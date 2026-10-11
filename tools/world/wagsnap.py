"""浜松市の現況平面図（道路台帳図、1/500）の線で区画を作り、車道・歩道・道路の外の境目を図の線に合わせる。
ユーザーの指示（2026-10-10）: 歩道と車道の大きさ・位置は現況平面図が正確なので、それを正解にする（写真の測定は誤差が大きい）。
図の画像は浜松市の著作物で、公開のリポジトリには入れない（個人利用。/tmp/world/wag/g_500_X_Z.png）。
線の種類（凡例: 破線 = 区間線、数字 = 幅員、U-52 = 側溝の寸法）を判別する:
  道路の外側の範囲は今のデータ（PLATEAU の道路の外形。市の地図が元）のまま使い、図の線はその範囲の 0.6m 内側にある物だけを使う
  （建物・敷地の線は道路の外にあるので使われない）。文字・記号・破線（区間線）は短い塊として除く。
  残った実線（縁石・分離帯の縁・側溝・寸法線）で道路の中を区画に分け、区画の種類は、OSM の車道の中心線が通るか・区画の幅・
  道路の縁に接するかで決める。外側の範囲は変えず、車道と歩道・島の分け方だけを変える。"""
import math, os
import numpy as np
import cv2
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from wagref import WagRef, DX, DZ
from scipy import ndimage

STEP = 115.0   # 図の中心の間隔（m）。この四方だけを使う（となりの図と重ねない）


def _fill(mask, geom, toP, val):
    for g in (geom.geoms if hasattr(geom, 'geoms') else [geom]):
        if g.is_empty or g.geom_type != 'Polygon': continue
        rings = [np.round(np.array(toP(np.array(r.coords))) * 4).astype(np.int32) for r in [g.exterior] + list(g.interiors)]
        cv2.fillPoly(mask, [rings[0]], val, shift=2)
        if len(rings) > 1: cv2.fillPoly(mask, rings[1:], 0, shift=2)


def bridge(thin, Um, res, Lmax=6.0):
    """線の端（細線化した線の、隣が 1 画素だけの所）から、端の手前 1.5m の向きに最大 Lmax m 延ばし、
    ほかの線（同じ線でも 2m 以上離れた所）に当たれば、その間を線でつなぐ。道路の範囲の外へは延ばさない"""
    from skimage.morphology import skeletonize
    sk = skeletonize(thin > 0).astype(np.uint8)
    nbc = cv2.filter2D(sk, -1, np.ones((3, 3), np.float32), borderType=cv2.BORDER_CONSTANT) - sk
    ends = np.argwhere((sk > 0) & (nbc == 1))
    if not len(ends): return thin
    ncomp, comp = cv2.connectedComponents(sk, connectivity=8)
    H, W = thin.shape; out = thin.copy(); r = max(4, int(1.5 / res)); steps = int(Lmax / res)
    for y, x in ends:
        y0, y1, x0, x1 = max(0, y - r), min(H, y + r + 1), max(0, x - r), min(W, x + r + 1)
        yy, xx = np.nonzero(comp[y0:y1, x0:x1] == comp[y, x])
        if len(yy) < 4: continue
        d = np.array([x - (xx.mean() + x0), y - (yy.mean() + y0)])
        nd = np.hypot(*d)
        if nd < 1.5: continue
        d /= nd
        for k in range(3, steps):
            px, py = int(round(x + d[0] * k)), int(round(y + d[1] * k))
            if px < 0 or py < 0 or px >= W or py >= H or not Um[py, px]: break
            if sk[py, px] or thin[py, px]:
                # 当たった線が同じ向き（20 度以内）のときだけつなぐ（途切れた縁石の続き）。向きの違う線とはつながない
                yy2, xx2 = np.nonzero(comp[max(0, py - r):py + r + 1, max(0, px - r):px + r + 1] == comp[py, px])
                if (comp[py, px] != comp[y, x] or k * res >= 2.0) and len(yy2) >= 4:
                    C = np.cov(np.stack([xx2, yy2]))
                    ev, evec = np.linalg.eigh(C); dl = evec[:, 1]
                    if abs(float(dl @ d)) >= math.cos(math.radians(20)): cv2.line(out, (int(x), int(y)), (px, py), 1, 1)
                break
    return out


