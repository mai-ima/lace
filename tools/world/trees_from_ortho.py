#!/usr/bin/env python3
"""航空写真（ortho.jpg）から樹冠（木の葉の部分）を見つけて、木の位置と大きさを書き出す。
  python3 tools/world/trees_from_ortho.py assets/data/world/center
出力: trees.json … [[x, z, 樹冠の半径(m)], ...]（ゲームの x 東・z 南）。木の高さはゲーム側で樹冠の大きさから決める。
方法: 過剰緑指数 ExG = 2G − R − B が高く、暗すぎず明るすぎない画素を「樹冠」とし、ぼかしてから局所的な最大を
      4m 以上離して拾う。芝生（明るく平らな緑）は、明るさとまわりのばらつきで除く。
出典: 国土地理院（地理院タイル 全国最新写真（シームレス））を加工して作成。"""
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter
out = sys.argv[1]
roads = json.load(open(os.path.join(out, 'roads.json')))
T = roads['terrain']
X0, Z0 = T['x0'], T['z0']
SPAN = (T['nx'] - 1) * T['cell']
im = Image.open(os.path.join(out, 'ortho.jpg')).convert('RGB')
N = im.size[0]; mpp = SPAN / N
# 1m/画素 くらいに縮めて計算する
S = int(SPAN / 1.0)
a = np.asarray(im.resize((S, S), Image.BILINEAR)).astype(np.float32) / 255.0
R, G, B = a[..., 0], a[..., 1], a[..., 2]
exg = 2 * G - R - B
lum = (R + G + B) / 3
# 葉のばらつき（樹冠は凹凸で明暗が細かく変わる。芝生は平ら）
g8 = Image.fromarray((G * 255).astype(np.uint8))
mean = np.asarray(g8.filter(ImageFilter.BoxBlur(2))).astype(np.float32) / 255
sq = np.asarray(Image.fromarray((G * G * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(2))).astype(np.float32) / 255
var = np.clip(sq - mean * mean, 0, 1)
canopy = (exg > 0.105) & (G > R * 1.06) & (G > B * 1.12) & (lum > 0.04) & (lum < 0.5) & (var > 0.0008)   # 写真全体がやや緑がかっている（ExG の中央値 0.075）ので高めに
cm = Image.fromarray((canopy * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.0))
c = np.asarray(cm).astype(np.float32) / 255
# 局所的な最大（半径 3m）
mx = np.asarray(Image.fromarray((c * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))).astype(np.float32) / 255
peaks = np.argwhere((c >= mx - 1e-6) & (c > 0.45))
trees = []
taken = np.zeros((S, S), bool)
order = sorted(peaks.tolist(), key=lambda p: -c[p[0], p[1]])
for j, i in order:
    if taken[max(0, j - 3):j + 4, max(0, i - 3):i + 4].any(): continue   # 4m 以内に既に木がある
    # 樹冠の半径: まわりで樹冠の画素が続く範囲（最大 7m）
    r = 1
    while r < 7 and j - r >= 0 and i - r >= 0 and j + r < S and i + r < S and canopy[j - r:j + r + 1, i - r:i + r + 1].mean() > 0.55: r += 1
    taken[max(0, j - 2):j + 3, max(0, i - 2):i + 3] = True
    x = X0 + (i + 0.5) * SPAN / S; z = Z0 + (j + 0.5) * SPAN / S
    trees.append([round(x, 1), round(z, 1), r])
json.dump({'trees': trees, 'credit': '国土地理院（地理院タイル 全国最新写真（シームレス））を加工して作成'}, open(os.path.join(out, 'trees.json'), 'w'), separators=(',', ':'))
print('trees.json', len(trees), '本', os.path.getsize(os.path.join(out, 'trees.json')) // 1024, 'KB', '樹冠の画素の割合 %.1f%%' % (canopy.mean() * 100))
# 確認用の画像（緑: 樹冠、赤: 木の位置）
if len(sys.argv) > 2:
    vis = Image.fromarray((a * 255).astype(np.uint8)).convert('RGB'); px = vis.load()
    for t in trees:
        i = int((t[0] - X0) / SPAN * S); j = int((t[1] - Z0) / SPAN * S)
        for dj in range(-1, 2):
            for di in range(-1, 2):
                if 0 <= i + di < S and 0 <= j + dj < S: px[i + di, j + dj] = (255, 0, 0)
    vis.crop((900, 900, 1500, 1500)).save(sys.argv[2])
