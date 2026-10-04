/*
 * traffic.js — 一般車（交通 AI）。道路網（roadnet）の車線に沿って走る。
 * - 左側通行。車線の中心は roadnet の断面（車線幅・路肩）から求める。
 * - 前の車との間は IDM（Intelligent Driver Model）で保つ。自車も「前の車」として扱う。
 * - 信号のある交差点では、腕ごとの現示（roadnet の signals() が付けた grp）と race-spec の秒数で、
 *   赤と黄（止まれる距離のとき）は停止線（横断歩道の手前 2m）で止まる。
 * - 交差点では出口をランダムに選び（U ターンはしない、格の高い道を選びやすい）、3 次曲線で曲がる。
 * - 自車の周り（半径 400m）にだけ置き、遠くなったら別の場所へ出し直す。
 */
import * as THREE from 'three';

const IDM = { T: 1.4, s0: 2.5, a: 1.6, b: 2.8, delta: 4 };
const STOP_BACK = 0.5 + 4.0 + 2.0 + 0.6;   // 線の端（交差点の切り口）から停止線まで（横断歩道 4m ＋ 2m ＋ 車の鼻先の余裕）

function prep(e) {   // 線の累積距離
  if (e.cum) return;
  const L = e.line, c = [0]; for (let i = 1; i < L.length; i++) c.push(c[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));
  e.cum = c; e.L = c[c.length - 1];
}
/** 線の上の距離 s（a→b 向き）と、横のずれ off（+ = a→b の向きで右… ではなく、roadnet の + 側）から位置と向き */
function at(e, s, off) {
  const L = e.line, c = e.cum; s = Math.max(0, Math.min(e.L, s));
  let i = 1; while (i < c.length - 1 && c[i] < s) i++;
  const a = L[i - 1], b = L[i], sl = (c[i] - c[i - 1]) || 1, u = (s - c[i - 1]) / sl;
  const dx = (b[0] - a[0]) / sl, dz = (b[1] - a[1]) / sl;
  return { x: a[0] + (b[0] - a[0]) * u - dz * off, z: a[1] + (b[1] - a[1]) * u + dx * off, y: a[2] + (b[2] - a[2]) * u, dx, dz };
}
function laneOff(pr, dir, k) {   // dir +1: a→b（− 側を走る）、−1: b→a（+ 側）。k: 0 = いちばん左の車線
  return dir > 0 ? -pr.hw + pr.edge + pr.lw * (k + 0.5) : pr.hw - pr.edge - pr.lw * (k + 0.5);
}
const limitOf = pr => (pr.rank <= 2 ? 50 : pr.rank <= 4 ? 40 : 30) / 3.6;