def sidewalk_rays(Um, thin, res, dmin=1.2, dmax=6.5, win=7.5, wloc=None, wmin=8.0, frac=0.45):
    """道路の縁から内側へまっすぐ延ばし、縁から dmin〜dmax m で最初に当たる「縁と平行な線」を縁石とみなす（縁のすぐ内側の境界線・側溝の線は dmin で除く）。
    縁に沿って win m の幅で縁石までの距離の中央値を取り（車の出入り口などで縁石が途切れた所も幅を保つ）、
    縁と縁石の間を歩道にした画像を返す。幅 4m 未満の穴（分離帯）の縁からは延ばさない"""
    H, W = Um.shape; out = np.zeros((H, W), np.uint8)
    # 線の向き（構造テンソル）: 線に沿う向きの角度
    t = cv2.GaussianBlur(thin.astype(np.float32), (0, 0), 1.5)
    gx = cv2.Sobel(t, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(t, cv2.CV_32F, 0, 1, ksize=3)
    Jxx = cv2.GaussianBlur(gx * gx, (0, 0), 2.5); Jyy = cv2.GaussianBlur(gy * gy, (0, 0), 2.5); Jxy = cv2.GaussianBlur(gx * gy, (0, 0), 2.5)
    lang = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2   # 勾配に直交 = 線の向き
    cs, hi = cv2.findContours(Um, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hi is None: return out
    edt = ndimage.distance_transform_edt(Um)
    k0, k1 = int(dmin / res), int(dmax / res); K = np.arange(k0, k1 + 1)
    hw = max(3, int(win / res / 2))
    for i, c in enumerate(cs):
        P = c[:, 0, :].astype(np.float32); n = len(P)
        if n < 20: continue
        if hi[0][i][3] != -1:   # 穴: 幅 4m 未満（分離帯）なら延ばさない
            m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [c], 1)
            if ndimage.distance_transform_edt(m).max() * res * 2 < 4.0: continue
        tg = np.roll(P, -4, 0) - np.roll(P, 4, 0); tg /= np.maximum(np.linalg.norm(tg, axis=1, keepdims=True), 1e-6)
        nv = np.stack([-tg[:, 1], tg[:, 0]], 1)
        # 内側を向くように（3 画素先が道路の範囲なら内側）
        q = np.clip(np.round(P + nv * 3).astype(int), 0, [W - 1, H - 1])
        flip = Um[q[:, 1], q[:, 0]] == 0; nv[flip] *= -1
        X = np.round(P[:, None, 0] + nv[:, None, 0] * K[None]).astype(int); Y = np.round(P[:, None, 1] + nv[:, None, 1] * K[None]).astype(int)
        ok = (X >= 0) & (X < W) & (Y >= 0) & (Y < H); Xc = np.clip(X, 0, W - 1); Yc = np.clip(Y, 0, H - 1)
        inside = ok & (Um[Yc, Xc] > 0)
        hit = inside & (thin[Yc, Xc] > 0)
        # 道の中心より遠い線（細い道の向こう側の側溝など）は縁石と見なさない: 縁からの距離 ≦ その筋の道幅の半分（内側の画素の縁までの距離の最大）
        half = np.maximum.accumulate(np.where(inside, edt[Yc, Xc], 0), axis=1)
        hit &= K[None] <= half + 1
        # 縁と平行な線だけ（向きの差 30 度以内）
        ta = np.arctan2(tg[:, 1], tg[:, 0])[:, None]
        dang = np.abs(((lang[Yc, Xc] - ta) + np.pi / 2) % np.pi - np.pi / 2)
        hit &= dang < np.radians(30)
        # 道路の範囲を出る前に当たった最初の線
        out_first = np.where((~inside).any(1), (~inside).argmax(1), len(K))
        hk = np.where(hit.any(1), hit.argmax(1), len(K))
        d = np.where(hk < out_first, K[np.minimum(hk, len(K) - 1)], np.inf).astype(float)
        # 縁に沿った中央値（窓の 4 割以上で縁石が見つかった所だけ）
        dd = np.concatenate([d[-hw:], d, d[:hw]]) if hi[0][i][2] != -2 else d
        fin = np.isfinite(dd).astype(float)
        cnt = np.convolve(fin, np.ones(2 * hw + 1), 'same')
        med = np.array([np.median(dd[j - hw:j + hw + 1][np.isfinite(dd[j - hw:j + hw + 1])]) if cnt[j] >= 0.4 * (2 * hw + 1) else np.inf for j in range(hw, hw + n)])
        if wloc is not None:   # 細い道（幅 wmin m 未満）には歩道を作らない。歩道の幅は道幅の frac まで（向こう側の線を縁石と誤らない）
            q2 = np.clip(np.round(P + nv * 3).astype(int), 0, [W - 1, H - 1]); wl = wloc[q2[:, 1], q2[:, 0]]
            med = np.where((wl >= wmin) & (med * res <= frac * wl), med, np.inf)
        for j in np.nonzero(np.isfinite(med))[0]:
            e = P[j] + nv[j] * med[j]
            cv2.line(out, (int(round(P[j][0])), int(round(P[j][1]))), (int(round(e[0])), int(round(e[1]))), 1, 2)
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) & Um
    return out


