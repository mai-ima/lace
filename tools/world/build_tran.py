#!/usr/bin/env python3
"""PLATEAU の道路モデル（交通・道路 LOD1、MVT）から、道路の範囲の多角形と、OSM の道路ごとの実測の道幅を作る。
  python3 tools/world/build_tran.py assets/data/world/center
出力:
  road_area.json  … 道路の範囲（車道と歩道を含む。数値地形図の道路縁）の多角形。座標はゲームの x（東）z（南）、0.05m 単位の整数
  road_width.json … OSM の道路（way の id）ごとに、中心線から直角に測った道路の範囲の幅（中央値, m）と、中心線のずれ（m、+ は進行方向の右）
中の島（中央分離帯・交通島）は、国土地理院ベクトルタイルの道路構成線（/tmp/world/gsibv）で囲まれた所だけにする（塗装だけの導流帯は車道）。
出典: 国土交通省 PLATEAU（3D 都市モデル 浜松市 交通（道路）モデル LOD1、2023 年度）を加工して作成。国土地理院ベクトルタイル（道路構成線・鉄道）。"""
import sys, os, math, json, glob, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mapbox_vector_tile
from shapely.geometry import Polygon, MultiPolygon, MultiPoint, LineString, Point, box
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

def road_look(geom, strict=False):
    """多角形の中が道路に見える割合（VIRTUAL SHIZUOKA のオルソ 20cm を 0.5m ごとに見る。暗い無彩色か白い塗料）"""
    try:
        from vsimg import VS
    except Exception:
        return None
    global _vs
    if '_vs' not in globals(): _vs = VS()
    import numpy as np
    from shapely import contains_xy
    mnx, mnz, mxx, mxz = geom.bounds
    X, Zg = np.meshgrid(np.arange(mnx, mxx, 0.5), np.arange(mnz, mxz, 0.5))
    ins = contains_xy(geom, X.ravel(), Zg.ravel())
    if ins.sum() < 6: return None
    px = _vs.sample(X.ravel()[ins], Zg.ravel()[ins]) / 255.0; px = px[~np.isnan(px[:, 0])]
    if len(px) < 6: return None
    L = px.mean(1); sat = px.max(1) - px.min(1)
    dark = ((L > 0.1) & (L < 0.45) & (sat < 0.1)).mean(); white = ((L > 0.58) & (sat < 0.12)).mean()
    if strict and white < 0.03: return 0.0   # 車道沿いの見直し: 白い線（区画線・文字）の無い所は、アスファルトの歩道かもしれないので戻さない
    return float(dark + white) if dark >= (0.55 if strict else 0.4) else 0.0   # 明るい屋根・コンクリートだけの所は道路にしない


def osm_sidewalks():
    """OSM（/tmp/world/osm/*.xml）の独立した歩道の線（highway=footway かつ footway=sidewalk）"""
    import xml.etree.ElementTree as ET
    fs = glob.glob('/tmp/world/osm/*.xml')
    if not fs: return None
    nodes, ws = {}, {}
    for f in fs:
        r = ET.parse(f).getroot()
        for nd in r.iter('node'): nodes[nd.get('id')] = ((float(nd.get('lon')) - LON0) * KX, (LAT0 - float(nd.get('lat'))) * KZ)
        for w in r.iter('way'):
            t = {x.get('k'): x.get('v') for x in w.iter('tag')}
            if t.get('highway') == 'footway' and t.get('footway') == 'sidewalk': ws[w.get('id')] = [x.get('ref') for x in w.iter('nd')]
    ls = []
    for refs in ws.values():
        P = [nodes[r] for r in refs if r in nodes]
        if len(P) >= 2: ls.append(LineString(P))
    return unary_union(ls) if ls else None


RAILS = None


