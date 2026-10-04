/*
 * roadnet.js — 道路網から、車線単位の道路面・交差点の多角形・路面表示・信号の位置を作る（新道路生成）。
 * 方式は A/B Street（osm2streets）の切り戻しと角の丸めに、SUMO / OpenDRIVE の考え方を合わせたもの。
 * THREE に依存しない（Node でも動く）。座標は x（東, m）、z（南, m）、y（標高, m）。
 * 寸法の根拠は docs/spec/README.md と race-spec.js（区画線・横断歩道・停止線）。
 */

/* 道路の種類ごとの既定値（OSM に lanes / width がないとき）。lanes は両方向の合計、lw は車線幅（道路構造令） */
export const CLASS = {
  motorway:      { rank: 0, lanes: 2, lw: 3.5,  edge: 1.25, walk: 0,   one: true },
  motorway_link: { rank: 5, lanes: 1, lw: 3.5,  edge: 1.0,  walk: 0,   one: true },
  trunk:         { rank: 1, lanes: 2, lw: 3.25, edge: 0.75, walk: 3.0 },
  trunk_link:    { rank: 5, lanes: 1, lw: 3.25, edge: 0.5,  walk: 0,   one: true },
  primary:       { rank: 2, lanes: 2, lw: 3.25, edge: 0.5,  walk: 3.0 },
  primary_link:  { rank: 5, lanes: 1, lw: 3.25, edge: 0.5,  walk: 0,   one: true },
  secondary:     { rank: 3, lanes: 2, lw: 3.0,  edge: 0.5,  walk: 2.5 },
  secondary_link:{ rank: 5, lanes: 1, lw: 3.0,  edge: 0.5,  walk: 0,   one: true },
  tertiary:      { rank: 4, lanes: 2, lw: 3.0,  edge: 0.5,  walk: 2.0 },
  tertiary_link: { rank: 5, lanes: 1, lw: 3.0,  edge: 0.5,  walk: 0,   one: true },
  unclassified:  { rank: 6, lanes: 2, lw: 2.75, edge: 0.4,  walk: 0 },
  residential:   { rank: 7, lanes: 1, lw: 4.0,  edge: 0.3,  walk: 0 },
  living_street: { rank: 8, lanes: 1, lw: 3.5,  edge: 0.3,  walk: 0 },
  service:       { rank: 9, lanes: 1, lw: 3.0,  edge: 0.2,  walk: 0 },
  busway:        { rank: 9, lanes: 1, lw: 3.5,  edge: 0.3,  walk: 0 }   // バス専用の道（一般車は走らない: 交通は rank 7 まで）
};
const MARK = { lane: 0.15, center: 0.15, centerWide: 0.20, edge: 0.15, stop: 0.45, cwStripe: 0.45, cwGap: 0.45, cwLen: 4.0, dash: [6, 9], centerDash: [5, 5], solidNear: 30, stopGap: 2.0 };

function num(v, d) { const n = parseFloat(v); return isFinite(n) ? n : d; }
function len2(ax, az) { return Math.hypot(ax, az); }

/** 道路 1 本（way）の断面: 車線数（上り・下り）、車線幅、車道の半幅、歩道 */
export function profile(t) {
  const C = CLASS[t.highway] || CLASS.residential;
  let one = t.oneway === 'yes' || t.oneway === '1' || t.oneway === '-1' || (t.oneway !== 'no' && (C.one || t.junction === 'roundabout'));
  let lanes = Math.max(1, Math.round(num(t.lanes, C.lanes)));
  let fw = num(t['lanes:forward'], NaN), bw = num(t['lanes:backward'], NaN);
  if (one) { fw = lanes; bw = 0; }
  else if (!isFinite(fw) || !isFinite(bw)) { fw = Math.ceil(lanes / 2); bw = Math.max(1, lanes - fw); if (lanes === 1) { fw = 1; bw = 1; } }
  let lw = C.lw;
  const w = num(t.width, NaN);
  const nl = fw + bw;
  if (isFinite(w) && w > 2) lw = Math.max(2.5, Math.min(3.75, (w - 2 * C.edge) / Math.max(1, nl)));
  if (nl === 2 && lanes === 1) lw = C.lw / 2 + 0.25;   // 中央線のない 1 車線の道（両方向で 1 本）
  const carriage = nl * lw + 2 * C.edge;
  const walk = t.sidewalk === 'no' || t.sidewalk === 'none' ? 0 : C.walk;
  return { cls: t.highway, rank: C.rank, one: !!one, rev: t.oneway === '-1', fw, bw, lw, edge: C.edge, hw: carriage / 2, walk,
           centerLine: !one && nl >= 2 && lanes >= 2, bridge: t.bridge && t.bridge !== 'no', tunnel: t.tunnel && t.tunnel !== 'no', layer: num(t.layer, 0),
           turnF: t['turn:lanes:forward'] || (one ? t['turn:lanes'] : null) || null, turnB: t['turn:lanes:backward'] || null, name: t.name || t.ref || '',
           lanesTagged: t.lanes !== undefined || t['lanes:forward'] !== undefined, ref: t.ref || '', roadName: t.name || '' };
}

/**
 * 実測の道幅（PLATEAU の道路の範囲を中心線から直角に測った幅 m・中心のずれ m）に断面を合わせる。
 * 道路の範囲は車道と歩道を含むので、歩道のある道（幹線と 2 車線の道で幅 9m 以上）は幅の 2 割（1.5〜4.5m）を両側の歩道にし、
 * 残りを車道にする。車線数は OSM の値を使い、無ければ車道の幅から決める。上下線が分かれた道（片側の一方通行で中心が大きくずれる）は使わない。
 */
export function fitWidth(pr, m) {
  if (!m) return pr;
  const [W, off, , carW, carOff] = m;
  const q = Object.assign({}, pr);
  let car, walk;
  if (carW && carW > 2.4 && carW < 45) {
    // 実測の車道の幅（PLATEAU の道路の範囲から歩道を除き、航空写真で見直したもの）があればそれを使う
    car = carW; walk = (pr.rank <= 4 && W > carW + 2) ? Math.max(0, Math.min(4.5, (W - carW) / 2)) : 0;
    q.shift = Math.max(-4, Math.min(4, carOff));
  } else {
    if (W < 3 || W > 60 || (pr.one && Math.abs(off) > 2.5) || W < pr.hw * 2 * 0.55) return pr;
    walk = (pr.rank <= 4 && W >= 9) ? Math.max(1.5, Math.min(4.5, W * 0.2)) : 0;
    car = W - walk * 2;
    const nl0 = pr.fw + pr.bw;
    if (car < nl0 * 2.6 + 2 * pr.edge && walk > 0) { walk = Math.max(0, (W - nl0 * 2.6 - 2 * pr.edge) / 2); car = W - walk * 2; }
    q.shift = Math.max(-3, Math.min(3, off));   // 中心線を実測の道路の中央へ寄せる（+ 側へ）
  }
  q.walk = walk;
  // 車線数: OSM に無い道、または OSM の車線数だと 1 車線が広すぎる（4.6m 超）・狭すぎる（2.4m 未満）道は、車道の幅から決める（1 車線あたり約 3.1m）
  const nl = pr.fw + pr.bw, per = (car - 2 * pr.edge) / Math.max(1, nl);
  let nl2 = nl;
  if ((!pr.lanesTagged || per > 4.6 || (per < 2.4 && nl > 1)) && pr.rank <= 7) {
    const k = (car - 2 * pr.edge) / 3.1;
    if (pr.one) nl2 = Math.max(1, Math.min(5, Math.round(k)));
    else if (pr.rank <= 6 || car >= 7.0) nl2 = Math.max(2, Math.min(8, Math.round(k / 2) * 2));
    if (nl2 !== nl) {
      if (pr.one) { q.fw = nl2; q.bw = 0; } else { q.fw = nl2 / 2; q.bw = nl2 / 2; q.centerLine = true; }
      q.lanesFixed = true;
    }
  }
  // 導流帯（中央のゼブラ帯）: 対面通行で、車道が車線数 × 3.25m より 1.5m 以上広いとき、余りを中央に（最大 4m）
  const two = !pr.one && q.fw > 0 && q.bw > 0 && nl2 >= 2 && pr.rank <= 6, extra = car - 2 * pr.edge - nl2 * 3.25;
  q.zb = two && extra >= 2.2 ? Math.min(4, extra) : 0;   // 2.2m 未満の余りは広めの車線・停車帯とみなす
  q.lw = Math.max(2.5, Math.min(3.75, (car - 2 * pr.edge - q.zb) / Math.max(1, nl2)));
  q.hw = (nl2 * q.lw + 2 * pr.edge + q.zb) / 2;
  q.measured = W; q.carW = carW || 0;
  return q;
}

