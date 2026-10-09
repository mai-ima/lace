"""VIRTUAL SHIZUOKA のオルソ画像（1 画素 20cm。tools/world/vs_ortho.py で集めたもの）を、ゲームの座標で読む。
  from vsimg import VS; vs = VS(); rgb = vs.sample(xs, zs)   # xs, zs: ゲームの座標（m、x 東・z 南）の配列 → (n, 3) の float32（写真の無い所は nan）
座標の変換: ゲームの座標 → 経緯度（ゲームと同じ近似）→ 平面直角座標系 第 8 系（EPSG:6676）→ 図郭の画素。"""
import json, math, os
from collections import OrderedDict
import numpy as np
import pyproj
from PIL import Image

LAT0, LON0 = 34.7037, 137.7351
KX = math.cos(math.radians(LAT0)) * 111320.0; KZ = 110574.0
Image.MAX_IMAGE_PIXELS = None


class VS:
    def __init__(self, d='/tmp/world/vs_ortho', cache=24):
        self.idx = json.load(open(os.path.join(d, 'index.json')))
        self.tr = pyproj.Transformer.from_crs(4326, 6676, always_xy=True)
        self.cache, self.max = OrderedDict(), cache
        px = self.idx[0]['px']; self.px = px
        # 図郭は 400m × 300m の格子に並ぶ。左上の座標で引けるように
        self.by = {(round(m['x0'] / (m['w'] * px)), round(m['y0'] / (m['h'] * px))): m for m in self.idx}
        self.W, self.H = self.idx[0]['w'] * px, self.idx[0]['h'] * px

    def img(self, m):
        k = m['mesh']
        if k in self.cache: self.cache.move_to_end(k); return self.cache[k]
        a = np.asarray(Image.open(m['file']).convert('RGB'))
        self.cache[k] = a
        if len(self.cache) > self.max: self.cache.popitem(last=False)
        return a

    def en(self, xs, zs):
        """ゲームの座標 → 平面直角座標（E, N）"""
        return self.tr.transform(LON0 + np.asarray(xs) / KX, LAT0 - np.asarray(zs) / KZ)

    def sample(self, xs, zs):
        xs, zs = np.asarray(xs, np.float64).ravel(), np.asarray(zs, np.float64).ravel()
        E, N = self.en(xs, zs)
        out = np.full((len(xs), 3), np.nan, np.float32)
        gi, gj = np.floor(E / self.W).astype(np.int64), np.ceil(N / self.H).astype(np.int64)   # 左上の格子
        for key in set(zip(gi.tolist(), gj.tolist())):
            m = self.by.get(key)
            if not m: continue
            sel = (gi == key[0]) & (gj == key[1])
            a = self.img(m)
            c = (E[sel] - m['x0']) / self.px - 0.5; r = (m['y0'] - N[sel]) / self.px - 0.5
            c0, r0 = np.clip(np.floor(c).astype(np.int64), 0, m['w'] - 2), np.clip(np.floor(r).astype(np.int64), 0, m['h'] - 2)
            u, v = np.clip(c - c0, 0, 1)[:, None], np.clip(r - r0, 0, 1)[:, None]
            out[sel] = (a[r0, c0] * (1 - u) + a[r0, c0 + 1] * u) * (1 - v) + (a[r0 + 1, c0] * (1 - u) + a[r0 + 1, c0 + 1] * u) * v
        return out
