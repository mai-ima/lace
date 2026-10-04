#!/usr/bin/env python3
"""標高（terrain.bin）に残った建物の塊を取り除く。
  python3 tools/world/dem_bldg.py assets/data/world/center
地理院の 5m DEM には、大きな建物（体育館・市役所など）の屋根の高さが地面として残っている所がある。
ゲームでは建物の外に、黒い崖のような地形として見える。
見つけ方:
  1. 地形の「開き」（65m 四方の最小のあと最大）より 3m 以上高い格子を、つながった塊ごとに分ける。
  2. 塊のうち 45% 以上が PLATEAU の建物の外形の中なら、建物の塊とみなす。
     森の丘（城の周り）や台地の縁の住宅地は、建物の外形と重なる割合が低いので残す。
  3. 建物の塊の格子と、その周り 1 格子で開きより 1m 以上高い所を、開きの高さに下げる。
もう一度実行しても、直した所は見つからないので何も変わらない。"""
import sys, os, json, struct
import numpy as np

out = sys.argv[1]
T = json.load(open(os.path.join(out, 'roads.json')))['terrain']
X0, Z0, NX, NZ, C = T['x0'], T['z0'], T['nx'], T['nz'], T['cell']
fn = os.path.join(out, 'terrain.bin')
U = np.frombuffer(open(fn, 'rb').read(), np.uint16).copy()
H = ((U.astype(np.float32) - 5000) / 100).reshape(NZ, NX)

K = 6
def filt(A, f):
    P = np.pad(A, K, mode='edge'); A1 = f(np.stack([P[K + d:K + d + NZ, K:K + NX] for d in range(-K, K + 1)]), 0)
    P = np.pad(A1, K, mode='edge'); return f(np.stack([P[K:K + NZ, K + d:K + d + NX] for d in range(-K, K + 1)]), 0)
O = filt(filt(H, np.min), np.max)
D = H - O

# 建物の外形（屋根と床の三角形を 5m 格子の点で塗る）
b = open(os.path.join(out, 'bldg.bin'), 'rb').read()
hl = struct.unpack('<I', b[:4])[0]; hdr = json.loads(b[4:4 + hl]); off = 4 + hl
q = np.frombuffer(b, np.int16, hdr['nv'] * 3, off).reshape(-1, 3) * hdr['q']; off += hdr['nv'] * 6; off += (hdr['nv'] * 6) % 4
idx = np.frombuffer(b, np.uint32, hdr['ni'], off).reshape(-1, 3)
F = np.zeros((NZ, NX), bool)
P3 = q[idx][:, :, [0, 2]]
area = (P3[:, 1, 0] - P3[:, 0, 0]) * (P3[:, 2, 1] - P3[:, 0, 1]) - (P3[:, 1, 1] - P3[:, 0, 1]) * (P3[:, 2, 0] - P3[:, 0, 0])
for P in P3[np.abs(area) >= 1]:
    i0, i1 = max(0, int(np.floor((P[:, 0].min() - X0) / C))), min(NX - 1, int(np.ceil((P[:, 0].max() - X0) / C)))
    j0, j1 = max(0, int(np.floor((P[:, 1].min() - Z0) / C))), min(NZ - 1, int(np.ceil((P[:, 1].max() - Z0) / C)))
    if i1 < i0 or j1 < j0: continue
    xs, zs = np.meshgrid(X0 + np.arange(i0, i1 + 1) * C, Z0 + np.arange(j0, j1 + 1) * C)
    d = [(P[(k + 1) % 3, 0] - P[k, 0]) * (zs - P[k, 1]) - (P[(k + 1) % 3, 1] - P[k, 1]) * (xs - P[k, 0]) for k in range(3)]
    F[j0:j1 + 1, i0:i1 + 1] |= ((d[0] >= 0) & (d[1] >= 0) & (d[2] >= 0)) | ((d[0] <= 0) & (d[1] <= 0) & (d[2] <= 0))

mask = D > 3
seen = np.zeros_like(mask)
fixed = 0; comps = 0
for j in range(NZ):
    for i in range(NX):
        if not mask[j, i] or seen[j, i]: continue
        st = [(j, i)]; seen[j, i] = True; cells = []
        while st:
            a, c = st.pop(); cells.append((a, c))
            for da, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                y, x = a + da, c + dc
                if 0 <= y < NZ and 0 <= x < NX and mask[y, x] and not seen[y, x]: seen[y, x] = True; st.append((y, x))
        ys = np.array([p[0] for p in cells]); xs = np.array([p[1] for p in cells])
        if F[ys, xs].mean() < 0.45: continue
        comps += 1
        sel = np.zeros_like(mask); sel[ys, xs] = True
        ring = np.zeros_like(mask)
        for da, dc in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            ring |= np.roll(np.roll(sel, da, 0), dc, 1)
        tgt = sel | (ring & (D > 1))
        H[tgt] = O[tgt]; fixed += int(tgt.sum())
        print('建物の塊 %4d 格子  中心 (%d, %d)  高さの差 最大 %.1f m' % (tgt.sum(), X0 + xs.mean() * C, Z0 + ys.mean() * C, D[ys, xs].max()))
U2 = np.round(H.reshape(-1) * 100 + 5000).clip(0, 65535).astype(np.uint16)
open(fn, 'wb').write(U2.tobytes())
print('直した塊', comps, '格子', fixed)
