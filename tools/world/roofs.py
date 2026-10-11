#!/usr/bin/env python3
"""屋根の形を、航空レーザの表面の高さ（tools/world/lp_dsm.py の DSM、0.25m 格子）から建物ごとに求める。
  python3 tools/world/roofs.py assets/data/world/center [確認の画像]
第 4 回の審査（2026-10-11）: 住宅地が窓の少ないコンクリートの箱に見える。PLATEAU の住宅の 8 割は屋根が平ら（LOD1 相当）で、
実際は寄棟・切妻の瓦屋根が多い。
方法:
  1. 屋根の平らな建物（勾配のある屋根の面積が半分未満）で、高さ 2.5〜16m・面積 20〜900m2 の物を選ぶ
  2. 外形を長方形に分ける（最小の外接長方形を 1 つ。外形を 9 割以上覆わなければ、0.5m の格子で大きい長方形から順に 3 つまで）
  3. 長方形ごとに、内側 0.5m の DSM の点に、陸屋根・切妻（棟が長い辺の向き／短い辺の向き）・寄棟・片流れ（2 向き）を
     外れ値を除く最小二乗で当てはめ、誤差のいちばん小さい形を選ぶ（形の複雑さで少し不利にする）
出力: roofs.json … {q: 0.01, e: 屋上の設備（下に書く）, r: [[建物の番号, 中心 x, 中心 z, 向き(0.1 度), 長さ L, 幅 W, 形, 棟の高さ, 勾配(×100), 棟のずれ], ...]}
  形: 1 切妻（棟が L の向き） 2 切妻（棟が W の向き） 3 寄棟 4 片流れ（W の向きに上がる） 5 片流れ（L の向き） 0 陸屋根
  棟のずれ: 切妻は棟の横へのずれ（m）、寄棟は妻側の流れの長さ ÷ 幅の半分（×100）
  （長さ・高さ・ずれは m を 100 倍した整数。高さはゲームの y と同じ標高）
出典: 静岡県 VIRTUAL SHIZUOKA の航空レーザ点群（CC BY 4.0）を加工して作成。"""
import sys, os, json, math
import numpy as np, shapely
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union
from shapely import affinity
sys.path.insert(0, os.path.dirname(__file__))
from vsimg import VS
import glob

out = sys.argv[1]
b = open(os.path.join(out, 'bldg.bin'), 'rb').read(); hl = int(np.frombuffer(b[:4], np.uint32)[0]); hdr = json.loads(b[4:4 + hl]); off = 4 + hl
nv, ni = hdr['nv'], hdr['ni']
P = np.frombuffer(b[off:off + nv * 6], np.int16).reshape(-1, 3).astype(np.float64) * hdr['q']; off += nv * 6; off += (nv * 6) % 4
I = np.frombuffer(b[off:off + ni * 4], np.uint32).reshape(-1, 3).astype(np.int64); off += ni * 4
bid = np.frombuffer(b[off:off + nv * 2], np.uint16)
info = json.load(open(os.path.join(out, 'bldg.json')))['b']; nb = len(info)


class DSM:
    def __init__(s, d='/tmp/world/vs_lp/dsm'):
        s.t = {}
        for f in glob.glob(d + '/*.npz'):
            z = np.load(f); s.t[(int(round(float(z['x0']) / 400)), int(round(float(z['y0']) / 300)))] = (z['top'], float(z['x0']), float(z['y0']))
        s.vs = VS()

    def sample(s, xs, zs):
        E, N = s.vs.en(xs, zs); out = np.full(len(xs), np.nan)
        ki = np.floor(E / 400).astype(int); kj = np.ceil(N / 300).astype(int)
        for k in set(zip(ki.tolist(), kj.tolist())):
            if k not in s.t: continue
            a, x0, y0 = s.t[k]; m = (ki == k[0]) & (kj == k[1])
            i = np.clip(((E[m] - x0) / 0.25).astype(int), 0, a.shape[1] - 1); j = np.clip(((y0 - N[m]) / 0.25).astype(int), 0, a.shape[0] - 1)
            v = a[j, i].astype(float) / 100; v[v == 0] = np.nan; out[m] = v
        return out


