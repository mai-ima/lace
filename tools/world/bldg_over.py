#!/usr/bin/env python3
"""道路の上の屋根（アーケード・歩道の上の屋根・渡り廊下）を見つけて、柱の位置を決める。
  python3 tools/world/bldg_over.py assets/data/world/center
PLATEAU の建物には、商店街のアーケードや歩道の上の屋根が「地面から立ち上がる箱」として入っていて、道路をふさいで見える。
屋根（上向きの面）の面積の 5 割以上が道路の範囲（PLATEAU の車道・歩道）の上にあり、面積 6m2 以上・高さ 2.5〜20m の建物を「道路の上の屋根」とする
（2026-10-11: 面積 20m2・6 割・16m では、バスのりばの屋根・小さな出入口の屋根・渡り廊下が漏れて地面まで箱で描かれていた）。
バスターミナルの島の上ののりばの屋根は、形（用途不明・低い・細長い・車道のそば）で選ぶ。
航空レーザの表面の高さで、屋根の範囲に何も無い物（取り壊された・古いデータ）は hide に入れて描かない。
ゲームでは元の箱を描かず、外形（fp）から種類ごとの厚さ・材質の屋根の板を作り、柱を立てる。
柱: 外形の縁に沿って 6m ごと、縁から 0.4m 内側の、歩道の上（車道から 0.3m 以上離れ、ほかの建物の外）にある点。見つからなければ段階的に緩める。
2 本未満で、ほかの建物から 3.5m を超えて張り出す物は屋根にせず建物のまま。3〜6m 四方の小さな箱も建物のまま。
出力: bldg_over.json … { q: 0.05, over: [{ id: 建物番号, top: 屋根の上の高さ, kind: 0 金属 1 ガラスのアーケード 2 カーポート・のりば,
  cols: [x, z, ...], fp: [[x, z, ...]（外形。[-1,-1] で始まる輪は直前の外形の穴）, ...]（0.05m 単位） }], hide: [建物番号, ...] }"""
import sys, os, json, struct
import numpy as np, shapely
from shapely.ops import unary_union

out = sys.argv[1]
b = open(os.path.join(out, 'bldg.bin'), 'rb').read(); hl = struct.unpack('<I', b[:4])[0]; hdr = json.loads(b[4:4 + hl]); off = 4 + hl
q = np.frombuffer(b, np.int16, hdr['nv'] * 3, off).reshape(-1, 3) * hdr['q']; off += hdr['nv'] * 6; off += (hdr['nv'] * 6) % 4
idx = np.frombuffer(b, np.uint32, hdr['ni'], off).reshape(-1, 3); off += hdr['ni'] * 4
bid = np.frombuffer(b[off:off + hdr['nv'] * 2], np.uint16)
nb = len(json.load(open(os.path.join(out, 'bldg.json')))['b'])
A = json.load(open(os.path.join(out, 'road_area.json'))); rq = A['q']
def tris(T):
    v = np.array(T['v']).reshape(-1, 2) * rq; i = np.array(T['i']).reshape(-1, 3); return shapely.polygons(v[i])
carT, walkT = tris(A['car']), tris(A['walk'])
road = unary_union(np.concatenate([carT, walkT])).buffer(0); shapely.prepare(road)
carTree, walkTree = shapely.STRtree(carT), shapely.STRtree(walkT)
lo = np.full(nb, 1e9); hi = np.full(nb, -1e9); np.minimum.at(lo, bid, q[:, 1]); np.maximum.at(hi, bid, q[:, 1])
V = q[idx]; tb = bid[idx[:, 0]]
# 屋根（上向きで、建物の高さの半分より上）の三角形
ux, uz, vx, vz = V[:, 1, 0] - V[:, 0, 0], V[:, 1, 2] - V[:, 0, 2], V[:, 2, 0] - V[:, 0, 0], V[:, 2, 2] - V[:, 0, 2]
area = np.abs(ux * vz - uz * vx) / 2
cy = V[:, :, 1].mean(1); roof = (area > 0.05) & (cy > (lo[tb] + hi[tb]) / 2)
cx, cz = V[:, :, 0].mean(1), V[:, :, 2].mean(1)
onR = np.zeros(len(V), bool); onR[roof] = shapely.contains_xy(road, cx[roof], cz[roof])
tot = np.bincount(tb[roof], area[roof], minlength=nb); onA = np.bincount(tb[roof & onR], area[roof & onR], minlength=nb)
h = hi - lo
cand = np.where((tot >= 6) & (onA / np.maximum(tot, 1e-9) > 0.5) & (h >= 2.5) & (h <= 20))[0]
# のりばの屋根（バスターミナルの島の上の細長い屋根）: 島は道路の範囲に入らないので、形で選ぶ。
# 用途が不明・高さ 2.5〜6.5m・幅 1.8〜4.5m で長さが幅の 3.5 倍以上・面積 15m2 以上・車道から 3m 以内。
# 幅と長さは「同じ面積と周の長さを持つ帯（長方形）」の短辺・長辺（弧・L 字の帯でも幅に近い）。
# 2026-10-11 の Q2 の審査: 以前の式（幅 = 2×面積÷周、長さ = 周÷2）では、どんな形でも長さ ≥ 4×幅となり、判定が働いていなかった
info = json.load(open(os.path.join(out, 'bldg.json')))['b']
def strip(fp):
    hp = fp.length / 2; W = (hp - max(hp * hp - 4 * fp.area, 0) ** 0.5) / 2; return W, hp - W
