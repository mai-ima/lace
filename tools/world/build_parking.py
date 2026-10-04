#!/usr/bin/env python3
"""平面駐車場（舗装と区画の白線）を作る。
  python3 tools/world/build_parking.py assets/data/world/center
入力: /tmp/world/osm/*.xml（OSM の amenity=parking の面。立体・地下・屋上は除く）、建物（bldg.bin）、車道の範囲（road_area.json）、
      航空写真（国土地理院 z18、/tmp/world/ortho18。区画の向きを読み取るだけで、写真は含めない）。
出力: parking.json … { q: 0.05, lots: [{ tri: { v, i }, lines: [x1, z1, x2, z2, ...] }] }（どれも 0.05m 単位の整数）
区画: 日本の一般的な寸法（幅 2.5m・奥行き 5.0m、通路 6.0m）。背中合わせの 2 列と通路をくり返す。
向き: 駐車場の外形を囲む最小の長方形の 2 つの軸のうち、航空写真の模様（白線の縁）の向きに近い方を区画の線の向きにする。
      写真の模様がはっきりしないときは、長い辺に沿って区画を並べる（区画の線は短い辺の向き）。"""
import sys, os, json, math, glob, struct
import xml.etree.ElementTree as ET
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union
from shapely import affinity
from PIL import Image

out = sys.argv[1]
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
T = json.load(open(os.path.join(out, 'roads.json')))['terrain']
X0, Z0, X1, Z1 = T['x0'], T['z0'], T['x0'] + (T['nx'] - 1) * T['cell'], T['z0'] + (T['nz'] - 1) * T['cell']
xz = lambda lat, lon: ((lon - LON0) * KX, (LAT0 - lat) * KZ)

# --- OSM の駐車場の面 ---
nodes, polys, seen = {}, [], set()
for f in sorted(glob.glob('/tmp/world/osm/*.xml')):
    r = ET.parse(f).getroot()
    for n in r.iter('node'): nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))
    for w in r.iter('way'):
        t = {k.get('k'): k.get('v') for k in w.iter('tag')}
        if t.get('amenity') != 'parking' or w.get('id') in seen: continue
        if t.get('parking') in ('multi-storey', 'underground', 'rooftop', 'sheds', 'street_side'): continue
        ids = [nd.get('ref') for nd in w.iter('nd')]
        if len(ids) < 4 or ids[0] != ids[-1] or any(i not in nodes for i in ids): continue
        seen.add(w.get('id'))
        pg = Polygon([xz(*nodes[i]) for i in ids])
        if not pg.is_valid: pg = pg.buffer(0)
        if pg.area > 40: polys.append(pg)
nOsm = len(polys)
# --- PLATEAU の土地利用（都市計画基礎調査）の「その他③（平面駐車場）」: OSM に無い駐車場を補う ---
import mapbox_vector_tile
LZ = 16; ln = 2 ** LZ
def tile_xz(i, j, px, py, ext):
    fx, fy = i + px / ext, j + 1 - py / ext
    lo = fx / ln * 360 - 180
    la = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / ln))))
    return ((lo - LON0) * KX, (LAT0 - la) * KZ)
