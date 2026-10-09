#!/usr/bin/env python3
"""VIRTUAL SHIZUOKA（静岡県の点群データ。CC BY 4.0 / ODbL）の航空レーザ測量のオルソ画像（1 画素 20cm）を、ゲームの範囲の分だけ集める。
  python3 tools/world/vs_ortho.py assets/data/world/center
入力: 図郭の索引（ベクトルタイル。図郭番号とダウンロード先）
出力: /tmp/world/vs_ortho/<図郭>/…tif（平面直角座標系 第 8 系、400m × 300m、2000 × 1500 画素）と、図郭の一覧 /tmp/world/vs_ortho/index.json
      index.json … [{ mesh, x0, y0（左上の X・Y、m）, w, h, px（m）, file }]
画像はリポジトリに含めない（路面の表示を読み取る・地面の写真を作るのに使う）。出典: 静岡県 VIRTUAL SHIZUOKA。"""
import sys, os, json, math, glob, subprocess, zipfile
import mapbox_vector_tile
import pyproj
from shapely.geometry import shape, box
from shapely.ops import transform as stransform

out = sys.argv[1]
D = '/tmp/world/vs_ortho'; os.makedirs(D, exist_ok=True)
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
T = json.load(open(os.path.join(out, 'roads.json')))['terrain']
X0, Z0, X1, Z1 = T['x0'], T['z0'], T['x0'] + (T['nx'] - 1) * T['cell'], T['z0'] + (T['nz'] - 1) * T['cell']
lat_lo, lat_hi = LAT0 - Z1 / KZ, LAT0 - Z0 / KZ
lon_lo, lon_hi = LON0 + X0 / KX, LON0 + X1 / KX
area = box(lon_lo, lat_lo, lon_hi, lat_hi)
IDX = 'https://gic-shizuoka.s3.ap-northeast-1.amazonaws.com/2025/Vectortile/mw/LP/merge/ortho/%d/%d/%d.pbf'
Z = 14; n = 2 ** Z
tx = lambda lon: (lon + 180) / 360 * n
ty = lambda lat: (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
meshes = {}
for x in range(int(tx(lon_lo)), int(tx(lon_hi)) + 1):
    for y in range(int(ty(lat_hi)), int(ty(lat_lo)) + 1):
        f = os.path.join(D, 'idx_%d_%d.pbf' % (x, y))
        if not os.path.exists(f): subprocess.run(['curl', '-s', '-o', f, '--max-time', '60', IDX % (Z, x, y)], check=True)
        L = mapbox_vector_tile.decode(open(f, 'rb').read()).get('Ortho')
        if not L: continue
        ext = L.get('extent', 4096)
        def ll(px, py, x=x, y=y, ext=ext):
            fx, fy = x + px / ext, y + 1 - py / ext
            return (fx / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / n)))))
        for ft in L['features']:
            g = stransform(lambda a, b, c=None: ll(a, b), shape(ft['geometry']))
            if g.intersects(area): meshes[ft['properties']['MESH_NO']] = ft['properties']['URL']
print('図郭', len(meshes))
index = []
for i, (m, url) in enumerate(sorted(meshes.items())):
    md = os.path.join(D, m)
    tifs = glob.glob(os.path.join(md, '**', '*.tif'), recursive=True)
    if not tifs:
        z = os.path.join(D, m + '.zip')
        for k in range(4):
            r = subprocess.run(['curl', '-s', '-o', z, '-w', '%{http_code}', '--max-time', '600', url], capture_output=True, text=True)
            if r.stdout == '200': break
        zipfile.ZipFile(z).extractall(md); os.remove(z)
        tifs = glob.glob(os.path.join(md, '**', '*.tif'), recursive=True)
    tif = tifs[0]; tfw = [float(v) for v in open(tif[:-4] + '.tfw').read().split()]
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    w, h = Image.open(tif).size
    index.append({'mesh': m, 'x0': tfw[4] - tfw[0] / 2, 'y0': tfw[5] - tfw[3] / 2, 'w': w, 'h': h, 'px': tfw[0], 'file': tif})
    print(i + 1, '/', len(meshes), m, w, h, flush=True)
json.dump(index, open(os.path.join(D, 'index.json'), 'w'), ensure_ascii=False, indent=0)
