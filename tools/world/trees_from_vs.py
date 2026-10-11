#!/usr/bin/env python3
"""VIRTUAL SHIZUOKA の高画質オルソ（1 画素 20cm）から樹冠を見つけ、木の位置と大きさを書き出す（trees_from_ortho.py の後継）。
  python3 tools/world/trees_from_vs.py assets/data/world/center [確認の画像の出力]
第 4 回の審査（2026-10-11）: 街路樹が実物の 1 割もない（地理院の写真は粗く、並木の小さな樹冠を拾えなかった）。
方法: 0.4m 格子で、緑の強さ（ExG = 2G − R − B を明るさで割った値）が高く、葉の細かい明暗がある所を樹冠とする。
      芝生（平らで明るい緑）は明暗のばらつきで除く。樹冠をぼかして局所的な最大を
      3m 以上離して拾い、半径は樹冠の続く範囲から（最大 8m）。
出力: trees.json … {trees: [[x, z, 樹冠の半径(m)], ...]}（ゲームの x 東・z 南）
出典: 静岡県 VIRTUAL SHIZUOKA のオルソ画像（CC BY 4.0）を加工して作成。"""
import sys, os, json
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from vsimg import VS

out = sys.argv[1]
T = json.load(open(os.path.join(out, 'roads.json')))['terrain']
X0, Z0, SPAN = T['x0'], T['z0'], (T['nx'] - 1) * T['cell']
RES, TILE = 0.4, 200.0
vs = VS()
trees = []
tz = Z0
while tz < Z0 + SPAN:
    tx = X0
    while tx < X0 + SPAN:
        n = int(TILE / RES); pad = 10
        X, Z = np.meshgrid(tx - pad * RES + (np.arange(n + 2 * pad) + .5) * RES, tz - pad * RES + (np.arange(n + 2 * pad) + .5) * RES)
        rgb = vs.sample(X.ravel(), Z.ravel()).reshape(X.shape + (3,))
        if np.isnan(rgb).mean() > 0.9: tx += TILE; continue
        rgb = np.nan_to_num(rgb) / 255.0
        R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]; L = (R + G + B) / 3 + 1e-3
        exg = (2 * G - R - B) / (3 * L)
        g = (G * 255).astype(np.float32)
        var = cv2.blur(g * g, (5, 5)) - cv2.blur(g, (5, 5)) ** 2   # 2m の範囲の明暗のばらつき（葉は大きい、芝生は小さい）
        canopy = (exg > 0.07) & (G > R * 1.03) & (G > B * 1.06) & (L > 0.05) & (L < 0.55) & (var > 40)
        canopy = cv2.morphologyEx(canopy.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        c = cv2.GaussianBlur(canopy.astype(np.float32), (0, 0), 2.5)
        mx = cv2.dilate(c, np.ones((9, 9), np.uint8))
        pk = np.argwhere((c >= mx - 1e-6) & (c > 0.5))
        order = sorted(pk.tolist(), key=lambda p: -c[p[0], p[1]])
        taken = np.zeros(c.shape, bool)
        for j, i in order:
            if not (pad <= i < n + pad and pad <= j < n + pad): continue
            if taken[j, i]: continue
            r = 2
            while r < 20 and j - r >= 0 and i - r >= 0 and j + r < c.shape[0] and i + r < c.shape[1] and canopy[j - r:j + r + 1, i - r:i + r + 1].mean() > 0.5: r += 1
            rad = max(1.5, min(8.0, r * RES))
            sep = int(max(3.0, rad * 0.9) / RES)
            taken[max(0, j - sep):j + sep + 1, max(0, i - sep):i + sep + 1] = True
            trees.append([round(float(X[j, i]), 1), round(float(Z[j, i]), 1), round(rad, 1)])
        tx += TILE
    print('z', round(tz), '木', len(trees), flush=True)
    tz += TILE
json.dump({'trees': trees, 'credit': '静岡県 VIRTUAL SHIZUOKA のオルソ画像（CC BY 4.0）を加工して作成'}, open(os.path.join(out, 'trees.json'), 'w'), separators=(',', ':'))
print('trees.json', len(trees), '本', os.path.getsize(os.path.join(out, 'trees.json')) // 1024, 'KB')