def gsi_islands():
    """地理院ベクトルタイル（/tmp/world/gsibv、ズーム 16）の道路構成線（RdCompt。vt_code 2401・2411 = 分離帯などの縁）を閉じた形にする"""
    from shapely.ops import polygonize, linemerge
    fs = glob.glob('/tmp/world/gsibv/16_*.pbf')
    if not fs: return None, None
    import gzip
    lines = []; global RAILS; rails = []
    for f in fs:
        zz, ti, tj = map(int, os.path.basename(f)[:-4].split('_'))
        b = open(f, 'rb').read(); b = gzip.decompress(b) if b[:2] == b'\x1f\x8b' else b
        dec = mapbox_vector_tile.decode(b)
        for R_ in (dec.get('RailCL'), dec.get('RailTrCL')):
            if not R_: continue
            for ft in R_['features']:
                g = ft['geometry']; cs = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
                for c in cs:
                    if len(c) >= 2: rails.append(LineString([tile_to_xz(ti, tj, px, py, R_.get('extent', 4096)) for px, py in c]))
        L = dec.get('RdCompt')
        if not L: continue
        ext = L.get('extent', 4096)
        for ft in L['features']:
            if ft['properties'].get('vt_code') not in (2401, 2411): continue
            g = ft['geometry']; cs = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
            for c in cs:
                if len(c) >= 2: lines.append(LineString([tile_to_xz(ti, tj, px, py, ext) for px, py in c]))
    if not lines: return None, None
    # タイルの境目で切れた線をつなぐため、0.3m 太らせて塞いだ形の穴（＝囲まれた所）を島にする
    fat = unary_union([l.buffer(0.15) for l in lines])
    polys = []
    for g in (fat.geoms if hasattr(fat, 'geoms') else [fat]):
        for h in g.interiors:
            pg = Polygon(h)
            if pg.area >= 1.0: polys.append(pg.buffer(0.15))
    rdc = unary_union(lines)
    RAILS = unary_union(rails).buffer(3.0) if rails else None   # 線路（駅・高架の下を車道にしないため）
    # 端の開いた細長い分離帯: 2 本の線に挟まれた帯（間隔 3.2m まで）。1.6m 太らせて 1.5m 細らせると、線の間だけが残る
    band = rdc.buffer(1.6, join_style=2).buffer(-1.5, join_style=2).buffer(-0.08).buffer(0.08)   # 幅 0.3m 程度の細い分離帯（柵・縁石だけの物）も残す
    polys += [g for g in (band.geoms if hasattr(band, 'geoms') else [band]) if g.geom_type == 'Polygon' and g.area >= 1.5]
    return (unary_union(polys) if polys else None), rdc


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
    # 交差点: 腕ごとに中心から外へ（ほかの腕の最大の半幅 + 隅切り 3m）の長さの帯を作り、その凸包。角が斜めに切れた形（隅切り）になる
    def junction_shape(nd):
        arms = nd.get('arms') or []
        if len(arms) < 2: return Point(nd['x'], nd['z']).buffer(nd['r'] + 2.0, 24)
        pts = []
        for a in arms:
            L = max(b['hw'] for b in arms if b is not a) + 3.0
            lx, lz = -a['dz'], a['dx']
            for s_ in (0.0, L):
                for o in (-a['hw'], a['hw']): pts.append((nd['x'] + a['dx'] * s_ + lx * o, nd['z'] + a['dz'] * s_ + lz * o))
        return MultiPoint(pts).convex_hull
    shapes += [junction_shape(nd) for nd in net['nodes']]
    carU = unary_union(shapes)
    # 歩道の無い区分の道を太らせた分のうち、OSM の独立した歩道の線（footway=sidewalk）が通る所は歩道にする
    #   （駅前の一方通行 4 車線など、区分は unclassified でも歩道のある道。タイル舗装の歩道まで車道にしないため）
    swl = osm_sidewalks()
    if swl is not None:
        core = unary_union([LineString(e['pts']).buffer(e['hw'] + 0.5, cap_style=2, join_style=1) for e in net['edges'] if len(e['pts']) >= 2] + [junction_shape(nd) for nd in net['nodes']])
        E = carU.difference(core).intersection(U)
        ex = []; eb = E.bounds; g = 10.0; gx = eb[0]
        while gx < eb[2]:
            gz = eb[1]
            while gz < eb[3]:
                piece = E.intersection(box(gx, gz, gx + g, gz + g))
                if not piece.is_empty and piece.area > 2 and piece.intersects(swl):
                    fr = road_look(piece)
                    if fr is None or fr < 0.6: ex.append(piece)   # 写真がアスファルト（車線）に見える所は車道のまま（OSM の歩道の線の位置ずれ）
                gz += g
            gx += g
        if ex:
            exU = unary_union(ex); carU = carU.difference(exU)
            print('OSM の歩道の線で歩道にした所 %.0f m2' % exU.area)
    car = carU.intersection(U)
    walk = U.difference(carU)
    walk = walk.buffer(-0.4).buffer(0.4)   # 幅 0.8m 未満の細い部分は捨てる（車道として扱う）
    wparts = [g for g in (walk.geoms if hasattr(walk, 'geoms') else [walk]) if g.geom_type == 'Polygon' and g.area >= 4]
    walk = unary_union(wparts).simplify(0.1)
    # 航空写真で見直す: 歩道とした所のうち、幅 5m 以上でアスファルトの色（暗い無彩色、影の青みが無い）の所は車道に戻す
    #   （バスターミナルの周回路、OSM の幅を少なく見積もった外側の車線、停車帯など。普通の歩道は幅 5m 未満なので対象外）
    from PIL import Image
    import numpy as np
    img = np.asarray(Image.open(os.path.join(out, 'ortho.jpg')).convert('RGB')).astype(np.float32) / 255.0
    NPX = img.shape[0]; SPAN = X1 - X0
    def photo_stats(geom):
        minx, minz, maxx, maxz = geom.bounds; pts = []
        x = minx + 0.5
        while x < maxx:
            z = minz + 0.5
            while z < maxz:
                if geom.contains(Point(x, z)): pts.append((x, z))
                z += 1.0
            x += 1.0
        if len(pts) < 8: return None
        ij = np.array([[int((zz - Z0) / SPAN * NPX), int((xx - X0) / SPAN * NPX)] for xx, zz in pts]).clip(0, NPX - 1)
        px = img[ij[:, 0], ij[:, 1]]
        L = px.mean(1); sat = px.max(1) - px.min(1); br = px[:, 2] / np.maximum(px.sum(1), 1e-3)
        asph = (L > 0.18) & (L < 0.46) & (sat < 0.09) & (br < 0.355)
        return asph.mean()
    to_car = []
    wb = walk.bounds; g = 12.0; gx = wb[0]
    while gx < wb[2]:
        gz = wb[1]
        while gz < wb[3]:
            piece = walk.intersection(box(gx, gz, gx + g, gz + g))
            if not piece.is_empty and piece.area > 20:
                core = piece.buffer(-2.6)
                if not core.is_empty and core.area > 4:
                    fa = photo_stats(core)
                    if fa is not None and fa > 0.6: to_car.append(core.buffer(2.6).intersection(piece))
            gz += g
        gx += g
    if to_car:
        tc = unary_union(to_car)
        walk = walk.difference(tc).buffer(-0.4).buffer(0.4)
        wparts = [gg for gg in (walk.geoms if hasattr(walk, 'geoms') else [walk]) if gg.geom_type == 'Polygon' and gg.area >= 4]
        walk = unary_union(wparts).simplify(0.1)
        print('航空写真で車道に戻した所 %.0f m2' % tc.area)
    # 3 段目: 道路の中の島（中央分離帯・交通島）は、地理院の道路構成線（分離帯・島の縁）で囲まれた所だけにする。
    #   上下線の間の導流帯（白い「く」の字などを塗っただけの平らな所）を島にしない。囲まれた島で車道になっている所は島にする
    isl, rdc = gsi_islands()
    walk_meas = walk if isl is None else unary_union([walk, isl.intersection(U)])   # 車線の幅を測るときは、導流帯も車道に含めない（走る所ではない）
    if isl is not None or rdc is not None:
        if isl is None: isl = Polygon()
        outer = U.boundary.buffer(1.0)
        keep = []
        for g in (walk.geoms if hasattr(walk, 'geoms') else [walk]):
            if g.intersects(outer): keep.append(g)   # 歩道（道路の外の縁に接する）
            else:
                k = g.intersection(isl.buffer(0.3))
                if not k.is_empty: keep.append(k)
                # 車道に戻すのは、写真が道路（暗い無彩色のアスファルトか白い塗料）に見える所だけ（駅・高架の下などは島のまま）
                rest = g.difference(isl.buffer(0.3))
                for rp in (rest.geoms if hasattr(rest, 'geoms') else [rest]):
                    if rp.geom_type != 'Polygon' or rp.area < 2: continue
                    fr = road_look(rp)
                    onrail = RAILS is not None and rp.intersection(RAILS).area > 0.2 * rp.area
                    if fr is None or fr < 0.6 or onrail: keep.append(rp)
        # 道路の外の縁につながった歩道でも、縁から 5m より内側（中央分離帯・島）は道路構成線の島に重なる所だけにする
        kw = unary_union(keep); deep = kw.difference(U.boundary.buffer(5.0))
        for dp in (deep.geoms if hasattr(deep, 'geoms') else [deep]):
            if dp.geom_type != 'Polygon' or dp.area < 4: continue
            rest = dp.difference(isl.buffer(0.3))
            for rp in (rest.geoms if hasattr(rest, 'geoms') else [rest]):
                if rp.geom_type != 'Polygon' or rp.area < 4: continue
                fr = road_look(rp); onrail = RAILS is not None and rp.intersection(RAILS).area > 0.2 * rp.area
                if fr is not None and fr >= 0.6 and not onrail: kw = kw.difference(rp.buffer(0.05))
        keep = [kw]
        before = walk.area
        walk = unary_union(keep + [isl.intersection(U)]).buffer(-0.3).buffer(0.3)
        wparts = [gg for gg in (walk.geoms if hasattr(walk, 'geoms') else [walk]) if gg.geom_type == 'Polygon' and gg.area >= 2]
        walk = unary_union(wparts).simplify(0.1)
        print('地理院の道路構成線で島を直した: 歩道・島 %.0f → %.0f m2（島 %d 個）' % (before, walk.area, len(isl.geoms) if hasattr(isl, 'geoms') else 1))
    # 4 段目: 車道に接する歩道のうち、写真でアスファルト（暗い無彩色 5.5 割以上・白い線と合わせて 7 割以上）に見える 4m 升を車道に戻す（2 回。
    #   OSM の道幅が実際より狭く、外側の車線・バス専用の車線が歩道になっている所）。線路・建物の中は除く
    for _ in range(2):
        # 車道に接する歩道の帯（車道から 4m まで）を、小さな形ごとに 4m 升で見る（全体の形で毎回計算すると遅い）
        carNow = U.difference(walk); band = carNow.buffer(4.0).intersection(walk)
        conv = []; g = 4.0
        for bp in (band.geoms if hasattr(band, 'geoms') else [band]):
            if bp.geom_type != 'Polygon' or bp.area < 3: continue
            eb = bp.bounds; gx = math.floor(eb[0] / g) * g
            while gx < eb[2]:
                gz = math.floor(eb[1] / g) * g
                while gz < eb[3]:
                    piece = bp.intersection(box(gx, gz, gx + g, gz + g))
                    if not piece.is_empty and piece.area > 3:
                        fr = road_look(piece, strict=True)
                        if fr is not None and fr >= 0.7 and not (RAILS is not None and piece.intersects(RAILS)): conv.append(piece)
                    gz += g
                gx += g
        if not conv: break
        cu = unary_union(conv); walk = walk.difference(cu.buffer(0.05)).buffer(-0.4).buffer(0.4)
        wparts = [gg for gg in (walk.geoms if hasattr(walk, 'geoms') else [walk]) if gg.geom_type == 'Polygon' and gg.area >= 4]
        walk = unary_union(wparts).simplify(0.1)
        print('写真で車道に戻した車道沿いの所 %.0f m2' % cu.area)
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
def measure(geoms, Ls, maxw=59):
    """中心線から直角に、geoms（多角形のリスト）の縁までを 8m ごとに測る。返り値: 幅の中央値・中心のずれの中央値・測れた数"""
    tree = STRtree(geoms)
    widths, offs = [], []
    s = 10.0
    while s < Ls.length - 10.0:
        p = Ls.interpolate(s); a = Ls.interpolate(max(0, s - 1)); b = Ls.interpolate(min(Ls.length, s + 1))
        dx, dz = b.x - a.x, b.y - a.y; l = math.hypot(dx, dz) or 1
        nx, nz = -dz / l, dx / l   # + 側（進行方向の左右は座標系に対して一定。roadnet の ribbon と同じ + 側）
        seg = LineString([(p.x - nx * 30, p.y - nz * 30), (p.x + nx * 30, p.y + nz * 30)])
        hit = None
        for idx in tree.query(seg):
            g = geoms[idx]
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
            if hi_ - lo_ < maxw: widths.append(hi_ - lo_); offs.append((hi_ + lo_) / 2)
        s += 8.0
    if len(widths) < 2: return None
    widths.sort(); offs.sort()
    return round(widths[len(widths) // 2], 2), round(offs[len(offs) // 2], 2), len(widths)
# 車道だけの幅（航空写真で見直したあとの車道）。roadnet はこれで車線数と車線の位置を決める（歩道の幅を仮定しなくてよい）
carParts = None
if NET and os.path.exists(NET):
    cg = U.difference(walk_meas).simplify(0.1).buffer(0)
    carParts = [g for g in (cg.geoms if hasattr(cg, 'geoms') else [cg]) if g.geom_type == 'Polygon']
res = {}
for w in roads['ways']:
    if w['k'] != 'road': continue
    Ls = LineString([pos(k) for k in w['n']])
    if Ls.length < 20: continue
    m = measure(parts, Ls)
    if not m: continue
    r = list(m)
    if carParts:
        mc = measure(carParts, Ls, 45)
        if mc: r += [mc[0], mc[1]]
    res[str(w['id'])] = r
json.dump(res, open(os.path.join(out, 'road_width.json'), 'w'), separators=(',', ':'))
ws = sorted(v[0] for v in res.values()); os_ = sorted(abs(v[1]) for v in res.values())
print('road_width.json', len(res), '本', '幅の中央値 %.1f m' % ws[len(ws) // 2], 'ずれの中央値 %.2f m' % os_[len(os_) // 2])
