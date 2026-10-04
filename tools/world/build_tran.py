#!/usr/bin/env python3
"""PLATEAU の道路モデル（交通・道路 LOD1、MVT）から、道路の範囲の多角形と、OSM の道路ごとの実測の道幅を作る。
  python3 tools/world/build_tran.py assets/data/world/center
出力:
  road_area.json  … 道路の範囲（車道と歩道を含む。数値地形図の道路縁）の多角形。座標はゲームの x（東）z（南）、0.05m 単位の整数
  road_width.json … OSM の道路（way の id）ごとに、中心線から直角に測った道路の範囲の幅（中央値, m）と、中心線のずれ（m、+ は進行方向の右）
出典: 国土交通省 PLATEAU（3D 都市モデル 浜松市 交通（道路）モデル LOD1、2023 年度）を加工して作成。"""
import sys, os, math, json, glob, urllib.request
import mapbox_vector_tile
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
out = sys.argv[1]
roads = json.load(open(os.path.join(out, 'roads.json')))
T = roads['terrain']
X0, Z0 = T['x0'], T['z0']
X1, Z1 = X0 + (T['nx'] - 1) * T['cell'], Z0 + (T['nz'] - 1) * T['cell']
Z = 16; n = 2 ** Z
URL = 'https://assets.cms.plateau.reearth.io/assets/ce/beba6b-54b7-4b85-b0b5-a79bf0d61b7e/22130_hamamatsu-shi_city_2023_citygml_2_op_tran_mvt_lod1/{z}/{x}/{y}.mvt'
cache = '/tmp/world/tran'; os.makedirs(cache, exist_ok=True)
def tx(lon): return (lon + 180) / 360 * n
def ty(lat): return (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
lon = lambda x: LON0 + x / KX
lat = lambda z: LAT0 - z / KZ
def tile_to_xz(i, j, px, py, ext):
    fx, fy = i + px / ext, j + 1 - py / ext   # MVT は y 上向き（mapbox_vector_tile の既定）
    lo = fx / n * 360 - 180
    la = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / n))))
    return ((lo - LON0) * KX, (LAT0 - la) * KZ)
polys = []
for i in range(int(tx(lon(X0))), int(tx(lon(X1))) + 1):
    for j in range(int(ty(lat(Z0))), int(ty(lat(Z1))) + 1):
        fn = os.path.join(cache, '%d_%d_%d.mvt' % (Z, i, j))
        if not os.path.exists(fn):
            urllib.request.urlretrieve(URL.format(z=Z, x=i, y=j), fn)
        d = mapbox_vector_tile.decode(open(fn, 'rb').read())
        L = d.get('Road')
        if not L: continue
        ext = L.get('extent', 4096)
        for f in L['features']:
            g = f['geometry']
            rings = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
            for rs in rings:
                try:
                    pg = Polygon([tile_to_xz(i, j, p[0], p[1], ext) for p in rs[0]], [[tile_to_xz(i, j, p[0], p[1], ext) for p in h] for h in rs[1:]])
                    if not pg.is_valid: pg = pg.buffer(0)
                    if pg.area > 0.5: polys.append(pg)
                except Exception as e:
                    pass
print('多角形', len(polys))
U = unary_union([p.buffer(0.05) for p in polys]).buffer(-0.05).intersection(box(X0, Z0, X1, Z1)).simplify(0.15)
parts = list(U.geoms) if isinstance(U, MultiPolygon) else [U]
# 三角形に分ける（制約付きドロネー。穴＝街区を正しく抜く）。ブラウザでは分割しない
import shapely
q = lambda v: int(round(v / 0.05))
def triangulate(geom):
  verts, index, vid = [], [], {}
  def vi(x, z):
    k = (q(x), q(z))
    if k not in vid: vid[k] = len(verts) // 2; verts.extend(k)
    return vid[k]
  ntri = 0
  gparts = list(geom.geoms) if hasattr(geom, 'geoms') else [geom]
  for p in gparts:
    if p.geom_type != 'Polygon' or p.area < 0.5: continue
    # 大きすぎる多角形は格子で切ってから分割する（速さのため）
    minx, minz, maxx, maxz = p.bounds
    step = 40.0   # 格子の大きさ（三角形を小さくして、地形の起伏に沿わせる）
    gx = minx
    while gx < maxx:
        gz = minz
        while gz < maxz:
            c = p.intersection(box(gx, gz, gx + step, gz + step)).segmentize(8.0)
            for cc in (c.geoms if hasattr(c, 'geoms') else [c]):
                if cc.geom_type != 'Polygon' or cc.area < 0.5: continue
                tris = shapely.constrained_delaunay_triangles(cc)
                for t in tris.geoms:
                    xy = list(t.exterior.coords)[:3]
                    index.extend(vi(*xy[0]) for _ in [0]); index.extend([vi(*xy[1]), vi(*xy[2])]); ntri += 1
            gz += step
        gx += step
  return {'v': verts, 'i': index}