/**
 * データ（roads.json）から道路網を作る。
 * 返り値: { nodes:[{x,z,y,arms:[], sig, kind}], edges:[{a,b,pts:[[x,z,y]...], pr, trimA, trimB}], junctions:[...], marks:[], signals:[] }
 */
export function build(D, heightAt, widths) {
  const P = D.p, N = P.length / 3;
  const pos = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const roads = D.ways.filter(w => w.k === 'road');
  // 交差点（2 本以上の道が使う点と、道の端）
  const use = new Int32Array(N);
  roads.forEach(w => { w.n.forEach((ni, j) => { use[ni] += (j === 0 || j === w.n.length - 1) ? 2 : 1; }); });
  const nodes = new Map();
  function node(i) { if (!nodes.has(i)) { const p = pos(i); nodes.set(i, { id: i, x: p[0], z: p[1], y: p[2], arms: [], sig: false, cross: false, stop: false }); } return nodes.get(i); }
  const edges = [];
  roads.forEach(w => {
    const pr = fitWidth(profile(w.t), widths && widths[w.id]);
    let start = 0;
    for (let j = 1; j < w.n.length; j++) {
      if (use[w.n[j]] >= 2 || j === w.n.length - 1) {
        const seq = w.n.slice(start, j + 1);
        if (seq.length >= 2) {
          const pts = seq.map(pos);
          if (pr.shift) shiftLine(pts, pr.shift);
          let L = 0; for (let k = 1; k < pts.length; k++) L += len2(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
          if (L > 0.5) {
            const e = { id: edges.length, way: w.id, a: seq[0], b: seq[seq.length - 1], pts, len: L, pr, trimA: 0, trimB: 0 };
            edges.push(e);
            node(e.a).arms.push({ e, end: 0 }); node(e.b).arms.push({ e, end: 1 });
          }
        }
        start = j;
      }
    }
  });
  // 信号・横断歩道・一時停止（OSM の点。交差点から 30m 以内の信号は、その交差点の信号とする）
  const feats = (D.feat || []).map(([i, f]) => ({ i, f, p: pos(i) }));
  const jlist = [...nodes.values()].filter(n => n.arms.length >= 3);
  const grid = new Map(), G = 50;
  jlist.forEach(n => { const k = Math.floor(n.x / G) + ',' + Math.floor(n.z / G); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); });
  function nearJ(x, z, r) {
    let best = null, bd = r;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) (grid.get((gx + a) + ',' + (gz + b)) || []).forEach(n => { const d = len2(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } });
    return best;
  }
  feats.forEach(F => {
    const f = F.f;
    if (f.highway === 'traffic_signals' || f.crossing === 'traffic_signals') { const j = nearJ(F.p[0], F.p[1], 32); if (j) j.sig = true; }
    if (f.highway === 'crossing' || f.crossing) { const j = nearJ(F.p[0], F.p[1], 25); if (j) j.cross = true; }
    if (f.highway === 'stop') { const j = nearJ(F.p[0], F.p[1], 25); if (j) j.stop = true; }
  });
  // 横断歩道の実際の位置（OSM の crossing の点。塗装の無いもの unmarked は除く）。路面表示はこの位置に置く
  // 横断歩道の線（OSM の footway=crossing。道路を横切る線）。位置と、どの道を横切るかはこの線と道の交点で決める
  const crossWays = D.ways.filter(w => w.k === 'cross' && w.n.length >= 2).map(w => w.n.map(i => [P[i * 3], P[i * 3 + 1]]));
  const crossings = feats.filter(F => (F.f.highway === 'crossing' || F.f.crossing) && F.f.crossing !== 'unmarked' && F.f.crossing !== 'no')
    .map(F => ({ x: F.p[0], z: F.p[1], sig: F.f.crossing === 'traffic_signals' || F.f.highway === 'traffic_signals' }))
    .concat((D.crossPhoto || []).map(p => ({ x: p[0], z: p[1], sig: true, photo: true })));   // 航空写真で見つけたもの（信号のある交差点の腕だけ）

  // 近い交差点をまとめる（osm2streets の consolidate intersections に相当）。上下線が分かれた大通りどうしの交差点は、
  // OSM では 2〜4 個の点と短い道でできているので、信号のある交差点で 28m 未満の道でつながる点を 1 つの交差点として扱う
  const parent = new Map(), find = i => { while (parent.get(i) !== i) { parent.set(i, parent.get(parent.get(i))); i = parent.get(i); } return i; };
  nodes.forEach(n => parent.set(n.id, n.id));
  edges.forEach(e => {
    const A = nodes.get(e.a), B = nodes.get(e.b);
    if (A.arms.length >= 3 && B.arms.length >= 3 && e.len < 28 && e.pr.rank <= 6 && (A.sig || B.sig)) { e.internal = true; parent.set(find(e.a), find(e.b)); }
  });
  const clusters = new Map();
  nodes.forEach(n => { const r = find(n.id); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(n); });
  const groups = [];
  clusters.forEach(ms => {
    if (ms.length < 2) return;
    const C = { members: ms, x: 0, z: 0, sig: ms.some(m => m.sig), cross: ms.some(m => m.cross), id: ms[0].id };
    ms.forEach(m => { C.x += m.x / ms.length; C.z += m.z / ms.length; });
    ms.forEach(m => { m.cluster = C; m.sig = C.sig; m.cross = m.cross || C.sig; });
    groups.push(C);
  });

  // 腕（交差点から出ていく向き）の情報
  function armInfo(n, arm) {
    const e = arm.e, pts = arm.end === 0 ? e.pts : e.pts.slice().reverse();
    // 交差点から 6m 先の点で向きを決める
    let acc = 0, k = 1, dx = pts[1][0] - pts[0][0], dz = pts[1][1] - pts[0][1];
    for (; k < pts.length; k++) {
      const sx = pts[k][0] - pts[k - 1][0], sz = pts[k][1] - pts[k - 1][1], sl = len2(sx, sz);
      if (acc + sl >= 6) { const f = (6 - acc) / sl; dx = pts[k - 1][0] + sx * f - pts[0][0]; dz = pts[k - 1][1] + sz * f - pts[0][1]; break; }
      acc += sl; dx = pts[k][0] - pts[0][0]; dz = pts[k][1] - pts[0][1];
    }
    const l = len2(dx, dz) || 1;
    return { arm, d: [dx / l, dz / l], ang: Math.atan2(dz / l, dx / l), hw: e.pr.hw };
  }
  // 交差点の多角形（切り戻しと角の丸め）
  const junctions = [];
  nodes.forEach(n => {
    if (n.arms.length < 2) return;
    const A = n.arms.map(a => armInfo(n, a)).sort((p, q) => p.ang - q.ang);
    if (n.arms.length === 2) {   // 道の継ぎ目: 切り戻さず、端の向きを 2 本の平均にする
      n.joint = true; return;
    }
    const m = A.length;
    // 左（+）: d を +90 度回した向き（角度が増える側）。右（−）: その反対
    const sideP = a => [-a.d[1], a.d[0]];
    const corners = [];
    for (let i = 0; i < m; i++) {
      const a = A[i], b = A[(i + 1) % m];
      const na = sideP(a), nb = [b.d[1], -b.d[0]];
      // a の + 側の縁: n + na*hw_a + t*d_a、b の − 側の縁: n + nb*hw_b + s*d_b
      const ax = na[0] * a.hw, az = na[1] * a.hw, bx = nb[0] * b.hw, bz = nb[1] * b.hw;
      const det = a.d[0] * (-b.d[1]) - a.d[1] * (-b.d[0]);
      let t = null, s = null;
      if (Math.abs(det) > 0.15) {
        const rx = bx - ax, rz = bz - az;
        t = (rx * (-b.d[1]) - rz * (-b.d[0])) / det;
        s = (a.d[0] * rz - a.d[1] * rx) / det;
      }
      corners.push({ t, s, cx: n.x + ax + (t || 0) * a.d[0], cz: n.z + az + (t || 0) * a.d[1], ok: t !== null && t > -2 && s > -2 && t < 60 && s < 60 });
    }
    // 腕ごとの切り戻し距離
    A.forEach((a, i) => {
      const c1 = corners[i], c0 = corners[(i - 1 + m) % m];
      let tr = Math.max(a.hw * 0.6, c1.ok ? c1.t : 0, c0.ok ? c0.s : 0) + 1.0;
      const e = a.arm.e;
      tr = Math.min(tr, e.len * 0.45, 45);
      a.trim = tr;
      if (a.arm.end === 0) e.trimA = Math.max(e.trimA, tr); else e.trimB = Math.max(e.trimB, tr);
    });
    // 多角形: 腕ごとに（− 側の端、+ 側の端）、その間を角の曲線でつなぐ
    const poly = [];
    A.forEach((a, i) => {
      const b = A[(i + 1) % m], c = corners[i];
      const nm = [a.d[1], -a.d[0]], np = sideP(a);
      const pm = [n.x + a.d[0] * a.trim + nm[0] * a.hw, n.z + a.d[1] * a.trim + nm[1] * a.hw];
      const pp = [n.x + a.d[0] * a.trim + np[0] * a.hw, n.z + a.d[1] * a.trim + np[1] * a.hw];
      poly.push(pm, pp);
      const nbm = [b.d[1], -b.d[0]];
      const qb = [n.x + b.d[0] * b.trim + nbm[0] * b.hw, n.z + b.d[1] * b.trim + nbm[1] * b.hw];
      const cc = c.ok ? [c.cx, c.cz] : [(pp[0] + qb[0]) / 2, (pp[1] + qb[1]) / 2];
      for (let k = 1; k < 6; k++) {   // 角の丸め（2 次ベジエ、補間点 5）
        const u = k / 6, v = 1 - u;
        poly.push([v * v * pp[0] + 2 * u * v * cc[0] + u * u * qb[0], v * v * pp[1] + 2 * u * v * cc[1] + u * u * qb[1]]);
      }
    });
    n.poly = poly; n.A = A;
    junctions.push(n);
  });
  // まとめた交差点: 外へ出る腕の切り口を包む多角形（凸包）と、外へ出る腕の一覧（中心からの距離と横のずれ）
  groups.forEach(C => {
    const pts = [], A = [];
    C.members.forEach(n => (n.A || []).forEach(a => {
      if (a.arm.e.internal) return;
      const nm = [a.d[1], -a.d[0]], np = [-a.d[1], a.d[0]], ex = n.x + a.d[0] * a.trim, ez = n.z + a.d[1] * a.trim;
      pts.push([ex + nm[0] * a.hw, ez + nm[1] * a.hw], [ex + np[0] * a.hw, ez + np[1] * a.hw]);
      // 中心から見た切り口までの距離と、腕の中心線の横のずれ（+ 側 = d を +90 度回した向き）
      A.push(Object.assign({}, a, { trim: (ex - C.x) * a.d[0] + (ez - C.z) * a.d[1], lat: (n.x - C.x) * np[0] + (n.z - C.z) * np[1], node: n }));
    }));
    C.poly = hull2(pts); C.A = A;
  });
  // 道路の帯（切り戻したあと）
  edges.forEach(e => {
    const P2 = cut(e.pts, e.trimA, e.len - e.trimB);
    e.line = resample(P2, 3.0);
    e.line.forEach(p => { p[2] = heightAt(p[0], p[1]); });
    // 地下の道（トンネル・地下駐車場の出入口）は地上に描かない
    if (e.pr.tunnel || e.pr.layer < 0) e.hidden = true;
    // 橋: 下の川や水路で路面がたわまないように、両端の高さを直線でつなぐ
    if (e.pr.bridge && e.line.length > 2) {
      const L = e.line, n = L.length, h0 = L[0][2], h1 = L[n - 1][2], tot = lineLen(L); let acc = 0;
      for (let i = 1; i < n; i++) { acc += len2(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); L[i][2] = h0 + (h1 - h0) * acc / tot; }
    }
  });
  // 継ぎ目の向き（2 本の平均）
  nodes.forEach(n => {
    if (!n.joint) return;
    const t = n.arms.map(arm => { const L = arm.e.line, p0 = arm.end === 0 ? L[0] : L[L.length - 1], p1 = arm.end === 0 ? L[1] : L[L.length - 2]; const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = len2(dx, dz) || 1; return [dx / l, dz / l]; });
    const bx = t[0][0] - t[1][0], bz = t[0][1] - t[1][1], bl = len2(bx, bz) || 1;   // 0 番の腕の向き（外向き）の平均
    n.arms.forEach((arm, k) => { const s = k === 0 ? 1 : -1; arm.e[arm.end === 0 ? 'dirA' : 'dirB'] = [s * bx / bl * (arm.end === 0 ? 1 : -1), s * bz / bl * (arm.end === 0 ? 1 : -1)]; });
  });
  return { nodes, edges, junctions, groups, MARK, crossings, crossWays };
}

