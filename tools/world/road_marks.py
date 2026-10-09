#!/usr/bin/env python3
"""路面表示（区画線・停止線・横断歩道・導流帯・矢印・文字など）を、VIRTUAL SHIZUOKA のオルソ画像（1 画素 20cm）から読み取る。
  python3 tools/world/road_marks.py assets/data/world/center [x0 z0 x1 z1]
入力: /tmp/world/vs_ortho（tools/world/vs_ortho.py）、車道の範囲（road_area.json）、道路網（/tmp/world/net.json。tools/world/dump_net.mjs）
出力: road_marks.bin … 先頭 4 バイトにヘッダーの長さ、ヘッダー（JSON: { tile: 100, tiles: [[tx, tz, 始まり, 長さ], ...] }）、本体（Int16）。
      本体は 100m 四方のまとまりごとに、まとまりの左上からの cm で:
        線: 0, 色, 幅（cm）, 点の数, x, z, x, z, ...（塗った線の中心線）
        形: 1, 色, 輪の数, 点の数, x, z, ...（外側の輪）, 点の数, x, z, ...（穴）...（矢印・文字・ひし形・横断歩道の縞・停止線・導流帯など）
      色: 0 = 白、1 = 黄、2 = 赤の色付き舗装、3 = 緑の色付き舗装（面。白・黄の表示より下に描く）。
方法:
  1. 100m 四方ごとに、写真を 10cm の格子で読み、車道の中だけを見る。
  2. 明るさから「1.5m より細い明るい所」を取り出す（トップハット変換。影の中でも周りより明るければ取れる）。黄色は色の差で取る。
  3. つながった塊ごとに、主軸の長さ・幅・充填率で分ける: 細長い塊 → 線（中心線を折れ線に）、長方形に近い塊 → 長方形、それ以外 → 形（輪郭を簡略化）。
     車（幅 1m 以上で中が詰まった明るい塊）や、マンホール・補修の跡などの小さい塊は除く。
  4. 車や影で途切れた線は、同じ向きで 4m 以内の切れ目をつなぐ（実線）。
写真は含めない（形だけ）。出典: 静岡県 VIRTUAL SHIZUOKA（CC BY 4.0）を加工して作成。"""
import sys, os, json, math
import numpy as np
import cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vsimg import VS

RES = 0.1            # 格子の間隔（m）
TILE = 100.0         # まとまりの大きさ（m）
PAD = 6.0            # 隣のまとまりと重ねる幅（塊が切れないように）


def car_mask_fn(out):
    A = json.load(open(os.path.join(out, 'road_area.json')))
    q = A['q']; V = np.array(A['car']['v'], np.float64).reshape(-1, 2) * q; I = np.array(A['car']['i']).reshape(-1, 3)
    T = V[I]   # (n, 3, 2)
    lo, hi = T.min(1), T.max(1)
    def mask(x0, z0, n):
        """左上 (x0, z0)、n × n 画素の車道の範囲"""
        m = np.zeros((n, n), np.uint8)
        sel = (hi[:, 0] >= x0) & (lo[:, 0] <= x0 + n * RES) & (hi[:, 1] >= z0) & (lo[:, 1] <= z0 + n * RES)
        if sel.any():
            P = ((T[sel] - [x0, z0]) / RES * 8).round().astype(np.int32)   # 1/8 画素の精度で塗る
            cv2.fillPoly(m, list(P), 1, lineType=cv2.LINE_8, shift=3)
        return m
    return mask


