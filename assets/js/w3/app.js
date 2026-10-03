/*
 * app.js — 3D 自由走行（試作: 浜松駅周辺 2.4km 四方）。
 * 地形・航空写真・道路網・路面表示・PLATEAU の建物・信号・車両物理・追従カメラ・HUD。
 */
import * as THREE from 'three';
import { loadWorld } from './data.js';
import { buildWorld, buildSky } from './world.js';
import { makeCar, makeColliders } from './vehicle.js';
import { makeGrid } from './grid.js';
import { loadImpostor, plantTrees } from './trees.js';
import { buildProps } from './props.js';
import { makeTraffic } from './traffic.js';

/** 品質の段階（GPU 名で自動判定。iPhone 17 は高、Intel 内蔵は中） */
export function detectGfx(renderer, force) {
  let name = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { /* ignore */ }
  const low = /SwiftShader|llvmpipe|Software/i.test(name), intel = /Intel/i.test(name), apple = /Apple/i.test(name);
  const tier = force || (low ? 'low' : intel ? 'mid' : apple ? 'high' : 'high');
  const T = { low: { pr: 0.75, shadows: 0, far: 1400 }, mid: { pr: 0.85, shadows: 1, far: 1500 }, high: { pr: 1, shadows: 2, far: 2600 } }[tier];
  return Object.assign({ tier, gpu: name, orthoZ: 17 }, T);
}

function decodeCar(D) {
  const dec = (b64, Tp) => { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Tp(u8.buffer); };
  const mats = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xb01826, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x10161c, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.55 }),
    head: new THREE.MeshStandardMaterial({ color: 0xf2f2ea, emissive: 0xfff3d6, emissiveIntensity: 0.6 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x700a0a, emissive: 0xff1a10, emissiveIntensity: 0.4 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xc87a10, emissive: 0x402000 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.25 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.12 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7 })
  };
  const root = new THREE.Group(), g = new THREE.Group();
  let headZ = 0, headN = 0;
  Object.keys(D.groups).forEach(k => {
    const Gp = D.groups[k], P = dec(Gp.p, Int16Array), N = dec(Gp.n, Int8Array), I = dec(Gp.i, Gp.i32 ? Uint32Array : Uint16Array);
    const pos = new Float32Array(P.length), nor = new Float32Array(N.length);
    for (let i = 0; i < P.length; i++) { pos[i] = P[i] / 1000; nor[i] = N[i] / 127; }
    if (k === 'head') for (let i = 2; i < pos.length; i += 3) { headZ += pos[i]; headN++; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(new THREE.BufferAttribute(I, 1));
    const m = new THREE.Mesh(geo, mats[k] || mats.dark); m.castShadow = k !== 'glass'; m.receiveShadow = true; g.add(m);
  });
  if (headN && headZ / headN < 0) g.rotation.y = Math.PI;
  root.add(g);
  return { root, mats };
}

