#!/usr/bin/env python3
"""路面表示（road_marks.bin）の破片を掃除する。
  python3 tools/world/marks_clean.py assets/data/world/center/road_marks.bin [出力]
第 4 回の審査（2026-10-11）: 導流帯・区画線が「ちぎれた紙片」のようになり、交差点の周りに細かい白い破片が散る。
原因は、航空写真の木漏れ日・影の縁・車の反射・広場の舗装の模様を塗料として拾った形。
規則: 白・黄の形（色付き舗装は除く）のうち、次のどれにも当たらない物を捨てる。
  - 長方形に近い（最小の外接長方形を埋める割合 0.72 以上）: 破線・停止線・横断歩道の縞・導流帯の縞
  - 大きくまとまった形（長い辺 1.6〜8m・面積 0.8m2 以上・凸包を埋める割合 0.45 以上）: 矢印・数字・文字・ひし形
  - 細長い形（長さが幅の 6 倍以上・幅 0.1〜0.35m・長さ 1m 以上）: 実線の一部
さらに、面積 0.12m2 未満は捨てる。線（中心線と幅で持つ物）は 0.8m 未満の短い物だけ捨てる。
"""
import sys, json, numpy as np, cv2

RECT, SOL = 0.72, 0.45


def load(fn):
    b = open(fn, 'rb').read(); hl = int(np.frombuffer(b[:4], np.uint32)[0]); hdr = json.loads(b[4:4 + hl]); off = 4 + hl + ((4 + hl) % 2)
    body = np.frombuffer(b[off:], np.int16); T = hdr['tile']; items = []
    for ti, tj, st, ln in hdr['tiles']:
        ox, oz = ti * T, tj * T; p = st; end = st + ln
        while p < end:
            kind, ci = int(body[p]), int(body[p + 1]); p += 2
            if kind == 0:
                w = body[p] / 100; n = int(body[p + 1]); p += 2
                P = np.array(body[p:p + 2 * n], float).reshape(-1, 2) / 100 + [ox, oz]; p += 2 * n; items.append(('l', ci, w, P))
            else:
                nr = int(body[p]); p += 1; R = []
                for r in range(nr):
                    n = int(body[p]); p += 1; R.append(np.array(body[p:p + 2 * n], float).reshape(-1, 2) / 100 + [ox, oz]); p += 2 * n
                items.append(('p', ci, R))
    return hdr, items


def keep_poly(R):
    P = np.asarray(R[0], np.float32); A = abs(cv2.contourArea(P))
    if A < 0.12: return False
    (_, _), (w, h), _ = cv2.minAreaRect(P); L, W = max(w, h), min(w, h)
    rect = A / max(w * h, 1e-6); sol = A / max(cv2.contourArea(cv2.convexHull(P)), 1e-6)
    if rect >= RECT: return True
    if 1.6 <= L <= 8.0 and A >= 0.8 and sol >= SOL: return True
    if L >= 1.0 and L >= 6 * W and 0.1 <= W <= 0.35: return True
    return False