def narrow_strips(Um, thin, res, wmax=3.0, lmin=5.0):
    """2 本の線に挟まれた幅 wmax m 以下の細長い帯（分離帯・交通島）。区画が閉じているかには頼らない:
    各画素からいちばん近い線へ向かう向きの反対側へ進み、wmax m 以内にもう 1 本の線があれば帯の中とする。
    長さ lmin m 以上で、道路の縁から 1.2m 以上離れた塊だけを返す"""
    H, W = Um.shape
    d1, (iy, ix) = ndimage.distance_transform_edt(thin == 0, return_indices=True)
    yy, xx = np.nonzero((Um > 0) & (thin == 0) & (d1 * res <= wmax * 0.6))
    if not len(yy): return np.zeros((H, W), np.uint8)
    ny, nx = yy - iy[yy, xx], xx - ix[yy, xx]; L = np.maximum(np.hypot(ny, nx), 1e-6); ny, nx = ny / L, nx / L
    found = np.zeros(len(yy), bool); tot = d1[yy, xx].copy()
    for k in range(1, int(wmax / res) + 1):
        py = np.round(yy + ny * k).astype(int); px = np.round(xx + nx * k).astype(int)
        ok = (py >= 0) & (py < H) & (px >= 0) & (px < W) & ~found
        hit = np.zeros(len(yy), bool); hit[ok] = thin[py[ok], px[ok]] > 0
        found |= hit; tot = np.where(hit, tot + k, tot)
    st = found & (tot * res <= wmax)
    m = np.zeros((H, W), np.uint8); m[yy[st], xx[st]] = 1
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) & Um
    far = ndimage.distance_transform_edt(Um) * res >= 1.2
    m &= far.astype(np.uint8)
    n, lab, stt, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros(n, bool)
    keep[1:] = (np.hypot(stt[1:, 2], stt[1:, 3]) * res >= lmin) & (stt[1:, 4] * res * res >= 4)
    return keep[lab].astype(np.uint8)


def local_width(Um, res, r=12.0):
    """道路の範囲の各画素の「その所の道幅」（m）= 周り r m 四方での、縁までの距離の最大の 2 倍。
    （細線化の中心線から写す方法は、車の出入り口のへこみで中心線に枝が出て、歩道の所の道幅を小さく見誤った）"""
    dt = ndimage.distance_transform_edt(Um).astype(np.float32)
    k = int(2 * r / res) | 1
    return (2 * ndimage.maximum_filter(dt, size=k) * res * (Um > 0)).astype(np.float32)


def centerline_dir(edges, toP, H, W):
    """各画素からいちばん近い OSM の道の中心線の向き（ラジアン）。交差点の近くでも道路の向きを取れる"""
    ang = np.zeros((H, W), np.float32); has = np.zeros((H, W), np.uint8)
    for e in edges:
        pp = toP(np.asarray(e['pts'], float))
        if (pp[:, 0] < -200).all() or (pp[:, 0] > W + 200).all() or (pp[:, 1] < -200).all() or (pp[:, 1] > H + 200).all(): continue
        for (x1, y1), (x2, y2) in zip(pp[:-1], pp[1:]):
            if np.hypot(x2 - x1, y2 - y1) < 1: continue
            p1, p2 = (int(round(x1)), int(round(y1))), (int(round(x2)), int(round(y2)))
            cv2.line(ang, p1, p2, float(math.atan2(y2 - y1, x2 - x1)), 1); cv2.line(has, p1, p2, 1, 1)
    if not has.any(): return None
    _, (iy, ix) = ndimage.distance_transform_edt(has == 0, return_indices=True)
    return ang[iy, ix]


def long_parallel_lines(a, Um, Uin, res, ang=15.0, lmin=8.0, seg_min=0.8, cdir=None):
    """道路の向きと平行（ang 度以内）な線分だけを集め、つながって lmin m 以上になる線を返す（縁石・分離帯の縁の候補）。
    寸法線・区間線（道路を横切る）、横断歩道の縞（1 本 4m 前後）、文字・記号はここで落ちる。
    道路の向きは、道路の縁までの距離の勾配に直交する向き（交差点の角の曲がった縁石にも沿う）"""
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    L = lsd.detect(a)[0]
    H, W = Um.shape; out = np.zeros((H, W), np.uint8)
    if L is None: return out
    L = L.reshape(-1, 4)
    E = cv2.GaussianBlur(ndimage.distance_transform_edt(Um).astype(np.float32), (0, 0), 3)
    gx = cv2.Sobel(E, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(E, cv2.CV_32F, 0, 1, ksize=3)
    rdir = np.arctan2(gy, gx) + np.pi / 2
    ln = np.hypot(L[:, 2] - L[:, 0], L[:, 3] - L[:, 1]) * res
    mx = np.clip(((L[:, 0] + L[:, 2]) / 2).astype(int), 0, W - 1); my = np.clip(((L[:, 1] + L[:, 3]) / 2).astype(int), 0, H - 1)
    sa = np.arctan2(L[:, 3] - L[:, 1], L[:, 2] - L[:, 0])
    dang = np.abs(((sa - rdir[my, mx]) + np.pi / 2) % np.pi - np.pi / 2)
    if cdir is not None:   # 道の中心線の向きと合っていてもよい（交差点の近くは縁までの距離の勾配が乱れる）
        dang = np.minimum(dang, np.abs(((sa - cdir[my, mx]) + np.pi / 2) % np.pi - np.pi / 2))
    ok = (ln >= seg_min) & (Uin[my, mx] > 0) & (dang < np.radians(ang))
    for x1, y1, x2, y2 in L[ok]:
        cv2.line(out, (int(round(x1)), int(round(y1))), (int(round(x2)), int(round(y2))), 1, 1)
    # 線の両側の縁（LSD は 1 本の線を 2 本に取る）と、0.4m までの切れ目をつなげてから長さを測る
    j = cv2.morphologyEx(out, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.4 / res) | 1,) * 2))
    n, lab, st, _ = cv2.connectedComponentsWithStats(j, connectivity=8)
    keep = np.zeros(n, bool); keep[1:] = np.hypot(st[1:, 2], st[1:, 3]) * res >= lmin
    return (keep[lab] & (out > 0)).astype(np.uint8)