export async function start(container, opt) {
  opt = opt || {};
  const R = window.TB && TB.Race;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opt.capture });
  const gfx = detectGfx(renderer, opt.tier);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * gfx.pr);
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = gfx.shadows > 0; renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(62, 1, 0.3, gfx.far + 400);
  function resize() { const w = container.clientWidth || 960, h = container.clientHeight || 600; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  resize(); window.addEventListener('resize', resize);
  const hud = document.createElement('div'); hud.className = 'w3-hud'; container.appendChild(hud);
  hud.textContent = '読み込み中…（浜松駅周辺の地形・道路・建物）';

  const W = await loadWorld(opt.base || 'assets/data/world/center/');
  const sky = buildSky(scene, renderer, { shadows: gfx.shadows, far: gfx.far, elev: opt.elev, azim: opt.azim });
  const world = buildWorld(scene, W, gfx);
  const T0 = W.terrain, collide = makeColliders(W.bldg, { x0: T0.x0, z0: T0.z0, size: (T0.nx - 1) * T0.cell }, makeGrid, world.roadTris, world.pierTris);
  // 街路樹: 幹線（歩道のある道）の両側の歩道に、約 12m ごと。建物・車道・信号の近くは避ける
  try {
    const imp = await loadImpostor('assets/data/world/props/', 'tree_broadleaf');
    const spots = [], hsh = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
    const sigNear = (x, z) => world.signals.some(s => Math.abs(s.x - x) < 5 && Math.abs(s.z - z) < 5);
    world.net.edges.forEach(e => {
      const pr = e.pr; if (!(pr.walk > 0) || pr.rank > 4 || e.internal || e.hidden) return;
      const L = e.line; let acc = 0, next = 8;
      for (let i = 1; i < L.length; i++) {
        const a = L[i - 1], b = L[i], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
        while (next <= acc + sl) {
          const u = (next - acc) / sl, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, dx = (b[0] - a[0]) / sl, dz = (b[1] - a[1]) / sl;
          [-1, 1].forEach(sd => {
            const off = pr.hw + pr.walk * 0.5, tx = x - dz * off * sd, tz = z + dx * off * sd;
            if (collide.grid.at(tx, tz) || world.onRoadPt(tx, tz) || sigNear(tx, tz)) return;
            const r = hsh(tx, tz);
            spots.push({ x: tx, y: W.terrain.at(tx, tz) + 0.15, z: tz, h: 8 + r * 4, yaw: r * 6.283 });
          });
          next += 11 + hsh(x, z) * 3;
        }
        acc += sl;
      }
    });
    world.trees = plantTrees(scene, imp, spots, { shadows: gfx.shadows > 0 });
    spots.forEach(p => { const r = 0.35; collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z - r, p.x + r, p.z + r); collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z + r, p.x - r, p.z + r); });   // 幹の当たり判定
    world.treeSpots = spots;
  } catch (e) { console.warn('街路樹を読めませんでした', e); }
  // 電柱・電線・街灯（建物・車道・木・信号と重ならない所）
  {
    const T = world.treeSpots || [];
    const free = (x, z) => !collide.grid.at(x, z) && !world.onRoadPt(x, z) && !world.signals.some(s => Math.abs(s.x - x) < 3 && Math.abs(s.z - z) < 3) && !T.some(t => Math.abs(t.x - x) < 2.5 && Math.abs(t.z - z) < 2.5);
    world.props = buildProps(scene, world.net, (x, z) => W.terrain.at(x, z) + 0.15, free, {});
    world.props.poles.concat(world.props.lights).forEach(p => { const r = 0.25; collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z - r, p.x + r, p.z + r); collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z + r, p.x - r, p.z + r); });
  }
  // 車（Khronos Car Concept。高品質なリアル調の車がそろうまでの暫定）
  if (!(TB.RaceRealCars && TB.RaceRealCars.concept)) await new Promise(r => { const s = document.createElement('script'); s.src = 'assets/vendor/real-concept.js'; s.onload = s.onerror = r; document.head.appendChild(s); });
  const carM = TB.RaceRealCars && TB.RaceRealCars.concept ? decodeCar(TB.RaceRealCars.concept) : { root: new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 4.4), new THREE.MeshStandardMaterial({ color: 0xb01826 })) };
  scene.add(carM.root);
  // 一般車（自車の周り 400m に 40 台。低画質は 20 台）
  let traffic = null;
  try {
    const [l1, l2] = await Promise.all(['car_concept_lod1', 'car_concept_lod2'].map(n => fetch('assets/data/world/props/' + n + '.json').then(r => r.json())));
    const near = decodeCar(l1), far = decodeCar(l2);
    traffic = makeTraffic(scene, world.net, { near: { root: near.root, paint: near.mats.paint }, far: { root: far.root, paint: far.mats.paint }, count: gfx.tier === 'low' ? 20 : 40 });
  } catch (e) { console.warn('一般車を読めませんでした', e); }
  function trafficStep(dt) {
    if (!traffic) return;
    const st = car.st;
    traffic.step(dt, simT, { x: st.x, z: st.z, v: Math.hypot(st.vx, st.vy), yaw: st.yaw });
    // 一般車との接触（車体を半径 1.1m の円 2 つで近似）
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    traffic.cars.forEach(c => {
      if (!c.P) return;
      const gx = Math.sin(c.P.yaw), gz = Math.cos(c.P.yaw);
      for (const a of [-1.1, 1.1]) for (const b of [-1.1, 1.1]) {
        const px = st.x + fx * a, pz = st.z + fz * a, qx = c.P.x + gx * b, qz = c.P.z + gz * b, dx = px - qx, dz = pz - qz, d = Math.hypot(dx, dz);
        if (d < 2.0 && d > 1e-3) {
          const push = 2.0 - d, nx = dx / d, nz = dz / d; st.x += nx * push; st.z += nz * push;
          const vwx = fx * st.vx + fz * st.vy, vwz = fz * st.vx - fx * st.vy, vn = vwx * nx + vwz * nz;
          if (vn < 0) { const rx = vwx - 1.4 * vn * nx, rz = vwz - 1.4 * vn * nz; st.vx = (rx * fx + rz * fz) * 0.8; st.vy = (rx * fz - rz * fx) * 0.8; hitT = 0.4; c.v *= 0.3; }
        }
      }
    });
  }
  const car = makeCar(opt.car);
  // 出発: 浜松駅北口の前の道（いちばん近い幹線の上）
  const startAt = opt.start || { x: -40, z: -260 };
  let best = null, bd = Infinity;
  world.net.edges.forEach(e => { if (e.pr.rank > 4) return; e.line.forEach((p, i) => { const d = Math.hypot(p[0] - startAt.x, p[1] - startAt.z); if (d < bd && i < e.line.length - 1) { bd = d; best = { e, i }; } }); });
  if (best) {
    const L = best.e.line, p = L[best.i], q = L[best.i + 1], pr = best.e.pr;
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
    // 左側通行: 進む向き（a→b）の車線は − 側（左）。いちばん左の車線の中央に置く
    const off = -pr.hw + pr.edge + pr.lw * 0.5;
    car.st.x = p[0] + (-dz / l) * off; car.st.z = p[1] + (dx / l) * off; car.st.yaw = Math.atan2(dx, dz);
    if (pr.one && pr.rev) car.st.yaw += Math.PI;
  }
  const ground = (x, z) => ({ y: W.terrain.at(x, z) + 0.06, mu: 1 });
  car.st.y = ground(car.st.x, car.st.z).y;
  // 入力
  const keys = {};
  // Esc: 一時停止（もう一度 Esc で再開、Enter / q で終了）
  let paused = false;
  const pauseEl = document.createElement('div');
  pauseEl.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,10,14,.55);color:#fff;font-size:18px;text-align:center;line-height:2;z-index:5';
  pauseEl.innerHTML = '<div><b style="font-size:28px">一時停止</b><br>Esc / タップで再開　　Enter / Q で終了</div>';
  pauseEl.addEventListener('pointerdown', () => setPause(false));
  container.appendChild(pauseEl);
  function setPause(v) { paused = v; pauseEl.style.display = v ? 'flex' : 'none'; Object.keys(keys).forEach(k => { keys[k] = false; }); last = performance.now(); }
  const onKey = (e, d) => {
    if (d && e.key === 'Escape') { setPause(!paused); return; }
    if (d && paused && (e.key === 'Enter' || e.key === 'q' || e.key === 'Q')) { if (opt.onExit) opt.onExit(); return; }
    keys[e.key] = d;
  };
  const onBlur = () => { Object.keys(keys).forEach(k => { keys[k] = false; }); };
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => { if (document.hidden && !paused) setPause(true); });
  const ctl = { steer: 0, throttle: 0, brake: 0, hand: 0, reverse: false };
  // タッチ操作（スマホ）: 左下にハンドル（左右）、右下にアクセルとブレーキ、その上にサイドブレーキ。アイコンは SVG
  const touch = { left: 0, right: 0, up: 0, down: 0, hand: 0 };
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || opt.touch;
  if (isTouch) {
    const svg = d => '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    const ICON = { left: svg('<path d="M15 5l-7 7 7 7"/>'), right: svg('<path d="M9 5l7 7-7 7"/>'), up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: svg('<rect x="6" y="9" width="12" height="9" rx="2"/><path d="M8 9V6h8v3"/>'), hand: svg('<path d="M12 3v10"/><circle cx="12" cy="17" r="4"/>'), exit: svg('<path d="M10 6l-6 6 6 6M4 12h16"/>') };
    const pad = document.createElement('div'); pad.className = 'w3-pad';
    pad.innerHTML = '<style>.w3-pad b{position:fixed;display:flex;align-items:center;justify-content:center;border-radius:18px;background:rgba(20,24,30,.42);border:1px solid rgba(255,255,255,.28);touch-action:none;user-select:none;-webkit-user-select:none}.w3-pad b.on{background:rgba(255,255,255,.3)}</style>' +
      '<b data-k="left" style="left:16px;bottom:calc(20px + env(safe-area-inset-bottom));width:84px;height:84px">' + ICON.left + '</b>' +
      '<b data-k="right" style="left:112px;bottom:calc(20px + env(safe-area-inset-bottom));width:84px;height:84px">' + ICON.right + '</b>' +
      '<b data-k="down" style="right:112px;bottom:calc(20px + env(safe-area-inset-bottom));width:84px;height:84px">' + ICON.down + '</b>' +
      '<b data-k="up" style="right:16px;bottom:calc(20px + env(safe-area-inset-bottom));width:84px;height:120px">' + ICON.up + '</b>' +
      '<b data-k="hand" style="right:16px;bottom:calc(152px + env(safe-area-inset-bottom));width:84px;height:56px">' + ICON.hand + '</b>' +
      '<b data-k="exit" style="right:16px;top:calc(12px + env(safe-area-inset-top));width:52px;height:52px">' + ICON.exit + '</b>';
    container.appendChild(pad);
    pad.querySelectorAll('b').forEach(b => {
      const k = b.dataset.k;
      const on = e => { e.preventDefault(); if (k === 'exit') { setPause(true); return; } touch[k] = 1; b.classList.add('on'); };
      const offf = e => { e.preventDefault(); touch[k] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', offf); b.addEventListener('pointercancel', offf); b.addEventListener('pointerleave', offf);
    });
  }
  function readInput(dt) {
    const L = keys.ArrowLeft || keys.a || keys.A || touch.left, Rr = keys.ArrowRight || keys.d || keys.D || touch.right;
    const s = (L ? 1 : 0) - (Rr ? 1 : 0);   // 左が +（向きが増える）
    ctl.steer += (s - ctl.steer) * Math.min(1, dt * (s ? 4 : 6));
    const up = keys.ArrowUp || keys.w || keys.W || touch.up, dn = keys.ArrowDown || keys.s || keys.S || touch.down;
    const v = car.st.vx;
    if (dn && v < 0.5) { ctl.reverse = true; ctl.throttle = 1; ctl.brake = 0; }
    else { ctl.reverse = false; ctl.throttle = up ? 1 : 0; ctl.brake = dn ? 1 : 0; }
    if (ctl.reverse && up) { ctl.reverse = false; ctl.throttle = 0; ctl.brake = 1; }
    ctl.hand = keys[' '] || touch.hand ? 1 : 0;
    if (opt.autoDrive) { ctl.throttle = car.kmh() < 40 ? 0.6 : 0; ctl.steer = 0; }
  }
  // 追従カメラ
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let firstCam = true;
  function updateCam(dt) {
    const st = car.st, fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    const back = 6.2 + Math.min(2.5, Math.abs(st.vx) * 0.03), up = 2.1;
    const want = new THREE.Vector3(st.x - fx * back, st.y + up, st.z - fz * back);
    const look = new THREE.Vector3(st.x + fx * 4, st.y + 1.1, st.z + fz * 4);
    if (firstCam) { camPos.copy(want); camLook.copy(look); firstCam = false; }
    camPos.lerp(want, Math.min(1, dt * 6)); camLook.lerp(look, Math.min(1, dt * 10));
    const gy = W.terrain.at(camPos.x, camPos.z) + 0.6; if (camPos.y < gy) camPos.y = gy;
    cam.position.copy(camPos); cam.lookAt(camLook);
    cam.fov = 60 + Math.min(14, Math.hypot(st.vx, st.vy) * 0.25); cam.updateProjectionMatrix();
    // 影は車の周りだけ（太陽の向きに合わせて追う）
    sky.sun.position.set(st.x, st.y, st.z).addScaledVector(sky.sunDir, 400); sky.sun.target.position.set(st.x, st.y, st.z);
  }
  // 信号（race-spec.js の公式の秒数。交差点ごとに位相をずらす）
  function updateSignals(t) {
    // 交差点ごとに周期をずらし、主道路（grp 0）は phase、従道路（grp 1）は crossPhase（全赤を挟むので同時に青にならない）
    world.signals.forEach((s, k) => {
      const ph = R && R.SPEC ? R.SPEC.phaseAt(t + (s.junction * 7.3) % 33, s.art) : { phase: 'green', crossPhase: 'red' };
      world.setSignal(k, s.grp === 0 ? ph.phase : ph.crossPhase);
    });
    world.signalsDone();
  }
  let last = performance.now(), acc = 0, simT = 0, running = true, frames = 0, fpsT = 0, fps = 0, hitT = 0;
  const STEP = 1 / 120;
  function frame(now) {
    if (!running) return;
    // 遅い端末でも実時間で進める（物理は固定刻みで最大 0.25 秒ぶんまで追いつく）
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (paused) { requestAnimationFrame(frame); return; }
    readInput(dt);
    acc += dt;
    while (acc >= STEP) {
      car.step(STEP, ctl, ground);
      const hit = collide(car.st); if (hit > 3) hitT = 0.4;
      acc -= STEP; simT += STEP;
    }
    trafficStep(dt);
    if (hitT > 0) hitT -= dt;
    const st = car.st;
    carM.root.position.set(st.x, st.y, st.z);
    carM.root.rotation.set(0, 0, 0); carM.root.rotateY(st.yaw); carM.root.rotateX(-st.pitch); carM.root.rotateZ(st.roll);
    updateCam(dt); updateSignals(simT);
    renderer.render(scene, cam);
    frames++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    const info = renderer.info.render;
    hud.innerHTML = '<b>' + car.kmh() + '</b> km/h　' + (st.gear) + ' 速' + (st.abs ? '　ABS' : '') + (st.tcs ? '　TCS' : '') + (hitT > 0 ? '　衝突' : '') +
      '<br><small>' + fps + ' fps　描画 ' + info.calls + '　三角形 ' + Math.round(info.triangles / 1000) + 'k　画質 ' + gfx.tier + '</small>' +
      '<br><small>出典: 国土交通省 PLATEAU を加工して作成 / 地理院タイル（航空写真・標高）を加工して作成 / © OpenStreetMap contributors / 車: Khronos glTF Sample Assets「Car Concept」（CC BY 4.0）</small>';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const api = {
    renderer, scene, cam, car, world, gfx, W, collide, traffic,
    stop() {
      running = false;
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', resize); window.removeEventListener('blur', onBlur);
      // GPU の資源（形・材質・テクスチャ・環境マップ）を片付けて、WebGL のコンテキストも手放す
      const seen = new Set();
      scene.traverse(o => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        [].concat(o.material || []).forEach(m => { if (seen.has(m)) return; seen.add(m); Object.values(m).forEach(v => { if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }); m.dispose(); });
      });
      if (scene.environment) scene.environment.dispose();
      if (sky.dispose) sky.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      container.innerHTML = '';
      if (window.W3 === api) window.W3 = null;
    },
    keys, ready: world.orthoReady,
    /** 検証用: ループを止めて、指定秒数ぶん物理を進めてから 1 枚描く */
    freeze() { running = false; },
    tick(sec, c) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { if (c) Object.assign(ctl, c); car.step(STEP, ctl, ground); collide(car.st); simT += STEP; if (i % 4 === 3) trafficStep(STEP * 4); } },
    draw() { const st = car.st; carM.root.position.set(st.x, st.y, st.z); carM.root.rotation.set(0, 0, 0); carM.root.rotateY(st.yaw); carM.root.rotateX(-st.pitch); carM.root.rotateZ(st.roll); firstCam = true; updateCam(1 / 60); updateSignals(simT); renderer.render(scene, cam); return renderer.domElement.toDataURL('image/jpeg', 0.9); },
    pose(x, z, yaw) { car.st.x = x; car.st.z = z; car.st.yaw = yaw; car.st.vx = car.st.vy = car.st.r = 0; firstCam = true; }
  };
  return api;
}
