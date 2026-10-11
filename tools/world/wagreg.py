"""浜松市の現況平面図（1/500）を 1 枚ごとに細かく位置合わせする（全体のずらし量 wagref.DX・DZ からの残り）。
図の線のうち道路の範囲の中にある物（縁石・分離帯など地面の上の線）と、写真（VIRTUAL SHIZUOKA のオルソ 20cm）の輪郭が
最もよく重なるずらし量を ±2.5m の範囲で求め、/tmp/world/wag/offsets.json に書く（建物は倒れ込みがあるので使わない）。
使い方: python3 tools/world/wagreg.py assets/data/world/center/road_area.json"""
import sys, os, json, math
import numpy as np
import cv2
sys.path.insert(0, os.path.dirname(__file__))
from wagref import WagRef, DX, DZ
from vsimg import VS


def main():
    ra = json.load(open(sys.argv[1])); q = ra['q']
    wr = WagRef(mps=500); vs = VS(); res = {}
    tris = []
    for key in ('car', 'walk'):
        v = np.array(ra[key]['v'], np.float64).reshape(-1, 2) * q; I = np.array(ra[key]['i']).reshape(-1, 3); tris.append(v[I])
    T = np.concatenate(tris); TC = T.mean(1)
    for k, (cx, cz, f) in enumerate(wr.imgs):
        a = cv2.imread(f, 0); H, W = a.shape
        toP = lambda p: np.stack([(p[..., 0] - DX - cx) / wr.sx + W / 2 - .5, (p[..., 1] - DZ - cz) / wr.sz + H / 2 - .5], -1)
        sel = (np.abs(TC[:, 0] - cx) < 80) & (np.abs(TC[:, 1] - cz) < 80)
        Um = np.zeros((H, W), np.uint8)
        for t in toP(T[sel]): cv2.fillPoly(Um, [np.round(t * 4).astype(np.int32)], 1, shift=2)
        Uin = cv2.erode(Um, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
        ln = (a < 215).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(ln, connectivity=8)
        keep = np.zeros(n, bool); keep[1:] = np.maximum(st[1:, 2], st[1:, 3]) * wr.sx >= 3.0
        ys, xs = np.nonzero(keep[lab] & (Uin > 0))
        if len(xs) < 800: continue
        if len(xs) > 20000:
            s = np.random.default_rng(k).choice(len(xs), 20000, replace=False); ys, xs = ys[s], xs[s]
        # 写真の輪郭（図と同じ 1 画素の大きさで、図の範囲 + 3m）
        R = 0.125; m = 3.0
        gx = (xs + .5 - W / 2) * wr.sx + cx + DX; gz = (ys + .5 - H / 2) * wr.sz + cz + DZ
        x0, z0 = gx.min() - m, gz.min() - m; nx, nz = int((gx.max() - x0 + m) / R) + 1, int((gz.max() - z0 + m) / R) + 1
        X, Z = np.meshgrid(x0 + (np.arange(nx) + .5) * R, z0 + (np.arange(nz) + .5) * R)
        g = np.nan_to_num(vs.sample(X.ravel(), Z.ravel())).reshape(nz, nx, 3).mean(-1).astype(np.float32)
        e = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
        e = cv2.GaussianBlur(e, (3, 3), 0); e /= np.percentile(e, 99) + 1e-6
        def score(dx, dz):
            c = ((gx + dx - x0) / R).astype(int); r = ((gz + dz - z0) / R).astype(int)
            return float(e[r, c].mean())
        best = (score(0, 0), 0.0, 0.0); base = best[0]
        for dx in np.arange(-2.5, 2.51, 0.25):
            for dz in np.arange(-2.5, 2.51, 0.25):
                s_ = score(dx, dz)
                if s_ > best[0]: best = (s_, dx, dz)
        _, bx, bz = best
        for dx in np.arange(bx - 0.25, bx + 0.26, 0.125):
            for dz in np.arange(bz - 0.25, bz + 0.26, 0.125):
                s_ = score(dx, dz)
                if s_ > best[0]: best = (s_, dx, dz)
        res[os.path.basename(f)] = {'dx': round(best[1], 3), 'dz': round(best[2], 3), 'gain': round(best[0] / max(base, 1e-6), 3), 'n': int(len(xs))}
        if k % 40 == 0: print(k, os.path.basename(f), res[os.path.basename(f)], flush=True)
    json.dump(res, open(os.path.join(os.environ.get('WAG_DIR', '/tmp/world/wag'), 'offsets.json'), 'w'), indent=0)
    d = np.array([[v['dx'], v['dz']] for v in res.values()])
    print('図', len(res), '枚。ずらし量の中央値 x %.2f z %.2f、ばらつき（標準偏差）x %.2f z %.2f' % (*np.median(d, 0), *d.std(0)))


if __name__ == '__main__':
    main()
