#!/usr/bin/env python3
"""地面の航空写真を 1 枚の画像にまとめる（地形の範囲と同じ広さ）。
  python3 tools/world/ortho.py assets/data/world/center [ズーム=18] [画素=4096]
出力: ortho.jpg（北が上、ゲームの x（東）と z（南）にそのまま合わせた画像）
出典: 国土地理院（地理院タイル「全国最新写真（シームレス）」）。地理院コンテンツ利用規約に従い、出典を表示して加工して使う。"""
import sys, os, json, math, io, urllib.request, concurrent.futures as cf
from PIL import Image
LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
out = sys.argv[1]
Z = int(sys.argv[2]) if len(sys.argv) > 2 else 18
PX = int(sys.argv[3]) if len(sys.argv) > 3 else 4096
T = json.load(open(os.path.join(out, 'roads.json')))['terrain']
X0, Z0 = T['x0'], T['z0']
X1, Z1 = X0 + (T['nx'] - 1) * T['cell'], Z0 + (T['nz'] - 1) * T['cell']
n = 2 ** Z
def tx(lon): return (lon + 180) / 360 * n
def ty(lat): return (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
lon = lambda x: LON0 + x / KX
lat = lambda z: LAT0 - z / KZ
i0, i1 = int(tx(lon(X0))), int(tx(lon(X1)))
j0, j1 = int(ty(lat(Z0))), int(ty(lat(Z1)))
cache = '/tmp/world/ortho%d' % Z
os.makedirs(cache, exist_ok=True)
def get(ij):
    i, j = ij
    fn = os.path.join(cache, '%d_%d.jpg' % (i, j))
    if not os.path.exists(fn):
        url = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/%d/%d/%d.jpg' % (Z, i, j)
        for k in range(5):
            try:
                with urllib.request.urlopen(url, timeout=30) as r: data = r.read()
                open(fn, 'wb').write(data); break
            except Exception as e:
                if k == 4: print('失敗', url, e); return
    return ij
jobs = [(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1)]
with cf.ThreadPoolExecutor(12) as ex: list(ex.map(get, jobs))
# タイルを並べた大きな画像（メルカトル）
W, H = (i1 - i0 + 1) * 256, (j1 - j0 + 1) * 256
mos = Image.new('RGB', (W, H), (109, 115, 99))
for i, j in jobs:
    fn = os.path.join(cache, '%d_%d.jpg' % (i, j))
    if os.path.exists(fn):
        try: mos.paste(Image.open(fn).convert('RGB'), ((i - i0) * 256, (j - j0) * 256))
        except Exception as e: print('壊れたタイル', fn, e)
# ゲーム座標（x, z が等間隔）へ。東西は線形、南北はメルカトルの式で行ごとに対応させる
px0, px1 = (tx(lon(X0)) - i0) * 256, (tx(lon(X1)) - i0) * 256
mos = mos.crop((int(px0), 0, int(math.ceil(px1)), H)).resize((PX, H), Image.LANCZOS)
outim = Image.new('RGB', (PX, PX))
rows = [(ty(lat(Z0 + (Z1 - Z0) * (r + 0.5) / PX)) - j0) * 256 for r in range(PX)]
for r in range(PX):
    y = min(H - 1, max(0, int(rows[r])))
    outim.paste(mos.crop((0, y, PX, y + 1)), (0, r))
outim.save(os.path.join(out, 'ortho.jpg'), quality=84, optimize=True, progressive=True)
print('ortho.jpg', PX, 'px', '%.2f m/px' % ((X1 - X0) / PX), os.path.getsize(os.path.join(out, 'ortho.jpg')) // 1024, 'KB', len(jobs), 'タイル')
