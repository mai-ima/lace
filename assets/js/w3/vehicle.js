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
    mu: 1.05, B: 10, C: 1.9, E: 0.97, cd: 0.33, area: 2.1, rr: 0.012, brake: 1.0, drive: 'fr', steerMax: 0.62, rearB: 1.5, rearMu: 1.08, esc: true
  }, spec || {});
  const a = s.wb * (1 - s.cgF), b = s.wb * s.cgF;   // 重心から前軸・後軸まで
  const st = { x: 0, z: 0, y: 0, yaw: 0, vx: 0, vy: 0, r: 0, steer: 0, gear: 1, rpm: s.idleRpm, pitch: 0, roll: 0, slipF: 0, slipR: 0, ax: 0, ay: 0, abs: false, tcs: false, esc: false, onRoad: true, contact: 0 };
  // 簡易マジックフォーミュラ。kB は横方向の硬さの倍率（後輪を硬くして、量産車らしい弱いアンダーステアにする）
  function tire(alpha, Fz, mu, kB) { const B = s.B * (kB || 1), x = alpha; return -mu * Fz * Math.sin(s.C * Math.atan(B * x - s.E * (B * x - Math.atan(B * x)))); }
  function step(dt, c, ground) {
    // c: { steer -1..1, throttle 0..1, brake 0..1, hand 0..1 }  ground(x,z) → { y, mu, drag }
    const speed = Math.hypot(st.vx, st.vy);
    const gr = ground(st.x, st.z), mu = s.mu * (gr.mu || 1);
    // 速度に応じてハンドルの切れ角を減らす（実車の操舵感に近づける）
    // 速さに応じて切れ角を減らす（実車はハンドル 1 回転半で、高速では小さく切る。100km/h で全切りでも約 0.15rad）
    const steerTarget = c.steer * s.steerMax / (1 + speed * speed / 250);
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
    if (c.reverse) { Fdrive = st.vx > -20 / 3.6 ? -c.throttle * 3500 * Math.min(1, (20 / 3.6 + st.vx) / 2) : 0; }   // 後退は 20km/h まで
    const Fdrag = 0.5 * 1.2 * s.cd * s.area * st.vx * Math.abs(st.vx) + s.rr * Wt * Math.sign(st.vx) + (gr.drag || 0) * st.vx * s.mass;
    // 横力（摩擦円: 前後の力を使うほど横の力は減る）
    const usedR = Math.min(0.95, Math.abs(Fdrive) / (mu * FzR + 1));
    let FyF = tire(aF, FzF, mu), FyR = tire(aR, FzR, mu * (s.rearMu || 1), s.rearB) * Math.sqrt(1 - usedR * usedR);
    if (c.hand > 0) FyR *= 1 - 0.7 * c.hand;
    const sgn = Math.sign(st.vx) || 1;
    // 低速（5m/s 以下）では、タイヤの横力の式が不安定になるので、幾何学の 2 輪モデル（舵角どおりに曲がる）へ寄せる
    const kin = Math.max(0, Math.min(1, 1 - (speed - 1.5) / 3.5));
    let Fx = Fdrive - Fdrag - Fbrake * sgn - FyF * Math.sin(st.steer) * (1 - kin);
    if (Math.abs(st.vx) < 0.5 && c.throttle < 0.05 && !c.reverse) { Fx = -st.vx * s.mass * 6; }
    const Fy = FyF * Math.cos(st.steer) + FyR;
    const ax = Fx / s.mass + st.vy * st.r, ay = Fy / s.mass - st.vx * st.r;
    st.vx += ax * dt; st.vy += ay * dt;
    if (speed < 0.6 && Math.abs(st.r) < 0.5) { st.vy *= 0.8; }
    st.ax = Fx / s.mass; st.ay = Fy / s.mass;
    st.r += (a * FyF * Math.cos(st.steer) - b * FyR) / s.Iz * dt;
    if (kin > 0) {
      const rK = st.vx * Math.tan(st.steer) / s.wb;
      st.r += (rK - st.r) * kin; st.vy += (rK * b - st.vy) * kin;
    }
    // 横滑り防止（ESC。運転設定で切れる）: 横滑り角が大きいときと、路面の限界を超える向きの変わり方のときに抑える
    st.esc = false;
    if (s.esc !== false && speed > 5) {
      const beta = Math.atan2(st.vy, Math.abs(st.vx)), rMax = mu * G / speed * 1.15;
      if (Math.abs(beta) > 0.1 || Math.abs(st.r) > rMax) {
        st.esc = true;
        const over = beta * st.r < 0;   // 後ろが外へ流れている（オーバーステア）
        const rT = Math.max(-rMax, Math.min(rMax, st.r)) + (over ? beta * 2.0 : 0);
        st.r += (rT - st.r) * Math.min(1, dt * 6);
        st.vy *= 1 - Math.min(1, dt * 1.5);
        st.vx -= Math.sign(st.vx) * Math.min(Math.abs(st.vx), 1.2 * dt) * (Math.abs(beta) > 0.1 ? 1 : 0);
      }
    }
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

/**
 * 建物の当たり判定。建物の下の部分（下端から 3m 以内）の三角形を 0.5m の格子に塗って、実際の外形で判定する
 * （L 字やコの字の建物でも、外形の内側の空きに見えない壁ができない。上空の通路やひさしは当たらない）。
 * 車は車体の形の長方形（8 点）で調べる。
 */
export function makeColliders(B, ext, makeGrid, freeTris, blockTris) {
  const g = makeGrid(ext.x0, ext.z0, ext.size, 0.5), nb = B.info.length, lo = new Float32Array(nb).fill(1e9);
  for (let v = 0; v < B.bid.length; v++) { const k = B.bid[v]; if (B.pos[v * 3 + 1] < lo[k]) lo[k] = B.pos[v * 3 + 1]; }
  const P = B.pos, I = B.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, y0 = lo[B.bid[I[t]]] + 3;
    if (P[a + 1] > y0 || P[b + 1] > y0 || P[c + 1] > y0) continue;
    g.tri(P[a], P[a + 2], P[b], P[b + 2], P[c], P[c + 2]);
  }
  // 車道（OSM）の上は走れることを優先する（バスターミナルの屋根などが地面まで続く立体として入っている所がある）
  if (freeTris) { g.clear = true; freeTris((ax, az, bx, bz, cx, cz) => g.tri(ax, az, bx, bz, cx, cz)); g.clear = false; }
  // 道路の上でも当たるもの（高架橋の橋脚など）
  (blockTris || []).forEach(t => g.tri(t[0], t[1], t[2], t[3], t[4], t[5]));
  const HL = 2.2, HW = 0.88, SAMP = [[HL, HW], [HL, -HW], [-HL, HW], [-HL, -HW], [HL, 0], [-HL, 0], [0, HW], [0, -HW]];
  function collide(st) {
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw), lx = fz, lz = -fx;   // 前と左
    let hit = 0;
    for (let it = 0; it < 3; it++) {
      let best = null;
      for (const [u, w] of SAMP) {
        const e = g.escape(st.x + fx * u + lx * w, st.z + fz * u + lz * w, 2.5);
        if (e && (!best || e.d > best.d)) best = e;
      }
      if (!best) break;
      st.x += best.dx; st.z += best.dz;
      const vwx = fx * st.vx + lx * st.vy, vwz = fz * st.vx + lz * st.vy, vn = vwx * best.nx + vwz * best.nz;
      if (vn < 0) {
        const rx2 = (vwx - 1.3 * vn * best.nx) * 0.85, rz2 = (vwz - 1.3 * vn * best.nz) * 0.85;
        st.vx = rx2 * fx + rz2 * fz; st.vy = rx2 * lx + rz2 * lz; st.r *= 0.5; hit = Math.max(hit, -vn);
      }
    }
    return hit;
  }
  collide.grid = g;
  return collide;
}