lpolys = []
for fn in sorted(glob.glob('/tmp/world/luse/16_*_*.mvt')):
    _, i, j = os.path.basename(fn)[:-4].split('_'); i, j = int(i), int(j)
    L = mapbox_vector_tile.decode(open(fn, 'rb').read()).get('luse')
    if not L: continue
    ext = L.get('extent', 4096)
    for f in L['features']:
        if '平面駐車場' not in str(f['properties'].get('luse_class', '')): continue
        g = f['geometry']
        for rs in ([g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']):
            try:
                pg = Polygon([tile_xz(i, j, p[0], p[1], ext) for p in rs[0]], [[tile_xz(i, j, p[0], p[1], ext) for p in h] for h in rs[1:]])
                if not pg.is_valid: pg = pg.buffer(0)
                if pg.area > 40: lpolys.append(pg)
            except Exception:
                pass
# OSM の面と重なる PLATEAU の面は、OSM の面と合わせて 1 つに（同じ駐車場の範囲の違い）
allp = unary_union([p.buffer(0.05) for p in polys + lpolys]).buffer(-0.05)
polys = [g for g in (allp.geoms if hasattr(allp, 'geoms') else [allp]) if g.geom_type == 'Polygon' and g.area > 40]
print('駐車場の面: OSM', nOsm, ' PLATEAU 土地利用', len(lpolys), ' 合わせて', len(polys))

# --- 除く範囲: 建物の外形と車道 ---
b = open(os.path.join(out, 'bldg.bin'), 'rb').read()
hl = struct.unpack('<I', b[:4])[0]; hdr = json.loads(b[4:4 + hl]); off = 4 + hl
q = np.frombuffer(b, np.int16, hdr['nv'] * 3, off).reshape(-1, 3) * hdr['q']; off += hdr['nv'] * 6; off += (hdr['nv'] * 6) % 4
idx = np.frombuffer(b, np.uint32, hdr['ni'], off).reshape(-1, 3)
P3 = q[idx][:, :, [0, 2]]
area = (P3[:, 1, 0] - P3[:, 0, 0]) * (P3[:, 2, 1] - P3[:, 0, 1]) - (P3[:, 1, 1] - P3[:, 0, 1]) * (P3[:, 2, 0] - P3[:, 0, 0])
bt = shapely.polygons(P3[np.abs(area) > 0.5])
A = json.load(open(os.path.join(out, 'road_area.json')))
rq = A['q']; cv, ci = np.array(A['car']['v']).reshape(-1, 2) * rq, np.array(A['car']['i']).reshape(-1, 3)
rt = shapely.polygons(cv[ci])
btree, rtree = shapely.STRtree(bt), shapely.STRtree(rt)

# --- 航空写真（区画の向き） ---
Z = 18; n = 2 ** Z; tiles = {}
def gray(x, z):
    lon, lat = LON0 + x / KX, LAT0 - z / KZ
    fx = (lon + 180) / 360 * n * 256
    fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n * 256
    k = (int(fx) // 256, int(fy) // 256)
    if k not in tiles:
        fn = '/tmp/world/ortho18/%d_%d.jpg' % k
        tiles[k] = np.asarray(Image.open(fn).convert('L'), np.float32) if os.path.exists(fn) else None
    t = tiles[k]
    return None if t is None else float(t[int(fy) % 256, int(fx) % 256])
def photo_dir(pg):
    """写真の模様の向き（線の向きの角度、0〜π）と、はっきりさ（0〜1）"""
    x0, z0, x1, z1 = pg.bounds; st = max(0.5, math.sqrt(pg.area / 3000))
    sxx = syy = sxy = 0.0
    for x in np.arange(x0 + 1, x1 - 1, st):
        for z in np.arange(z0 + 1, z1 - 1, st):
            if not pg.contains(shapely.Point(x, z)): continue
            gx0, gx1, gz0, gz1 = gray(x - 0.5, z), gray(x + 0.5, z), gray(x, z - 0.5), gray(x, z + 0.5)
            if None in (gx0, gx1, gz0, gz1): continue
            gx, gz = gx1 - gx0, gz1 - gz0
            sxx += gx * gx; syy += gz * gz; sxy += gx * gz
    tr = sxx + syy
    if tr <= 0: return 0.0, 0.0
    coh = math.hypot(sxx - syy, 2 * sxy) / tr
    th = 0.5 * math.atan2(2 * sxy, sxx - syy) + math.pi / 2   # 勾配に直角 = 線の向き
    return th % math.pi, coh

def gray_arr(xs, zs):
    """写真の明るさ（双一次補間）を配列でまとめて。写真の無い所は nan"""
    lon, lat = LON0 + xs / KX, LAT0 - zs / KZ
    fx = (lon + 180) / 360 * n * 256 - 0.5
    fy = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n * 256 - 0.5
    ix, iy = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64); ax, ay = fx - ix, fy - iy
    def px(X, Y):
        r = np.full(xs.shape, np.nan, np.float32)
        for k in set(zip((X // 256).ravel().tolist(), (Y // 256).ravel().tolist())):
            fn = '/tmp/world/ortho18/%d_%d.jpg' % k
            if k not in tiles: tiles[k] = np.asarray(Image.open(fn).convert('L'), np.float32) if os.path.exists(fn) else None
            t = tiles[k]
            if t is None: continue
            m = ((X // 256) == k[0]) & ((Y // 256) == k[1])
            r[m] = t[Y[m] % 256, X[m] % 256]
        return r
    return (px(ix, iy) * (1 - ax) + px(ix + 1, iy) * ax) * (1 - ay) + (px(ix, iy + 1) * (1 - ax) + px(ix + 1, iy + 1) * ax) * ay

def phase(loc, inner, vAng, c, vx0, uy0, vx1, uy1, period):
    """区画の列（v 方向の始まり）と区画の線（u 方向）の位置。写真の模様が見えなければ None"""
    S = 0.25
    vs, us = np.arange(vx0, vx1, S), np.arange(uy0, uy1, S)
    if len(vs) < 8 or len(us) < 8 or len(vs) * len(us) > 400000: return None
    VV, UU = np.meshgrid(vs, us, indexing='ij')
    ca, sa = math.cos(vAng), math.sin(vAng)
    X = c.x + VV * ca - UU * sa; Zw = c.y + VV * sa + UU * ca
    R = gray_arr(X, Zw)
    ins = shapely.contains_xy(inner, VV, UU) & ~np.isnan(R)
    if ins.sum() < 200: return None
    A = np.where(ins, R, 0.0); I = ins.astype(np.float64)
    best, bsc = None, 0.0
    for sv in np.arange(0, period, 0.5):
        st = vx0 + sv - period
        rel = (vs - st) % period
        band = (rel < 2 * STALL_D)   # 背中合わせの 2 列の範囲（残りは通路）
        if band.sum() < 4: continue
        Ab, Ib = A[band].sum(0), I[band].sum(0)   # u ごとの合計（区画の範囲の行だけ）
        for su in np.arange(0, STALL_W, S):
            on = (np.abs(((us - uy0 - su) + S / 2) % STALL_W - S / 2) < S / 2 + 1e-6)
            n1, n0 = Ib[on].sum(), Ib[~on].sum()
            if n1 < 20 or n0 < 20: continue
            sc = Ab[on].sum() / n1 - Ab[~on].sum() / n0
            if sc > bsc: bsc, best = sc, (st, uy0 + su)   # st は外形の端より手前から始まる（線は外形の内側で切る）
    if best is None or bsc < 4: return None
    return best

q05 = lambda v: int(round(v / 0.05))
lots, nLines = [], 0
STALL_W, STALL_D, AISLE = 2.5, 5.0, 6.0
for pg in polys:
    pg = pg.intersection(box(X0, Z0, X1, Z1))
    if pg.is_empty: continue
    cut = [bt[i] for i in btree.query(pg)] + [rt[i] for i in rtree.query(pg)]
    if cut: pg = pg.difference(unary_union(cut).buffer(0.3))
    pg = pg.buffer(-0.2).buffer(0.2)
    parts = [g for g in (pg.geoms if hasattr(pg, 'geoms') else [pg]) if g.geom_type == 'Polygon' and g.area > 30]
    for p in parts:
        p = p.simplify(0.4)   # 土地利用の外形は細かい折れが多い（三角形を減らす。40cm 以内の形は変えない）
        if p.is_empty or p.geom_type != 'Polygon': continue
        # 区画の向き
        mrr = p.minimum_rotated_rectangle
        cs = list(mrr.exterior.coords)
        e1 = (cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]); e2 = (cs[2][0] - cs[1][0], cs[2][1] - cs[1][1])
        long_, short_ = (e1, e2) if math.hypot(*e1) >= math.hypot(*e2) else (e2, e1)
        aShort = math.atan2(short_[1], short_[0]) % math.pi
        th, coh = photo_dir(p)
        vAng = aShort
        if coh > 0.15:
            aLong = math.atan2(long_[1], long_[0]) % math.pi
            d = lambda a, b2: min(abs(a - b2), math.pi - abs(a - b2))
            vAng = aShort if d(th, aShort) <= d(th, aLong) else aLong
        # 区画の線を、v（区画の線の向き）・u（列の向き）の座標で作り、外形の 0.6m 内側で切る
        c = p.centroid
        loc = affinity.rotate(affinity.translate(p, -c.x, -c.y), -vAng, origin=(0, 0), use_radians=True)   # v を +x に
        inner = loc.buffer(-0.6)
        if inner.is_empty: continue
        vx0, uy0, vx1, uy1 = loc.bounds
        segs = []
        period = 2 * STALL_D + AISLE
        L = vx1 - vx0
        start = vx0 + ((L - AISLE) % period) / 2 + AISLE / 2 if L > period else vx0 + max(0.3, (L - 2 * STALL_D) / 2)
        u0 = uy0 + ((uy1 - uy0) % STALL_W) / 2
        # 列と区画の位置を写真に合わせる: 区画の線（白）の上が、区画の中（車・舗装）より明るくなる位置を探す
        ph = phase(loc, inner, vAng, c, vx0, uy0, vx1, uy1, period)
        if ph: start, u0 = ph
        v = start
        while v + STALL_D <= vx1 + 0.01:
            rowsN = 2 if v + 2 * STALL_D <= vx1 + 0.01 else 1
            for k in range(rowsN):
                a0 = v + k * STALL_D
                u = u0
                while u <= uy1:
                    segs.append(LineString([(a0, u), (a0 + STALL_D, u)]))
                    u += STALL_W
            if rowsN == 2: segs.append(LineString([(v + STALL_D, uy0), (v + STALL_D, uy1)]))   # 背中合わせの区画の間の線
            v += period
        out_lines = []
        for s in segs:
            g = s.intersection(inner)
            for gg in (g.geoms if hasattr(g, 'geoms') else [g]):
                if gg.geom_type != 'LineString' or gg.length < (1.5 if gg.length < STALL_D else 2.0): continue
                gw = affinity.translate(affinity.rotate(gg, vAng, origin=(0, 0), use_radians=True), c.x, c.y)
                (ax, az), (bx, bz) = gw.coords[0], gw.coords[-1]
                out_lines += [q05(ax), q05(az), q05(bx), q05(bz)]
        # 舗装の面（三角形）
        verts, index, vid = [], [], {}
        def vi(x, z):
            k = (q05(x), q05(z))
            if k not in vid: vid[k] = len(verts) // 2; verts.extend(k)
            return vid[k]
        # 地形の格子（10m）で切ってから三角形にする（地面の三角形に沿わせて、浮きやめり込みを防ぐ）
        C5 = T['cell'] * 2; bx0, bz0, bx1, bz1 = p.bounds   # 10m（地形の格子 2 つ分）
        for gi in range(int(math.floor((bx0 - X0) / C5)), int(math.ceil((bx1 - X0) / C5))):
            for gj in range(int(math.floor((bz0 - Z0) / C5)), int(math.ceil((bz1 - Z0) / C5))):
                cell = p.intersection(box(X0 + gi * C5, Z0 + gj * C5, X0 + (gi + 1) * C5, Z0 + (gj + 1) * C5))
                for cc in (cell.geoms if hasattr(cell, 'geoms') else [cell]):
                    if cc.geom_type != 'Polygon' or cc.area < 0.05: continue
                    for t in shapely.constrained_delaunay_triangles(cc).geoms:
                        xy = list(t.exterior.coords)[:3]
                        index.extend([vi(*xy[0]), vi(*xy[1]), vi(*xy[2])])
        lots.append({'tri': {'v': verts, 'i': index}, 'lines': out_lines})
        nLines += len(out_lines) // 4
json.dump({'q': 0.05, 'lots': lots, 'credit': '© OpenStreetMap contributors（amenity=parking）。区画の向きは国土地理院の航空写真から読み取り'}, open(os.path.join(out, 'parking.json'), 'w'), separators=(',', ':'))
print('駐車場', len(lots), ' 区画の線', nLines, ' ', os.path.getsize(os.path.join(out, 'parking.json')) // 1024, 'KB')
