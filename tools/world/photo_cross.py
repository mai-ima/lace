#!/usr/bin/env python3
"""航空写真（国土地理院 z18）から、OSM に無い横断歩道を見つける。
  node tools/world/dump_net.mjs assets/data/world/center > /tmp/world/net.json
  python3 tools/world/photo_cross.py assets/data/world/center /tmp/world/net.json
出力: cross_photo.json … [[x, z, 1 写真で見つけた / 0 標準の位置], ...]（横断歩道の中心。道の中心線の上）
見つけ方（信号のある交差点の腕ごと。幹線〜生活道路 rank ≦ 6）:
  信号の無い所は、写真の解像度（約 0.49m/画素）では横断歩道の縞（0.45m）と白い車・明るい舗装を見分けられないので対象にしない。
  - 腕の向きに 0.5m ごとの行を取り、行ごとに車道の幅の 85% を 0.5m ごとに測る。
  - 基準の舗装の明るさは、交差点から 18〜35m の中央値。基準より 35 以上明るい点の割合が、
    車道を 4 等分したどれでも 25% 以上・全体で 40% 以上の行（白い車 1 台や、交差点の中で別の道の横断歩道を縦に横切った所では
    一部だけになる）が 2.5〜7m 続き、その前か後ろ 1.5m の行が暗い（明るい点が 35% 未満）所を横断歩道とする。
    目視の確認（浜松駅周辺、28 か所）で、約 8 割が実際の横断歩道に当たった。
    停止線（幅 0.45m）は 1 行なので当たらない。
  - その腕の近く（12m 以内）に OSM の横断歩道（線または点）があれば、OSM の方を使うので出力しない。
写真はゲームには含めない（位置を読み取るだけ）。"""
import sys, os, json, math
import numpy as np
from PIL import Image

out, netf = sys.argv[1], sys.argv[2]
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
Z = 18; n = 2 ** Z; TD = '/tmp/world/ortho18'
tiles = {}
def tile(tx, ty):
    k = (tx, ty)
    if k not in tiles:
        f = os.path.join(TD, '%d_%d.jpg' % k)
        tiles[k] = np.asarray(Image.open(f).convert('L'), np.float32) if os.path.exists(f) else None
    return tiles[k]
def gray(x, z):
    lon, lat = LON0 + x / KX, LAT0 - z / KZ
    fx = (lon + 180) / 360 * n * 256
    fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n * 256
    px, py = int(fx), int(fy)
    t = tile(px // 256, py // 256)
    return None if t is None else float(t[py % 256, px % 256])

D = json.load(open(os.path.join(out, 'roads.json')))
P = D['p']
osm = [(P[i * 3], P[i * 3 + 1]) for i, f in D['feat'] if f.get('highway') == 'crossing' or f.get('crossing')]
for w in D['ways']:
    if w['k'] == 'cross': osm += [(P[i * 3], P[i * 3 + 1]) for i in w['n']]
osm = np.array(osm) if osm else np.zeros((0, 2))

N = json.load(open(netf))
res, nArm, nOsm, nDef = [], 0, 0, 0
for nd in N['nodes']:
    if not nd.get('sig'): continue   # 信号のある交差点だけ（日本ではほぼすべての腕に横断歩道がある。写真はその位置を決めるのに使う）
    # 標準の位置に置いてよい単純な交差点: 外へ向かう腕（交差点の中の道を除く）が 2〜4 本で、どれも 25m 以上、腕どうしが 50 度以上開いている、
    # 12m 以内に OSM の横断歩道が無い（上下線の分かれた大通りや駅前の複雑な交差点は、重なりを避けて写真で見つけた所だけ）
    ext = [a for a in nd['arms'] if not a.get('internal')]   # 交差点の中の短い道（上下線の間）は数えない
    angs = sorted(math.atan2(a['dz'], a['dx']) for a in ext)
    gaps = [(angs[(i + 1) % len(angs)] - angs[i]) % (2 * math.pi) for i in range(len(angs))]
    simple = 2 <= len(ext) <= 4 and all(a.get('len', 0) >= 25 for a in ext) and min(gaps) > math.radians(50) \
        and not (len(osm) and (np.hypot(osm[:, 0] - nd['x'], osm[:, 1] - nd['z']) < nd['r'] + 12).any())
    for a in nd['arms']:
        if a.get('rank', 9) > 6 or a['hw'] < 2.5: continue
        nArm += 1
        ux, uz = a['dx'], a['dz']; nx_, nz_ = -uz, ux; hw = a['hw']
        r0 = nd['r'] + 0.5
        # OSM の横断歩道が、この腕の 0〜20m・中心線から半幅 + 3m 以内にあれば飛ばす
        if len(osm):
            rel = osm - [nd['x'], nd['z']]
            al, ac = rel @ [ux, uz], np.abs(rel @ [nx_, nz_])
            if ((al > -2) & (al < r0 + 20) & (ac < hw + 3)).any(): nOsm += 1; continue
        offs = np.arange(-0.85 * hw, 0.85 * hw + 0.01, 0.5)
        def row(t):
            g = [gray(nd['x'] + ux * t + nx_ * o, nd['z'] + uz * t + nz_ * o) for o in offs]
            return None if any(v is None for v in g) else np.array(g)
        ref = [row(t) for t in np.arange(r0 + 18, r0 + 35, 1.0)]
        if any(v is None for v in ref): continue
        base = float(np.median(np.concatenate(ref)))
        ts = np.arange(r0, r0 + 9, 0.5); ok = []   # 横断歩道は交差点の角のすぐ外（9m 以内）。その先の導流帯・矢印は見ない
        for t in ts:
            g = row(t)
            if g is None: ok.append(False); continue
            b = g > base + 35; q4 = np.array_split(b, 4)
            ok.append(all(q.mean() >= 0.25 for q in q4) and b.mean() >= 0.4)
        def dark(t):   # 帯の外の行は舗装
            g = row(t)
            return g is not None and (g > base + 35).mean() < 0.35
        best = None; k = 0
        while k < len(ok):
            if not ok[k]: k += 1; continue
            e = k
            while e + 1 < len(ok) and ok[e + 1]: e += 1
            L = (e - k + 1) * 0.5
            if 2.5 <= L <= 7 and best is None and (dark(ts[k] - 1.5) or dark(ts[e] + 1.5)): best = (ts[k] + ts[e]) / 2
            k = e + 1
        if best is not None:
            res.append([round(nd['x'] + ux * best, 2), round(nd['z'] + uz * best, 2), 1])
        elif simple and not a.get('internal'):
            # 写真で見つからない（影・車で隠れた）腕にも、信号のある交差点ならふつうは横断歩道がある。角のすぐ外（4m 幅の中心）に置く
            res.append([round(nd['x'] + ux * (r0 + 3), 2), round(nd['z'] + uz * (r0 + 3), 2), 0]); nDef += 1
json.dump(res, open(os.path.join(out, 'cross_photo.json'), 'w'), separators=(',', ':'))
print('腕', nArm, ' OSM に横断歩道あり', nOsm, ' 写真で見つけた', len(res) - nDef, ' 標準の位置に置いた', nDef)