function hull2(P) {
  if (P.length < 3) return P;
  P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** 折れ線を横（+ 側）へずらす。端の点（交差点）は動かさず、内側の点だけ（道の接続を保つ） */
function shiftLine(pts, d) {
  const n = pts.length; if (n < 3) return;
  const src = pts.map(p => p.slice());
  for (let i = 1; i < n - 1; i++) {
    const a = src[i - 1], b = src[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = len2(dx, dz) || 1;
    const k = Math.min(1, Math.min(i, n - 1 - i) / 2);   // 端に近いほど少なく
    pts[i][0] = src[i][0] - dz / l * d * k; pts[i][1] = src[i][1] + dx / l * d * k;
  }
}

/** 折れ線の [from, to] の区間を切り出す */
function cut(pts, from, to) {
  const out = []; let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], sl = len2(b[0] - a[0], b[1] - a[1]);
    if (sl <= 0) continue;
    const s0 = acc, s1 = acc + sl;
    if (s1 >= from && s0 <= to) {
      const u0 = Math.max(0, (from - s0) / sl), u1 = Math.min(1, (to - s0) / sl);
      if (!out.length) out.push([a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0, 0]);
      out.push([a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1, 0]);
    }
    acc = s1;
  }
  if (out.length < 2) { const m = pts[Math.floor(pts.length / 2)]; return [[m[0], m[1], 0], [m[0] + 0.01, m[1], 0]]; }
  return out;
}
/** 等間隔（step m 以下）に点を足す */
function resample(pts, step) {
  const out = [pts[0].slice()];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], sl = len2(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(sl / step));
    for (let j = 1; j <= n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n, 0]);
  }
  return out;
}