extra = []
for k in np.where((tot >= 15) & (h >= 2.5) & (h <= 6.5))[0]:
    if k in set(cand.tolist()) or info[k].get('u') not in (None, '不明'): continue
    fp = unary_union(list(shapely.polygons(V[roof & (tb == k)][:, :, [0, 2]]))).buffer(0.05).buffer(-0.05)
    W, L = strip(fp)
    if 1.8 <= W <= 4.5 and L >= 3.5 * W and any(carT[i].distance(fp) < 3 for i in carTree.query(fp.buffer(3))): extra.append(k)
print('のりばの屋根（形で選んだ物）', len(extra))
cand = np.array(sorted(set(cand.tolist()) | set(extra)), dtype=int); extraS = set(int(k) for k in extra)
print('候補', len(cand))
# 航空レーザの表面の高さ（DSM）で確かめる: 屋根の範囲の点のうち、建物の下端より 2m 以上高い点の割合。
# 2 割 5 分未満なら、そこには何も無い（取り壊された・古いデータ）→ 描かない（hide）。それ以上なら屋根だけ残して柱で支える
sys.path.insert(0, os.path.dirname(__file__))
from dsmread import DSM
dsm = DSM(); hide = []; keep = []
for k in cand:
    fp = unary_union(list(shapely.polygons(V[roof & (tb == k)][:, :, [0, 2]]))).buffer(0.05).buffer(-0.05)
    x0, z0, x1, z1 = fp.bounds; X, Z = np.meshgrid(np.arange(x0 + 0.25, x1, 0.5), np.arange(z0 + 0.25, z1, 0.5)); X, Z = X.ravel(), Z.ravel()
    m = shapely.contains_xy(fp.buffer(-0.3), X, Z)
    if m.sum() < 8: keep.append(k); continue
    t = dsm.sample(X[m], Z[m]); ok = ~np.isnan(t)
    if ok.sum() < 8: keep.append(k); continue
    (keep if np.mean(t[ok] - lo[k] > 2.0) >= 0.25 else hide).append(k)
