#!/usr/bin/env python3
"""道路の上の屋根（アーケード・歩道の上の屋根・渡り廊下）を見つけて、柱の位置を決める。
  python3 tools/world/bldg_over.py assets/data/world/center
PLATEAU の建物には、商店街のアーケードや歩道の上の屋根が「地面から立ち上がる箱」として入っていて、道路をふさいで見える。
屋根（上向きの面）の面積の 5 割以上が道路の範囲（PLATEAU の車道・歩道）の上にあり、面積 6m2 以上・高さ 2.5〜20m の建物を「道路の上の屋根」とする
（2026-10-11: 面積 20m2・6 割・16m では、バスのりばの屋根・小さな出入口の屋根・渡り廊下が漏れて地面まで箱で描かれていた）。
バスターミナルの島の上ののりばの屋根は、形（用途不明・低い・細長い・車道のそば）で選ぶ。
航空レーザの表面の高さで、屋根の範囲に何も無い物（取り壊された・古いデータ）は hide に入れて描かない。
ゲームでは屋根の厚み（0.6m）だけを残して浮かせ、柱を立てる。
柱: 外形の縁に沿って 6m ごと、縁から 0.4m 内側の、歩道の上（車道から 0.3m 以上離れ、ほかの建物の外）にある点。
出力: bldg_over.json … { q: 0.05, over: [{ id: 建物番号, top: 屋根の上の高さ, cols: [x, z, ...]（0.05m 単位） }], hide: [建物番号, ...] }"""
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
# 用途が不明・高さ 2.5〜6.5m・幅（面積 ÷ 周の半分）1.8〜4.5m で長さが幅の 3.5 倍以上・面積 15m2 以上・車道から 3m 以内
info = json.load(open(os.path.join(out, 'bldg.json')))['b']
extra = []
for k in np.where((tot >= 15) & (h >= 2.5) & (h <= 6.5))[0]:
    if k in set(cand.tolist()) or info[k].get('u') not in (None, '不明'): continue
    fp = unary_union(list(shapely.polygons(V[roof & (tb == k)][:, :, [0, 2]]))).buffer(0.05).buffer(-0.05)
    W = 2 * fp.area / max(fp.length, 1e-6); L = fp.length / 2   # 細い帯（弧・L 字も）なら W は幅に近い
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
res = []
for k in cand:
    fp = unary_union(list(shapely.polygons(V[roof & (tb == k)][:, :, [0, 2]]))).buffer(0.05).buffer(-0.05)
    cols = []
    for g in (fp.geoms if hasattr(fp, 'geoms') else [fp]):
        if g.geom_type != 'Polygon': continue
        r = g.exterior; L = r.length; n = max(1, int(L // 6)); c = g.centroid
        for j in range(n):
            pt = r.interpolate(j * L / n); dx, dz = c.x - pt.x, c.y - pt.y; d = (dx * dx + dz * dz) ** 0.5 or 1
            p2 = shapely.Point(pt.x + dx / d * 0.4, pt.y + dz / d * 0.4)
            if near(carTree, carT, p2, 0.3) or near(oTree, other, p2, 0.3) or (k not in extraS and not near(walkTree, walkT, p2, 0.2)): continue   # のりばの島は歩道でなくても立てる
            cols += [q05(p2.x), q05(p2.y)]
    if not cols:   # 柱を立てる所が見つからない屋根: 外接長方形の四隅（0.4m 内側）のうち、車道とほかの建物に掛からない所に
        mr = fp.minimum_rotated_rectangle; c = mr.centroid
        for x, z in list(mr.exterior.coords)[:4]:
            dx, dz = c.x - x, c.y - z; d = (dx * dx + dz * dz) ** 0.5 or 1; p2 = shapely.Point(x + dx / d * 0.4, z + dz / d * 0.4)
            if not near(carTree, carT, p2, 0.3) and not near(oTree, other, p2, 0.3): cols += [q05(p2.x), q05(p2.y)]
    res.append({'id': int(k), 'top': round(float(hi[k]), 2), 'cols': cols})
json.dump({'q': 0.05, 'over': res, 'hide': [int(k) for k in hide]}, open(os.path.join(out, 'bldg_over.json'), 'w'), separators=(',', ':'))
print('道路の上の屋根', len(res), ' 描かない', len(hide), ' 柱', sum(len(r['cols']) // 2 for r in res))