def to_line(R, res=0.05):
    """細長いが縁がぎざぎざの形（区画線に木漏れ日・影がくっついた物）を、中心線と一定の幅の線に直す。
    主軸に沿って 1m ごとに、細線化した中心の横の位置の中央値を取る。幅は中心での太さの中央値を標準の幅（0.15/0.2/0.3m）に丸める。
    線にできなければ None"""
    from skimage.morphology import skeletonize
    from scipy import ndimage
    P = np.asarray(R[0], float); mn = P.min(0) - 0.2; Q = ((P - mn) / res).astype(np.int32)
    H, W = Q[:, 1].max() + 6, Q[:, 0].max() + 6
    if H * W > 4e6: return None
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [Q], 1)
    for r in R[1:]: cv2.fillPoly(m, [((np.asarray(r, float) - mn) / res).astype(np.int32)], 0)
    sk = skeletonize(m > 0); dt = ndimage.distance_transform_edt(m)
    ys, xs = np.nonzero(sk)
    if len(xs) < 20: return None
    wd = np.median(dt[ys, xs]) * 2 * res
    if not 0.08 <= wd <= 0.42: return None
    pts = np.stack([xs, ys], 1) * res + mn; c = pts.mean(0); C = np.cov((pts - c).T); ev, evec = np.linalg.eigh(C); u = evec[:, 1]; v = np.array([-u[1], u[0]])
    t = (pts - c) @ u; l = (pts - c) @ v; t0, t1 = t.min(), t.max()
    if t1 - t0 < 3: return None
    out = []
    for a in np.arange(t0, t1 + 1e-6, 1.0):
        k = np.abs(t - a) <= 0.6
        if k.sum() >= 3: out.append(c + u * a + v * float(np.median(l[k])))
    if len(out) < 3: return None
    out = np.array(out)
    if np.abs(np.diff(out @ v)).max() > 0.5: return None   # 横へ大きく跳ぶ物は線ではない
    out[:, :] = np.array([np.convolve(out[:, j], np.ones(3) / 3, 'same') if len(out) > 4 else out[:, j] for j in (0, 1)]).T if len(out) > 4 else out
    out[0], out[-1] = c + u * t0 + v * float(np.median(l[t < t0 + 1])), c + u * t1 + v * float(np.median(l[t > t1 - 1]))
    w = min((0.15, 0.2, 0.3), key=lambda q: abs(q - wd))
    return w, out


def clean(L, Pp):
    """road_marks.py の中で使う: L = [(色, 幅, 点列)], Pp = [(色, [輪, ...])]"""
    L2 = [l for l in L if np.sum(np.hypot(*np.diff(np.asarray(l[2], float), axis=0).T)) >= 0.8]
    P2 = []
    for p in Pp:
        if p[0] >= 2 or keep_poly(p[1]): P2.append(p); continue
        r = to_line(p[1])
        if r: L2.append((p[0], r[0], [tuple(q) for q in r[1]]))
    return L2, P2


def write(fn, hdr, items):
    T = hdr['tile']; byT = {}
    key = lambda P: (int(np.floor(np.mean(np.asarray(P, float)[:, 0]) / T)), int(np.floor(np.mean(np.asarray(P, float)[:, 1]) / T)))
    for it in items: byT.setdefault(key(it[3] if it[0] == 'l' else it[2][0]), []).append(it)
    body, tiles = [], []
    for (ti, tj), its in sorted(byT.items()):
        ox, oz = ti * T, tj * T; st = len(body)
        cm = lambda P: [int(round((v - o) * 100)) for p in P for v, o in ((p[0], ox), (p[1], oz))]
        for it in its:
            if it[0] == 'l': body += [0, it[1], int(round(it[2] * 100)), len(it[3])] + cm(it[3])
            else:
                body += [1, it[1], len(it[2])]
                for ring in it[2]: body += [len(ring)] + cm(ring)
        tiles.append([ti, tj, st, len(body) - st])
    h = dict(hdr); h['tiles'] = tiles
    hb = json.dumps(h, separators=(',', ':'), ensure_ascii=False).encode(); hb += b' ' * (len(hb) % 2)
    with open(fn, 'wb') as f:
        f.write(np.uint32(len(hb)).tobytes()); f.write(hb); f.write(np.array(body, np.int16).tobytes())


if __name__ == '__main__':
    src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else src
    hdr, items = load(src)
    L = [(it[1], it[2], it[3]) for it in items if it[0] == 'l']; P = [(it[1], it[2]) for it in items if it[0] == 'p']
    L2, P2 = clean(L, P)
    print('線 %d → %d・形 %d → %d' % (len(L), len(L2), len(P), len(P2)))
    write(dst, hdr, [('l', c, w, Q) for c, w, Q in L2] + [('p', c, R) for c, R in P2])