/** 線に沿った左右の点（帯）。dirA/dirB は端の向き（継ぎ目でそろえる） */
export function ribbon(e, off0, off1) {
  const L = e.line, n = L.length, out = [];
  for (let i = 0; i < n; i++) {
    let dx, dz;
    if (i === 0 && e.dirA) { dx = e.dirA[0]; dz = e.dirA[1]; }
    else if (i === n - 1 && e.dirB) { dx = -e.dirB[0]; dz = -e.dirB[1]; }
    else { const p = L[Math.max(0, i - 1)], q = L[Math.min(n - 1, i + 1)]; dx = q[0] - p[0]; dz = q[1] - p[1]; }
    const l = len2(dx, dz) || 1; dx /= l; dz /= l;
    const lx = -dz, lz = dx;   // 進行方向の + 側（左右は座標系に対して一定）
    out.push([L[i][0] + lx * off0, L[i][1] + lz * off0, L[i][0] + lx * off1, L[i][1] + lz * off1, L[i][2], dx, dz]);
  }
  return out;
}

/**
 * 路面表示（区画線・停止線・横断歩道）の四角形の一覧を作る。
 * 返り値の各要素: { q:[[x,z],[x,z],[x,z],[x,z]], y, c:'w'|'y' }
 */
export function markings(net, carAt) {
  // 返り値: [{ q: 4 点（帯）| tris: [[x,z]×3...]（形）, c: 'w'|'y', t: 種類 }] と文字 { txt, at: 中心, dir: 読む向き（車の進む向き）, w, len }
  // 種類 t: edge 外側線 / center 中央線 / lane 車線境界線 / cw 横断歩道 / stop 停止線 / arrow 矢印 / dia ひし形 / side 路側帯の線
  const M = net.MARK, out = [];
  out.texts = []; out.signs = [];
  // 標識: 進む向き travel（線の向きに対して ±1）の左側の路肩に、近づく運転者の方へ向けて立てる
  function addSign(type, e, s, pr, travel, val) {
    const f = frame(e, s); if (!f) return;
    const tx = f.dx * travel, tz = f.dz * travel, lat = -travel * (pr.hw + 0.9) + CS;
    out.signs.push({ type, val, x: f.x + -f.dz * lat, z: f.z + f.dx * lat, nx: -tx, nz: -tz, e, s, travel });
  }
  let CS = 0;   // いま線を引いている道の、中心線から実際の車道の中央までのずれ（m、+ 側）
  // 実際の車道（PLATEAU）の幅を、中心線から直角に測る（carAt があるとき）。返り値: [− 側の端, + 側の端]（中心線からの m）
  function extentAt(e, s) {
    if (!carAt) return null;
    const f = frame(e, s); if (!f || !carAt(f.x, f.z)) return null;
    const lx = -f.dz, lz = f.dx; let lo = 0, hi = 0;
    while (lo > -30 && carAt(f.x + lx * (lo - 0.25), f.z + lz * (lo - 0.25))) lo -= 0.25;
    while (hi < 30 && carAt(f.x + lx * (hi + 0.25), f.z + lz * (hi + 0.25))) hi += 0.25;
    return [lo, hi];
  }
  function quadAlong(e, off, w, s0, s1, c, t) {   // 線に沿った帯（off: 中心線からの横のずれ、w: 幅、s0〜s1: 距離の範囲）
    const L = e.line; let acc = 0;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i], sl = len2(b[0] - a[0], b[1] - a[1]); if (sl <= 0) continue;
      const u0 = Math.max(0, (s0 - acc) / sl), u1 = Math.min(1, (s1 - acc) / sl);
      if (u1 > u0) {
        const dx = (b[0] - a[0]) / sl, dz = (b[1] - a[1]) / sl, lx = -dz, lz = dx;
        const p0 = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0], p1 = [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1];
        const o0 = off + CS - w / 2, o1 = off + CS + w / 2;
        out.push({ q: [[p0[0] + lx * o0, p0[1] + lz * o0], [p1[0] + lx * o0, p1[1] + lz * o0], [p1[0] + lx * o1, p1[1] + lz * o1], [p0[0] + lx * o1, p0[1] + lz * o1]], c, t: t || 'line', e });
      }
      acc += sl;
    }
  }
  function dashed(e, off, w, dash, c, solidNearA, solidNearB, t) {
    const Ltot = lineLen(e.line), on = dash[0], per = dash[0] + dash[1];
    if (solidNearA > 0) quadAlong(e, off, w, 0, Math.min(Ltot, solidNearA), c, t);
    if (solidNearB > 0) quadAlong(e, off, w, Math.max(0, Ltot - solidNearB), Ltot, c, t);
    for (let s = solidNearA; s < Ltot - solidNearB; s += per) quadAlong(e, off, w, s, Math.min(s + on, Ltot - solidNearB), c, t);
  }
  // 線上の距離 s の点と向き
  function frame(e, s) {
    const L = e.line; let acc = 0;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i], sl = len2(b[0] - a[0], b[1] - a[1]); if (sl <= 0) continue;
      if (s <= acc + sl || i === L.length - 1) { const u = Math.max(0, Math.min(1, (s - acc) / sl)); return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: (b[0] - a[0]) / sl, dz: (b[1] - a[1]) / sl }; }
      acc += sl;
    }
    return null;
  }
  // 形（車の進む向き u・運転者の左 w の座標の多角形のリスト）を、距離 s・横のずれ off・進む向き dir（a→b が +1）で置く
  function shapeAt(e, s, off, dir, polys, c, t) {
    const f = frame(e, s); if (!f) return;
    const lx = -f.dz, lz = f.dx, tris = [];
    off += CS;
    const P = ([u, w]) => [f.x + lx * off + f.dx * u * dir + lx * (-w * dir), f.z + lz * off + f.dz * u * dir + lz * (-w * dir)];
    polys.forEach(poly => { const Q = poly.map(P); for (let k = 1; k < Q.length - 1; k++) tris.push(Q[0], Q[k], Q[k + 1]); });
    out.push({ tris, c, t, e });
  }
  // 矢印（長さ 5m。軸 0.3m、頭 0.9m）。u = 0 が後ろの端
  const SH = 0.15, HD = 0.45;
  const A_STRAIGHT = [[[0, -SH], [3.4, -SH], [3.4, SH], [0, SH]], [[3.4, -HD], [5, 0], [3.4, HD]]];
  const turnArrow = k => {   // k: +1 左折、−1 右折。まっすぐの軸（2.4m）のあと半径 1.0m で 90 度曲がり、頭は横を向く（道路標示の様式）
    const S0 = 2.4, R = 1.0, polys = [[[0, -SH], [S0, -SH], [S0, SH], [0, SH]]];
    const N = 6; let prevI = null, prevO = null;
    for (let i = 0; i <= N; i++) {
      const t = i / N * Math.PI / 2, cu = S0 + Math.sin(t) * R, cw = R - Math.cos(t) * R;   // 円弧の中心線（u, w）
      const pi = [cu - Math.sin(t) * SH, cw + Math.cos(t) * SH], po = [cu + Math.sin(t) * SH, cw - Math.cos(t) * SH];   // 曲がる側・外側の縁（法線 = (−sin t, cos t)）
      if (prevI) polys.push([prevO, po, pi, prevI]);
      prevI = pi; prevO = po;
    }
    // 頭（横向き）: 円弧の終わり (S0 + R, R) から w の向きへ
    polys.push([[S0 + R - HD, R], [S0 + R, R + 1.1], [S0 + R + HD, R]]);
    return polys.map(P => P.map(([u, w]) => [u, w * k]));
  };
  const A_LEFT = turnArrow(1), A_RIGHT = turnArrow(-1);
  const DIAMOND = (() => { const L2 = 2.5, W2 = 0.75, t = 0.2, P = [[-L2, 0], [0, W2], [L2, 0], [0, -W2]], out2 = [];
    for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], dx = b[0] - a[0], dw = b[1] - a[1], l = Math.hypot(dx, dw), nx = -dw / l * t, nw = dx / l * t;
      out2.push([[a[0], a[1]], [b[0], b[1]], [b[0] + nx, b[1] + nw], [a[0] + nx, a[1] + nw]]); }
    return out2.map(p => p.map(([u, w]) => [u + 2.5, w])); })();
  // 交差点の腕の向きから、曲がれる向き（左・直進・右）を調べる。hx, hz: 交差点へ向かう向き
  function turnsAt(j, e, hx, hz) {
    const r = { left: false, straight: false, right: false }, Lx = hz, Lz = -hx;   // 運転者の左
    j.arms.forEach(a => {
      if (a.e === e || a.e.hidden) return;
      const P = a.e.line; if (!P || P.length < 2) return;
      const atA = len2(P[0][0] - j.x, P[0][1] - j.z) <= len2(P[P.length - 1][0] - j.x, P[P.length - 1][1] - j.z);
      const q = atA ? P[Math.min(P.length - 1, 2)] : P[Math.max(0, P.length - 3)], d = len2(q[0] - j.x, q[1] - j.z) || 1, dx = (q[0] - j.x) / d, dz = (q[1] - j.z) / d;
      const st = dx * hx + dz * hz, lf = dx * Lx + dz * Lz;
      if (st > 0.7) r.straight = true; else if (lf > 0.35) r.left = true; else if (lf < -0.35) { r.right = true; if (!r.rightArm || lf < r.rightLf) { r.rightArm = { e: a.e, atA }; r.rightLf = lf; } }
    });
    return r;
  }
  const arrowsFor = (str, tr) => {   // turn:lanes の 1 車線ぶん（"left;through" など）→ 形
    const parts = (str || '').split(';'), polys = [];
    if (parts.some(p => /through/.test(p))) polys.push(...A_STRAIGHT);
    if (parts.some(p => /left/.test(p))) polys.push(...A_LEFT);
    if (parts.some(p => /right/.test(p))) polys.push(...A_RIGHT);
    return polys;
  };
  // 横断歩道の割り当て。① 横断歩道の線（footway=crossing）が道の中心線（切り詰める前）と交わる点 → その道の、その位置
  //                    ② 線の無い横断歩道の点は、いちばん近い道（横のずれ ÷ 半幅 が最小）
  // 位置は切り詰めた線の上の距離 s に直す（交差点の中にある場合は負や全長を超える値になり、あとで道の端に寄せる）
  const XS = new Map();
  const sOnLine = (e, x, z) => {   // 切り詰めた線へ（両端は 12m まで延長して）射影した距離と横のずれ
    const L = e.line; let acc = 0, best = null;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i], sl = len2(b[0] - a[0], b[1] - a[1]); if (sl <= 0) continue;
      const dx = (b[0] - a[0]) / sl, dz = (b[1] - a[1]) / sl, u = (x - a[0]) * dx + (z - a[1]) * dz;
      const lo = i === 1 ? -12 : 0, hi = i === L.length - 1 ? sl + 12 : sl;
      if (u >= lo && u <= hi) { const d = Math.abs((x - a[0]) * -dz + (z - a[1]) * dx); if (!best || d < best.d) best = { s: acc + u, d }; }
      acc += sl;
    }
    return best;
  };
  const distSeg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return len2(x - a[0] - dx * u, z - a[1] - dz * u); };
  const addX = (e, sv, sig) => { if (!XS.has(e)) XS.set(e, []); XS.get(e).push({ s: sv, sig }); };
  const segX = (p, q, r, t) => {   // 線分 pq と rt の交点（無ければ null）
    const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]); if (Math.abs(d) < 1e-9) return null;
    const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d, v = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u] : null;
  };
  const roadEdges = net.edges.filter(e => !e.internal && !e.hidden && e.line.length >= 2 && (e.pts || e.line).length >= 2);
  const usedPts = [];
  (net.crossWays || []).forEach(W2 => {
    // この横断歩道の線が交わる道のうち、交点が道の範囲（切り詰めた線の 0〜全長）にいちばん近いものを 1 つだけ採る（交差点の中で隣の道の延長と交わる誤りを避ける）
    // 1 本の線が何本もの道を横切るとき（駅のバスターミナルの長い横断歩道など）は、道の範囲の中で交わる所（6m 以上離れたもの）にも置く
    const cand = [];
    for (let k = 1; k < W2.length; k++) for (const e of roadEdges) {
      const Pp = e.pts || e.line, Lt = lineLen(e.line);
      for (let i = 1; i < Pp.length; i++) {
        const X = segX(W2[k - 1], W2[k], Pp[i - 1], Pp[i]); if (!X) continue;
        const r = sOnLine(e, X[0], X[1]); if (!r || r.d > e.pr.hw + 3) continue;
        const outR = r.s < 0 ? -r.s : r.s > Lt ? r.s - Lt : 0, sc = outR + r.d * 0.5;
        cand.push({ e, s: r.s, X, sc, outR });
      }
    }
    cand.sort((p, q) => p.sc - q.sc);
    const took = [];
    cand.forEach((c, k) => {
      if (k > 0 && (c.outR > 0 || took.some(t => t.e === c.e || len2(t.X[0] - c.X[0], t.X[1] - c.X[1]) < 6))) return;
      took.push(c);
      const sig = (net.crossings || []).some(q => q.sig && len2(q.x - c.X[0], q.z - c.X[1]) < 8); addX(c.e, c.s, sig); usedPts.push(c.X);
    });
  });
  (net.crossings || []).forEach(c => {
    const near = usedPts.find(p => len2(p[0] - c.x, p[1] - c.z) < 8);
    if (near) return;   // 横断歩道の線で置いたもの
    if ((net.crossWays || []).some(W2 => W2.some((p, k) => k > 0 && distSeg(c.x, c.z, W2[k - 1], p) < 2.5))) return;   // 横断歩道の線の上の点（線の方で置く）
    let best = null;
    roadEdges.forEach(e => { const r = sOnLine(e, c.x, c.z); if (r && r.d < e.pr.hw + 2) { const sc = r.d / Math.max(2, e.pr.hw); if (!best || sc < best.sc) best = { e, s: r.s, sc }; } });
    if (best) addX(best.e, best.s, c.sig);
  });
  net.edges.forEach(e => {
    let pr = e.pr; const Ltot = lineLen(e.line);
    if (e.internal || e.hidden || e.offArea || Ltot < 2) return;   // まとめた交差点の中の短い道、地下の道、道路の範囲の外の私道には線を引かない
    const jA = net.nodes.get(e.a), jB = net.nodes.get(e.b);
    const minor = pr.rank >= 7;
    const nearA = jA && jA.arms.length >= 3 ? M.solidNear : 0, nearB = jB && jB.arms.length >= 3 ? M.solidNear : 0;
    // 実測の車道の幅と中心で線の位置を合わせる（道の 20〜80% の何か所かで測った中央値。交差点の広がりは除く）
    CS = 0;
    if (carAt && Ltot > 8 && !(pr.one && pr.rank <= 5)) {   // 上下線が分かれた道の片側（一方通行）は、測ると両方向の幅になるので合わせない
      const ex = []; for (let k = 1; k <= 5; k++) { const r = extentAt(e, Ltot * (0.1 + 0.16 * k)); if (r) ex.push(r); }
      if (ex.length >= 2) {
        const med = a => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
        const lo = med(ex.map(r => r[0])), hi = med(ex.map(r => r[1])), wM = hi - lo;
        if (wM > 2.4 && wM < pr.hw * 2 * 1.9 + 3 && wM > pr.hw * 2 * 0.5) {
          const nl0 = pr.fw + pr.bw, lwM = (wM - 2 * pr.edge) / Math.max(1, nl0);
          if (lwM >= 2.3 && lwM <= 4.2) { pr = Object.assign({}, pr, { hw: wM / 2, lw: lwM }); CS = (hi + lo) / 2; }
        }
      }
    }
    const nl = pr.fw + pr.bw, x0 = -pr.hw + pr.edge;   // 車道の端（− 側）
    // 導流帯（中央のゼブラ帯）: 対面通行で、車道の幅が車線数 × 3.25m より 1.5m 以上広いとき、余りを中央の導流帯にする（最大 4m）
    let zb = 0;
    if (!minor && pr.centerLine && pr.fw > 0 && pr.bw > 0 && nl >= 2) {
      const extra = pr.hw * 2 - 2 * pr.edge - nl * 3.25;
      zb = pr.zb !== undefined ? pr.zb : extra >= 2.2 ? Math.min(4, extra) : 0;
      if (zb > 0) pr = Object.assign({}, pr, { lw: (pr.hw * 2 - 2 * pr.edge - zb) / nl });
    }
    const cOff = x0 + pr.fw * pr.lw + zb;   // + 側の車線の始まり（導流帯があればその外）
    const cMid = x0 + pr.fw * pr.lw + zb / 2;   // 中央線の位置
    junctionMarks(e, jA, jB, Ltot, pr, x0, cOff, minor);
    if (Ltot < 25 && jA && jB && jA.arms.length >= 3 && jB.arms.length >= 3) return;   // 交差点どうしをつなぐ短い道（左折の側道・交差点の中の道）には線を引かない
    if (minor) {
      // 住宅地の道: 幅 4.5m 以上なら両側に路側帯の線（実線）。交差点の手前 2m で切る
      if (pr.hw * 2 >= 4.5) { const g0 = jA && jA.arms.length >= 3 ? pr.hw + 1 : 0, g1 = jB && jB.arms.length >= 3 ? pr.hw + 1 : 0;
        if (Ltot - g0 - g1 > 3) { quadAlong(e, -pr.hw + 0.6, M.edge, g0, Ltot - g1, 'w', 'side'); quadAlong(e, pr.hw - 0.6, M.edge, g0, Ltot - g1, 'w', 'side'); } }
      return;
    }
    // 外側線
    quadAlong(e, -pr.hw + pr.edge * 0.5, M.edge, 0, Ltot, 'w', 'edge');
    quadAlong(e, pr.hw - pr.edge * 0.5, M.edge, 0, Ltot, 'w', 'edge');
    // 中央線: 4 車線以上は白の実線、2 車線の幹線（県道以上）は黄色の実線（はみ出し禁止）、それ以外の 2 車線は白の破線（交差点の手前 30m は実線）
    if (zb > 0) {
      // 導流帯: 両側の実線と、45 度の斜線（幅 0.45m・3m ごと）。交差点の手前 12m までは描かない
      quadAlong(e, cMid - zb / 2 + 0.08, M.centerWide, 0, Ltot, 'w', 'center');
      quadAlong(e, cMid + zb / 2 - 0.08, M.centerWide, 0, Ltot, 'w', 'center');
      const h = zb / 2 - 0.1;
      for (let s2 = 12; s2 + zb < Ltot - 12; s2 += 3) shapeAt(e, s2, cMid, 1, [[[-0.22, -h], [0.22, -h], [0.22 + 2 * h, h], [-0.22 + 2 * h, h]]], 'w', 'zebra');
    } else if (pr.centerLine) {
      if (nl >= 4) quadAlong(e, cMid, M.centerWide, 0, Ltot, 'w', 'center');
      else if (pr.rank <= 3) quadAlong(e, cMid, M.center, 0, Ltot, 'y', 'center');
      else dashed(e, cMid, M.center, M.centerDash, 'w', Math.min(nearA, Ltot / 2), Math.min(nearB, Ltot / 2), 'center');
    }
    // 車線境界線（同じ向きの車線の間。交差点の手前 30m は黄色の実線 = 車線変更禁止、が多い）
    for (let k = 1; k < pr.fw; k++) { dashed(e, x0 + k * pr.lw, M.lane, pr.rank === 0 ? [8, 12] : M.dash, 'w', 0, 0, 'lane'); }
    for (let k = 1; k < pr.bw; k++) { dashed(e, cOff + k * pr.lw, M.lane, pr.rank === 0 ? [8, 12] : M.dash, 'w', 0, 0, 'lane'); }
    // 標識: 最高速度（約 300m ごと、向きごと）、一方通行（入口）と進入禁止（出口）、駐車禁止（幹線）
    if (pr.rank <= 5 && Ltot > 60) {
      const v = pr.rank <= 2 ? 50 : pr.rank <= 4 ? 40 : 30;
      for (let s2 = 40; s2 < Ltot - 30; s2 += 300) { if (pr.fw > 0) addSign('speed', e, s2, pr, 1, v); if (pr.bw > 0) addSign('speed', e, Ltot - s2, pr, -1, v); }
      if (pr.rank <= 3 && Ltot > 120) { if (pr.fw > 0) addSign('nopark', e, Ltot * 0.6, pr, 1); if (pr.bw > 0) addSign('nopark', e, Ltot * 0.4, pr, -1); }
    }
    if (pr.one && pr.rank >= 3 && Ltot > 25) {
      const tr = pr.rev ? -1 : 1, s0 = tr > 0 ? 6 : Ltot - 6, s1 = tr > 0 ? Ltot - 3 : 3;
      addSign('oneway', e, s0, pr, tr);
      const jEnd = net.nodes.get(tr > 0 ? e.b : e.a); if (jEnd && jEnd.arms.length >= 3) addSign('noentry', e, s1, pr, -tr);
    }
    // 速度の数字（県道以上: 50、それ以外の 2 車線以上の道: 40）。長い道の中ほどに、向きごとに 1 つ
    if (Ltot > 90 && pr.rank <= 5) {
      const v = pr.rank <= 2 ? '50' : pr.rank <= 4 ? '40' : '30';
      if (pr.fw > 0) out.texts.push(Object.assign(frame(e, Ltot * 0.45), { off: CS + x0 + pr.lw * 0.5, dir: 1, txt: v, w: Math.min(1.6, pr.lw * 0.6), len: 3.0 }));
      if (pr.bw > 0) out.texts.push(Object.assign(frame(e, Ltot * 0.55), { off: CS + cOff + pr.bw * pr.lw - pr.lw * 0.5, dir: -1, txt: v, w: Math.min(1.6, pr.lw * 0.6), len: 3.0 }));
    }
  });
  return out;
  // 交差点の手前: 横断歩道・停止線・矢印・ひし形・止まれ
  function junctionMarks(e, jA, jB, Ltot, pr, x0, cOff, minor) {
    // 横断歩道（OSM の位置）。同じ道で 6m 以内のものは 1 つにまとめ、道の範囲に収める
    const half = 0.5 + M.cwLen / 2, xs = [];
    (XS.get(e) || []).slice().sort((p, q) => p.s - q.s).forEach(c => { const s2 = Math.max(half, Math.min(Ltot - half, c.s)); if (Ltot < M.cwLen + 1) return; if (!xs.some(o => Math.abs(o.s - s2) < 6)) xs.push({ s: s2, sig: c.sig }); });
    const drawCW = sc => {
      const cw0 = sc - M.cwLen / 2, cw1 = sc + M.cwLen / 2;
      let lo = -pr.hw, hi = pr.hw; const ex = extentAt(e, sc);
      if (ex && ex[1] - ex[0] > 2 && ex[1] - ex[0] < pr.hw * 2 * 2.2 + 4) { lo = ex[0] - CS; hi = ex[1] - CS; }
      for (let o = lo + 0.3; o + M.cwStripe <= hi - 0.3; o += M.cwStripe + M.cwGap) quadAlong(e, o + M.cwStripe / 2, M.cwStripe, cw0, cw1, 'w', 'cw');
    };
    xs.forEach(c => { drawCW(c.s); if (!c.sig && !minor) { addSign('cross', e, c.s, pr, 1); addSign('cross', e, c.s, pr, -1); } });   // 信号の無い横断歩道は両端に横断歩道の標識
    // 交差点から離れた横断歩道（両端から 20m 以上）: 信号付きなら両方向に停止線、信号なしなら両方向にひし形
    xs.filter(c => c.s > 20 && c.s < Ltot - 20).forEach(c => {
      [1, -1].forEach(dir2 => {   // dir2 = +1: a→b の車線（− 側）が向かう
        const nIn2 = dir2 > 0 ? pr.fw : pr.bw; if (nIn2 < 1 || minor) return;
        const mid2 = dir2 > 0 ? x0 + pr.fw * pr.lw / 2 : cOff + pr.bw * pr.lw / 2, st2 = c.s - dir2 * (M.cwLen / 2 + M.stopGap);
        if (c.sig) quadAlong(e, mid2, nIn2 * pr.lw, Math.min(st2, st2 - dir2 * M.stop), Math.max(st2, st2 - dir2 * M.stop), 'w', 'stop');
        else for (let k = 0; k < nIn2; k++) [30, 50].forEach(d => { const sd = st2 - dir2 * d; if (sd > 6 && sd < Ltot - 6) shapeAt(e, sd, dir2 > 0 ? x0 + (k + 0.5) * pr.lw : pr.hw - pr.edge - (k + 0.5) * pr.lw, dir2, DIAMOND, 'w', 'dia'); });
      });
    });
    [[jA, 0, 1], [jB, Ltot, -1]].forEach(([j, s, dir]) => {
      if (!j || j.arms.length < 3) return;
      // この端の交差点へ向かう車線: a 端（dir=+1 で s=0）へ向かうのは b→a の車線（+ 側、bw 本）、b 端へ向かうのは a→b（− 側、fw 本）
      const nIn = dir === 1 ? pr.bw : pr.fw;
      const laneOff = k => dir === 1 ? (pr.hw - pr.edge - (k + 0.5) * pr.lw) : (x0 + (k + 0.5) * pr.lw);   // k = 0 がいちばん左の車線
      const travel = -dir;   // 交差点へ向かう車の進む向き（線の向きに対して）
      const higher = j.arms.some(a => a.e !== e && a.e.pr.rank < pr.rank - 1);
      const stopSign = !j.sig && (j.stop || (higher && pr.rank >= 5));
      // この端の近く（20m 以内）の横断歩道。停止線はその 2m 手前（交差点から遠い側）
      const near = xs.filter(c => Math.abs(c.s - s) < 20).sort((p, q) => Math.abs(q.s - s) - Math.abs(p.s - s))[0];
      const cw = !!near;
      let st = s + dir * 0.5;
      if (near) st = near.s + dir * (M.cwLen / 2 + M.stopGap);
      if (!(j.sig || cw || stopSign) || nIn < 1) return;
      // 停止線（向かう側の車線の幅）
      const s0 = Math.min(st, st + dir * M.stop), s1 = Math.max(st, st + dir * M.stop);
      const mid = dir === 1 ? cOff + pr.bw * pr.lw / 2 : x0 + pr.fw * pr.lw / 2, wIn = nIn * pr.lw;
      quadAlong(e, minor && pr.centerLine === false ? 0 : mid, minor && !pr.centerLine ? pr.hw * 2 - 0.6 : wIn, s0, s1, 'w', 'stop');
      const sAfter = d => st + dir * (M.stop + d);   // 停止線から手前へ d m
      if (stopSign && Ltot > 8) addSign('stop', e, st + dir * 0.6, pr, travel);   // 止まれの標識（停止線の位置の左の路肩）
      if (stopSign && Ltot > 12) {   // 「止まれ」（停止線の 1〜4m 手前）
        const f = frame(e, sAfter(2.5)); if (f) out.texts.push(Object.assign(f, { off: CS + (minor && !pr.centerLine ? 0 : mid), dir: travel, txt: '止まれ', w: Math.min(2.4, Math.max(1.2, (minor && !pr.centerLine ? pr.hw * 2 : wIn) * 0.6)), len: 4.5 }));
      }
      // 進行方向別の矢印（2 車線以上で向かう交差点）。turn:lanes があればその通り、無ければ曲がれる向きから決める
      if (!minor && nIn >= 2 && Ltot > 45) {
        const f = frame(e, st), hx = f.dx * travel, hz = f.dz * travel, T = turnsAt(j, e, hx, hz);
        const tags = (dir === 1 ? pr.turnB : pr.turnF); const tl = tags ? tags.split('|') : null;
        for (let k = 0; k < nIn; k++) {
          let str = tl && tl[k] ? tl[k] : null;
          if (!str) {
            if (k === 0) str = (T.left ? 'left;' : '') + (T.straight || nIn === 2 && !T.right ? 'through' : '');
            else if (k === nIn - 1) str = (T.straight && nIn === 2 ? 'through;' : '') + (T.right ? 'right' : T.straight ? 'through' : '');
            else str = T.straight ? 'through' : '';
          }
          const polys = arrowsFor(str); if (!polys.length) continue;
          // 右折の誘導線（信号のある交差点の、いちばん右の車線から右の道の出ていく車線へ、交差点の中の点線）
          if (k === nIn - 1 && /right/.test(str) && j.sig && T.rightArm) {
            const e2 = T.rightArm.e, p2 = e2.pr, L2 = lineLen(e2.line), s2 = T.rightArm.atA ? 0 : L2, out2 = T.rightArm.atA ? 1 : -1;
            const f0 = frame(e, st), f3 = frame(e2, s2);
            if (f0 && f3) {
              const l0 = laneOff(k) + CS, P0 = [f0.x - f0.dz * l0, f0.z + f0.dx * l0], d0 = [f0.dx * travel, f0.dz * travel];
              const n2 = out2 > 0 ? p2.fw : p2.bw, o2 = out2 > 0 ? (-p2.hw + p2.edge + (n2 - 0.5) * p2.lw) : (p2.hw - p2.edge - (n2 - 0.5) * p2.lw);   // 出ていく車線のうち中央寄り
              const P3 = [f3.x - f3.dz * o2, f3.z + f3.dx * o2], d3 = [f3.dx * out2, f3.dz * out2], D = len2(P3[0] - P0[0], P3[1] - P0[1]);
              if (D > 6 && D < 70) {
                const P1 = [P0[0] + d0[0] * D * 0.45, P0[1] + d0[1] * D * 0.45], P2 = [P3[0] - d3[0] * D * 0.45, P3[1] - d3[1] * D * 0.45];
                const B = t => { const v = 1 - t; return [v * v * v * P0[0] + 3 * v * v * t * P1[0] + 3 * v * t * t * P2[0] + t * t * t * P3[0], v * v * v * P0[1] + 3 * v * v * t * P1[1] + 3 * v * t * t * P2[1] + t * t * t * P3[1]]; };
                const n = Math.ceil(D * 1.6), pts = []; for (let i = 0; i <= n; i++) pts.push(B(i / n));
                let acc = 0, on = true, tris = [];
                for (let i = 1; i < pts.length; i++) {   // 長さ 1m・間 1m の点線、幅 0.15m
                  const a = pts[i - 1], b = pts[i], l = len2(b[0] - a[0], b[1] - a[1]) || 1e-6, nx = -(b[1] - a[1]) / l * 0.075, nz = (b[0] - a[0]) / l * 0.075;
                  if (Math.floor(acc / 1.0) % 2 === 0) tris.push([a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] + nx, a[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]);
                  acc += l;
                }
                if (tris.length) out.push({ tris, c: 'w', t: 'guide', e });
              }
            }
          }
          [8, 30].forEach(d => { if (d + 5 < Ltot - 10) shapeAt(e, sAfter(d + 5), laneOff(k), travel, polys, 'w', 'arrow'); });
        }
      }
      // 信号の無い横断歩道の予告（ひし形）: 30m と 50m 手前
      if (cw && !j.sig && !minor) for (let k = 0; k < nIn; k++) [30, 50].forEach(d => { if (d + 5 < Ltot - 5) shapeAt(e, sAfter(d), laneOff(k), travel, DIAMOND, 'w', 'dia'); });
    });
  }
}
export function lineLen(L) { let s = 0; for (let i = 1; i < L.length; i++) s += len2(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); return s; }