dsm = DSM()
# 建物ごとの三角形・高さ・勾配のある屋根の割合
A, B, C = P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]
n = np.cross(B - A, C - A); ar = np.linalg.norm(n, axis=1) / 2; nn = n / np.maximum(ar[:, None] * 2, 1e-9)
tb = bid[I[:, 0]].astype(np.int64)
up = np.abs(nn[:, 1]) > 0.3; slope = up & (np.abs(nn[:, 1]) < 0.985)
fr = np.bincount(tb, ar * slope, nb) / np.maximum(np.bincount(tb, ar * up, nb), 1e-9)
yLo = np.full(nb, 1e9); yHi = np.full(nb, -1e9); np.minimum.at(yLo, bid, P[:, 1]); np.maximum.at(yHi, bid, P[:, 1])
order = np.argsort(tb, kind='stable'); tb_s = tb[order]; starts = np.searchsorted(tb_s, np.arange(nb + 1))


def footprint(k):
    T = order[starts[k]:starts[k + 1]]; T = T[up[T]]
    polys = [Polygon([(P[i, 0], P[i, 2]) for i in I[t]]) for t in T]
    polys = [p for p in polys if p.area > 1e-4]
    if not polys: return None
    g = unary_union([p.buffer(0.01) for p in polys]).buffer(-0.01)
    if isinstance(g, MultiPolygon): g = max(g.geoms, key=lambda q: q.area)
    return g.simplify(0.15)


def rects(fp):
    """外形を長方形（中心・向き・長さ・幅）に分ける"""
    mr = fp.minimum_rotated_rectangle; cs = np.array(mr.exterior.coords)[:4]
    e0, e1 = cs[1] - cs[0], cs[2] - cs[1]; ang = math.atan2(e0[1], e0[0])
    if fp.area >= 0.9 * mr.area:
        c = cs.mean(0); a, w = np.linalg.norm(e0), np.linalg.norm(e1)
        return [(c[0], c[1], ang, a, w)] if a >= w else [(c[0], c[1], ang + math.pi / 2, w, a)]
    # 格子に分けて、大きい長方形から順に取る（長方形の枠に合わせて回す）
    r = affinity.rotate(fp, -ang, origin=(0, 0), use_radians=True); x0, z0, x1, z1 = r.bounds; g = 0.5
    nx, nz = int(math.ceil((x1 - x0) / g)), int(math.ceil((z1 - z0) / g))
    if nx * nz > 40000: return []
    X, Z = np.meshgrid(x0 + (np.arange(nx) + .5) * g, z0 + (np.arange(nz) + .5) * g)
    M = shapely.contains_xy(r, X, Z)
    outr = []; total = M.sum()
    for it in range(3):
        best = None
        # 最大の長方形（ヒストグラムの方法）
        h = np.zeros(nx, int)
        for j in range(nz):
            h = np.where(M[j], h + 1, 0); st = []
            for i in range(nx + 1):
                hi = h[i] if i < nx else 0; s0 = i
                while st and st[-1][1] >= hi:
                    s0, hh = st.pop(); a = hh * (i - s0)
                    if best is None or a > best[0]: best = (a, s0, i, j - hh + 1, j + 1)
                st.append((s0, hi))
        if best is None or best[0] * g * g < 15 or (it and best[0] < 0.12 * total): break
        a, i0, i1, j0, j1 = best; M[j0:j1, i0:i1] = False
        cxr, czr = x0 + (i0 + i1) / 2 * g, z0 + (j0 + j1) / 2 * g; L, W = (i1 - i0) * g, (j1 - j0) * g
        ca, sa = math.cos(ang), math.sin(ang); c = (cxr * ca - czr * sa, cxr * sa + czr * ca)
        outr.append((c[0], c[1], ang, L, W) if L >= W else (c[0], c[1], ang + math.pi / 2, W, L))
    return outr


