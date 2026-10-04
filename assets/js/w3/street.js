/*
 * street.js — バス停（標識柱・時刻表・上屋・ベンチ）と、駐車場の設備（車止め・ロック板・精算機・ゲート・P の看板）。
 * 標識の板（バス停の名前・時刻表・P）は、ほかの標識と同じ画像（world.js の標識の画像）に描いて、同じ描画にまとめる。
 * 箱の部品は材質ごとに 1 つのインスタンス描画にし、カメラの周り（NEAR_R）の物だけを並べる。
 */
import * as THREE from 'three';

const NEAR_R = { conc: 60, flap: 60, metal: 120, glass: 150 };   // これより遠くの小物は描かない（車止め・ロック板は 60m 先で 2 画素ほど）
const hsh = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';

/* --- 板の絵（256 × 256） --- */
function drawStopPlate(g, name) {
  // 丸い板: 外周は濃い赤、上は赤地に白いバスの絵、下は白地に停留所名
  g.save(); g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fillStyle = '#9e1424'; g.fill();
  g.beginPath(); g.arc(128, 128, 114, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.clip();
  g.fillStyle = '#c8172c'; g.fillRect(0, 0, 256, 104);
  // バスの絵（横から）
  g.fillStyle = '#fff'; const r = (x, y, w, h, rr) => { g.beginPath(); g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + h, rr); g.arcTo(x + w, y + h, x, y + h, rr); g.arcTo(x, y + h, x, y, rr); g.arcTo(x, y, x + w, y, rr); g.closePath(); g.fill(); };
  r(70, 34, 116, 52, 9);
  g.fillStyle = '#c8172c'; for (let k = 0; k < 4; k++) g.fillRect(80 + k * 24, 42, 18, 18); g.fillRect(170, 42, 9, 30);
  g.beginPath(); g.arc(94, 86, 9, 0, Math.PI * 2); g.arc(160, 86, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(94, 86, 4, 0, Math.PI * 2); g.arc(160, 86, 4, 0, Math.PI * 2); g.fill();
  g.restore();
  // 停留所名（幅に合わせて縮める）
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fs = name.length <= 3 ? 50 : name.length <= 5 ? 40 : name.length <= 7 ? 31 : 25;
  g.font = '800 ' + fs + 'px ' + FONT; const w = g.measureText(name).width, mw = 200;
  g.save(); g.translate(128, 150); if (w > mw) g.scale(mw / w, 1); g.fillText(name, 0, 0); g.restore();
  g.fillStyle = '#555'; g.font = '700 21px ' + FONT; g.fillText('バスのりば', 128, 200);
}
function drawTimetable(g) {
  // 時刻表の箱（白地に表の線と細かい数字）。板の縦横比 0.34 : 0.46 に引き伸ばされる
  g.fillStyle = '#e9ecef'; g.fillRect(4, 4, 248, 248); g.strokeStyle = '#2b3a55'; g.lineWidth = 6; g.strokeRect(7, 7, 242, 242);
  g.fillStyle = '#2b3a55'; g.fillRect(7, 7, 242, 34); g.fillStyle = '#fff'; g.font = '700 22px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('時刻表', 128, 25);
  g.strokeStyle = '#8a95a5'; g.lineWidth = 1.5;
  for (let y = 56; y < 240; y += 14) { g.beginPath(); g.moveTo(14, y); g.lineTo(242, y); g.stroke(); }
  g.beginPath(); g.moveTo(46, 44); g.lineTo(46, 242); g.moveTo(144, 44); g.lineTo(144, 242); g.stroke();
  g.fillStyle = '#333'; g.font = '600 10px Arial,sans-serif'; g.textAlign = 'left';
  for (let k = 0, h = 6; k < 13; k++, h++) { const y = 50 + k * 14; g.fillText(String(h), 20, y); for (let m = 0; m < 4; m++) if (hsh(k, m) < 0.8) g.fillText(String((m * 15 + (k * 7) % 13) % 60).padStart(2, '0'), 52 + m * 22, y); for (let m = 0; m < 4; m++) if (hsh(m, k) < 0.6) g.fillText(String((m * 17 + (k * 5) % 11) % 60).padStart(2, '0'), 150 + m * 22, y); }
}
function drawParkSign(g) {
  // 駐車場の案内（青地に白の P、下に 24H と空車の表示）
  g.fillStyle = '#fff'; g.fillRect(2, 2, 252, 252); g.fillStyle = '#1d4f9c'; g.fillRect(10, 10, 236, 236);
  g.fillStyle = '#fff'; g.font = '900 170px Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 128, 104);
  g.fillStyle = '#0d2c5c'; g.fillRect(24, 186, 208, 48);
  g.fillStyle = '#fff'; g.font = '800 30px ' + FONT; g.fillText('24H', 82, 211);
  g.fillStyle = '#3ddc6a'; g.font = '900 34px ' + FONT; g.fillText('空', 182, 211);
}

/* --- カメラの周りだけを並べるインスタンス描画 --- */
function nearSet(group, geo, mat, items, shadow, R) {
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, items.length); im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
  im.setColorAt(0, new THREE.Color()); group.add(im);
  let lx = Infinity, lz = Infinity;
  return {
    im,
    update(cx, cz, force) {
      if (!force && Math.hypot(cx - lx, cz - lz) < 6) return;   // 6m 動くごとに並べ直す
      lx = cx; lz = cz; let n = 0;
      for (const it of items) {
        const dx = it.x - cx, dz = it.z - cz; if (dx * dx + dz * dz > R * R) continue;
        im.setMatrixAt(n, it.m); im.setColorAt(n, it.c); n++;
      }
      im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  };
}

/**
 * ctx: { W, net, terr, onRoadPt, walkG, WALK_H, group, atlas: { g, rectUV, cell() }, extra }
 *   atlas.cell(): 256 × 256 の空いた場所 [x, y] を返す（無ければ null）
 *   extra: 標識の配列（ここに板を足す）
 * 返り値: { update(cx, cz), stops, gates }
 */
export function buildStreet(ctx) {
  const { W, net, terr, onRoadPt, walkG, WALK_H, atlas, extra } = ctx;
  const parts = { conc: [], flap: [], metal: [], glass: [] }, arms = [];
  const M = new THREE.Matrix4(), col = h => new THREE.Color(h);
  // 部品を置く: 中心 (x, y, z)、横の向き (ux, uz)、大きさ (sx, sy, sz)。y は箱の下端
  const box = (set, x, y, z, ux, uz, sx, sy, sz, c) => {
    const m = new THREE.Matrix4().set(ux * sx, 0, -uz * sz, x, 0, sy, 0, y + sy / 2, uz * sx, 0, ux * sz, z, 0, 0, 0, 1);
    parts[set].push({ x, z, m, c: col(c) });
  };
  const cell = (fn) => { const p = atlas.cell(); if (!p) return null; atlas.g.save(); atlas.g.translate(p[0], p[1]); atlas.g.clearRect(0, 0, 256, 256); fn(atlas.g); atlas.g.restore(); return atlas.rectUV(p[0] + 2, p[1] + 2, 252, 252); };

  /* --- バス停 --- */
  const S = (W.stops && W.stops.stops) || [], plateUV = new Map(), ttUV = S.length ? cell(drawTimetable) : null;
  const edges = net.edges.filter(e => e.line && e.line.length > 1 && e.pr && !e.pr.tunnel && !e.pr.bridge);
  const stops = [];
  S.forEach(([sx, sz, name, shel, bench]) => {
    // 一番近い道路の区間
    let best = null, bd = 30;
    edges.forEach(e => { const L = e.line; for (let i = 0; i + 1 < L.length; i++) {
      const ax = L[i][0], az = L[i][1], bx = L[i + 1][0], bz = L[i + 1][1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; if (l2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sz - az) * dz) / l2)), qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(sx - qx, sz - qz);
      if (d < bd) { bd = d; const l = Math.sqrt(l2); best = { e, qx, qz, tx: dx / l, tz: dz / l, d }; }
    } });
    if (!best) return;
    const { e, qx, qz, tx, tz } = best, lx = tz, lz = -tx;   // 進む向き t の左
    const side = (sx - qx) * lx + (sz - qz) * lz;
    const nx = side >= -0.5 ? lx : -lx, nz = side >= -0.5 ? lz : -lz;   // バス停の側（道路の中心線の上なら t の左）
    const trx = side >= -0.5 ? tx : -tx, trz = side >= -0.5 ? tz : -tz;   // その側を走るバスの向き（左側通行）
    const hw = e.pr.hw || 3;
    let curb = null, walk = false;
    for (let o = Math.max(0.5, hw - 1); o < hw + 9; o += 0.25) { const x = qx + nx * o, z = qz + nz * o; if (walkG.at(x, z) && !onRoadPt(x, z)) { curb = o; walk = true; break; } }
    if (curb === null) for (let o = hw; o < hw + 9; o += 0.25) { const x = qx + nx * o, z = qz + nz * o; if (!onRoadPt(x, z)) { curb = o + 0.3; break; } }
    if (curb === null) return;
    let depth = 0; if (walk) while (depth < 8 && walkG.at(qx + nx * (curb + depth + 0.25), qz + nz * (curb + depth + 0.25))) depth += 0.25;
    const px = qx + nx * (curb + 0.45), pz = qz + nz * (curb + 0.45), gy = terr.atRoad(px, pz) + (walk ? WALK_H : 0);
    // 標識柱（丸い板は近づくバスの方を向く）と時刻表
    let uv = plateUV.get(name);
    if (uv === undefined) { uv = cell(g => drawStopPlate(g, name)); plateUV.set(name, uv); }
    const yaw = Math.atan2(-trx, -trz);
    if (uv) extra.push({ x: px, z: pz, y: gy, yaw, uv, sw: 0.6, sh: 0.6, h: 2.15, poleR: 1.5 });
    if (ttUV) extra.push({ x: px - trx * 0.045, z: pz - trz * 0.045, y: gy, yaw, uv: ttUV, sw: 0.34, sh: 0.46, h: 1.3, poleR: 0 });
    box('conc', px, gy, pz, trx, trz, 0.46, 0.1, 0.46, '#8d8b86');   // 置き台
    // 上屋: OSM で屋根ありのもの、または幅の広い歩道の大きな道路の停留所。歩道の奥行きが 2.4m 以上の所だけ
    const wantShel = shel || (depth >= 3.2 && e.pr.rank <= 3 && hsh(px, pz) < 0.75);
    const isShel = wantShel && depth >= 2.4;
    if (isShel) {
      // 横 = 進む向き、奥 = 道路から離れる向き。標識柱の 3.5m 手前（バスの来る側）に置く
      const off = Math.min(depth - 1.35, 2.55), ux = trx, uz = trz, cx0 = px - trx * 3.6 + nx * off, cz0 = pz - trz * 3.6 + nz * off;
      const at = (a, b) => { const x = cx0 + ux * a + nx * b, z = cz0 + uz * a + nz * b; return [x, terr.atRoad(x, z) + WALK_H, z]; };   // b は道路から離れる向き
      const y0 = at(0, 0)[1];
      [[-1.65, 0.62], [1.65, 0.62]].forEach(([a, b]) => { const p = at(a, b); box('metal', p[0], y0, p[2], ux, uz, 0.08, 2.42, 0.08, '#5d6268'); });   // 柱（奥）
      { const p = at(0, 0.05); box('metal', p[0], y0 + 2.42, p[2], ux, uz, 3.7, 0.07, 1.6, '#cfd3d6'); }   // 屋根
      { const p = at(0, -0.74); box('metal', p[0], y0 + 2.3, p[2], ux, uz, 3.7, 0.2, 0.05, '#2f5d8c'); }   // 屋根の前の帯
      { const p = at(0, 0.66); box('glass', p[0], y0 + 0.25, p[2], ux, uz, 3.25, 1.95, 0.02, '#cfe0e8'); }   // 奥のガラス
      { const p = at(1.62, 0.2); box('glass', p[0], y0 + 0.25, p[2], -uz, ux, 0.9, 1.95, 0.02, '#cfe0e8'); }   // 横のガラス
      { const p = at(-0.3, 0.38); box('metal', p[0], y0 + 0.41, p[2], ux, uz, 2.0, 0.04, 0.36, '#8b6a4a'); }   // ベンチの座面
      [-1.15, 0.55].forEach(a => { const p = at(a, 0.38); box('metal', p[0], y0, p[2], ux, uz, 0.05, 0.41, 0.3, '#3d4146'); });
    } else if (bench) {
      const bx0 = px - trx * 1.6 + nx * 0.5, bz0 = pz - trz * 1.6 + nz * 0.5, y0 = terr.atRoad(bx0, bz0) + (walk ? WALK_H : 0);
      box('metal', bx0, y0 + 0.41, bz0, trx, trz, 1.6, 0.04, 0.38, '#8b6a4a');
      box('metal', bx0 + nx * 0.2, y0 + 0.47, bz0 + nz * 0.2, trx, trz, 1.6, 0.3, 0.03, '#8b6a4a');
      [-0.65, 0.65].forEach(a => box('metal', bx0 + trx * a, y0, bz0 + trz * a, trx, trz, 0.05, 0.41, 0.34, '#3d4146'));
    }
    stops.push({ x: +px.toFixed(1), z: +pz.toFixed(1), name, shelter: isShel ? 1 : 0 });
  });

  /* --- 駐車場の設備 --- */
  const PK = W.parking, gates = [];
  let parkUV = null;
  if (PK && PK.lots) {
    const q = PK.q, gY = (x, z) => terr.at(x, z) - 0.09;
    PK.lots.forEach(lot => {
      const st = lot.stalls || [], kind = lot.kind || 0;
      const h0 = st.length ? hsh(st[0], st[1]) : 0, wheel = kind > 0 || h0 < 0.6, yel = h0 < 0.3;
      for (let i = 0; i < st.length; i += 3) {
        const x = st[i] * q, z = st[i + 1] * q, a = st[i + 2] / 100, ax = Math.cos(a), az = Math.sin(a), ux = -az, uz = ax;
        if (wheel) [-0.55, 0.55].forEach(o => { const wx = x + ax * 1.8 + ux * o, wz = z + az * 1.8 + uz * o; box('conc', wx, gY(wx, wz), wz, ux, uz, 0.6, 0.1, 0.15, yel ? '#d9a91a' : '#9a978f'); });   // 車止め（奥から 0.7m）
        if (kind === 1) { const fx = x + ax * 0.15, fz = z + az * 0.15; box('flap', fx, gY(fx, fz), fz, ux, uz, 0.42, 0.06, 0.95, '#3a3d42'); box('flap', fx - ax * 0.12, gY(fx, fz) + 0.06, fz - az * 0.12, ux, uz, 0.36, 0.035, 0.55, '#d8b11c'); }   // ロック板
      }
      if (!lot.ent || kind === 0) return;
      const ex = lot.ent[0] * q, ez = lot.ent[1] * q, ea = lot.ent[2] / 100, w = lot.ent[3] / 10, nx = Math.cos(ea), nz = Math.sin(ea), lx = nz, lz = -nx;   // n: 中へ、l: 入る車の左
      // P の看板（出入口の脇、道路の方を向く）
      if (parkUV === null) parkUV = cell(drawParkSign) || false;
      const sx = ex + lx * Math.min(w / 2, 5) + nx * 0.6, sz = ez + lz * Math.min(w / 2, 5) + nz * 0.6;
      if (parkUV) extra.push({ x: sx, z: sz, y: gY(sx, sz) + 0.09, yaw: Math.atan2(-nx, -nz), uv: parkUV, sw: 0.85, sh: 0.85, h: 2.5, poleR: 2.2 });
      if (kind === 1) {
        // 精算機（出入口の脇、中に 1.5m）
        const mx = ex - lx * Math.min(w / 2 - 0.6, 4) + nx * 1.5, mz = ez - lz * Math.min(w / 2 - 0.6, 4) + nz * 1.5, y = gY(mx, mz);
        payMachine(mx, y, mz, lx, lz);
        return;
      }
      // ゲート式: 入口と出口の 2 車線、間に島（発券機・精算機・開閉バー）。外形から 3m 中
      const gx = ex + nx * 3, gz = ez + nz * 3, y = gY(gx, gz);
      box('conc', gx, y, gz, lx, lz, 0.9, 0.15, 3.2, '#a9a69e');   // 島
      // 入口（島の左側の車線）: 発券機は運転席の右（= 島の上、左寄り）
      const tkx = gx + lx * 0.22 - nx * 0.8, tkz = gz + lz * 0.22 - nz * 0.8;
      box('metal', tkx, y + 0.15, tkz, lx, lz, 0.42, 1.25, 0.5, '#e8e6df'); box('metal', tkx + lx * 0.215, y + 0.95, tkz + lz * 0.215, nx, nz, 0.3, 0.32, 0.01, '#2a2d33'); box('metal', tkx, y + 1.4, tkz, lx, lz, 0.46, 0.14, 0.54, '#d8b11c');
      // 出口: 精算機は島の右寄り（出る車の運転席の右）
      payMachine(gx - lx * 0.25 + nx * 0.8, y + 0.15, gz - lz * 0.25 + nz * 0.8, -lx, -lz);
      // 開閉バーの箱と腕: 入る車は発券機の先、出る車は精算機の先。腕は島から車線の上へ
      [[1, -0.2], [-1, 0.2]].forEach(([s, o]) => {
        const hx = gx + lx * 0.3 * s + nx * o, hz = gz + lz * 0.3 * s + nz * o;
        box('metal', hx, y + 0.15, hz, lx, lz, 0.3, 0.95, 0.3, '#e8e6df');
        arms.push({ x: hx + lx * 0.15 * s, y: y + 0.15 + 0.85, z: hz + lz * 0.15 * s, ux: lx * s, uz: lz * s, len: 3.0, open: 0 });
      });
      gates.push({ x: +gx.toFixed(1), z: +gz.toFixed(1) });
    });
  }
  function payMachine(x, y, z, fx, fz) {   // 前（f）へ向いた精算機
    const ux = -fz, uz = fx;
    box('metal', x, y, z, ux, uz, 0.6, 1.45, 0.42, '#e8e6df');
    box('metal', x + fx * 0.215, y + 0.75, z + fz * 0.215, ux, uz, 0.46, 0.5, 0.01, '#2a2d33');
    box('metal', x + fx * 0.215, y + 0.45, z + fz * 0.215, ux, uz, 0.2, 0.12, 0.01, '#6b7480');
    box('metal', x, y + 1.45, z, ux, uz, 0.64, 0.16, 0.46, '#d8b11c');
  }

  /* --- 描画 --- */
  const bg = new THREE.BoxGeometry(1, 1, 1);
  const conc = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, name: 'street-conc' });
  const metal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.35, name: 'street-metal' });
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
  // box() の行列は箱の中心を y + sy/2 に置くので、形は中心のままでよい。低い物（車止め・ロック板・置き台）は影を落とさない（環境光の遮蔽で足りる）
  const sets = [nearSet(ctx.group, bg, conc, parts.conc, false, NEAR_R.conc), nearSet(ctx.group, bg, metal, parts.flap, false, NEAR_R.flap), nearSet(ctx.group, bg, metal, parts.metal, true, NEAR_R.metal), nearSet(ctx.group, bg, glass, parts.glass, false, NEAR_R.glass)].filter(Boolean);
  // 開閉バー: 黄と黒の縞（6 区切り）。車が近づくと上がる
  let armIM = null;
  if (arms.length) {
    armIM = new THREE.InstancedMesh(bg, metal, arms.length * 6); armIM.castShadow = true; armIM.frustumCulled = false;
    for (let k = 0; k < arms.length * 6; k++) armIM.setColorAt(k, col(k % 2 ? '#1d1d1f' : '#e7c21b'));
    ctx.group.add(armIM);
  }
  const R4 = new THREE.Matrix4(), T4 = new THREE.Matrix4(), S4 = new THREE.Matrix4();
  function placeArms(cx, cz, dt) {
    arms.forEach((a, i) => {
      const near = Math.hypot(a.x - cx, a.z - cz) < 9;
      a.open += ((near ? 1 : 0) - a.open) * Math.min(1, dt * 3);
      const ang = a.open * Math.PI * 0.47;   // 腕の付け根で上へ回す
      const yaw = Math.atan2(-a.uz, a.ux);
      for (let k = 0; k < 6; k++) {
        const seg = a.len / 6;
        T4.makeTranslation(a.x, a.y, a.z); R4.makeRotationY(yaw); M.multiplyMatrices(T4, R4);
        R4.makeRotationZ(ang); M.multiply(R4);
        S4.compose(new THREE.Vector3(seg * (k + 0.5), 0, 0), new THREE.Quaternion(), new THREE.Vector3(seg, 0.06, 0.05)); M.multiply(S4);
        armIM.setMatrixAt(i * 6 + k, M);
      }
    });
    armIM.instanceMatrix.needsUpdate = true;
  }
  let lastT = performance.now();
  if (armIM) placeArms(0, 0, 1);
  return {
    stops, gates, counts: { conc: parts.conc.length, flap: parts.flap.length, metal: parts.metal.length, glass: parts.glass.length, arms: arms.length },
    update(cx, cz) {
      sets.forEach(s => s.update(cx, cz));
      if (armIM) { const t = performance.now(), dt = Math.min(0.1, (t - lastT) / 1000); lastT = t; placeArms(cx, cz, dt); }
    }
  };
}
