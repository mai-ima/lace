#!/usr/bin/env python3
"""VIRTUAL SHIZUOKA の車載写真レーザ測量（MMS）の点群（地面の点）を、ゲームの座標の 10cm 格子にまとめる。
  python3 tools/world/mms_raster.py            # /tmp/world/mms/*.las → /tmp/world/mms/raster.npz
入力: /tmp/world/mms/<図郭>.las（2021 年の MMS Ground。浜松の中心部は 08OC7243・7253・7263 の 3 図郭。索引は
      https://gic-shizuoka.s3.ap-northeast-1.amazonaws.com/2022/p/Vectortile2025/MMS22/{z}/{x}/{y}.pbf）
出力: raster.npz … x0, z0（左上、m）, res（m）, I（反射強度の平均, float32。点の無い所は 0）, rgb（点の色の平均, uint8）, n（点の数, uint16）
反射強度は路面の塗料で強く（アスファルトの 4〜10 倍）、写真と違って車・影・木漏れ日の影響が無い。点の色はカメラの写真による着色（黄・青・赤の判定に使う）。
点群はリポジトリに含めない。出典: 静岡県 VIRTUAL SHIZUOKA（CC BY 4.0）。"""
import glob, math, os, sys
import numpy as np
import laspy
import pyproj

LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
RES = 0.1
D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/world/mms'
files = sorted(glob.glob(os.path.join(D, '*.las')))
tr = pyproj.Transformer.from_crs(6676, 4326, always_xy=True)


def affine(h):
    """図郭の範囲で、平面直角座標（E, N）→ ゲームの座標（x, z）を 1 次式で近似する（数百 m の範囲なら誤差は 1mm 未満）"""
    E, N = np.meshgrid(np.linspace(h.mins[0], h.maxs[0], 6), np.linspace(h.mins[1], h.maxs[1], 6))
    lon, lat = tr.transform(E.ravel(), N.ravel())
    x, z = (np.asarray(lon) - LON0) * KX, (LAT0 - np.asarray(lat)) * KZ
    A = np.column_stack([E.ravel(), N.ravel(), np.ones(E.size)])
    cx, rx = np.linalg.lstsq(A, x, rcond=None)[:2]; cz, rz = np.linalg.lstsq(A, z, rcond=None)[:2]
    err = max(np.abs(A @ cx - x).max(), np.abs(A @ cz - z).max())
    return cx, cz, err


# 全体の範囲
boxes = []
for f in files:
    h = laspy.open(f).header; cx, cz, err = affine(h)
    cs = np.array([[h.mins[0], h.mins[1], 1], [h.maxs[0], h.mins[1], 1], [h.mins[0], h.maxs[1], 1], [h.maxs[0], h.maxs[1], 1]])
    boxes.append((cs @ cx, cs @ cz)); print(os.path.basename(f), h.point_count, '近似の誤差 %.4fm' % err)
x0 = math.floor(min(b[0].min() for b in boxes)); x1 = math.ceil(max(b[0].max() for b in boxes))
z0 = math.floor(min(b[1].min() for b in boxes)); z1 = math.ceil(max(b[1].max() for b in boxes))
W, H = int(round((x1 - x0) / RES)), int(round((z1 - z0) / RES))
print('範囲 x %d〜%d, z %d〜%d, %d × %d 画素' % (x0, x1, z0, z1, W, H))
# 1 回目: 地面の点（分類 2）で、1m ごとの路面の高さ（平均）を求める。点の高さとの比較は双一次補間で（升の中の傾きで片側が落ちないように）
G = 10; GW, GH = (W + G - 1) // G + 1, (H + G - 1) // G + 1
zs_, zn_ = np.zeros(GH * GW), np.zeros(GH * GW)
for f in files:
    with laspy.open(f) as rd:
        cx, cz, _ = affine(rd.header)
        for P in rd.chunk_iterator(4_000_000):
            sel = np.asarray(P.classification) == 2
            E, N, Zp = np.asarray(P.x)[sel], np.asarray(P.y)[sel], np.asarray(P.z)[sel]
            x = cx[0] * E + cx[1] * N + cx[2]; z = cz[0] * E + cz[1] * N + cz[2]
            c = np.floor((x - x0) / (RES * G)).astype(np.int64); r = np.floor((z - z0) / (RES * G)).astype(np.int64)
            ok = (c >= 0) & (c < GW) & (r >= 0) & (r < GH)
            zs_ += np.bincount(r[ok] * GW + c[ok], Zp[ok], GH * GW); zn_ += np.bincount(r[ok] * GW + c[ok], None, GH * GW)
