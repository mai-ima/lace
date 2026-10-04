#!/usr/bin/env python3
"""道路の上の屋根（アーケード・歩道の上の屋根・渡り廊下）を見つけて、柱の位置を決める。
  python3 tools/world/bldg_over.py assets/data/world/center
PLATEAU の建物には、商店街のアーケードや歩道の上の屋根が「地面から立ち上がる箱」として入っていて、道路をふさいで見える。
屋根（上向きの面）の面積の 6 割以上が道路の範囲（PLATEAU の車道・歩道）の上にあり、高さ 2.5〜16m の建物を「道路の上の屋根」とする。
ゲームでは屋根の厚み（0.6m）だけを残して浮かせ、柱を立てる。
柱: 外形の縁に沿って 6m ごと、縁から 0.4m 内側の、歩道の上（車道から 0.3m 以上離れ、ほかの建物の外）にある点。
出力: bldg_over.json … { q: 0.05, over: [{ id: 建物番号, top: 屋根の上の高さ, cols: [x, z, ...]（0.05m 単位） }] }"""
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
cand = np.where((tot >= 20) & (onA / np.maximum(tot, 1e-9) > 0.6) & (h >= 2.5) & (h <= 16))[0]
print('候補', len(cand))
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
            if near(carTree, carT, p2, 0.3) or near(oTree, other, p2, 0.3) or not near(walkTree, walkT, p2, 0.2): continue
            cols += [q05(p2.x), q05(p2.y)]
    res.append({'id': int(k), 'top': round(float(hi[k]), 2), 'cols': cols})
json.dump({'q': 0.05, 'over': res}, open(os.path.join(out, 'bldg_over.json'), 'w'), separators=(',', ':'))
print('道路の上の屋根', len(res), ' 柱', sum(len(r['cols']) // 2 for r in res))
