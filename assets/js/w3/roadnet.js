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
  service:       { rank: 9, lanes: 1, lw: 3.0,  edge: 0.2,  walk: 0 }
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
           turnF: t['turn:lanes:forward'] || (one ? t['turn:lanes'] : null) || null, turnB: t['turn:lanes:backward'] || null, name: t.name || t.ref || '' };
}

/**
 * データ（roads.json）から道路網を作る。
 * 返り値: { nodes:[{x,z,y,arms:[], sig, kind}], edges:[{a,b,pts:[[x,z,y]...], pr, trimA, trimB}], junctions:[...], marks:[], signals:[] }
 */
export function build(D, heightAt) {
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
    const pr = profile(w.t);
    let start = 0;
    for (let j = 1; j < w.n.length; j++) {
      if (use[w.n[j]] >= 2 || j === w.n.length - 1) {
        const seq = w.n.slice(start, j + 1);
        if (seq.length >= 2) {
          const pts = seq.map(pos);
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
  // 道路の帯（切り戻したあと）
  edges.forEach(e => {
    const P2 = cut(e.pts, e.trimA, e.len - e.trimB);
    e.line = resample(P2, 3.0);
    e.line.forEach(p => { p[2] = heightAt(p[0], p[1]); });
  });
  // 継ぎ目の向き（2 本の平均）
  nodes.forEach(n => {
    if (!n.joint) return;
    const t = n.arms.map(arm => { const L = arm.e.line, p0 = arm.end === 0 ? L[0] : L[L.length - 1], p1 = arm.end === 0 ? L[1] : L[L.length - 2]; const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = len2(dx, dz) || 1; return [dx / l, dz / l]; });
    const bx = t[0][0] - t[1][0], bz = t[0][1] - t[1][1], bl = len2(bx, bz) || 1;   // 0 番の腕の向き（外向き）の平均
    n.arms.forEach((arm, k) => { const s = k === 0 ? 1 : -1; arm.e[arm.end === 0 ? 'dirA' : 'dirB'] = [s * bx / bl * (arm.end === 0 ? 1 : -1), s * bz / bl * (arm.end === 0 ? 1 : -1)]; });
  });
  return { nodes, edges, junctions, MARK };
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
export function markings(net) {
  const M = net.MARK, out = [];
  function quadAlong(e, off, w, s0, s1, c) {   // 線に沿った帯（off: 中心線からの横のずれ、w: 幅、s0〜s1: 距離の範囲）
    const L = e.line; let acc = 0;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i], sl = len2(b[0] - a[0], b[1] - a[1]); if (sl <= 0) continue;
      const u0 = Math.max(0, (s0 - acc) / sl), u1 = Math.min(1, (s1 - acc) / sl);
      if (u1 > u0) {
        const dx = (b[0] - a[0]) / sl, dz = (b[1] - a[1]) / sl, lx = -dz, lz = dx;
        const p0 = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0], p1 = [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1];
        const o0 = off - w / 2, o1 = off + w / 2;
        out.push({ q: [[p0[0] + lx * o0, p0[1] + lz * o0], [p1[0] + lx * o0, p1[1] + lz * o0], [p1[0] + lx * o1, p1[1] + lz * o1], [p0[0] + lx * o1, p0[1] + lz * o1]], y: a[2] + (b[2] - a[2]) * (u0 + u1) / 2, c });
      }
      acc += sl;
    }
  }
  function dashed(e, off, w, dash, c, solidNearA, solidNearB) {
    const Ltot = lineLen(e.line), on = dash[0], per = dash[0] + dash[1];
    if (solidNearA > 0) quadAlong(e, off, w, 0, Math.min(Ltot, solidNearA), c);
    if (solidNearB > 0) quadAlong(e, off, w, Math.max(0, Ltot - solidNearB), Ltot, c);
    for (let s = solidNearA; s < Ltot - solidNearB; s += per) quadAlong(e, off, w, s, Math.min(s + on, Ltot - solidNearB), c);
  }
  net.edges.forEach(e => {
    const pr = e.pr, Ltot = lineLen(e.line);
    if (pr.rank >= 7 || Ltot < 2) return;   // 住宅地の細い道・私道には線を引かない
    const jA = net.nodes.get(e.a), jB = net.nodes.get(e.b);
    const nearA = jA && jA.arms.length >= 3 ? M.solidNear : 0, nearB = jB && jB.arms.length >= 3 ? M.solidNear : 0;
    const nl = pr.fw + pr.bw, x0 = -pr.hw + pr.edge;   // 車道の端（− 側）
    // 外側線
    quadAlong(e, -pr.hw + pr.edge * 0.5, M.edge, 0, Ltot, 'w');
    quadAlong(e, pr.hw - pr.edge * 0.5, M.edge, 0, Ltot, 'w');
    // 中央線（両方向の道）: 4 車線以上は実線、2 車線は破線（交差点の手前 30m は実線）
    // 左側通行: 進行方向（a→b）の車線は − 側（座標の向きで「進行方向の左」は − 側）
    const cOff = x0 + pr.fw * pr.lw;
    if (pr.centerLine) {
      if (nl >= 4) quadAlong(e, cOff, M.centerWide, 0, Ltot, 'w');
      else dashed(e, cOff, M.center, M.centerDash, 'w', Math.min(nearA, Ltot / 2), Math.min(nearB, Ltot / 2));
    }
    // 車線境界線（同じ向きの車線の間）
    for (let k = 1; k < pr.fw; k++) dashed(e, x0 + k * pr.lw, M.lane, pr.rank === 0 ? [8, 12] : M.dash, 'w', Math.min(nearA, Ltot / 2), Math.min(nearB, Ltot / 2));
    for (let k = 1; k < pr.bw; k++) dashed(e, cOff + k * pr.lw, M.lane, pr.rank === 0 ? [8, 12] : M.dash, 'w', Math.min(nearA, Ltot / 2), Math.min(nearB, Ltot / 2));
    // 交差点の手前: 横断歩道と停止線（信号か横断歩道のある交差点）
    [[jA, 0, 1], [jB, Ltot, -1]].forEach(([j, s, dir]) => {
      if (!j || j.arms.length < 3 || !(j.sig || j.cross)) return;
      const cw0 = s + dir * 0.5, cw1 = s + dir * (0.5 + M.cwLen);
      // 横断歩道（車道の全幅、縞は道路の進行方向と平行）
      for (let o = -pr.hw + 0.3; o + M.cwStripe <= pr.hw - 0.3; o += M.cwStripe + M.cwGap) quadAlong(e, o + M.cwStripe / 2, M.cwStripe, Math.min(cw0, cw1), Math.max(cw0, cw1), 'w');
      // 停止線: 交差点へ向かう車線の側だけ（a 端の交差点へ向かうのは b→a の車線 = + 側、b 端へ向かうのは − 側）
      const st = s + dir * (0.5 + M.cwLen + M.stopGap);
      const s0 = Math.min(st, st + dir * M.stop), s1 = Math.max(st, st + dir * M.stop);
      if (dir === 1 && pr.bw > 0) quadAlong(e, cOff + pr.bw * pr.lw / 2, pr.bw * pr.lw, s0, s1, 'w');
      if (dir === -1 && pr.fw > 0) quadAlong(e, x0 + pr.fw * pr.lw / 2, pr.fw * pr.lw, s0, s1, 'w');
    });
  });
  return out;
}
export function lineLen(L) { let s = 0; for (let i = 1; i < L.length; i++) s += len2(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); return s; }

/** 信号機の置き場所: 交差点へ向かう車線ごとに、交差点の向こう側の左の角（日本の一般的な配置） */
export function signals(net) {
  const out = [];
  net.junctions.forEach(n => {
    if (!n.sig) return;
    n.A.forEach(a => {
      const pr = a.arm.e.pr;
      const inLanes = a.arm.end === 0 ? pr.bw : pr.fw;   // この腕から交差点へ入ってくる車線
      if (!inLanes) return;
      // 進んでくる向き t = −d。向こう側 = 交差点の中心から t の向きへ、左 = (t.z, −t.x)
      const tx = -a.d[0], tz = -a.d[1];
      let far = 0; n.A.forEach(b => { if (b !== a) far = Math.max(far, b.trim * Math.max(0, b.d[0] * tx + b.d[1] * tz)); });
      far = Math.max(far, a.trim * 0.8);
      const lx = tz, lz = -tx;
      out.push({ x: n.x + tx * (far + 2) + lx * (pr.hw + 1.2), z: n.z + tz * (far + 2) + lz * (pr.hw + 1.2), face: Math.atan2(-tx, -tz), arm: Math.min(pr.hw * 2 - 1, inLanes * pr.lw + 0.5), junction: n.id });
    });
  });
  return out;
}
