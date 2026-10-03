/*
 * app.js — 3D 自由走行（試作: 浜松駅周辺 2.4km 四方）。
 * 地形・航空写真・道路網・路面表示・PLATEAU の建物・信号・車両物理・追従カメラ・HUD。
 */
import * as THREE from 'three';
import { loadWorld } from './data.js';
import { buildWorld, buildSky } from './world.js';
import { makeCar, makeColliders } from './vehicle.js';

/** 品質の段階（GPU 名で自動判定。iPhone 17 は高、Intel 内蔵は中） */
export function detectGfx(renderer, force) {
  let name = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { /* ignore */ }
  const low = /SwiftShader|llvmpipe|Software/i.test(name), intel = /Intel/i.test(name), apple = /Apple/i.test(name);
  const tier = force || (low ? 'low' : intel ? 'mid' : apple ? 'high' : 'high');
  const T = { low: { pr: 0.75, shadows: 0, far: 1400 }, mid: { pr: 0.85, shadows: 1, far: 2000 }, high: { pr: 1, shadows: 2, far: 2600 } }[tier];
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
  const collide = makeColliders(W.bldg);
  // 車（Khronos Car Concept。高品質なリアル調の車がそろうまでの暫定）
  if (!(TB.RaceRealCars && TB.RaceRealCars.concept)) await new Promise(r => { const s = document.createElement('script'); s.src = 'assets/vendor/real-concept.js'; s.onload = s.onerror = r; document.head.appendChild(s); });
  const carM = TB.RaceRealCars && TB.RaceRealCars.concept ? decodeCar(TB.RaceRealCars.concept) : { root: new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 4.4), new THREE.MeshStandardMaterial({ color: 0xb01826 })) };
  scene.add(carM.root);
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
  // 入力
  const keys = {};
  const onKey = (e, d) => { keys[e.key] = d; if (d && (e.key === 'Escape') && opt.onExit) opt.onExit(); };
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const ctl = { steer: 0, throttle: 0, brake: 0, hand: 0, reverse: false };
  function readInput(dt) {
    const L = keys.ArrowLeft || keys.a || keys.A, Rr = keys.ArrowRight || keys.d || keys.D;
    const s = (L ? 1 : 0) - (Rr ? 1 : 0);   // 左が +（向きが増える）
    ctl.steer += (s - ctl.steer) * Math.min(1, dt * (s ? 4 : 6));
    const up = keys.ArrowUp || keys.w || keys.W, dn = keys.ArrowDown || keys.s || keys.S;
    const v = car.st.vx;
    if (dn && v < 0.5) { ctl.reverse = true; ctl.throttle = 1; ctl.brake = 0; }
    else { ctl.reverse = false; ctl.throttle = up ? 1 : 0; ctl.brake = dn ? 1 : 0; }
    if (ctl.reverse && up) { ctl.reverse = false; ctl.throttle = 0; ctl.brake = 1; }
    ctl.hand = keys[' '] ? 1 : 0;
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
    world.sigGroups.forEach(({ s, L }) => {
      const art = true, ph = R && R.SPEC ? R.SPEC.phaseAt(t + (s.junction % 97) * 1.7 + (Math.abs(Math.cos(s.face)) > 0.7 ? 0 : 17), art).phase : 'green';
      ['green', 'yellow', 'red'].forEach(c => { L[c].material = c === ph ? world.lampM[c] : world.lampOff; });
    });
    Object.values(world.lampM).forEach(m => { m.emissiveIntensity = 2.2; });
  }
  let last = performance.now(), acc = 0, simT = 0, running = true, frames = 0, fpsT = 0, fps = 0, hitT = 0;
  const STEP = 1 / 120;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    readInput(dt);
    acc += dt;
    while (acc >= STEP) {
      car.step(STEP, ctl, ground);
      const hit = collide(car.st, 1.1); if (hit > 3) hitT = 0.4;
      acc -= STEP; simT += STEP;
    }
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
      '<br><small>出典: 国土交通省 PLATEAU を加工して作成 / 地理院タイル / © OpenStreetMap contributors</small>';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const api = {
    renderer, scene, cam, car, world, gfx, W,
    stop() { running = false; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', resize); renderer.dispose(); container.innerHTML = ''; },
    keys, ready: world.orthoReady,
    /** 検証用: ループを止めて、指定秒数ぶん物理を進めてから 1 枚描く */
    freeze() { running = false; },
    tick(sec, c) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { if (c) Object.assign(ctl, c); car.step(STEP, ctl, ground); collide(car.st, 1.1); simT += STEP; } },
    draw() { const st = car.st; carM.root.position.set(st.x, st.y, st.z); carM.root.rotation.set(0, 0, 0); carM.root.rotateY(st.yaw); carM.root.rotateX(-st.pitch); carM.root.rotateZ(st.roll); firstCam = true; updateCam(1 / 60); updateSignals(simT); renderer.render(scene, cam); return renderer.domElement.toDataURL('image/jpeg', 0.9); },
    pose(x, z, yaw) { car.st.x = x; car.st.z = z; car.st.yaw = yaw; car.st.vx = car.st.vy = car.st.r = 0; firstCam = true; }
  };
  return api;
}
