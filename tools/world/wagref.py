"""浜松市の地図情報サイト（わが街ガイド）の現況平面図（道路台帳図）を、照合の参考として読む。
図の画像は浜松市の著作物で、公開のリポジトリには入れない（個人利用。/tmp/world/wag/ に置く。取り方は docs/WORKLOG-3D.md）。
ここでは「ある線の近くに図の線があるか」だけを調べ、図の線そのものはデータにしない。
画像の名前: g_縮尺_中心x_中心z.png（中心はゲームの座標 m）。"""
import os, re, glob, math
import numpy as np
import cv2

LAT0 = 34.7037
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0
# 位置合わせ（地理院の道路縁・建物の外形との距離が最も小さくなる量。3 か所で同じ値）
DX, DZ, KX2, KZ2 = -2.4, -1.5, 0.995, 1.015


class WagRef:
    def __init__(self, d=os.environ.get('WAG_DIR', '/tmp/world/wag'), mps=1000):
        self.imgs = []
        for f in sorted(glob.glob(os.path.join(d, 'g_%d_*.png' % mps))):
            cx, cz = map(float, re.findall(r'_(-?\d+)_(-?\d+)\.png$', f)[0])
            self.imgs.append((cx, cz, f))
        self.sx = 1.37315e-6 * mps / 500 * KX * KX2
        self.sz = 1.11668e-6 * mps / 500 * KZ * KZ2
        self.cache = {}
        self.ok = bool(self.imgs)

    def _dist(self, k):
        # 図の線（濃さ 200 未満）までの距離（m）の画像
        if k not in self.cache:
            a = cv2.imread(self.imgs[k][2], 0)
            self.cache[k] = cv2.distanceTransform((a >= 200).astype(np.uint8), cv2.DIST_L2, 5) * (self.sx + self.sz) / 2
        return self.cache[k]

    def dist(self, xs, zs):
        """点ごとの、いちばん近い図の線までの距離（m）。図の無い所は nan"""
        xs = np.asarray(xs, float); zs = np.asarray(zs, float); out = np.full(len(xs), np.nan)
        for k, (cx, cz, f) in enumerate(self.imgs):
            if not ((np.abs(xs - cx) < 130) & (np.abs(zs - cz) < 130)).any(): continue
            d = self._dist(k); H, W = d.shape
            c = (xs - DX - cx) / self.sx + W / 2 - .5; r = (zs - DZ - cz) / self.sz + H / 2 - .5
            ok = (c >= 20) & (c < W - 20) & (r >= 20) & (r < H - 20)
            v = d[r[ok].astype(int), c[ok].astype(int)]
            o = out[ok]; out[ok] = np.where(np.isnan(o), v, np.minimum(o, v))
        return out

    def outline_match(self, geom, step=0.5, near=0.8):
        """形（shapely）の縁のうち、図の線から near m 以内にある割合。図の無い所が半分を超えれば None"""
        pts = []
        for g in (geom.geoms if hasattr(geom, 'geoms') else [geom]):
            for ring in [g.exterior] + list(g.interiors):
                L = ring.length; k = max(4, int(L / step))
                pts += [ring.interpolate(L * (i + .5) / k).coords[0] for i in range(k)]
        p = np.array(pts); d = self.dist(p[:, 0], p[:, 1]); cov = ~np.isnan(d)
        if cov.mean() < 0.5: return None
        return float((d[cov] <= near).mean())
