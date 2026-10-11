"""航空レーザの表面の高さ（tools/world/lp_dsm.py の DSM、0.25m 格子）を、ゲームの座標で読む。
  from dsmread import DSM; d = DSM(); top = d.sample(xs, zs)   # 写真の無い所・点の無い升は nan。d.vs は VS（オルソ画像）"""
import glob
import numpy as np
from vsimg import VS


class DSM:
    def __init__(s, d='/tmp/world/vs_lp/dsm'):
        s.t = {}
        for f in glob.glob(d + '/*.npz'):
            z = np.load(f); s.t[(int(round(float(z['x0']) / 400)), int(round(float(z['y0']) / 300)))] = (z['top'], float(z['x0']), float(z['y0']))
        s.vs = VS()

    def sample(s, xs, zs):
        xs, zs = np.asarray(xs, float).ravel(), np.asarray(zs, float).ravel()
        E, N = s.vs.en(xs, zs); out = np.full(len(xs), np.nan)
        ki = np.floor(E / 400).astype(int); kj = np.ceil(N / 300).astype(int)
        for k in set(zip(ki.tolist(), kj.tolist())):
            if k not in s.t: continue
            a, x0, y0 = s.t[k]; m = (ki == k[0]) & (kj == k[1])
            i = np.clip(((E[m] - x0) / 0.25).astype(int), 0, a.shape[1] - 1); j = np.clip(((y0 - N[m]) / 0.25).astype(int), 0, a.shape[0] - 1)
            v = a[j, i].astype(float) / 100; v[v == 0] = np.nan; out[m] = v
        return out