def fit(s, t, z, L, W):
    """形ごとに当てはめる。戻り値: (誤差, 形, 棟の高さ, 勾配, ずれ)"""
    res = []
    hl, hw = L / 2, W / 2
    def lsq(f, kind, off=0.0):
        # z = r − p·f（f ≥ 0）を外れ値を除いて解く
        k = np.ones(len(z), bool)
        for _ in range(3):
            Am = np.c_[np.ones(k.sum()), -f[k]]
            try: (r, p), *_ = np.linalg.lstsq(Am, z[k], rcond=None)
            except Exception: return
            e = z - (r - p * f); k = np.abs(e) < max(0.25, 2.5 * np.median(np.abs(e[k])))
            if k.sum() < 12: return
        rm = math.sqrt(np.mean(e[k] ** 2)) + 1.5 * (1 - k.mean())
        res.append((rm, kind, r, p, off))
    # 陸屋根
    zm = np.median(z); k = np.abs(z - zm) < 0.4
    res.append((math.sqrt(np.mean((z[k] - np.median(z[k])) ** 2)) + 1.5 * (1 - k.mean()) - 0.02, 0, float(np.median(z[k])), 0.0, 0.0))
    for o in (-0.15, 0, 0.15):
        lsq(np.abs(t - o * W), 1, o * W)
    lsq(np.abs(s), 2)
    for kk in (0.7, 1.0, 1.4):   # 寄棟の妻側の流れの長さ（幅の半分の何倍か）。外形が屋根より大きい時・妻側が急な時
        lsq(np.maximum(np.abs(t), (np.abs(s) - max(0.0, hl - hw * kk)) / kk), 3, kk)
    lsq(-t, 4); lsq(-s, 5)
    best = min(res, key=lambda q: q[0])
    rm, kind, r, p, off = best
    # 切妻・寄棟は勾配が正（谷になる形は無い）。片流れは上がる向きを符号で持つ
    if kind and not (0.12 <= (abs(p) if kind >= 4 else p) <= 1.3): kind, r, p = 0, float(np.median(z)), 0.0
    return rm, kind, r, p, off


rows = []; stat = {}
cand = [k for k in range(nb) if fr[k] < 0.5 and 2.5 <= yHi[k] - yLo[k] <= 16]
print('候補', len(cand), flush=True)
for ci, k in enumerate(cand):
    fp = footprint(k)
    if fp is None or not 20 <= fp.area <= 900: continue
    inner = fp.buffer(-0.5)
    if inner.is_empty: continue
    for (cx, cz, ang, L, W) in rects(fp):
        if W < 3 or L < 3: continue
        ca, sa = math.cos(ang), math.sin(ang)
        ss, tt = np.meshgrid(np.arange(-L / 2 + 0.5, L / 2 - 0.5, 0.25), np.arange(-W / 2 + 0.5, W / 2 - 0.5, 0.25))
        ss, tt = ss.ravel(), tt.ravel()
        X, Z = cx + ss * ca - tt * sa, cz + ss * sa + tt * ca
        m = shapely.contains_xy(inner, X, Z)
        if m.sum() < 40: continue
        zz = dsm.sample(X[m], Z[m]); ok = ~np.isnan(zz)
        if ok.sum() < 40: continue
        rm, kind, r, p, o = fit(ss[m][ok], tt[m][ok], zz[ok], L, W)
        # 測った高さが建物の高さと大きく違う（木・別の建物に掛かる）物は使わない
        if abs(r - yHi[k]) > 3.0 or rm > 0.75: stat['外れ'] = stat.get('外れ', 0) + 1; continue
        stat[kind] = stat.get(kind, 0) + 1
        rows.append([int(k), round(cx * 100), round(cz * 100), round(math.degrees(ang) * 10) % 3600, round(L * 100), round(W * 100), kind, round(r * 100), round(p * 100), round(o * 100)])
    if ci % 1000 == 0: print(ci, len(rows), stat, flush=True)