export function makeTraffic(scene, net, opt) {
  const R = window.TB && TB.Race, rnd = opt.random || Math.random;
  const edges = net.edges.filter(e => !e.hidden && e.line.length >= 2 && e.pr.rank <= 7);
  edges.forEach(prep);
  const nodeArms = id => net.nodes.get(id).arms.filter(a => !a.e.hidden && a.e.pr.rank <= 7 && a.e.line.length >= 2);
  const cars = [], N = opt.count || 40;
  /* 見た目: 自車と同じ形を、インスタンス描画で色違いに（白・銀・黒が多い日本の色の比率） */
  const COLORS = [[0xf2f2f0, 30], [0xb8bcc2, 20], [0x1a1c20, 18], [0x6b6f75, 8], [0x2a3d66, 6], [0x8c1c1c, 6], [0xd7cfc0, 5], [0x2f4a3a, 3], [0x5a3a24, 4]];
  const pickColor = () => { let t = rnd() * 100; for (const [c, w] of COLORS) { if ((t -= w) < 0) return c; } return 0xf2f2f0; };
  // 車種（cars.js の fleetParts でまとめた部品）。近い車（最大 8 台）は細かい形で影も落とす。遠い車は粗い形で影なし
  const NEAR = opt.near || 8, FAR = opt.farDist || 220, types = opt.types;   // 細かい形で描く台数、描く距離（それより遠い車は動かすだけ）
  function makeParts(parts, n, shadow) {
    return parts.map(pt => {
      const im = new THREE.InstancedMesh(pt.geometry, pt.material, n);
      im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; im.count = 0; im.visible = false;
      scene.add(im); return { im, paint: pt.paint };
    });
  }
  types.forEach(T => { T.nearIM = makeParts(T.near.parts, NEAR, true); T.farIM = makeParts(T.far.parts, N, false); });
  let wSum = 0; types.forEach(T => { wSum += T.weight; });
  const pickType = () => { let t = rnd() * wSum; for (const T of types) { if ((t -= T.weight) < 0) return T; } return types[0]; };
  const ids = new Map();
  function spawn(px, pz, near) {
    // 自車から near〜400m の道の上の、ランダムな車線
    for (let tries = 0; tries < 40; tries++) {
      const e = edges[Math.floor(rnd() * edges.length)];
      if (e.L < 20) continue;
      const s = 5 + rnd() * (e.L - 10), p0 = at(e, s, 0), d = Math.hypot(p0.x - px, p0.z - pz);
      if (d < near || d > 380) continue;
      const pr = e.pr, dirs = []; if (pr.fw) dirs.push(1); if (pr.bw) dirs.push(-1);
      if (!dirs.length) continue;
      const dir = dirs[Math.floor(rnd() * dirs.length)], nl = dir > 0 ? pr.fw : pr.bw, k = Math.floor(rnd() * nl);
      const ss = dir > 0 ? s : e.L - s;   // 進む向きの距離
      if (cars.some(c => c.e === e && c.dir === dir && c.k === k && Math.abs(c.s - ss) < 12)) continue;
      if (e.L - STOP_BACK - ss < 30) continue;   // 交差点（停止線）の直前には出さない（赤で止まりきれないため）
      const T = pickType();
      return { born: step.t || 0, e, dir, k, s: ss, v: limitOf(pr) * (0.6 + rnd() * 0.3), color: T.colors ? T.colors[Math.floor(rnd() * T.colors.length)] : pickColor(), T, jx: null, len: T.len, id: Math.random() };
    }
    return null;
  }
  function pose(c) {   // 位置と向き
    if (c.jx) {
      const J = c.jx, u = Math.min(1, c.s / J.len), v = 1 - u;
      const x = v * v * v * J.p0[0] + 3 * v * v * u * J.p1[0] + 3 * v * u * u * J.p2[0] + u * u * u * J.p3[0];
      const z = v * v * v * J.p0[1] + 3 * v * v * u * J.p1[1] + 3 * v * u * u * J.p2[1] + u * u * u * J.p3[1];
      const tx = 3 * v * v * (J.p1[0] - J.p0[0]) + 6 * v * u * (J.p2[0] - J.p1[0]) + 3 * u * u * (J.p3[0] - J.p2[0]);
      const tz = 3 * v * v * (J.p1[1] - J.p0[1]) + 6 * v * u * (J.p2[1] - J.p1[1]) + 3 * u * u * (J.p3[1] - J.p2[1]);
      return { x, z, y: J.y0 + (J.y1 - J.y0) * u, yaw: Math.atan2(tx, tz) };
    }
    const sl = c.dir > 0 ? c.s : c.e.L - c.s, p = at(c.e, sl, laneOff(c.e.pr, c.dir, c.k));
    return { x: p.x, z: p.z, y: p.y, yaw: Math.atan2(p.dx * c.dir, p.dz * c.dir) };
  }
  // 交差点を抜ける曲線を作る（次の道と車線を選ぶ）
  function enterJunction(c) {
    const node = c.dir > 0 ? c.e.b : c.e.a, arms = nodeArms(node).filter(a => a.e !== c.e);
    const over = c.s; c.s = c.e.L; const end = pose(c); c.s = over;   // 道の終わり（交差点の切り口）の位置と向き
    const opts = arms.filter(a => (a.end === 0 ? a.e.pr.fw : a.e.pr.bw) > 0);
    if (!opts.length) { c.dead = true; return; }
    // 出口の候補ごとに曲線を作り、短いもの（50m 以下）から重みつきで選ぶ
    const cands = [];
    opts.forEach(a => {
      const e2 = a.e, dir2 = a.end === 0 ? 1 : -1, nl = dir2 > 0 ? e2.pr.fw : e2.pr.bw;
      const st = pose({ e: e2, dir: dir2, k: 0, s: 0 }), turn = Math.atan2(Math.sin(st.yaw - end.yaw), Math.cos(st.yaw - end.yaw));
      if (Math.abs(turn) > 2.7) return;   // U ターンに近いものは選ばない
      // 左折は左の車線へ、右折は右の車線へ
      const k2 = turn > 0.5 ? 0 : turn < -0.5 ? nl - 1 : Math.min(nl - 1, c.k);
      const s2 = pose({ e: e2, dir: dir2, k: k2, s: 0 });
      const ux = Math.sin(end.yaw), uz = Math.cos(end.yaw), vx = Math.sin(s2.yaw), vz = Math.cos(s2.yaw), D = Math.hypot(s2.x - end.x, s2.z - end.z);
      if (D > 50) return;
      // 2 本の向きの交点へ向けた制御点（円弧に近い 3 次曲線）。ほぼ平行なら直線に近い形
      let h1 = D * 0.35, h2 = D * 0.35;
      const det = ux * (-vz) - uz * (-vx);
      if (Math.abs(det) > 0.2) {
        const rx = s2.x - end.x, rz = s2.z - end.z, t1 = (rx * (-vz) - rz * (-vx)) / det, t2 = (ux * rz - uz * rx) / det;
        if (t1 > 0 && t2 > 0) { h1 = t1 * 0.55; h2 = t2 * 0.55; }
      }
      cands.push({ e2, dir2, k2, s2, turn, h1, h2, D, w: 1 / (1 + e2.pr.rank) * (Math.abs(turn) < 0.5 ? 2 : 1) });
    });
    if (!cands.length) { c.dead = true; return; }
    let tot = 0; cands.forEach(x => { tot += x.w; });
    let t = rnd() * tot, pick = cands[0]; for (const x of cands) { if ((t -= x.w) < 0) { pick = x; break; } }
    const { e2, dir2, k2, s2, turn, h1, h2, D } = pick;
    c.jx = { p0: [end.x, end.z], p1: [end.x + Math.sin(end.yaw) * h1, end.z + Math.cos(end.yaw) * h1], p2: [s2.x - Math.sin(s2.yaw) * h2, s2.z - Math.cos(s2.yaw) * h2], p3: [s2.x, s2.z], len: Math.max(2, D * (1 + Math.abs(turn) * 0.12)), y0: end.y, y1: s2.y, next: { e: e2, dir: dir2, k: k2 } };
    c.s = Math.max(0, over);   // 交差点の中へ進んだぶん
  }
  // 信号: この道の先の交差点で止まるべきか
  const stats = { sigEntries: 0, redEntries: 0 };
  function sigColor(c, t) {
    const arm = (c.dir > 0 ? net.nodes.get(c.e.b) : net.nodes.get(c.e.a)).arms.find(a => a.e === c.e && a.end === (c.dir > 0 ? 1 : 0));
    if (!arm || !arm.sig || !R || !R.SPEC) return null;
    return R.SPEC.phasesAt(t + (arm.sig.unit * 7.3) % 33, arm.sig.n, arm.sig.art)[arm.sig.grp] || 'red';
  }
  function mustStop(c, t) {
    const arm = (c.dir > 0 ? net.nodes.get(c.e.b) : net.nodes.get(c.e.a)).arms.find(a => a.e === c.e && a.end === (c.dir > 0 ? 1 : 0));
    if (!arm || !arm.sig || !R || !R.SPEC) return false;
    const col = R.SPEC.phasesAt(t + (arm.sig.unit * 7.3) % 33, arm.sig.n, arm.sig.art)[arm.sig.grp] || 'red';
    if (col === 'red') return true;
    if (col === 'yellow') { const dist = c.e.L - STOP_BACK - c.s; return dist > c.v * c.v / (2 * 3.5); }   // 止まれる距離なら止まる
    return false;
  }
  function step(dt, t, player) {
    step.t = t;
    // 自車の周りに保つ
    for (let i = cars.length - 1; i >= 0; i--) { const p = pose(cars[i]); if (cars[i].dead || Math.hypot(p.x - player.x, p.z - player.z) > 450) cars.splice(i, 1); }
    let budget = 3; while (cars.length < N && budget-- > 0) { const c = spawn(player.x, player.z, cars.length < N / 2 && !step.started ? 25 : 150); if (c) cars.push(c); else break; }
    step.started = true;
    // 同じ車線の並び（前の車）
    const lanes = new Map();
    cars.forEach(c => { const key = c.jx ? 'j' + c.jx.next.e.id + ':' + c.jx.next.dir + ':' + c.jx.next.k : c.e.id + ':' + c.dir + ':' + c.k; if (!lanes.has(key)) lanes.set(key, []); lanes.get(key).push(c); });
    lanes.forEach(list => list.sort((a, b) => a.s - b.s));
    cars.forEach(c => {
      const P = pose(c), v0 = c.jx ? Math.min(limitOf(c.jx.next.e.pr), 7) : limitOf(c.e.pr);
      let gap = 1e9, dv = 0;
      const key = c.jx ? 'j' + c.jx.next.e.id + ':' + c.jx.next.dir + ':' + c.jx.next.k : c.e.id + ':' + c.dir + ':' + c.k, list = lanes.get(key), i = list.indexOf(c);
      if (i < list.length - 1) { const f = list[i + 1]; gap = f.s - c.s - f.len; dv = c.v - f.v; }
      else if (!c.jx) {   // 車線の先頭: 交差点の中の車（同じ出口）と、次の道の車
        const nk = 'j'; lanes.forEach((l2, k2) => { if (k2.startsWith(nk)) l2.forEach(o => { if (o.jx && o.jx.p0 && Math.hypot(o.jx.p0[0] - P.x, o.jx.p0[1] - P.z) < 1 && o !== c) { const g = c.e.L - c.s + o.s - o.len; if (g < gap) { gap = g; dv = c.v - o.v; } } }); });
      }
      // 信号の停止線
      let hold = false;
      if (!c.jx && mustStop(c, t)) { const g = c.e.L - STOP_BACK - c.s; if (g > -1 && g < gap) { gap = Math.max(0.1, g + IDM.s0 - 1.0); dv = c.v; if (g < 0.8 && c.v < 1.5) hold = true; } }   // 停止線の 1m 手前で止まる
      // 自車（前方 0〜60m、横 1.8m 以内）
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), rx = player.x - P.x, rz = player.z - P.z, ahead = rx * fx + rz * fz, lat = Math.abs(-rx * fz + rz * fx);
      if (ahead > 0 && ahead < 60 && lat < 1.9) { const g = ahead - 4.4; if (g < gap) { gap = Math.max(0.1, g); dv = c.v - Math.max(0, player.v * Math.cos(player.yaw - P.yaw)); } }
      // IDM
      const sStar = IDM.s0 + Math.max(0, c.v * IDM.T + c.v * dv / (2 * Math.sqrt(IDM.a * IDM.b)));
      let acc = IDM.a * (1 - Math.pow(c.v / Math.max(1, v0), IDM.delta) - (gap < 1e8 ? (sStar / Math.max(0.1, gap)) ** 2 : 0));
      acc = Math.max(-8, acc);
      c.brake = acc < -0.6;
      c.v = hold ? 0 : Math.max(0, c.v + acc * dt);
      c.s += c.v * dt;
      if (c.jx) { if (c.s >= c.jx.len) { const n = c.jx.next; c.s = c.s - c.jx.len; c.e = n.e; c.dir = n.dir; c.k = n.k; c.jx = null; } }
      else {
        const thr = c.e.L - STOP_BACK;   // 停止線を越えた瞬間の信号の色を記録（確認用）
        if (c.s >= thr && c.s - c.v * dt < thr) { const col = sigColor(c, t); if (col) { stats.sigEntries++; if (col === 'red') { stats.redEntries++; (stats.log = stats.log || []).push({ v: +(c.v * 3.6).toFixed(1), L: Math.round(c.e.L), age: +((t - (c.born || 0))).toFixed(1) }); } } }
        if (c.s >= c.e.L) { c.s -= c.e.L; enterJunction(c); }
      }
    });
    // 描画
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    cars.forEach(c => { c.P = pose(c); c.d2 = (c.P.x - player.x) ** 2 + (c.P.z - player.z) ** 2; });
    const order = cars.slice().sort((a, b) => a.d2 - b.d2);
    types.forEach(T => { T.nn = 0; T.nf = 0; });
    order.forEach((c, r) => {
      if (c.d2 > FAR * FAR) return;
      const P = c.P, T = c.T, near = r < NEAR && c.d2 < 90 * 90, ims = near ? T.nearIM : T.farIM, i = near ? T.nn++ : T.nf++;
      Q.setFromAxisAngle(Y, P.yaw); V.set(P.x, P.y + 0.02, P.z); M.compose(V, Q, S1);
      ims.forEach(p => { p.im.setMatrixAt(i, M); if (p.paint) p.im.setColorAt(i, col.setHex(c.color)); });
    });
    types.forEach(T => {
      T.nearIM.forEach(p => { p.im.count = T.nn; p.im.visible = T.nn > 0; }); T.farIM.forEach(p => { p.im.count = T.nf; p.im.visible = T.nf > 0; });
      T.nearIM.concat(T.farIM).forEach(p => { if (!p.im.visible) return; p.im.instanceMatrix.needsUpdate = true; if (p.im.instanceColor) p.im.instanceColor.needsUpdate = true; });
    });
  }
  return { cars, step, stats };
}