def extract(vs, mask_fn, x0, z0, size):
    n = int(round(size / RES))
    xs = x0 + (np.arange(n) + 0.5) * RES; zs = z0 + (np.arange(n) + 0.5) * RES
    X, Z = np.meshgrid(xs, zs)
    rgb = vs.sample(X.ravel(), Z.ravel()).reshape(n, n, 3)
    valid = ~np.isnan(rgb[..., 0])
    rgb = np.nan_to_num(rgb)
    road = mask_fn(x0, z0, n).astype(bool) & valid
    road = cv2.dilate(road.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)   # 車道の縁の外側線を取りこぼさない（縁石の側溝は入れない）
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    gray = (0.3 * r + 0.55 * g + 0.15 * b).astype(np.float32)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    bg = cv2.morphologyEx(gray, cv2.MORPH_OPEN, k)
    th = gray - bg
    sat = rgb.max(-1) - rgb.min(-1)
    # しきい値は、周り 0.9m のいちばん明るい所との中間（横断歩道の縞の間は写真のにじみで明るくなるが、縞よりは暗い）
    lmax = cv2.dilate(gray, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    white = (th > np.maximum(np.maximum(20, bg * 0.16), 0.5 * (lmax - bg))) & (sat < 60)
    S3 = r + g + b + 1; white &= ~(((r - g) / S3 > 0.045) & ((r - b) / S3 > 0.06))   # 色あせた赤の舗装を白と取り違えない（赤の上の白い文字は残る）
    yel = (r - b > 45) & (r > 105) & (r - g < 95) & (th > 6) & ((g - b) / (r + g + b + 1) > 0.07)   # 赤の色付き舗装（緑と青がほぼ同じ）は除く   # 黄・橙（はみ出し禁止の線・バスの文字など。写真では橙に写る）
    # 木の葉（緑・黄葉）とその周り 0.6m は見ない（木漏れ日の明るい点が線に見える）
    # 写真は全体に緑がかっている（アスファルトで 2G−R−B ≈ 18）ので、明るさで割った値で見る
    leaf = (((2 * g - r - b) / (r + g + b + 1) > 0.15) & (sat > 30)) | ((r - b > 60) & (g - b > 45) & (sat > 70) & (th < 25))
    leaf = cv2.dilate(leaf.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))).astype(bool)
    m = (white | yel) & road & ~leaf
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    return m, yel & road, rgb, road, th


# 道路標示の型（u: 矢印の進む向き、0 が後ろの端・5 が先、w: 横。単位 m）。道路標示の様式に合わせた形（roadnet.js の矢印と同じ）
def _templates():
    SH, HD = 0.15, 0.45
    straight = [[(0, -SH), (3.4, -SH), (3.4, SH), (0, SH)], [(3.4, -HD), (5, 0), (3.4, HD)]]
    def turn(k):
        S0, R, N = 2.4, 1.0, 6
        P = [[(0, -SH), (S0, -SH), (S0, SH), (0, SH)]]; pi = po = None
        for i in range(N + 1):
            t = i / N * math.pi / 2; cu, cw = S0 + math.sin(t) * R, R - math.cos(t) * R
            a, b = (cu - math.sin(t) * SH, cw + math.cos(t) * SH), (cu + math.sin(t) * SH, cw - math.cos(t) * SH)
            if pi: P.append([po, b, a, pi])
            pi, po = a, b
        P.append([(S0 + R - HD, R), (S0 + R, R + 1.1), (S0 + R + HD, R)])
        return [[(u, w * k) for u, w in q] for q in P]
    L, Rr = turn(1), turn(-1)
    dia = []
    D = [(0, 0), (2.5, 0.75), (5, 0), (2.5, -0.75)]
    for i in range(4):
        a, b = D[i], D[(i + 1) % 4]; dx, dw = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dw); nx, nw = -dw / l * 0.2, dx / l * 0.2
        dia.append([a, b, (b[0] + nx, b[1] + nw), (a[0] + nx, a[1] + nw)])
    return {'straight': straight, 'left': L, 'right': Rr, 'straight_left': straight + L, 'straight_right': straight + Rr, 'diamond': dia}
TPL = _templates()
WIDTHS = [0.15, 0.2, 0.3, 0.45]   # 区画線・停止線・横断歩道の縞の幅（m）
snapW = lambda w: min(WIDTHS, key=lambda v: abs(v - (w - 0.06))) if w < 0.6 else w   # 写真の 20cm の画素でにじんで太く見える分（約 6cm）を引いて、規格の幅にそろえる


