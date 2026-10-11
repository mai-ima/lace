#!/usr/bin/env python3
"""VIRTUAL SHIZUOKA の航空レーザ点群（オリジナルデータ、1m2 に約 46 点、CC BY 4.0）から、0.25m 格子の表面の高さ（DSM）を作る。
  python3 tools/world/lp_dsm.py            # ゲームの範囲の 63 図郭（vs_ortho と同じ図郭）
  python3 tools/world/lp_dsm.py 08OC7253   # 1 図郭だけ
入力: 図郭ごとの LAS（平面直角座標系 第 8 系、400m × 300m。1 図郭 約 190MB）。1 つずつ取得して、使い終わったら消す
出力: /tmp/world/vs_lp/dsm/<図郭>.npz … top（各升の点の最も高い値、cm の uint16。点の無い升は 0）、
      gnd（地面に分類された点の最も低い値。同じ形式）、x0, y0（左上の X・Y）、px（0.25）
点群はリポジトリに含めない（屋根の形を測るのに使う）。出典: 静岡県 VIRTUAL SHIZUOKA。"""
import sys, os, json, subprocess, zipfile, glob
import numpy as np, laspy

D = '/tmp/world/vs_lp'; OUT = os.path.join(D, 'dsm'); os.makedirs(OUT, exist_ok=True)
PX = 0.25
urls = json.load(open(os.path.join(D, 'urls.json')))
todo = sys.argv[1:] or sorted(urls)
for i, m in enumerate(todo):
    of = os.path.join(OUT, m + '.npz')
    if os.path.exists(of): continue
    z = os.path.join(D, m + '.zip')
    for k in range(4):
        r = subprocess.run(['curl', '-s', '-o', z, '-w', '%{http_code}', '--max-time', '900', urls[m]['original']], capture_output=True, text=True)
        if r.stdout == '200': break
    zf = zipfile.ZipFile(z); las = [n for n in zf.namelist() if n.lower().endswith('.las')][0]
    zf.extract(las, D); zf.close(); os.remove(z)
    f = laspy.read(os.path.join(D, las))
    X, Y, Zc = np.asarray(f.x), np.asarray(f.y), np.asarray(f.z); cl = np.asarray(f.classification)
    # 図郭は 400m × 300m の格子に並ぶ（左上の角を、点の範囲から格子に丸めて求める）
    x0 = np.floor(X.min() / 400 + 0.01) * 400; y1 = np.ceil(Y.max() / 300 - 0.01) * 300
    W, H = int(400 / PX), int(300 / PX)
    ix = np.clip(((X - x0) / PX).astype(np.int64), 0, W - 1); iy = np.clip(((y1 - Y) / PX).astype(np.int64), 0, H - 1)
    zc = np.clip(np.round(Zc * 100), 1, 65535).astype(np.uint16)
    top = np.zeros(H * W, np.uint16); np.maximum.at(top, iy * W + ix, zc)
    g = cl == 2; gnd = np.full(H * W, 65535, np.uint16); np.minimum.at(gnd, (iy * W + ix)[g], zc[g]); gnd[gnd == 65535] = 0
    np.savez_compressed(of, top=top.reshape(H, W), gnd=gnd.reshape(H, W), x0=x0, y0=y1, px=PX)
    os.remove(os.path.join(D, las))
    print(i + 1, '/', len(todo), m, '点', len(X), '升の埋まり', round(float((top > 0).mean()), 3), flush=True)
