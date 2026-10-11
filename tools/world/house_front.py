#!/usr/bin/env python3
"""住宅の表（道に面した向き）と、家と道の間の塀（ブロック塀・生垣・フェンス）を決める。
  python3 tools/world/house_front.py assets/data/world/center
第 4 回の審査（2026-10-11）: 住宅地に瓦屋根・塀・カーポートが無く、窓の少ない箱が空き地に並んで見える。
方法: 住宅（住宅・店舗等併用住宅・小さな共同住宅）の最小の外接長方形の 4 辺から、外へ光線を 0.25m ごとに 12m まで進め、
      道路の範囲（road_area.json の車道・歩道）に入るまでの距離がいちばん短い辺を表とする。
      表と道の間が 1.2〜9m なら、道の縁から 0.15m 内側に、建物の幅＋左右 1m の塀を置く。ほかの建物に掛かる所は切る。
      車の出入り口（表の奥行き 4m 以上で 3m）か、人の出入り口（1m）を、建物ごとの乱数で左右どちらかの端に空ける。
出力: house_front.json … {q: 0.01, f: [[建物の番号, 表の向き(0.1 度、外向き), 道までの距離], ...],
                          w: [[建物の番号, x1, z1, x2, z2, 高さ, 種類（0 ブロック 1 生垣 2 ブロックの上にフェンス）], ...]}"""
import sys, os, json, math
import numpy as np, shapely
from shapely.geometry import Polygon, MultiPolygon, LineString
from shapely.ops import unary_union

out = sys.argv[1]
b = open(os.path.join(out, 'bldg.bin'), 'rb').read(); hl = int(np.frombuffer(b[:4], np.uint32)[0]); hdr = json.loads(b[4:4 + hl]); off = 4 + hl
nv, ni = hdr['nv'], hdr['ni']
P = np.frombuffer(b[off:off + nv * 6], np.int16).reshape(-1, 3).astype(np.float64) * hdr['q']; off += nv * 6; off += (nv * 6) % 4
I = np.frombuffer(b[off:off + ni * 4], np.uint32).reshape(-1, 3).astype(np.int64); off += ni * 4
bid = np.frombuffer(b[off:off + nv * 2], np.uint16)
info = json.load(open(os.path.join(out, 'bldg.json')))['b']; nb = len(info)
A = json.load(open(os.path.join(out, 'road_area.json'))); rq = A['q']
def tris(T):
    v = np.array(T['v']).reshape(-1, 2) * rq; i = np.array(T['i']).reshape(-1, 3); return shapely.polygons(v[i])
road = unary_union(np.concatenate([tris(A['car']), tris(A['walk'])])).buffer(0); shapely.prepare(road)
print('道路の範囲', flush=True)
# 建物の外形（上向きの三角形の和）
V = P[I]; n = np.cross(V[:, 1] - V[:, 0], V[:, 2] - V[:, 0]); ar = np.linalg.norm(n, axis=1) / 2
up = (np.abs(n[:, 1]) / np.maximum(ar * 2, 1e-9) > 0.3) & (ar > 1e-4)
tb = bid[I[:, 0]].astype(np.int64)
polys = [[] for _ in range(nb)]
for t in np.nonzero(up)[0]: polys[tb[t]].append(V[t][:, [0, 2]])
fps = [None] * nb
for k in range(nb):
    if not polys[k]: continue
    g = unary_union([Polygon(p).buffer(0.01) for p in polys[k]]).buffer(-0.01)
    if isinstance(g, MultiPolygon): g = max(g.geoms, key=lambda q: q.area)
    if not g.is_empty: fps[k] = g
print('外形', flush=True)
allb = [f for f in fps if f is not None]; ids = [k for k in range(nb) if fps[k] is not None]
tree = shapely.STRtree(allb)
H = lambda k, s: (((k + 1) * 2654435761 ^ (s * 40503)) & 0xffffffff) / 4294967296
HOUSE = {'住宅', '店舗等併用住宅'}
F, Wl = [], []
for k in range(nb):
    fp = fps[k]; u = info[k].get('u')
    if fp is None or not (u in HOUSE or (u in ('共同住宅', '不明') and fp.area < 300)) or not 25 <= fp.area <= 400: continue
    mr = fp.minimum_rotated_rectangle; cs = np.array(mr.exterior.coords)[:4]; c = cs.mean(0)
    best = None
    for i in range(4):
        a, bb = cs[i], cs[(i + 1) % 4]; e = bb - a; E = np.linalg.norm(e); e = e / max(E, 1e-9)
        m = (a + bb) / 2; nn = np.array([e[1], -e[0]])
        if np.dot(nn, m - c) < 0: nn = -nn
        steps = np.arange(0.05, 12.0, 0.25); offs = np.array([-0.3, 0.0, 0.3]) * E
        X = m[0] + e[0] * offs[:, None] + nn[0] * steps[None, :]; Z = m[1] + e[1] * offs[:, None] + nn[1] * steps[None, :]
        hit = shapely.contains_xy(road, X, Z)
        d = [steps[np.argmax(h)] for h in hit if h.any()]
        if len(d) < 2: continue
        d = float(np.median(d))
        if best is None or d < best[0]: best = (d, m, nn, e, E)
    if best is None: continue
    d, m, nn, e, E = best
    F.append([k, round(math.degrees(math.atan2(nn[1], nn[0])) * 10) % 3600, round(d * 100)])
    if not 1.2 <= d <= 9.0: continue
    # 塀: 道の縁から 0.15m 内側。ほかの建物（0.3m 太らせる）と道路に掛かる所は切る
    p0 = m + nn * (d - 0.15) - e * (E / 2 + 1.0); p1 = m + nn * (d - 0.15) + e * (E / 2 + 1.0)
    gate = 3.0 if d >= 4.0 else 1.0; side = H(k, 3) < 0.5
    L = E + 2.0
    if side: segs = [(0.0, L - gate - 0.3)]
    else: segs = [(gate + 0.3, L)]
    if gate < 2: segs = [(0.0, L * 0.3), (L * 0.3 + 1.0, L)] if side else [(0.0, L * 0.7 - 1.0), (L * 0.7, L)]
    near = [allb[j] for j in tree.query(LineString([p0, p1]).buffer(1.0))]
    block = unary_union([g.buffer(0.3) for g in near]) if near else None
    hh = 1.0 + 0.5 * H(k, 5); ty = 0 if H(k, 6) < 0.6 else 1 if H(k, 6) < 0.8 else 2
    if ty == 1: hh += 0.3
    for s0, s1 in segs:
        if s1 - s0 < 0.8: continue
        ln = LineString([p0 + e * s0, p0 + e * s1])
        if block is not None: ln = ln.difference(block)
        ln = ln.difference(road)
        parts = [ln] if ln.geom_type == 'LineString' else list(getattr(ln, 'geoms', []))
        for q in parts:
            if q.is_empty or q.length < 0.8: continue
            (x1, z1), (x2, z2) = q.coords[0], q.coords[-1]
            Wl.append([k, round(x1 * 100), round(z1 * 100), round(x2 * 100), round(z2 * 100), round(hh * 100), ty])
    if len(F) % 1000 == 0: print(len(F), len(Wl), flush=True)
json.dump({'q': 0.01, 'f': F, 'w': Wl}, open(os.path.join(out, 'house_front.json'), 'w'), separators=(',', ':'))
print('house_front.json 表', len(F), '塀', len(Wl), os.path.getsize(os.path.join(out, 'house_front.json')) // 1024, 'KB')