def match_template(sub, holes):
    """塊（画素の 0/1）を矢印・ひし形の型と比べる。返り値: (名前, 型の多角形を画素の座標に置いたもの) か None"""
    pts = np.column_stack(np.nonzero(sub))[:, ::-1].astype(np.float64)
    if len(pts) < 30: return None
    mu = pts.mean(0); ev, evec = np.linalg.eigh(np.cov((pts - mu).T)); d, nrm = evec[:, 1], evec[:, 0]
    u, w = (pts - mu) @ d * RES, (pts - mu) @ nrm * RES
    Lc = u.max() - u.min()
    if not (3.0 <= Lc <= 7.5) or (w.max() - w.min()) > 2.4: return None
    G = 0.1; nu, nw = int(Lc / G) + 3, int(3.0 / G)
    C = np.zeros((nw, nu), np.uint8)
    C[np.clip(((w + 1.5) / G).astype(int), 0, nw - 1), np.clip(((u - u.min()) / G + 1).astype(int), 0, nu - 1)] = 1
    C = cv2.dilate(C, np.ones((2, 2), np.uint8))
    best = None
    for name, polys in TPL.items():
        if (name == 'diamond') != bool(holes): continue
        sc = Lc / 5.0
        for fu in (1, -1):
            for fw in (1, -1):
                for wo in np.arange(-0.6, 0.61, 0.15):
                    Tm = np.zeros_like(C); Q = []
                    for q in polys:
                        qq = [((uu * sc if fu > 0 else (5 - uu) * sc) / G + 1, (ww * fw + wo + 1.5) / G) for uu, ww in q]
                        Q.append(qq); cv2.fillPoly(Tm, [np.round(np.array(qq) * 8).astype(np.int32)], 1, shift=3)
                    inter = (Tm & C).sum(); uni = (Tm | C).sum()
                    iou = inter / max(1, uni)
                    if not best or iou > best[0]: best = (iou, name, fu, fw, wo, sc)
    if not best or best[0] < 0.5: return None
    iou, name, fu, fw, wo, sc = best
    out = []
    for q in TPL[name]:   # 型を画素の座標へ戻す
        P = []
        for uu, ww in q:
            ul = (uu * sc if fu > 0 else (5 - uu) * sc) + u.min(); wl = ww * fw + wo
            P.append(mu + d * (ul / RES) + nrm * (wl / RES))
        out.append(P)
    return name, out