_VS = None
def photo_lab(toG, W, H):
    """図の画素と同じ格子の写真（Lab、0〜255）。写真が無ければ None"""
    global _VS
    try:
        from vsimg import VS
        if _VS is None: _VS = VS()
        cc, rr = np.meshgrid(np.arange(W, dtype=np.float64), np.arange(H, dtype=np.float64))
        gx, gz = toG(cc, rr)
        rgb = _VS.sample(np.asarray(gx).ravel(), np.asarray(gz).ravel()).reshape(H, W, 3)
    except Exception:
        return None
    if np.isnan(rgb).mean() > 0.5: return None
    rgb = np.nan_to_num(rgb).clip(0, 255).astype(np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)


def photo_ok(cand, carr, lab, res, de=8.0, band=8.0, prior=None):
    """cand の塊ごとに、写真の色（影を除く）を周り band m の車道の見本（carr: 道の中心線の周り）と比べ、色の差（ΔE）が de 以上の塊だけを返す。
    prior（今のデータの歩道）と 4 割以上重なる塊は、色が似ていても残す（灰色の舗装の歩道）"""
    out = np.zeros(cand.shape, bool)
    n, labc = cv2.connectedComponents(cand.astype(np.uint8), connectivity=8)
    lit = lab[..., 0] >= 70   # 影（暗い所）は比べない
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(band / res) | 1,) * 2)
    for i in range(1, n):
        m = labc == i
        if m.sum() * res * res < 6: continue
        if prior is not None and (prior & m).sum() >= 0.4 * m.sum(): out |= m; continue
        near = cv2.dilate(m.astype(np.uint8), k) > 0
        a = lab[m & lit]; b = lab[near & carr & lit]
        if len(a) < 50 or len(b) < 50:   # 建物の影の中: 影どうしで比べる
            a = lab[m & ~lit]; b = lab[near & carr & ~lit]
            if len(a) < 50 or len(b) < 50: continue
        dE = np.linalg.norm(np.median(a, 0) - np.median(b, 0))
        if os.environ.get('SNAP_DE'): print('写真の色の差', round(float(dE), 1), '面積 %.0f m2' % (m.sum() * res * res), '重心', np.argwhere(m).mean(0).astype(int), np.median(a, 0).astype(int), np.median(b, 0).astype(int))
        if dE >= de: out |= m
    return out


def hatch_zone(a, Um, res, box_m=2.5, th=0.33):
    """図の線が密集した所（横断歩道・導流帯の縞、「止まれ」などの文字、寸法の数字の固まり）。
    普通の線（縁石・側溝の 2 本線）は box_m 四方の 3 割に満たない。この中の線は縁石として使わず、歩道・島も作らない"""
    k = max(3, int(box_m / res)) | 1
    dens = cv2.boxFilter((a < 215).astype(np.float32), -1, (k, k))
    hz = ((dens > th) & (Um > 0)).astype(np.uint8)
    return cv2.dilate(hz, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(1.2 / res) | 1,) * 2))


