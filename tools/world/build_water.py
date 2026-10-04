#!/usr/bin/env python3
"""川・池の水面を作る。国土地理院の最適化ベクトルタイル（optimal_bvmap-v1、z16）の水域（WA）の多角形を使う。
  python3 tools/world/build_water.py assets/data/world/center
出力: water.json … 水面ごとに { wl: 水面の高さ, bed: 川底の高さ, tri: { v, i }（水面の三角形。0.05m 単位の整数）, rings: [[x, z, ...]]（護岸を立てる輪郭） }
水面の高さは、地理院の標高（terrain.bin）で水域の内側の最も低い所と、岸（輪郭の 4m 外）の高さの中央値から決める
（DEM は水面の上を補間しているので、岸より 2.5m 以上低くする）。
出典: 国土地理院（地理院地図ベクトル（最適化ベクトルタイル））・地理院タイル（標高）を加工して作成。"""
import sys, os, math, json, struct, urllib.request
import numpy as np
import mapbox_vector_tile, shapely
from shapely.geometry import Polygon, MultiPolygon, Point, box
from shapely.ops import unary_union

LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
out = sys.argv[1]
roads = json.load(open(os.path.join(out, 'roads.json')))
T = roads['terrain']
X0, Z0, NX, NZ, CELL = T['x0'], T['z0'], T['nx'], T['nz'], T['cell']
X1, Z1 = X0 + (NX - 1) * CELL, Z0 + (NZ - 1) * CELL
U = np.frombuffer(open(os.path.join(out, 'terrain.bin'), 'rb').read(), np.uint16)
H = (U.astype(np.float32) - 5000) / 100.0
H = H.reshape(NZ, NX)
def hat(x, z):
    fi, fj = (x - X0) / CELL, (z - Z0) / CELL
    i, j = int(max(0, min(NX - 2, math.floor(fi)))), int(max(0, min(NZ - 2, math.floor(fj))))
    u, v = max(0, min(1, fi - i)), max(0, min(1, fj - j))
    return float((H[j, i] * (1 - u) + H[j, i + 1] * u) * (1 - v) + (H[j + 1, i] * (1 - u) + H[j + 1, i + 1] * u) * v)

Z = 16; n = 2 ** Z
URL = 'https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf'
cache = '/tmp/world/gsibv'; os.makedirs(cache, exist_ok=True)
def tx(lon): return (lon + 180) / 360 * n
def ty(lat): return (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
lon = lambda x: LON0 + x / KX
lat = lambda z: LAT0 - z / KZ
def tile_to_xz(i, j, px, py, ext):
    fx, fy = i + px / ext, j + 1 - py / ext
    lo = fx / n * 360 - 180
    la = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / n))))
    return ((lo - LON0) * KX, (LAT0 - la) * KZ)
polys = []
for i in range(int(tx(lon(X0))), int(tx(lon(X1))) + 1):
    for j in range(int(ty(lat(Z0))), int(ty(lat(Z1))) + 1):
        fn = os.path.join(cache, '%d_%d_%d.pbf' % (Z, i, j))
        if not os.path.exists(fn):
            try: urllib.request.urlretrieve(URL.format(z=Z, x=i, y=j), fn)
            except Exception as e: print('取得できない', i, j, e); continue
        d = mapbox_vector_tile.decode(open(fn, 'rb').read())
        L = d.get('WA')
        if not L: continue
        ext = L.get('extent', 4096)
        for f in L['features']:
            g = f['geometry']
            rings = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
            for rs in rings:
                try:
                    pg = Polygon([tile_to_xz(i, j, p[0], p[1], ext) for p in rs[0]], [[tile_to_xz(i, j, p[0], p[1], ext) for p in h] for h in rs[1:]])
                    if not pg.is_valid: pg = pg.buffer(0)
                    if pg.area > 4: polys.append(pg)
                except Exception:
                    pass
print('水域の多角形', len(polys))
U2 = unary_union([p.buffer(0.3) for p in polys]).buffer(-0.3).intersection(box(X0, Z0, X1, Z1)).simplify(0.3)
parts = [g for g in (U2.geoms if hasattr(U2, 'geoms') else [U2]) if g.geom_type == 'Polygon' and g.area > 40]
q = lambda v: int(round(v / 0.05))
res = []
for p in parts:
    # 内側の最も低い所（DEM の 5m 格子の点のうち内側のもの）
    minx, minz, maxx, maxz = p.bounds
    ins = []
    for jj in range(max(0, int((minz - Z0) / CELL)), min(NZ, int((maxz - Z0) / CELL) + 2)):
        for ii in range(max(0, int((minx - X0) / CELL)), min(NX, int((maxx - X0) / CELL) + 2)):
            x, z = X0 + ii * CELL, Z0 + jj * CELL
            if p.contains(Point(x, z)): ins.append(float(H[jj, ii]))
    ring = p.exterior
    bank = []
    outer = p.buffer(4.0).exterior
    for k in range(0, int(outer.length), 6):
        pt = outer.interpolate(k); bank.append(hat(pt.x, pt.y))
    bank.sort(); bmed = bank[len(bank) // 2] if bank else 5.0
    inmin = min(ins) if ins else bmed - 3
    wl = min(inmin - 0.4, bmed - 2.5)
    bed = wl - 1.5
    # 三角形（40m の格子で切ってから制約付きドロネー）
    verts, index, vid = [], [], {}
    def vi(x, z):
        k = (q(x), q(z))
        if k not in vid: vid[k] = len(verts) // 2; verts.extend(k)
        return vid[k]
    gx = minx
    while gx < maxx:
        gz = minz
        while gz < maxz:
            c = p.intersection(box(gx, gz, gx + 40, gz + 40))
            for cc in (c.geoms if hasattr(c, 'geoms') else [c]):
                if cc.geom_type != 'Polygon' or cc.area < 0.2: continue
                for t in shapely.constrained_delaunay_triangles(cc).geoms:
                    xy = list(t.exterior.coords)[:3]
                    index.extend([vi(*xy[0]), vi(*xy[1]), vi(*xy[2])])
            gz += 40
        gx += 40
    rings = []
    for r in [p.exterior] + list(p.interiors):
        cs = list(r.coords); flat = []
        for x, z in cs: flat.extend([q(x), q(z)])
        rings.append(flat)
    res.append({'wl': round(wl, 2), 'bed': round(bed, 2), 'bank': round(bmed, 2), 'area': round(p.area), 'tri': {'v': verts, 'i': index}, 'rings': rings})
    print('水面 %.0f m2  水面の高さ %.2f m  岸 %.2f m  内側の最低 %.2f m' % (p.area, wl, bmed, inmin))
json.dump({'q': 0.05, 'water': res, 'credit': '国土地理院（地理院地図ベクトル・地理院タイル（標高））を加工して作成'}, open(os.path.join(out, 'water.json'), 'w'), separators=(',', ':'))
print('water.json', os.path.getsize(os.path.join(out, 'water.json')) // 1024, 'KB')