# 屋上の設備（陸屋根の建物）: 屋根の面より 0.7〜8m 高い塊を、塔屋・室外機・キュービクル・高架水槽の箱にする。
# 写真で緑の塊（屋上に掛かる木）は除く。e: [[建物の番号, 中心 x, 中心 z, 向き(0.1 度), 長さ, 幅, 高さ, 屋根の高さ], ...]（m は 100 倍）
from scipy import ndimage
import cv2
eq = []
flat_ids = set(r[0] for r in rows if r[6] == 0)
cand2 = [k for k in range(nb) if fr[k] < 0.5 and yHi[k] - yLo[k] >= 5.5 and (k in flat_ids or yHi[k] - yLo[k] > 16 or k not in set(r[0] for r in rows))]
print('屋上の候補', len(cand2), flush=True)
for ci, k in enumerate(cand2):
    fp = footprint(k)
    if fp is None or fp.area < 40 or fp.area > 40000: continue
    inner = fp.buffer(-0.6)
    if inner.is_empty: continue
    mr = fp.minimum_rotated_rectangle; cs = np.array(mr.exterior.coords)[:4]; e0 = cs[1] - cs[0]; ang = math.atan2(e0[1], e0[0])
    ca, sa = math.cos(ang), math.sin(ang); c0 = cs.mean(0)
    # 長方形の枠の格子（0.25m）
    rel = np.array(mr.exterior.coords)[:4] - c0; ls = rel @ [ca, sa]; lt = rel @ [-sa, ca]
    S0, S1, T0, T1 = ls.min(), ls.max(), lt.min(), lt.max()
    ns, nt = int((S1 - S0) / 0.25) + 1, int((T1 - T0) / 0.25) + 1
    if ns * nt > 2e6: continue
    ss, tt = np.meshgrid(S0 + np.arange(ns) * 0.25, T0 + np.arange(nt) * 0.25)
    X, Z = c0[0] + ss * ca - tt * sa, c0[1] + ss * sa + tt * ca
    m = shapely.contains_xy(inner, X, Z)
    if m.sum() < 200: continue
    zz = np.full(X.shape, np.nan); zz[m] = dsm.sample(X[m], Z[m])
    v = zz[m]; v = v[~np.isnan(v)]
    if len(v) < 200: continue
    # 屋根の面の高さ: いちばん多い高さ（0.2m の箱で数える）
    h, be = np.histogram(v, bins=np.arange(v.min(), v.max() + 0.4, 0.2)); roof = be[np.argmax(h)] + 0.1
    if abs(roof - yHi[k]) > 4: continue
    dz = np.nan_to_num(zz - roof, nan=0.0); hi = (dz > 0.7) & (dz < 8) & m
    hi = ndimage.binary_opening(hi, np.ones((2, 2)))
    lab, nl = ndimage.label(hi)
    if not nl: continue
    for j, sl in enumerate(ndimage.find_objects(lab)):
        cm = lab[sl] == j + 1; area = cm.sum() * 0.0625
        if area < 0.75 or area > 0.5 * fp.area: continue
        ys, xs = np.nonzero(cm); ys = ys + sl[0].start; xs = xs + sl[1].start
        (rx, ry), (rw, rh), ra = cv2.minAreaRect(np.c_[xs, ys].astype(np.float32))
        if area < 0.5 * max(rw * rh * 0.0625, 1e-6): continue   # 細長い・まばらな塊（手すり・木の縁）
        hh = float(np.percentile(dz[ys, xs], 80))
        px = c0[0] + (S0 + rx * 0.25) * ca - (T0 + ry * 0.25) * sa; pz = c0[1] + (S0 + rx * 0.25) * sa + (T0 + ry * 0.25) * ca
        # 写真で緑なら木
        rgb = dsm.vs.sample(np.array([px]), np.array([pz]))[0]
        if np.all(np.isfinite(rgb)) and (2 * rgb[1] - rgb[0] - rgb[2]) / max(rgb.sum(), 1) > 0.06: continue
        aw = ang + math.radians(ra); L, Wd = max(rw, 1) * 0.25, max(rh, 1) * 0.25
        eq.append([int(k), round(px * 100), round(pz * 100), round(math.degrees(aw) * 10) % 3600, round(L * 100), round(Wd * 100), round(hh * 100), round(roof * 100)])
    if ci % 1000 == 0: print(ci, len(eq), flush=True)
print('屋上の設備', len(eq))
json.dump({'q': 0.01, 'r': rows, 'e': eq, 'credit': '静岡県 VIRTUAL SHIZUOKA の航空レーザ点群（CC BY 4.0）を加工して作成'}, open(os.path.join(out, 'roofs.json'), 'w'), separators=(',', ':'))
print('roofs.json', len(rows), len(eq), stat, os.path.getsize(os.path.join(out, 'roofs.json')) // 1024, 'KB')