def snap_edge(Um, lines, res, dmax=1.5, win=7.5):
    """道路の外側の縁を、縁から内外 dmax m 以内にある図の平行な線（道路の縁の線）に合わせた範囲を返す。
    縁に沿って win m の幅でずらし量の中央値を取る（線の見つかった所が 4 割未満なら動かさない）"""
    H, W = Um.shape
    t = cv2.GaussianBlur(lines.astype(np.float32), (0, 0), 1.5)
    gx = cv2.Sobel(t, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(t, cv2.CV_32F, 0, 1, ksize=3)
    Jxx = cv2.GaussianBlur(gx * gx, (0, 0), 2.5); Jyy = cv2.GaussianBlur(gy * gy, (0, 0), 2.5); Jxy = cv2.GaussianBlur(gx * gy, (0, 0), 2.5)
    lang = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2
    cs, hi = cv2.findContours(Um, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hi is None: return Um
    K = np.arange(-int(dmax / res), int(dmax / res) + 1); order = np.argsort(np.abs(K), kind='stable')
    hw = max(3, int(win / res / 2)); out = np.zeros_like(Um); holes = []
    for i, c in enumerate(cs):
        P = c[:, 0, :].astype(np.float32); n = len(P)
        if n < 40:   # 小さな形は動かさない
            if hi[0][i][3] == -1: cv2.fillPoly(out, [c], 1)
            else: holes.append(c)
            continue
        tg = np.roll(P, -4, 0) - np.roll(P, 4, 0); tg /= np.maximum(np.linalg.norm(tg, axis=1, keepdims=True), 1e-6)
        nv = np.stack([-tg[:, 1], tg[:, 0]], 1)
        q = np.clip(np.round(P + nv * 3).astype(int), 0, [W - 1, H - 1]); nv[Um[q[:, 1], q[:, 0]] == 0] *= -1   # 内向き
        X = np.round(P[:, None, 0] + nv[:, None, 0] * K[None]).astype(int); Y = np.round(P[:, None, 1] + nv[:, None, 1] * K[None]).astype(int)
        ok = (X >= 0) & (X < W) & (Y >= 0) & (Y < H); Xc = np.clip(X, 0, W - 1); Yc = np.clip(Y, 0, H - 1)
        ta = np.arctan2(tg[:, 1], tg[:, 0])[:, None]
        dang = np.abs(((lang[Yc, Xc] - ta) + np.pi / 2) % np.pi - np.pi / 2)
        hit = ok & (lines[Yc, Xc] > 0) & (dang < np.radians(25))
        ho = hit[:, order]; first = np.where(ho.any(1), ho.argmax(1), -1)   # 縁にいちばん近い線
        off = np.where(first >= 0, K[order][np.maximum(first, 0)], np.nan).astype(float)
        dd = np.concatenate([off[-hw:], off, off[:hw]])
        med = np.zeros(n)
        for j in range(n):
            w_ = dd[j:j + 2 * hw + 1]; f_ = w_[np.isfinite(w_)]
            med[j] = np.median(f_) if len(f_) >= 0.4 * len(w_) else 0.0
        Q = np.round(P + nv * med[:, None]).astype(np.int32)
        if hi[0][i][3] == -1: cv2.fillPoly(out, [Q.reshape(-1, 1, 2)], 1)
        else: holes.append(Q.reshape(-1, 1, 2))
    if holes: cv2.fillPoly(out, holes, 0)
    return out


def rails_gsi(buf=5.0):
    """地理院ベクトルタイル（/tmp/world/gsibv）の線路（RailCL・RailTrCL）を buf m 太らせた形。高架の下は線路の線が縁石に見えるので図を使わない"""
    import glob, gzip, mapbox_vector_tile
    from shapely.geometry import LineString
    LAT0, LON0 = 34.7037, 137.7351; KXg = math.cos(math.radians(LAT0)) * 111320.0; KZg = 110574.0; nT = 2 ** 16
    def t2xz(i, j, px, py, ext):
        fx, fy = i + px / ext, j + 1 - py / ext
        lo = fx / nT * 360 - 180; la = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / nT))))
        return ((lo - LON0) * KXg, (LAT0 - la) * KZg)
    ls = []
    for f in glob.glob('/tmp/world/gsibv/16_*.pbf'):
        _, i, j = map(int, os.path.basename(f)[:-4].split('_'))
        b = open(f, 'rb').read(); b = gzip.decompress(b) if b[:2] == b'\x1f\x8b' else b
        d = mapbox_vector_tile.decode(b)
        for k in ('RailCL', 'RailTrCL'):
            L = d.get(k)
            if not L: continue
            for ft in L['features']:
                g = ft['geometry']; cs = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
                for c in cs:
                    if len(c) >= 2: ls.append(LineString([t2xz(i, j, x, y, L.get('extent', 4096)) for x, y in c]))
    return unary_union(ls).buffer(buf) if ls else None