print('DSM で何も無い（描かない）', len(hide), ' 屋根として残す', len(keep))
cand = np.array(keep, dtype=int)
# ほかの建物（屋根の三角形）: 柱を建物の中に立てない
other = shapely.polygons(V[roof & ~np.isin(tb, cand)][:, :, [0, 2]]); oTree = shapely.STRtree(other)
near = lambda tree, geoms, pt, d: any(geoms[i].distance(pt) < d for i in tree.query(pt.buffer(d)))
q05 = lambda v: int(round(v / 0.05))
res = []; back = []; stat = [0] * 5
def inset(g, step, d):
    """外形の縁に沿って step ごと、縁から d 内側の点"""
    r = g.exterior; L = r.length; n = max(1, int(L // step)); c = g.centroid; pts = []
    for j in range(n):
        pt = r.interpolate(j * L / n); q = r.interpolate(j * L / n + 0.5); tx, tz = q.x - pt.x, q.y - pt.y; tl = (tx * tx + tz * tz) ** 0.5 or 1
        for sgn in (1, -1):   # 縁の内向きの法線（多角形の向きによらない）
            p2 = shapely.Point(pt.x - tz / tl * d * sgn, pt.y + tx / tl * d * sgn)
            if g.contains(p2): pts.append(p2); break
    return pts
for k in cand:
    fp = unary_union(list(shapely.polygons(V[roof & (tb == k)][:, :, [0, 2]]))).buffer(0.05).buffer(-0.05)
    polys = [g for g in (fp.geoms if hasattr(fp, 'geoms') else [fp]) if g.geom_type == 'Polygon' and g.area > 1]
    mr = fp.minimum_rotated_rectangle; e = np.array(mr.exterior.coords)[:3]; s1, s2 = sorted([np.linalg.norm(e[1] - e[0]), np.linalg.norm(e[2] - e[1])])
    # 3〜6m 四方の小さな箱（地下の出入口・小屋・売店）は屋根でなく建物（審査: 2763・3107・8670 が板になって浮いていた）
    if fp.area < 40 and s2 < 2 * s1 and k not in extraS: back.append(int(k)); stat[4] += 1; continue
    # 柱: 段階的に緩めて探す（0 歩道の上 6m ごと → 1 歩道の条件を外す → 2 3m ごと・縁から 0.8m → 3 外接長方形の四隅と辺の中点）
    cols = []
    for lev in range(4):
        cols = []
        for g in polys:
            if lev < 3: pts = inset(g, 6 if lev < 2 else 3, 0.4 if lev < 2 else 0.8)
            else:
                cs = np.array(mr.exterior.coords)[:4]; c = mr.centroid; pts = []
                for a in list(cs) + [(cs[i] + cs[(i + 1) % 4]) / 2 for i in range(4)]:
                    dx, dz = c.x - a[0], c.y - a[1]; d = (dx * dx + dz * dz) ** 0.5 or 1; pts.append(shapely.Point(a[0] + dx / d * 0.6, a[1] + dz / d * 0.6))
            for p2 in pts:
                if near(carTree, carT, p2, 0.3) or near(oTree, other, p2, 0.3): continue
                if lev == 0 and k not in extraS and not near(walkTree, walkT, p2, 0.2): continue   # のりばの島は歩道でなくても立てる
                cols.append(p2)
        if len(cols) >= 2 or (fp.area < 40 and len(cols) >= 1): break
    # 柱が足りない: ほかの建物にくっついていて、張り出しが 3.5m 以内なら片持ち（柱なしでよい）。そうでなければ屋根にせず建物のまま
    if len(cols) < 2:
        nb_ = [other[i] for i in oTree.query(fp.buffer(0.6)) if other[i].distance(fp) < 0.6]
        if nb_:
            host = unary_union(nb_); depth = max(host.distance(shapely.Point(x, z)) for g in polys for x, z in g.exterior.coords)
            if depth > 3.5: back.append(int(k)); stat[3] += 1; continue
        elif not cols: back.append(int(k)); stat[3] += 1; continue
    stat[min(lev, 2)] += 1
    # 種類: 0 金属の屋根（駅前・歩道の上） 1 ガラスのアーケード（大きく高い通りの屋根） 2 カーポート・のりばの屋根（小さい・低い）
    W, L = strip(fp)
    kind = 1 if fp.area >= 400 and hi[k] - lo[k] >= 6 and W >= 6 else 2 if (k in extraS or fp.area < 60) else 0
    rings = []
    for g in polys:
        gs = g.simplify(0.15); rings.append([[q05(x), q05(z)] for x, z in list(gs.exterior.coords)[:-1]])
        for hole in gs.interiors: rings.append([[-1, -1]] + [[q05(x), q05(z)] for x, z in list(hole.coords)[:-1]])   # [-1,-1] で始まる輪は直前の外形の穴
    res.append({'id': int(k), 'top': round(float(hi[k]), 2), 'kind': kind, 'cols': [v for p in cols for v in (q05(p.x), q05(p.y))], 'fp': [[v for xz in r for v in xz] for r in rings]})
json.dump({'q': 0.05, 'over': res, 'hide': [int(k) for k in hide]}, open(os.path.join(out, 'bldg_over.json'), 'w'), separators=(',', ':'))
print('道路の上の屋根', len(res), ' 描かない', len(hide), ' 柱', sum(len(r['cols']) // 2 for r in res), ' 建物に戻す', len(back), ' 段階', stat)
import collections; print('種類', collections.Counter(r['kind'] for r in res), ' 柱の数', collections.Counter(min(len(r['cols']) // 2, 5) for r in res))
