/*
 * vehicle.js — 自由走行の車両物理（物理エンジンを使わない自前の車両モデル）。
 * 平面の 2 輪モデル（前後の軸）に、簡易マジックフォーミュラのタイヤ、荷重移動、駆動系、空気抵抗、ABS / TCS を入れる。
 * 高さと傾きは、4 輪の接地点の高さ（地面の高さ関数）から求める。固定刻み（1/120 秒）で進める。
 */
const G = 9.81;
export function makeCar(spec) {
  const s = Object.assign({
    mass: 1300, wb: 2.6, cgF: 0.47, track: 1.52, cgH: 0.52, Iz: 1900,
    power: 120e3, maxRpm: 7000, idleRpm: 900, gears: [3.4, 2.1, 1.45, 1.1, 0.9, 0.75], final: 4.1, wheelR: 0.31,
    mu: 1.05, B: 10, C: 1.9, E: 0.97, cd: 0.33, area: 2.1, rr: 0.012, brake: 1.0, drive: 'fr', steerMax: 0.62
  }, spec || {});
  const a = s.wb * (1 - s.cgF), b = s.wb * s.cgF;   // 重心から前軸・後軸まで
  const st = { x: 0, z: 0, y: 0, yaw: 0, vx: 0, vy: 0, r: 0, steer: 0, gear: 1, rpm: s.idleRpm, pitch: 0, roll: 0, slipF: 0, slipR: 0, ax: 0, ay: 0, abs: false, tcs: false, onRoad: true, contact: 0 };
  function tire(alpha, Fz, mu) { const x = alpha; return -mu * Fz * Math.sin(s.C * Math.atan(s.B * x - s.E * (s.B * x - Math.atan(s.B * x)))); }
  function step(dt, c, ground) {
    // c: { steer -1..1, throttle 0..1, brake 0..1, hand 0..1 }  ground(x,z) → { y, mu, drag }
    const speed = Math.hypot(st.vx, st.vy);
    const gr = ground(st.x, st.z), mu = s.mu * (gr.mu || 1);
    // 速度に応じてハンドルの切れ角を減らす（実車の操舵感に近づける）
    const steerTarget = c.steer * s.steerMax / (1 + speed * speed / 900);
    st.steer += (steerTarget - st.steer) * Math.min(1, dt * 8);
    // 荷重（静的 + 加減速による前後移動）
    const Wt = s.mass * G, dFz = s.mass * st.ax * s.cgH / s.wb;
    const FzF = Math.max(200, Wt * b / s.wb - dFz), FzR = Math.max(200, Wt * a / s.wb + dFz);
    // スリップ角
    const vxs = Math.max(1.5, Math.abs(st.vx)) * Math.sign(st.vx || 1);
    const aF = Math.atan2(st.vy + a * st.r, vxs) - st.steer * Math.sign(st.vx || 1);
    const aR = Math.atan2(st.vy - b * st.r, vxs);
    st.slipF = aF; st.slipR = aR;
    // 駆動・制動
    const ratio = s.gears[st.gear - 1] * s.final;
    const wheelRpm = Math.abs(st.vx) / s.wheelR * 60 / (2 * Math.PI);
    st.rpm = Math.max(s.idleRpm, Math.min(s.maxRpm * 1.02, wheelRpm * ratio));
    if (st.rpm > s.maxRpm * 0.93 && st.gear < s.gears.length) st.gear++;
    else if (st.gear > 1 && st.rpm < s.maxRpm * 0.42) st.gear--;
    const torqueCurve = 0.62 + 0.38 * Math.sin(Math.min(1, st.rpm / s.maxRpm) * Math.PI * 0.95);
    let Fdrive = c.throttle * s.power / Math.max(4, Math.abs(st.vx)) * torqueCurve;
    Fdrive = Math.min(Fdrive, c.throttle * 9000 * ratio / 14);
    const driveFz = s.drive === 'ff' ? FzF : s.drive === '4wd' ? FzF + FzR : FzR;
    st.tcs = false;
    if (Fdrive > mu * driveFz * 0.95) { Fdrive = mu * driveFz * 0.95; st.tcs = true; }   // TCS
    let Fbrake = c.brake * s.brake * mu * Wt * 0.95;
    st.abs = c.brake > 0.6 && speed > 3;
    if (c.reverse) { Fdrive = -c.throttle * 3500; }
    const Fdrag = 0.5 * 1.2 * s.cd * s.area * st.vx * Math.abs(st.vx) + s.rr * Wt * Math.sign(st.vx) + (gr.drag || 0) * st.vx * s.mass;
    // 横力（摩擦円: 前後の力を使うほど横の力は減る）
    const usedR = Math.min(0.95, Math.abs(Fdrive) / (mu * FzR + 1));
    let FyF = tire(aF, FzF, mu), FyR = tire(aR, FzR, mu) * Math.sqrt(1 - usedR * usedR);
    if (c.hand > 0) FyR *= 1 - 0.7 * c.hand;
    const sgn = Math.sign(st.vx) || 1;
    let Fx = Fdrive - Fdrag - Fbrake * sgn - FyF * Math.sin(st.steer);
    if (Math.abs(st.vx) < 0.5 && c.throttle < 0.05 && !c.reverse) { Fx = -st.vx * s.mass * 6; }
    const Fy = FyF * Math.cos(st.steer) + FyR;
    const ax = Fx / s.mass + st.vy * st.r, ay = Fy / s.mass - st.vx * st.r;
    st.vx += ax * dt; st.vy += ay * dt;
    if (speed < 0.6 && Math.abs(st.r) < 0.5) { st.vy *= 0.8; }
    st.ax = Fx / s.mass; st.ay = Fy / s.mass;
    st.r += (a * FyF * Math.cos(st.steer) - b * FyR) / s.Iz * dt;
    if (speed < 1) st.r *= 0.7;
    st.yaw += st.r * dt;
    // 世界座標へ（前 = (sin yaw, cos yaw)、x 東・z 南）
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    st.x += (fx * st.vx + fz * st.vy) * dt; st.z += (fz * st.vx - fx * st.vy) * dt;
    // 4 輪の高さから、車体の高さ・縦と横の傾き
    const rx = fz, rz = -fx, hl = s.wb / 2, ht = s.track / 2;
    const hF = (ground(st.x + fx * hl + rx * ht, st.z + fz * hl + rz * ht).y + ground(st.x + fx * hl - rx * ht, st.z + fz * hl - rz * ht).y) / 2;
    const hB = (ground(st.x - fx * hl + rx * ht, st.z - fz * hl + rz * ht).y + ground(st.x - fx * hl - rx * ht, st.z - fz * hl - rz * ht).y) / 2;
    const hR = (ground(st.x + rx * ht, st.z + rz * ht).y), hL = (ground(st.x - rx * ht, st.z - rz * ht).y);
    st.y = (hF + hB) / 2;
    st.pitch += ((Math.atan2(hF - hB, s.wb) - st.ax * 0.004) - st.pitch) * Math.min(1, dt * 10);
    st.roll += ((Math.atan2(hR - hL, s.track) + st.ay * 0.006) - st.roll) * Math.min(1, dt * 10);
  }
  return { s, st, step, kmh: () => Math.round(Math.hypot(st.vx, st.vy) * 3.6) };
}