/** 信号機の置き場所: 交差点へ向かう車線ごとに、交差点の向こう側の左の角（日本の一般的な配置） */
export function signals(net) {
  const out = [];
  // 信号の単位: まとめた交差点（外へ出る腕だけ）と、ふつうの交差点
  const units = net.groups.filter(C => C.sig).map(C => ({ x: C.x, z: C.z, A: C.A, id: C.id }))
    .concat(net.junctions.filter(n => n.sig && !n.cluster).map(n => ({ x: n.x, z: n.z, A: n.A, id: n.id })));
  units.forEach(n => {
    // 現示のグループ: いちばん格の高い腕の向きと平行な腕は主道路（0）、それ以外は従道路（1）
    if (!n.A.length) return;
    // 現示のグループ: 腕の向きでまとめる（一直線から 40 度以内の腕は同じ軸 = 対向。45 度以上ずれると交差として別の現示）。格の高い腕から順に軸を作るので、
    // グループ 0 が主道路。軸が 3 つ以上なら 3 現示以上になる（同時に青になるのは同じ軸の腕だけ）
    const order = n.A.slice().sort((p, q) => p.arm.e.pr.rank - q.arm.e.pr.rank), axes = [];
    const grpOf = new Map();
    order.forEach(a => {
      // グループの全員と一直線から 40 度以内のときだけ入れる（代表とだけ比べると、両側に 40 度ずつずれた 2 本が同じ組になる）
      let g = axes.findIndex(ms => ms.every(b => Math.abs(a.d[0] * b.d[0] + a.d[1] * b.d[1]) > Math.cos(40 * Math.PI / 180)));
      if (g < 0) { axes.push([]); g = axes.length - 1; }
      axes[g].push(a); grpOf.set(a, g);
    });
    const art = order[0].arm.e.pr.rank <= 2;   // 幹線（国道・主要地方道）は黄 4 秒
    n.A.forEach(a => {
      const grp = grpOf.get(a), ngrp = axes.length;
      a.arm.sig = { grp, n: ngrp, unit: n.id, art };   // 交通 AI が「この腕から入るときの信号」を引けるように
      const pr = a.arm.e.pr;
      const inLanes = a.arm.end === 0 ? pr.bw : pr.fw;   // この腕から交差点へ入ってくる車線
      if (!inLanes) return;
      // 進んでくる向き t = −d。向こう側 = 交差点の中心から t の向きへ、左 = (t.z, −t.x)
      const tx = -a.d[0], tz = -a.d[1];
      let far = 0; n.A.forEach(b => { if (b !== a) far = Math.max(far, b.trim * Math.max(0, b.d[0] * tx + b.d[1] * tz)); });
      far = Math.max(far, a.trim * 0.8);
      const lx = tz, lz = -tx;
      // 腕の中心線の横のずれ（a.lat は d の +90 度側。運転者の左 = d の −90 度側なので符号が逆）
      const side = -(a.lat || 0) + pr.hw + 1.2, laneLat = -(a.lat || 0) + pr.hw - pr.edge - inLanes * pr.lw / 2;   // 進入車線の中心（左が +）
      out.push({ x: n.x + tx * (far + 2) + lx * side, z: n.z + tz * (far + 2) + lz * side, face: Math.atan2(-tx, -tz),
        arm: Math.max(2.0, Math.min(6.0, 1.2 + pr.edge + inLanes * pr.lw * 0.5)),   /* 灯器を進入車線の中央の上に */
        junction: n.id, grp, n: ngrp, art, dx: tx, dz: tz, laneX: n.x + tx * (far + 2) + lx * laneLat, laneZ: n.z + tz * (far + 2) + lz * laneLat });
    });
  });
  return out;
}