zg = np.where(zn_ > 0, zs_ / np.maximum(zn_, 1), np.nan).reshape(GH, GW)
# 地面の点の無い升は、周りの升（5m 以内）の平均で埋める
for _ in range(5):
    pad = np.pad(zg, 1, constant_values=np.nan)
    nb = np.nanmean(np.stack([pad[1 + dy:GH + 1 + dy, 1 + dx:GW + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)]), 0)
    zg = np.where(np.isnan(zg), nb, zg)
zg = np.nan_to_num(zg, nan=-1e9)


def ground(x, z):
    """路面の高さ（升の中心の値を双一次補間）"""
    u = np.clip((x - x0) / (RES * G) - 0.5, 0, GW - 1.001); v = np.clip((z - z0) / (RES * G) - 0.5, 0, GH - 1.001)
    i, j = u.astype(np.int64), v.astype(np.int64); fu, fv = u - i, v - j
    return (zg[j, i] * (1 - fu) + zg[j, i + 1] * fu) * (1 - fv) + (zg[j + 1, i] * (1 - fu) + zg[j + 1, i + 1] * fu) * fv


# 2 回目: 升ごとに「点のいちばん多い計測の時間帯（1 秒単位）」の点だけで平均する。
# 別の回の遠い走査（強度の水準が違う、まばらな走査線）が混ざると、升の格子と走査線のずれで三角形の模様が出るため
best_n = np.zeros(H * W, np.int64); I = np.zeros(H * W, np.float32); C3 = np.zeros((H * W, 3), np.float32)
for f in files:
    K, T, V = [], [], []
    with laspy.open(f) as rd:
        cx, cz, _ = affine(rd.header)
        for P in rd.chunk_iterator(4_000_000):
            # 路面の点: 地面の分類（2）に加え、その他の分類（6）にも路面の点が多く入っているので、路面の高さから ±7cm 以内の点を使う（車・人・柵は高いので入らない）
            E, N, Zp = np.asarray(P.x), np.asarray(P.y), np.asarray(P.z)
            x = cx[0] * E + cx[1] * N + cx[2]; z = cz[0] * E + cz[1] * N + cz[2]
            c = ((x - x0) / RES).astype(np.int64); r = ((z - z0) / RES).astype(np.int64)
            ok = (c >= 0) & (c < W) & (r >= 0) & (r < H)
            dz = Zp - ground(x, z); sel = ok & (np.abs(dz) < 0.07)
            K.append(r[sel] * W + c[sel]); T.append(np.floor(np.asarray(P.gps_time)[sel]).astype(np.int64))
            V.append(np.column_stack([np.asarray(P.intensity)[sel], np.asarray(P.red)[sel], np.asarray(P.green)[sel], np.asarray(P.blue)[sel]]).astype(np.float32))
    K, T, V = np.concatenate(K), np.concatenate(T), np.concatenate(V)
    T -= T.min()
    u, inv, cnt = np.unique(K * (int(T.max()) + 1) + T, return_inverse=True, return_counts=True)
    sums = np.zeros((len(u), 4), np.float64)
    for j in range(4): sums[:, j] = np.bincount(inv, V[:, j], len(u))
    pix = u // (int(T.max()) + 1)
    o = np.lexsort((cnt, pix)); last = np.r_[pix[o][1:] != pix[o][:-1], True]; sel = o[last]   # 升ごとに点の数がいちばん多い時間帯
    p_, c_ = pix[sel], cnt[sel]; better = c_ > best_n[p_]
    p_, c_, sm = p_[better], c_[better], sums[sel][better]
    best_n[p_] = c_; I[p_] = sm[:, 0] / c_; C3[p_] = sm[:, 1:] / c_[:, None]
    print(os.path.basename(f), '済', len(K), '点', flush=True)
    del K, T, V, u, inv, cnt, sums
n = best_n; m = n > 0
I = I.reshape(H, W)
rgb = np.clip(C3 / 256, 0, 255).astype(np.uint8).reshape(H, W, 3)   # 16 ビット → 8 ビット
np.savez_compressed(os.path.join(D, 'raster.npz'), x0=x0, z0=z0, res=RES, I=I, rgb=rgb, n=np.minimum(n, 65535).astype(np.uint16).reshape(H, W))
print('点のある画素 %.1f%%' % (m.mean() * 100))