# 2 段目: 車道と歩道に分ける（tools/world/dump_net.mjs が書き出した車道の中心線と半幅を使う）
#   車道 = 中心線を半幅で太らせた形 ∪ 交差点の円（腕の最大の半幅 + 2m）、ただし道路の範囲の中だけ
#   歩道 = 道路の範囲 − 車道（細すぎるもの・小さすぎるものは車道に含める）
#   縁石 = 歩道の縁のうち車道に接する部分（ゲームで高さ 15cm の段にする）
NET = sys.argv[2] if len(sys.argv) > 2 else None
res_json = {'q': 0.05, 'credit': '国土交通省 PLATEAU（浜松市 交通（道路）モデル LOD1）を加工して作成'}
if NET and os.path.exists(NET):
    net = json.load(open(NET))
    # 歩道のない道（住宅地の道など）は、道路の範囲いっぱいを車道にする（半幅 + 4m で太らせて範囲で切る）
    shapes = [LineString(e['pts']).buffer(e['hw'] if e['walk'] > 0 else e['hw'] + 4.0, cap_style=2, join_style=1) for e in net['edges'] if len(e['pts']) >= 2]
    shapes += [Point(nd['x'], nd['z']).buffer(nd['r'] + 2.0, 24) for nd in net['nodes']]
    carU = unary_union(shapes)
    car = carU.intersection(U)
    walk = U.difference(carU)
    walk = walk.buffer(-0.4).buffer(0.4)   # 幅 0.8m 未満の細い部分は捨てる（車道として扱う）
    wparts = [g for g in (walk.geoms if hasattr(walk, 'geoms') else [walk]) if g.geom_type == 'Polygon' and g.area >= 4]
    walk = unary_union(wparts).simplify(0.1)
    car = U.difference(walk).simplify(0.1)
    # 縁石の線分
    curbs = []
    for g in (walk.geoms if hasattr(walk, 'geoms') else [walk]):
        for ring in [g.exterior] + list(g.interiors):
            cs = list(ring.coords)
            for a, b in zip(cs[:-1], cs[1:]):
                m = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                if car.distance(m) < 0.2: curbs.extend([q(a[0]), q(a[1]), q(b[0]), q(b[1])])
    res_json['car'] = triangulate(car); res_json['walk'] = triangulate(walk); res_json['curb'] = curbs
    print('車道 %.0f m2・歩道 %.0f m2・縁石 %d 本' % (car.area, walk.area, len(curbs) // 4))
else:
    res_json['car'] = triangulate(U)
json.dump(res_json, open(os.path.join(out, 'road_area.json'), 'w'), separators=(',', ':'))
print('road_area.json', os.path.getsize(os.path.join(out, 'road_area.json')) // 1024, 'KB', '面積 %.0f m2' % U.area)

# OSM の道路ごとの実測の道幅（中心線から直角に、道路の範囲の縁まで）
P = roads['p']; pos = lambda k: (P[k * 3], P[k * 3 + 1])
tree = STRtree(parts)
res = {}
for w in roads['ways']:
    if w['k'] != 'road': continue
    pts = [pos(k) for k in w['n']]
    Ls = LineString(pts)
    if Ls.length < 20: continue
    widths, offs = [], []
    s = 10.0
    while s < Ls.length - 10.0:
        p = Ls.interpolate(s); a = Ls.interpolate(max(0, s - 1)); b = Ls.interpolate(min(Ls.length, s + 1))
        dx, dz = b.x - a.x, b.y - a.y; l = math.hypot(dx, dz) or 1
        nx, nz = -dz / l, dx / l   # + 側（進行方向の左右は座標系に対して一定。roadnet の ribbon と同じ + 側）
        seg = LineString([(p.x - nx * 30, p.y - nz * 30), (p.x + nx * 30, p.y + nz * 30)])
        hit = None
        for idx in tree.query(seg):
            g = parts[idx]
            if g.contains(p) or g.distance(p) < 0.5:
                inter = g.intersection(seg)
                cand = list(inter.geoms) if hasattr(inter, 'geoms') else [inter]
                for c in cand:
                    if c.length > 0 and c.distance(p) < 0.6: hit = c; break
            if hit: break
        if hit:
            c0, c1 = hit.coords[0], hit.coords[-1]
            t0 = (c0[0] - p.x) * nx + (c0[1] - p.y) * nz; t1 = (c1[0] - p.x) * nx + (c1[1] - p.y) * nz
            lo_, hi_ = min(t0, t1), max(t0, t1)
            if hi_ - lo_ < 59: widths.append(hi_ - lo_); offs.append((hi_ + lo_) / 2)
        s += 8.0
    if len(widths) >= 2:
        widths.sort(); offs.sort()
        res[str(w['id'])] = [round(widths[len(widths) // 2], 2), round(offs[len(offs) // 2], 2), len(widths)]
json.dump(res, open(os.path.join(out, 'road_width.json'), 'w'), separators=(',', ':'))
ws = sorted(v[0] for v in res.values()); os_ = sorted(abs(v[1]) for v in res.values())
print('road_width.json', len(res), '本', '幅の中央値 %.1f m' % ws[len(ws) // 2], 'ずれの中央値 %.2f m' % os_[len(os_) // 2])
