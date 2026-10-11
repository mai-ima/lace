#!/usr/bin/env python3
"""屋根の上の太陽光パネルを、VIRTUAL SHIZUOKA のオルソ（20cm）から見つける。
  python3 tools/world/solar.py assets/data/world/center [確認の画像]
第 4 回の審査の Q1e の審査（2026-10-11）: 写真の範囲にパネルを載せた屋根が 15 棟以上あるのに、ゲームに 1 枚も無い。
方法: roofs.json の屋根の長方形（勾配・陸屋根とも）の内側 0.3m を 0.2m 格子で見て、パネルの色（暗い紺〜黒、青が赤より強い、明るさ 0.06〜0.3）
      の画素を拾い、ひと続きの塊（4m2 以上・短い辺 1.6m 以上・長方形を 7 割 5 分以上埋める・平均で青が赤より 0.03 以上強い）を、屋根の向きにそろえた長方形にする。
      屋根の日陰の面・黒い瓦と分けるため、モジュールの継ぎ目の細い線による細かい明るさの変化（0.02 以上）も確かめる。
出力: solar.json … {q: 0.01, p: [[建物の番号, 中心 x, 中心 z, 向き(0.1 度), 長さ, 幅], ...]}（屋根の面の高さは描くときに屋根の形から求める）
出典: 静岡県 VIRTUAL SHIZUOKA のオルソ画像（CC BY 4.0）を加工して作成。"""
import sys, os, json, math
import numpy as np, cv2
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from vsimg import VS

out = sys.argv[1]
R = json.load(open(os.path.join(out, 'roofs.json')))['r']
vs = VS(); G = 0.2; panels = []
for r in R:
    k, cx, cz, a, L, W = r[0], r[1] / 100, r[2] / 100, math.radians(r[3] / 10), r[4] / 100, r[5] / 100
    if L * W < 12: continue
    ca, sa = math.cos(a), math.sin(a)
    ss, tt = np.meshgrid(np.arange(-L / 2 + 0.3, L / 2 - 0.3, G), np.arange(-W / 2 + 0.3, W / 2 - 0.3, G))
    X, Z = cx + ss * ca - tt * sa, cz + ss * sa + tt * ca
    rgb = vs.sample(X.ravel(), Z.ravel()).reshape(X.shape + (3,))
    if np.isnan(rgb).mean() > 0.3: continue
    rgb = np.nan_to_num(rgb) / 255.0; Rr, Gg, Bb = rgb[..., 0], rgb[..., 1], rgb[..., 2]; Lm = (Rr + Gg + Bb) / 3
    m = (Lm > 0.06) & (Lm < 0.3) & (Bb > Rr * 1.08) & (Bb >= Gg * 0.95) & (Gg < Bb + 0.03)
    m = ndimage.binary_opening(m, np.ones((2, 2))); m = ndimage.binary_closing(m, np.ones((3, 3)))
    lab, nl = ndimage.label(m)
    for j, sl in enumerate(ndimage.find_objects(lab)):
        cm = lab[sl] == j + 1; area = cm.sum() * G * G
        if area < 4.0: continue
        ys, xs = np.nonzero(cm); ys = ys + sl[0].start; xs = xs + sl[1].start
        # 屋根の向きにそろえた外接長方形（パネルは屋根の辺に平行に並べる）
        s0, s1, t0, t1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        fill = area / ((s1 - s0) * (t1 - t0) * G * G)
        if fill < 0.75 or min(s1 - s0, t1 - t0) * G < 1.6: continue   # 細い帯（屋根の縁の影）を除く
        if np.mean(Bb[ys, xs] - Rr[ys, xs]) < 0.03: continue   # 紺色（黒い瓦・影は青が強くない）
        # モジュールの継ぎ目の細い明るい線: 画素とその上下左右の平均の差（細かい変化）の平均が 0.02 以上。
        # 屋根の日陰の面（空の光で青く写る）・黒い瓦・陸屋根は 0.01 未満で、本物のパネルは 0.02〜0.04（30 枚を写真で見て決めた）
        sub = Lm[t0:t1, s0:s1]; hp = sub - (np.roll(sub, 1, 0) + np.roll(sub, -1, 0) + np.roll(sub, 1, 1) + np.roll(sub, -1, 1)) / 4
        if sub.shape[0] < 6 or sub.shape[1] < 6 or np.abs(hp[1:-1, 1:-1]).mean() < 0.02: continue
        sc, tc = ss[0, 0] + (s0 + s1) / 2 * G - G / 2, tt[0, 0] + (t0 + t1) / 2 * G - G / 2
        px, pz = cx + sc * ca - tc * sa, cz + sc * sa + tc * ca
        panels.append([int(k), round(px * 100), round(pz * 100), r[3], round((s1 - s0) * G * 100), round((t1 - t0) * G * 100)])
json.dump({'q': 0.01, 'p': panels, 'credit': '静岡県 VIRTUAL SHIZUOKA のオルソ画像（CC BY 4.0）を加工して作成'}, open(os.path.join(out, 'solar.json'), 'w'), separators=(',', ':'))
print('solar.json パネル', len(panels), '棟', len(set(p[0] for p in panels)))
