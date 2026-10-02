#!/usr/bin/env python3
"""国土地理院ベクトルタイルの建物を、ゲーム用の小さなファイル（1km 四方ごと）にする。
  python3 tools/map/gsi_build.py /tmp/gsi/raw /tmp/gsi/edges.json assets/js/race-bld-data.js
OpenStreetMap で作った中心部（race-map-data.js の bcov）は、そちらの建物を使うので重ねない。
出典: 国土地理院ベクトルタイル / 建物の高さは載っていないので、面積と種類から決める。"""
import json, math, os, sys, re, glob
import mapbox_vector_tile as mvt
raw, edges_fn, outfile = sys.argv[1:4]
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
Z = 16; N = 2 ** Z
ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
def enc(vals):
    out = []
    for v in vals:
        v = int(v); z = v * 2 if v >= 0 else -v * 2 - 1
        while True:
            c = z & 31; z >>= 5
            if z: out.append(ALPHA[c | 32])
            else: out.append(ALPHA[c]); break
    return ''.join(out)
def px2xz(tx, ty, px, py):
    lon = (tx + px / 4096.0) / N * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (ty + py / 4096.0) / N))))
    return ((lon - LON0) * KX, (LAT0 - lat) * KZ)
# 中心部（OSM の建物を使う所）
BCOV = [(0, 0, 2550), (None,)]
def projp(lat, lon): return ((lon - LON0) * KX, (LAT0 - lat) * KZ)
cov = []
for lat, lon, r in ((34.7037, 137.7351, 2550), (34.8063, 137.7853, 880), (34.8900, 137.8130, 680), (34.6920, 137.6100, 680), (34.7530, 137.6250, 680), (34.7545, 137.8270, 680)):
    x, z = projp(lat, lon); cov.append((x, z, r + 30))
def covered(x, z): return any(math.hypot(x - c[0], z - c[1]) < c[2] for c in cov)
# 道の近くだけ（約 110m 以内。それより遠い建物は画面に出ない）
road = json.load(open(edges_fn)); rg = {}
for x, z in road: rg.setdefault((int(x // 120), int(z // 120)), []).append((x, z))
def near_road(x, z, r=110):
    cx, cz = int(x // 120), int(z // 120)
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            for (rx, rz) in rg.get((cx + dx, cz + dz), ()):
                if (rx - x) ** 2 + (rz - z) ** 2 < r * r: return True
    return False
def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3: return pts
    def cr(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]
def obb(pts):
    h = hull(pts); best = None
    for k in range(len(h)):
        a, b = h[k], h[(k + 1) % len(h)]
        ang = math.atan2(b[1] - a[1], b[0] - a[0]); c, s = math.cos(ang), math.sin(ang)
        us = [p[0] * c + p[1] * s for p in h]; vs = [-p[0] * s + p[1] * c for p in h]
        A = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or A < best[0]:
            u0, v0 = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
            best = (A, u0 * c - v0 * s, u0 * s + v0 * c, max(us) - min(us), max(vs) - min(vs), ang)
    return best
def rings_of(geom):
    t = geom['type']; c = geom['coordinates']
    if t == 'LineString': return [c]
    if t == 'MultiLineString': return c
    if t == 'Polygon': return [c[0]]
    if t == 'MultiPolygon': return [p[0] for p in c]
    return []
chunks = {}; total = 0; kept = 0
for fn in sorted(glob.glob(raw + '/*.pbf')):
    data = open(fn, 'rb').read()
    if not data: continue
    tx, ty = [int(v) for v in os.path.basename(fn)[:-4].split('_')]
    try: t = mvt.decode(data, y_coord_down=True)
    except Exception as e: print('decode err', fn, e); continue
    lay = t.get('building')
    if not lay: continue
    for ft in lay['features']:
        code = ft['properties'].get('ftCode', 3101)
        for ring in rings_of(ft['geometry']):
            if len(ring) < 4: continue
            if ring[0] != ring[-1] and math.hypot(ring[0][0] - ring[-1][0], ring[0][1] - ring[-1][1]) > 40: continue
            pts = [px2xz(tx, ty, p[0], p[1]) for p in ring]
            total += 1
            o = obb(pts)
            if not o: continue
            A, cx, cz, bw, bd, ang = o
            if bw < 2.5 or bd < 2.5 or bw > 220 or bd > 220: continue
            if covered(cx, cz) or not near_road(cx, cz): continue
            hsh = ((int(cx) * 73856093) ^ (int(cz) * 19349663)) % 1000 / 1000.0
            # 種類と階数（高さは載っていないので、面積と種類から決める）
            if code in (3111, 3112, 3121, 3122): kind, lv = 3, 1
            elif code == 3103: kind, lv = 2, 8 + int(hsh * 10)
            elif code == 3102:
                if A > 1500: kind, lv = 3, 1 + (A > 3000)
                elif A > 500: kind, lv = 2, 3 + int(hsh * 4)
                else: kind, lv = 1, 3 + int(hsh * 3)
            else:
                kind = 0 if A < 220 else 2
                lv = (2 if hsh < 0.75 else 1 if hsh < 0.88 else 3) if A < 220 else 2 + int(hsh * 2)
            a = int(round(math.degrees(ang) % 180)) // 2
            key = (int(cx // 1000), int(cz // 1000))
            chunks.setdefault(key, []).append((round(cx), round(cz), max(3, round(bw)), max(3, round(bd)), a, lv, kind))
            kept += 1
# 1 つのデータファイルにまとめる（建物は x,z の差分、近い順に並べる）
allb = []
for key, B in chunks.items(): allb.extend(B)
allb.sort(key=lambda b: (b[1] // 100, b[0]))
seen = set(); B2 = []
for b in allb:   # 重なる輪郭（同じ位置）を取り除く
    k = (b[0] // 3, b[1] // 3, b[2] // 3)
    if k in seen: continue
    seen.add(k); B2.append(b)
px = pz = 0; cols = [[] for _ in range(7)]
for b in B2:
    cols[0].append(b[0] - px); cols[1].append(b[1] - pz); px, pz = b[0], b[1]
    for i in range(2, 7): cols[i].append(b[i])
# 建物のある範囲（250m の格子。データがある所では、土地利用からの飾りを足さない）
cells = sorted({(int(b[0] // 250), int(b[1] // 250)) for b in B2})
cx_d = []; cz_d = []; pcx = pcz = 0
for cx, cz in cells: cx_d.append(cx - pcx); cz_d.append(cz - pcz); pcx, pcz = cx, cz
data = dict(n=len(B2), x=enc(cols[0]), z=enc(cols[1]), w=enc(cols[2]), d=enc(cols[3]), a=enc(cols[4]), l=enc(cols[5]), k=enc(cols[6]), cx=enc(cx_d), cz=enc(cz_d))
open(outfile, 'w').write('/* 国土地理院ベクトルタイルの建物（道路から約 110m 以内）。tools/map/gsi_build.py で作る。出典: 国土地理院 */\n(function () { var TB = window.TB = window.TB || {}; TB.RaceBldData = ' + json.dumps(data) + '; })();\n')
print('rings', total, 'kept', kept, 'unique', len(B2), 'cells', len(cells), 'bytes', os.path.getsize(outfile))
