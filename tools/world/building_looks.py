#!/usr/bin/env python3
"""建物の見た目の素材を作る。
  python3 tools/world/building_looks.py assets/data/world/center <外壁テクスチャのフォルダ>
出力:
  ../walls.jpg      … 外壁の写真素材 8 種（各 512×512 を縦に並べた 512×4096）。明るさをそろえる
                      0 タイル張り（茶系） 1 タイル張り（灰系） 2 塗り壁（灰） 3 塗り壁（白） 4 プレキャストコンクリート
                      5 コンクリートパネル 6 リブ付きコンクリート 7 波形鋼板（工場・倉庫）
  bldg_roof.json    … 建物ごとの屋根の色（航空写真の、建物の上面の範囲の中央値。影の部分は除く）
出典: 外壁は Poly Haven（CC0）、屋根の色は国土地理院（地理院タイル 全国最新写真（シームレス））を加工。"""
import sys, os, json, struct
import numpy as np
from PIL import Image, ImageStat
out, src = sys.argv[1], sys.argv[2]
NAMES = ['rectangular_facade_tiles', 'rectangular_facade_tiles_02', 'plaster_grey_04', 'plastered_wall_05', 'precast_concrete_wall', 'concrete_panels', 'ribbed_concrete_wall', 'corrugated_iron']
atlas = Image.new('RGB', (512, 512 * len(NAMES)))
for k, n in enumerate(NAMES):
    im = Image.open(os.path.join(src, n + '.jpg')).convert('RGB').resize((512, 512), Image.LANCZOS)
    m = np.asarray(im).astype(np.float32)
    mean = m.mean()
    m = np.clip(m * (150.0 / max(1, mean)), 0, 255)   # 平均の明るさを 150 にそろえる（色はゲームの色と掛け合わせる）
    atlas.paste(Image.fromarray(m.astype(np.uint8)), (0, k * 512))
atlas.save(os.path.join(out, '..', 'walls.jpg'), quality=85, optimize=True)
print('walls.jpg', os.path.getsize(os.path.join(out, '..', 'walls.jpg')) // 1024, 'KB')

# 屋根の色: 建物の頂点のうち上面（建物の最高点から 1.5m 以内）の xz 範囲で、航空写真の画素の中央値
roads = json.load(open(os.path.join(out, 'roads.json'))); T = roads['terrain']
X0, Z0 = T['x0'], T['z0']; SPAN = (T['nx'] - 1) * T['cell']
ortho = np.asarray(Image.open(os.path.join(out, 'ortho.jpg')).convert('RGB'))
NPX = ortho.shape[0]
buf = open(os.path.join(out, 'bldg.bin'), 'rb').read()
hl = struct.unpack('<I', buf[:4])[0]; hdr = json.loads(buf[4:4 + hl]); off = 4 + hl
nv, ni = hdr['nv'], hdr['ni']
pos = np.frombuffer(buf, np.int16, nv * 3, off).astype(np.float32).reshape(-1, 3) * hdr['q']; off += nv * 6; off += (nv * 6) % 4
off += ni * 4
bid = np.frombuffer(buf, np.uint16, nv, off)
nb = int(bid.max()) + 1
roof = []
order = np.argsort(bid, kind='stable'); bs = bid[order]; starts = np.searchsorted(bs, np.arange(nb + 1))
for b in range(nb):
    idx = order[starts[b]:starts[b + 1]]
    if len(idx) == 0: roof.append(None); continue
    P = pos[idx]; top = P[:, 1].max(); up = P[P[:, 1] > top - 1.5]
    x0, x1, z0, z1 = up[:, 0].min(), up[:, 0].max(), up[:, 2].min(), up[:, 2].max()
    # 上面の範囲の内側 6 割（壁際の影・隣の建物を避ける）
    cx, cz, hx, hz = (x0 + x1) / 2, (z0 + z1) / 2, max(0.8, (x1 - x0) * 0.3), max(0.8, (z1 - z0) * 0.3)
    i0, i1 = int((cx - hx - X0) / SPAN * NPX), int((cx + hx - X0) / SPAN * NPX) + 1
    j0, j1 = int((cz - hz - Z0) / SPAN * NPX), int((cz + hz - Z0) / SPAN * NPX) + 1
    i0, j0 = max(0, i0), max(0, j0); i1, j1 = min(NPX, max(i0 + 1, i1)), min(NPX, max(j0 + 1, j1))
    px = ortho[j0:j1, i0:i1].reshape(-1, 3).astype(np.float32)
    if len(px) == 0: roof.append(None); continue
    lum = px.mean(1); keep = px[lum > np.percentile(lum, 25)]   # 暗い 4 分の 1（影）を除く
    c = np.median(keep if len(keep) else px, 0)
    roof.append([int(c[0]), int(c[1]), int(c[2])])
json.dump({'roof': roof}, open(os.path.join(out, 'bldg_roof.json'), 'w'), separators=(',', ':'))
print('bldg_roof.json', nb, '棟', os.path.getsize(os.path.join(out, 'bldg_roof.json')) // 1024, 'KB')