def snap(car, walk, edges, wr=None, log=print):
    """car・walk（shapely）と道路網の辺（pts を持つ）を受け取り、(図で直した car, walk, 図を使った範囲) を返す。図が無ければ None"""
    wr = wr or WagRef(mps=500)
    if not wr.ok: return None
    car = car.buffer(0); walk = walk.buffer(0)
    from scipy import ndimage
    cars, walks, cells = [], [], []
    res = (wr.sx + wr.sz) / 2
    import json
    rails = rails_gsi()
    of = os.path.join(os.environ.get('WAG_DIR', '/tmp/world/wag'), 'offsets.json')
    offs = json.load(open(of)) if os.path.exists(of) else {}
    box_env = os.environ.get('SNAP_BOX')   # 試すとき: x0,z0,x1,z1 の範囲の図だけを使う
    bb = [float(v) for v in box_env.split(',')] if box_env else None
    for k, (cx, cz, f) in enumerate(wr.imgs):
        if bb and not (bb[0] <= cx <= bb[2] and bb[1] <= cz <= bb[3]): continue
        a = cv2.imread(f, 0)
        if a is None: continue
        H, W = a.shape
        o = offs.get(os.path.basename(f), {}); ox = DX + (o.get('dx', 0) if o.get('gain', 0) >= 1.02 else 0); oz = DZ + (o.get('dz', 0) if o.get('gain', 0) >= 1.02 else 0)   # 図ごとの位置合わせ（wagreg.py）
        toP = lambda p: np.stack([(p[:, 0] - ox - cx) / wr.sx + W / 2 - .5, (p[:, 1] - oz - cz) / wr.sz + H / 2 - .5], 1)
        toG = lambda c, r: ((c + .5 - W / 2) * wr.sx + cx + ox, (r + .5 - H / 2) * wr.sz + cz + oz)
        x0, z0 = toG(-0.5, -0.5); x1, z1 = toG(W - 0.5, H - 0.5)
        view = box(x0, z0, x1, z1)
        # 車道と歩道は別々の面に描いてから合わせる（車道の穴（分離帯）を 0 で塗ると、先に描いた歩道を消してしまう）
        mw = np.zeros((H, W), np.uint8); mc = np.zeros((H, W), np.uint8)
        _fill(mw, walk.intersection(view), toP, 1); _fill(mc, car.intersection(view), toP, 1)
        cur = np.where(mc > 0, 1, np.where(mw > 0, 2, 0)).astype(np.uint8)
        if (cur > 0).mean() < 0.01: continue
        Um = (cur > 0).astype(np.uint8)   # 道路の範囲（外側の縁は今のデータのまま）
        Uin = cv2.erode(Um, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))   # 0.6m 内側（縁の線・側溝・建物の線を除く）
        cl = np.zeros((H, W), np.uint8)   # 車道の中心線
        for e in edges:
            pp = toP(np.asarray(e['pts'], float))
            if (pp[:, 0] < -100).all() or (pp[:, 0] > W + 100).all() or (pp[:, 1] < -100).all() or (pp[:, 1] > H + 100).all(): continue
            cv2.polylines(cl, [np.round(pp * 4).astype(np.int32)], False, 1, 3, shift=2)
        # 1. 線: 文字・記号・破線（区間線）は短い塊（外接の長い辺が 3m 未満）なので除く。道路の範囲の内側の線だけを使う
        #    1/500 の線は 1 画素の細さで、濃さの判定で切れやすいので、薄い所まで拾って 1〜2 画素の切れ目をふさぐ
        ln = cv2.morphologyEx((a < 215).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(ln, connectivity=8)
        keep = np.zeros(n, bool); keep[1:] = np.maximum(st[1:, 2], st[1:, 3]) * res >= 3.0
        # 道路の外側の縁を図の道路の縁の線に合わせ、範囲と今の分け方をそれに合わせて直す
        Um2 = snap_edge(Um, keep[lab].astype(np.uint8), res)
        if Um2.sum() > 0.5 * Um.sum():
            _, (jy, jx) = ndimage.distance_transform_edt(cur == 0, return_indices=True)
            cur = np.where(Um2 > 0, cur[jy, jx], 0).astype(np.uint8)
            Um = Um2; Uin = cv2.erode(Um, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
        hz = hatch_zone(a, Um, res)   # 縞・文字の密集した所
        wloc = local_width(Um, res)   # その所の道幅
        thin = long_parallel_lines(a, Um, Uin, res, cdir=centerline_dir(edges, toP, H, W))   # 道路と平行な長い線だけ（縁石・分離帯の縁）
        thin = bridge(thin, Um, res)   # 車の出入り口（切り下げ）などで途切れた縁石の線を、線の向きに延ばしてつなぐ
        solid = cv2.dilate(thin, np.ones((3, 3), np.uint8))
        # 2. 道路の中の区画と、その性質（面積・中心線・最も太い所の幅・道路の縁に接するか）
        free = ((Um > 0) & (solid == 0)).astype(np.uint8)
        n2, reg = cv2.connectedComponents(free, connectivity=4)
        area = np.bincount(reg.ravel(), minlength=n2).astype(float)
        touch = np.bincount(reg.ravel(), weights=cl.ravel().astype(float), minlength=n2) > 0
        wmax = ndimage.maximum(ndimage.distance_transform_edt(reg > 0), reg, index=np.arange(n2)) * res * 2
        edge = cv2.dilate(1 - Um, np.ones((3, 3), np.uint8))   # 道路の縁（範囲の外）に接する画素
        eN = np.bincount(reg.ravel(), weights=edge.ravel().astype(float), minlength=n2)
        lN = np.bincount(reg.ravel(), weights=cv2.dilate(solid, np.ones((3, 3), np.uint8)).ravel().astype(float), minlength=n2)
        adjE = eN > 0
        efr = eN / np.maximum(eN + lN, 1)   # 区画の周りのうち道路の縁の割合（歩道 = 縁と縁石で半々、歩道の無い細い道 = ほとんど縁）
        curcar = np.bincount(reg.ravel(), weights=(cur == 1).ravel().astype(float), minlength=n2) / np.maximum(area, 1)
        lab2 = np.full(n2, 3, np.uint8)   # 1 車道, 2 歩道・島, 3 今のまま
        for r in np.nonzero(area >= 20)[0]:
            if r == 0: continue
            w = wmax[r]; m2 = area[r] * res * res
            if w < 0.7: lab2[r] = 1                                      # 側溝・線の間のすき間（車道に含める）
            elif not adjE[r] and w < 3.0: lab2[r] = 2 if m2 >= 4 else 1  # 道路の中の細い帯 = 分離帯・島（4m2 未満の記号の中は車道）
            elif adjE[r] and w <= 6.5 and 0.15 <= efr[r] <= 0.7: lab2[r] = 2   # 道路の縁と縁石に挟まれた帯 = 歩道（OSM の中心線は数 m ずれることがあるので見ない）
            elif adjE[r] and w <= 6.5 and efr[r] > 0.7: lab2[r] = 1       # 周りのほとんどが道路の縁 = 歩道の無い細い道
            elif touch[r] or not adjE[r]: lab2[r] = 1                    # 中心線が通る、または道路の中の広い区画 = 車道
            else: lab2[r] = 1 if curcar[r] >= 0.5 else 2                 # 縁に接する広い区画（駅前の広場など）は今のデータの多数決
        out = np.where(Um > 0, lab2[reg], 0); out = np.where(out == 3, cur, out)
        # 歩道は、縁から最初の縁石までの帯（区画のつながりに頼らない）。分離帯・島は区画の判定のまま
        # 歩道: 幅 2.6m までの帯はそのまま、それより広い帯（道幅の 65% まで）は写真（VIRTUAL SHIZUOKA）で車道と色が違う時だけ
        # （広場の脇の車道を歩道と誤らない。広い歩道はたいてい舗装の色・模様が車道と違う）
        carRef = (cv2.dilate(cl, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(5.0 / res) | 1,) * 2)) > 0) & (Um > 0)   # 車道の見本（中心線の周り 2.5m）
        _ph = []
        def getph():   # 写真は要る時だけ 1 度取る
            if not _ph: _ph.append(photo_lab(toG, W, H))
            return _ph[0]
        sw = sidewalk_rays(Um, thin, res, dmax=2.6, wloc=wloc, frac=0.65)
        sw |= sidewalk_rays(Um, thin, res, dmax=8.0, wloc=wloc, frac=0.25)   # 広い道（幅の 25% まで）の広い歩道もそのまま（幹線の 4〜5m の歩道）
        # 縁石の線と道路の縁で閉じた帯（区画）も歩道に: 縁に接し、幅が道幅の 25% 以下（かつ 6.5m 以下）、中心線が通らない所。
        # 車の出入り口の切り下げで縁に沿った光線の中央値が取れない所を補う
        regw = (Um > 0) & (lab2[reg] == 2) & adjE[reg] & ~touch[reg] & (wloc >= 8.0) & (wmax[reg] <= 0.25 * wloc)
        sw = (sw | regw).astype(np.uint8)
        # 縁に接する閉じた区画で、もっと広い物（交差点の角の広場など、幅が道幅の 45%・16m まで）は写真で車道と色が違う時だけ
        regw2 = (Um > 0) & adjE[reg] & ~touch[reg] & (reg > 0) & (wloc >= 12.0) & (wmax[reg] <= np.minimum(16.0, 0.45 * wloc)) & (area[reg] * res * res >= 30) & (sw == 0)
        if regw2.sum() * res * res >= 30:
            photo = getph()
            if photo is not None: sw = (sw | photo_ok(regw2, carRef & ~regw2, photo, res, prior=(cur == 2), band=30.0)).astype(np.uint8)
        swA = sidewalk_rays(Um, thin, res, dmax=16.0, wloc=wloc, frac=0.65)   # 交差点の角の広場・幅 15m の歩道（アクトシティの周りなど）も（写真で確かめる）
        extra = (swA > 0) & (sw == 0)
        if extra.sum() * res * res >= 6:
            photo = getph()
            if photo is not None:
                sw = (sw | photo_ok(extra, carRef & (swA == 0), photo, res, prior=(cur == 2), band=30.0)).astype(np.uint8)
        isl = (out == 2) & ~(cv2.dilate(sw, np.ones((5, 5), np.uint8)) > 0) & (np.where(Um > 0, adjE[reg], True) == False)
        # 今のデータで道路の中の細い帯（分離帯・島）になっている所は、両側に図の線があれば島として残す（輪郭の線が途切れて区画が閉じない分離帯）
        inner = ((cur == 2) & (cv2.dilate(1 - Um, np.ones((9, 9), np.uint8)) == 0)).astype(np.uint8)
        nI, labI = cv2.connectedComponents(inner, connectivity=8)
        if nI > 1:
            bd = inner & (cv2.erode(inner, np.ones((3, 3), np.uint8)) == 0)
            nearL = cv2.dilate(thin, np.ones((13, 13), np.uint8)) > 0
            tot = np.bincount(labI[bd > 0], minlength=nI); hitb = np.bincount(labI[(bd > 0) & nearL], minlength=nI)
            okI = (hitb >= 0.5 * np.maximum(tot, 1)) & (tot > 20); okI[0] = False
            isl |= okI[labI]
        isl |= narrow_strips(Um, thin, res) > 0   # 輪郭が途切れて区画の閉じない分離帯
        # 分離帯の上の寸法の数字などでできた 2.6m までの切れ目をつなぐ（歩道から 1.5m 以内には広げない）
        ic = cv2.morphologyEx(isl.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
        isl |= (ic > 0) & (cv2.dilate(sw, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))) == 0) & (Um > 0)
        isl &= (wloc >= 10.0) & (hz == 0)   # 分離帯・島は幅 10m 以上の道だけ。縞（横断歩道・導流帯）の所には作らない
        if isl.any():   # 島も写真で確かめる（中央線の塗装の帯・二重の中央線を分離帯と誤らない）。今のデータの島と重なる物は残す
            photo = getph()
            if photo is not None: isl = photo_ok(isl, carRef & ~isl, photo, res, prior=(cur == 2), band=30.0)
        out = np.where(Um > 0, 1, 0).astype(np.uint8); out[sw > 0] = 2; out[isl] = 2
        # 線路の周り（高架の下など）は図を使わず今の分け方のまま（線路の平行な線が縁石・分離帯に見えるため）
        if rails is not None and rails.intersects(view):
            mr = np.zeros((H, W), np.uint8); _fill(mr, rails.intersection(view), toP, 1)
            # 線路の周りの歩道は、図の判定と今のデータの両方が歩道とする所だけ（高架の下をくぐる道を歩道にしない・線路の線を縁石と誤らない）
            out = np.where(mr > 0, np.where(Um > 0, np.where((cur == 2) & (out == 2), 2, 1), 0), out).astype(np.uint8)
        # 歩道・島の縁の小さな凹凸（木・電柱・ますの記号でできる 0.6m 未満の出っ張りとへこみ）を消す
        wk = (out == 2).astype(np.uint8)
        wk = cv2.morphologyEx(cv2.morphologyEx(wk, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) & Um
        nW, labW, stW, _ = cv2.connectedComponentsWithStats(wk, connectivity=8)
        if nW > 1:   # 6m2 未満、または長さ 5m 未満の塊（記号・縞の名残り）は車道へ
            okW = (stW[:, 4] * res * res >= 6.0) & (np.hypot(stW[:, 2], stW[:, 3]) * res >= 5.0); okW[0] = False
            wk = okW[labW].astype(np.uint8)
        out = np.where(Um > 0, np.where(wk > 0, 2, 1), 0).astype(np.uint8)
        dbg = os.environ.get('SNAP_DBG')
        if dbg and abs(float(dbg.split(',')[0]) - cx) < 1 and abs(float(dbg.split(',')[1]) - cz) < 1:
            np.savez('/tmp/world/snap_dbg.npz', a=a, thin=thin, out=out, Um=Um, cur=cur, sw=sw, wloc=wloc, reg=reg, lab2=lab2, wmax=wmax, adjE=adjE, touch=touch, efr=efr)

        # 中心の四方だけを形にする
        cell = box(cx - STEP / 2, cz - STEP / 2, cx + STEP / 2, cz + STEP / 2); cells.append(cell)
        # 画素の段々を 0.15m 以内でまとめた折れ線にする（同じ輪郭を車道と歩道で共有するため、範囲と歩道だけを形にし、車道は差で作る）
        for val, dst in (('road', cars), (2, walks)):
            m = (out > 0).astype(np.uint8) if val == 'road' else (out == val).astype(np.uint8)
            cs, hi = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
            cs = [cv2.approxPolyDP(c, 0.15 / res, True) for c in cs]
            if hi is None: continue
            polys = []
            for i, c in enumerate(cs):
                if hi[0][i][3] != -1 or len(c) < 3: continue
                ext = [toG(p[0][0], p[0][1]) for p in c]
                holes = []; j = hi[0][i][2]
                while j != -1:
                    if len(cs[j]) >= 3: holes.append([toG(p[0][0], p[0][1]) for p in cs[j]])
                    j = hi[0][j][0]
                pg = Polygon(ext, holes).buffer(0)
                if not pg.is_empty: polys.append(pg)
            if polys: dst.append(unary_union(polys).intersection(cell))
    if not cells: return None
    cov = unary_union(cells)
    from shapely import make_valid
    # 区画の継ぎ目をふさぐ（角は丸めない。丸めると頂点が何十倍にも増える）→ 0.2m 以内で折れ線を簡単にする
    tidy = lambda g: make_valid(make_valid(g).buffer(0.05, join_style=2).buffer(-0.05, join_style=2).simplify(0.2)).buffer(0)
    Rd = tidy(unary_union(cars)) if cars else Polygon()   # 道路の範囲（図の縁に合わせた物）
    Wk = tidy(unary_union(walks)).intersection(Rd) if walks else Polygon()
    C = Rd.difference(Wk)
    car2 = unary_union([car.difference(cov), C]); walk2 = unary_union([walk.difference(cov), Wk]).difference(car2)
    log('現況平面図で境目を合わせた範囲 %.2f km2（図 %d 枚）: 車道 %.0f → %.0f m2・歩道 %.0f → %.0f m2' % (cov.area / 1e6, len(cells), car.area, car2.area, walk.area, walk2.area))
    return car2, walk2, cov