/** 建物の外形（xz の凸包）にぶつかったら押し戻す */
export function makeColliders(B) {
  const n = B.info.length, pts = Array.from({ length: n }, () => []);
  for (let v = 0; v < B.bid.length; v++) { const k = B.bid[v]; if (pts[k].length < 400 || (v % 3 === 0)) pts[k].push([B.pos[v * 3], B.pos[v * 3 + 2]]); }
  const hulls = pts.map(p => hull(p)), grid = new Map(), C = 40;
  hulls.forEach((h, k) => {
    if (h.length < 3) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; h.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
    for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++) for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++) { const key = gx + ',' + gz; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k); }
  });
  return function collide(st, rad) {
    const list = grid.get(Math.floor(st.x / C) + ',' + Math.floor(st.z / C)); if (!list) return 0;
    let hit = 0;
    list.forEach(k => {
      const h = hulls[k]; let inside = true, best = Infinity, nx = 0, nz = 0;
      for (let i = 0; i < h.length; i++) {
        const a = h[i], b = h[(i + 1) % h.length], ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez) || 1;
        const ox = ez / el, oz = -ex / el;   // 外向き（凸包は反時計回り）
        const d = (st.x - a[0]) * ox + (st.z - a[1]) * oz;
        if (d > rad) { inside = false; break; }
        if (rad - d < best) { best = rad - d; nx = ox; nz = oz; }
      }
      if (inside && best < 6) {
        st.x += nx * best; st.z += nz * best;
        const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
        const vwx = fx * st.vx + fz * st.vy, vwz = fz * st.vx - fx * st.vy, vn = vwx * nx + vwz * nz;
        if (vn < 0) { const rx2 = vwx - (1.4 * vn) * nx, rz2 = vwz - (1.4 * vn) * nz; st.vx = (rx2 * fx + rz2 * fz) * 0.8; st.vy = (rx2 * fz - rz2 * fx) * 0.8; st.r *= 0.5; hit = Math.max(hit, -vn); }
      }
    });
    return hit;
  };
}
function hull(P) {
  if (P.length < 3) return P;
  P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