def classify(m, yel, x0, z0, th=None, protect=None):
    """塊を線・長方形・形に分ける。返り値: lines [(色, 幅m, [(x,z)...])], polys [(色, [(x,z)...])], 除いた塊の数"""
    nlab, lab, st, cen = cv2.connectedComponentsWithStats(m, connectivity=8)
    lines, polys, rej = [], [], 0
    for i in range(1, nlab):
        area = st[i, cv2.CC_STAT_AREA]
        if area < 12: continue   # 0.12m² 未満（砂利・汚れ）
        x, y, w, h = st[i, :4]
        sub = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
        cnts, hier = cv2.findContours(sub, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        perim = sum(cv2.arcLength(cc, True) for cc in cnts) * RES   # 輪郭の長さ（穴も含む、m）
        oi = max((k for k in range(len(cnts)) if hier[0][k][3] < 0), key=lambda k: cv2.contourArea(cnts[k]))
        c = cnts[oi]
        holes = [cnts[k] for k in range(len(cnts)) if hier[0][k][3] == oi and cv2.contourArea(cnts[k]) >= 4]   # 穴（導流帯の斜線の間・ひし形の中など）
        (cx, cy), (rw, rh), ang = cv2.minAreaRect(c)
        L, W = max(rw, rh) * RES, max(min(rw, rh), 1) * RES
        fill = area / max(1.0, rw * rh)
        color = 1 if yel[y:y + h, x:x + w][sub > 0].mean() > 0.5 else 0
        if protect is not None and protect[y:y + h, x:x + w][sub > 0].mean() > 0.5:
            # 色付き舗装の上の白い塊は文字（通学路・スクールゾーンなど）。小さな画でも残す
            cnts2, _ = cv2.findContours(sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            for cc in cnts2:
                ap = cv2.approxPolyDP(cc, 0.6, True)[:, 0, :]
                if len(ap) >= 3 and cv2.contourArea(cc) >= 3: polys.append((color, [[(x0 + (x + px + 0.5) * RES, z0 + (y + py + 0.5) * RES) for px, py in ap]]))
            continue
        toW = lambda P: [(x0 + (x + px + 0.5) * RES, z0 + (y + py + 0.5) * RES) for px, py in P]
        # 車らしい塊（幅 1.2m 以上、長さ 6.5m 以下、中が詰まっている）は除く
        if W >= 1.2 and L <= 6.5 and fill > (0.5 if holes else 0.45): rej += 1; continue   # 窓の穴がある車も
        if W >= 2.2 and fill > 0.5: rej += 1; continue   # 大きな明るい面（白い屋根の影・補修の跡など）
        if W >= 1.4 and 3.2 <= L <= 5.6 and fill > 0.35: rej += 1; continue   # 車の大きさの塊（窓の穴があっても。ひし形は幅 1.5m で中が空いているので充填率が低い）
        if W >= 0.75 and L <= 2.6 and fill > 0.6 and not holes: rej += 1; continue   # 車の屋根・ボンネット
        if color == 1 and not ((W <= 0.35 and L >= 1.2) or (fill > 0.55 and L >= 0.8)): rej += 1; continue   # 黄色は線か文字だけ（黄葉を除く）
        if area * RES * RES < 0.5 and fill < 0.6: rej += 1; continue   # 小さくて形の崩れた塊（木漏れ日・汚れ・縁石の粒）
        con = float(th[y:y + h, x:x + w][sub > 0].mean()) if th is not None else 99   # 塊の明るさの差（塗料は 60 以上、縁石の石・模様の舗装は低い）
        if W > 0.5 and con < 55 and (perim / (area * RES * RES) > 9 or len(cnts) / (area * RES * RES) > 2.5): rej += 1; continue   # 小さな穴だらけ（縁石の石）も。文字（塗料）は残す   # 面積の割に輪郭が長い（縁石の石・模様の舗装のざらざら）。矢印・導流帯は 6 前後
        # 矢印・ひし形: 型と比べて、合えばきれいな型の形で置く
        mt = match_template(sub, holes) if 3.0 <= L <= 7.5 and 0.75 <= W <= 2.4 else None   # 矢印の頭は幅 0.9m（横断歩道の縞 0.45m を矢印と取り違えない）
        if mt:
            name, Q = mt
            for q in Q: polys.append((color, [[(x0 + (x + px + 0.5) * RES, z0 + (y + py + 0.5) * RES) for px, py in q]]))
            continue
        if W <= 0.42 and L >= 1.0 and not holes:
            # 細長い塊 → 線。主軸に沿って区切り、各区切りの中心を折れ線に
            pts = np.column_stack(np.nonzero(sub))[:, ::-1].astype(np.float64)   # (px, py)
            mu = pts.mean(0); C = np.cov((pts - mu).T); ev, evec = np.linalg.eigh(C); d = evec[:, 1]
            t = (pts - mu) @ d; nb = max(2, int(L / 1.0) + 1)
            edges = np.linspace(t.min(), t.max(), nb + 1); P = []
            for k2 in range(nb):
                s = (t >= edges[k2]) & (t <= edges[k2 + 1])
                if s.sum() >= 2: P.append(pts[s].mean(0))
            if len(P) >= 2:
                # 両端は塊の端まで伸ばす
                P[0] = mu + d * t.min() + (P[0] - mu - d * ((P[0] - mu) @ d)); P[-1] = mu + d * t.max() + (P[-1] - mu - d * ((P[-1] - mu) @ d))
                ww = area / max(1.0, (t.max() - t.min() + 1)) * RES
                if fill < 0.5: rej += 1; continue   # 粒が並んだだけの細長い塊（縁石・側溝の縁）
                lines.append((color, snapW(ww), toW(P)))
                continue
        if fill > 0.7 and W >= 0.2 and not holes:
            # 長方形（停止線・横断歩道の縞・破線の 1 本など）: 幅を規格にそろえる
            ws = snapW(W) / RES
            box = cv2.boxPoints(((cx, cy), (rw, ws) if rw >= rh else (ws, rh), ang))
            polys.append((color, [toW(box)])); continue
        eps = 0.9   # 9cm（0.9 画素）で輪郭を簡略化
        rings = []
        for cc in [c] + holes:
            ap = cv2.approxPolyDP(cc, eps, True)[:, 0, :]
            if len(ap) >= 3: rings.append(toW(ap))
        if rings and len(cv2.approxPolyDP(c, eps, True)) >= 3: polys.append((color, rings))
    return lines, polys, rej


def color_areas(rgb, road, x0, z0):
    """色付き舗装（赤: 通学路・路側帯・交差点のカラー舗装、緑: 自転車帯・路側帯）の面。返り値: [(色 2 = 赤 / 3 = 緑, [外側の輪, 穴...])]
    影の中でも分かるように、明るさで割った色の差で見る"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]; S = r + g + b + 1
    out = []; allm = np.zeros(road.shape, np.uint8)
    for code, cm in ((2, ((r - g) / S > 0.055) & ((r - b) / S > 0.07) & (S > 120)), (3, ((g - r) / S > 0.06) & ((g - b) / S > 0.03) & (S > 120) & (r < 150))):
        m = (cm & road).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))   # 白い文字の穴は塞ぐ（文字は上に白で描く）
        allm |= m
        nlab, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
        for i in range(1, nlab):
            if st[i, cv2.CC_STAT_AREA] * RES * RES < 1.2: continue   # 1.2m² 未満（車の色・看板の影など）
            x, y, w, h = st[i, :4]; sub = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
            (cx, cy), (rw, rh), ang = cv2.minAreaRect(np.column_stack(np.nonzero(sub))[:, ::-1].astype(np.float32))
            if min(rw, rh) * RES < 0.6: continue   # 細い色の線（赤い車の縁など）は面にしない
            if st[i, cv2.CC_STAT_AREA] / max(1.0, rw * rh) < 0.35: continue   # まだらの塊（屋根の影・落ち葉）
            cnts, hier = cv2.findContours(sub, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
            rings = []
            for k, cc in enumerate(cnts):
                if hier[0][k][3] >= 0 and hier[0][hier[0][k][3]][3] >= 0: continue
                if cv2.contourArea(cc) < 6: continue
                ap = cv2.approxPolyDP(cc, 1.2, True)[:, 0, :]
                if len(ap) >= 3: rings.append((hier[0][k][3] < 0, [(x0 + (x + px + 0.5) * RES, z0 + (y + py + 0.5) * RES) for px, py in ap]))
            outer = [rg for o, rg in rings if o]
            if outer: out.append((code, [outer[0]] + [rg for o, rg in rings if not o]))
    return out, allm


def main():
    out = sys.argv[1]
    vs = VS(); mask_fn = car_mask_fn(out)
    T = json.load(open(os.path.join(out, 'roads.json')))['terrain']
    X0, Z0, X1, Z1 = T['x0'], T['z0'], T['x0'] + (T['nx'] - 1) * T['cell'], T['z0'] + (T['nz'] - 1) * T['cell']
    if len(sys.argv) >= 6: X0, Z0, X1, Z1 = map(float, sys.argv[2:6])
    L, Pp, nrej = [], [], 0
    tz = Z0
    while tz < Z1:
        tx = X0
        while tx < X1:
            m, yel, rgb, road, th = extract(vs, mask_fn, tx - PAD, tz - PAD, TILE + 2 * PAD)
            ca, cmask = color_areas(rgb, road, tx - PAD, tz - PAD)
            lines, polys, rej = classify(m, yel, tx - PAD, tz - PAD, th, cmask)
            polys = ca + polys   # 色付き舗装は先に（白い文字の下に描く）
            inside = lambda P: tx <= np.mean([p[0] for p in P]) < tx + TILE and tz <= np.mean([p[1] for p in P]) < tz + TILE   # 重なりの分は中心のあるまとまりだけ
            L += [l for l in lines if inside(l[2])]; Pp += [p for p in polys if inside(p[1][0])]; nrej += rej
            tx += TILE
        tz += TILE
        print('z', round(tz), '線', len(L), '形', len(Pp), flush=True)
    # まとまり（100m）ごとに Int16 の列へ
    byT = {}
    key = lambda P: (int(math.floor(np.mean([p[0] for p in P]) / TILE)), int(math.floor(np.mean([p[1] for p in P]) / TILE)))
    for c, w, P in L: byT.setdefault(key(P), []).append(('l', c, w, P))
    for c, R in Pp: byT.setdefault(key(R[0]), []).append(('p', c, R))
    body, tiles, nv = [], [], 0
    for (ti, tj), items in sorted(byT.items()):
        ox, oz = ti * TILE, tj * TILE; st = len(body)
        cm = lambda P: [int(round((v - o) * 100)) for p in P for v, o in ((p[0], ox), (p[1], oz))]
        for it in items:
            if it[0] == 'l': body += [0, it[1], int(round(it[2] * 100)), len(it[3])] + cm(it[3]); nv += len(it[3])
            else:
                body += [1, it[1], len(it[2])]
                for ring in it[2]: body += [len(ring)] + cm(ring); nv += len(ring)
        tiles.append([ti, tj, st, len(body) - st])
    hdr = json.dumps({'tile': TILE, 'tiles': tiles, 'credit': '静岡県 VIRTUAL SHIZUOKA のオルソ画像（CC BY 4.0）から読み取り'}, separators=(',', ':')).encode()
    hdr += b' ' * (len(hdr) % 2)   # 本体（Int16）が 2 バイト境界から始まるように、ヘッダーの長さを偶数に
    arr = np.array(body, np.int16)
    with open(os.path.join(out, 'road_marks.bin'), 'wb') as f:
        f.write(np.uint32(len(hdr)).tobytes()); f.write(hdr); f.write(arr.tobytes())
    print('線', len(L), '形', len(Pp), '頂点', nv, '除いた塊', nrej, os.path.getsize(os.path.join(out, 'road_marks.bin')) // 1024, 'KB')


if __name__ == '__main__':
    main()
