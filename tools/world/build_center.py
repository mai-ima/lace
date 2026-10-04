#!/usr/bin/env python3
"""浜松駅周辺（試作の範囲）の世界データを作る。
  python3 tools/world/build_center.py /tmp/world/osm assets/data/world/center
出力:
  roads.json   … OSM の道路（車道）と、信号・横断歩道・一時停止などの点。座標はゲームの x（東, m）z（南, m）y（標高, m）
  terrain.bin  … 国土地理院 5m DEM（dem5a_png、z15）から作った 5m 格子の標高（Uint16、cm + 5000）
出典: © OpenStreetMap contributors（ODbL）、国土地理院（地理院タイル）。"""
import sys, os, glob, json, math, io, urllib.request, struct
import xml.etree.ElementTree as ET
from PIL import Image
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
def xz(lat, lon): return ((lon - LON0) * KX, (LAT0 - lat) * KZ)
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

ROADS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service',
         'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'busway'}
KEEP = ['highway', 'lanes', 'lanes:forward', 'lanes:backward', 'oneway', 'width', 'turn:lanes', 'turn:lanes:forward', 'turn:lanes:backward',
        'layer', 'bridge', 'tunnel', 'maxspeed', 'name', 'ref', 'junction', 'sidewalk', 'service', 'surface', 'destination', 'placement', 'cycleway', 'access', 'bus', 'psv']
NODE_KEYS = {'highway': {'traffic_signals', 'crossing', 'stop', 'give_way', 'street_lamp', 'bus_stop', 'motorway_junction', 'toll_gantry', 'turning_circle'},
             'crossing': None, 'traffic_signals': None, 'railway': {'level_crossing'}, 'barrier': {'toll_booth', 'bollard', 'gate'}}
nodes, ways, seenw = {}, [], set()
for fn in sorted(glob.glob(os.path.join(src, '*.xml'))):
    root = ET.parse(fn).getroot()
    for nd in root.iter('node'):
        tags = {t.get('k'): t.get('v') for t in nd.iter('tag')}
        nodes[nd.get('id')] = (float(nd.get('lat')), float(nd.get('lon')), tags)
    for w in root.iter('way'):
        wid = w.get('id')
        if wid in seenw: continue
        tags = {t.get('k'): t.get('v') for t in w.iter('tag')}
        hw = tags.get('highway')
        kind = None
        # バス・タクシー専用の道（バスターミナルの周回路など）は、一般の通行止め（access=no）でも道路として入れる
        psv = hw == 'busway' or tags.get('bus') in ('yes', 'designated') or tags.get('psv') in ('yes', 'designated') or '専用' in (tags.get('name') or '')
        if hw in ROADS and tags.get('area') != 'yes' and (tags.get('access') not in ('no', 'private') or psv): kind = 'road'
        elif tags.get('railway') in ('rail', 'light_rail'): kind = 'rail'
        elif tags.get('natural') == 'water' or tags.get('waterway') in ('river', 'canal', 'riverbank'): kind = 'water'
        elif tags.get('amenity') == 'parking' and tags.get('parking') in (None, 'surface'): kind = 'parking'
        if not kind: continue
        seenw.add(wid)
        ways.append((kind, wid, [n.get('ref') for n in w.iter('nd')], tags))

# DEM（5m）。範囲は駅を中心に ±HALF m（ここから外の道は切り落とす）
HALF = float(os.environ.get('HALF', '1200'))
x0, x1, z0, z1 = -HALF, HALF, -HALF, HALF
CELL = 5.0
nx, nz = int((x1 - x0) / CELL) + 1, int((z1 - z0) / CELL) + 1
Z = 15; N = 2 ** Z
cache = {}
def tile(tx, ty):
    if (tx, ty) in cache: return cache[(tx, ty)]
    fn = '/tmp/world/dem/%d_%d.png' % (tx, ty)
    os.makedirs('/tmp/world/dem', exist_ok=True)
    if not os.path.exists(fn):
        url = 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/%d/%d/%d.png' % (Z, tx, ty)
        try: open(fn, 'wb').write(urllib.request.urlopen(url, timeout=60).read())
        except Exception as ex: print('dem miss', tx, ty, ex); cache[(tx, ty)] = None; return None
    im = Image.open(fn).convert('RGB'); cache[(tx, ty)] = im.load(); return cache[(tx, ty)]
def dem(lat, lon):
    fx = (lon + 180) / 360 * N
    fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * N
    tx, ty = int(fx), int(fy)
    px = tile(tx, ty)
    if px is None: return None
    i, j = min(255, int((fx - tx) * 256)), min(255, int((fy - ty) * 256))
    r, g, b = px[i, j]
    v = r * 65536 + g * 256 + b
    if v == 8388608: return None
    if v > 8388608: v -= 16777216
    return v * 0.01
H = []
for j in range(nz):
    for i in range(nx):
        x, z = x0 + i * CELL, z0 + j * CELL
        lat, lon = LAT0 - z / KZ, LON0 + x / KX
        h = dem(lat, lon)
        H.append(h)
# 欠測（水面など）は周りの値で埋める
for it in range(60):
    miss = 0
    for j in range(nz):
        for i in range(nx):
            k = j * nx + i
            if H[k] is not None: continue
            vs = [H[(j + dj) * nx + i + di] for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= i + di < nx and 0 <= j + dj < nz and H[(j + dj) * nx + i + di] is not None]
            if vs: H[k] = sum(vs) / len(vs)
            else: miss += 1
    if not miss: break
H = [h if h is not None else 0.0 for h in H]
with open(os.path.join(out, 'terrain.bin'), 'wb') as f:
    f.write(struct.pack('<%dH' % len(H), *[max(0, min(65535, int(round(h * 100)) + 5000)) for h in H]))
def hAt(x, z):
    fi, fj = (x - x0) / CELL, (z - z0) / CELL
    i, j = max(0, min(nx - 2, int(fi))), max(0, min(nz - 2, int(fj)))
    u, v = fi - i, fj - j
    a, b, c, d = H[j * nx + i], H[j * nx + i + 1], H[(j + 1) * nx + i], H[(j + 1) * nx + i + 1]
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v

# 点と線
idx, P, FEAT = {}, [], []
def ni(r):
    if r not in idx:
        lat, lon, tags = nodes[r]
        x, z = xz(lat, lon)
        idx[r] = len(P) // 3; P.extend([round(x, 2), round(z, 2), round(hAt(x, z), 2)])
        f = {}
        for k, allow in NODE_KEYS.items():
            if k in tags and (allow is None or tags[k] in allow): f[k] = tags[k]
        for k in ('direction', 'traffic_signals:direction', 'crossing', 'name'):
            if k in tags: f[k] = tags[k]
        if f: FEAT.append([idx[r], f])
    return idx[r]
W = []
def inside(r):
    x, z = xz(nodes[r][0], nodes[r][1]); return x0 <= x <= x1 and z0 <= z <= z1
for kind, wid, refs0, tags in ways:
  refs0 = [r for r in refs0 if r in nodes]
  # 範囲の外の点で切り分ける（範囲の境目を 1 点だけ含める）
  parts, cur = [], []
  for r in refs0:
      if inside(r): cur.append(r)
      else:
          if cur: cur.append(r); parts.append(cur); cur = []
          elif parts == [] and False: pass
  if cur: parts.append(cur)
  for refs in parts:
    if len(refs) < 2: continue
    W.append({'k': kind, 'id': int(wid), 'n': [ni(r) for r in refs], 't': {k: tags[k] for k in KEEP if k in tags} if kind == 'road' else {k: v for k, v in tags.items() if k in ('name', 'railway', 'layer', 'bridge', 'tunnel', 'natural', 'waterway', 'amenity', 'parking')}})
data = {'v': 1, 'origin': [LAT0, LON0], 'terrain': {'x0': x0, 'z0': z0, 'nx': nx, 'nz': nz, 'cell': CELL, 'enc': 'u16cm+5000'},
        'p': P, 'ways': W, 'feat': FEAT, 'credit': '© OpenStreetMap contributors (ODbL) / 国土地理院 地理院タイル'}
json.dump(data, open(os.path.join(out, 'roads.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('nodes', len(P) // 3, 'ways', len(W), 'roads', sum(1 for w in W if w['k'] == 'road'), 'feat', len(FEAT), 'grid', nx, nz, 'bytes', os.path.getsize(os.path.join(out, 'roads.json')))
