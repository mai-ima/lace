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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** 品質の段階（GPU 名で自動判定。iPhone 17 は高、Intel 内蔵は中） */
export function detectGfx(renderer, force) {
  let name = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { /* ignore */ }
  const low = /SwiftShader|llvmpipe|Software/i.test(name), intel = /Intel/i.test(name), apple = /Apple/i.test(name);
  const tier = force || (low ? 'low' : intel ? 'mid' : apple ? 'high' : 'high');
  const T = { low: { pr: 0.75, shadows: 0, far: 1400 }, mid: { pr: 0.85, shadows: 1, far: 1300, post: 'smaa' }, high: { pr: 1, shadows: 2, far: 2600, post: 'msaa' } }[tier];
  return Object.assign({ tier, gpu: name, orthoZ: 17 }, T);
}

/** タイヤとホイールを 4 輪に分ける（前後左右の位置で三角形を振り分け、各輪の中心を回転の軸にする） */
function splitWheels(geo, mat, parent, wheels) {
  const P = geo.attributes.position, I = geo.index.array, buckets = {};
  for (let t = 0; t < I.length; t += 3) {
    let cx = 0, cz = 0; for (let j = 0; j < 3; j++) { cx += P.getX(I[t + j]); cz += P.getZ(I[t + j]); }
    const key = (cx > 0 ? 'R' : 'L') + (cz > 0 ? 'F' : 'B'); (buckets[key] = buckets[key] || []).push(I[t], I[t + 1], I[t + 2]);
  }
  Object.keys(buckets).forEach(key => {
    const ix = buckets[key], b = new THREE.Box3(), v = new THREE.Vector3();
    ix.forEach(i => b.expandByPoint(v.fromBufferAttribute(P, i)));
    const c = b.getCenter(new THREE.Vector3());
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', P.clone()); g2.setAttribute('normal', geo.attributes.normal); g2.setIndex(ix);
    g2.translate(-c.x, -c.y, -c.z);   // 位置は輪ごとに複製してから、輪の中心を原点に
    const m = new THREE.Mesh(g2, mat); m.castShadow = true; m.receiveShadow = true;
    if (!wheels[key]) { const steer = new THREE.Group(), spin = new THREE.Group(); steer.position.copy(c); steer.add(spin); parent.add(steer); wheels[key] = { steer, spin, key, r: (b.max.y - b.min.y) / 2 }; }
    wheels[key].spin.add(m);
  });
}
function decodeCar(D, split) {
  const wheels = {};
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
    if (split && (k === 'tire' || k === 'rim')) { splitWheels(geo, mats[k], g, wheels); return; }
    const m = new THREE.Mesh(geo, mats[k] || mats.dark); m.castShadow = k !== 'glass'; m.receiveShadow = true; g.add(m);
  });
  const flip = headN && headZ / headN < 0; if (flip) g.rotation.y = Math.PI;
  Object.values(wheels).forEach(w => { w.front = (w.key[1] === 'F') !== !!flip; });   // 前輪（ライトのある側）
  root.add(g);
  return { root, mats, wheels, flip };
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
  const cam = new THREE.PerspectiveCamera(62, 1, 0.3, gfx.far + 50);   // 霧で消える距離の少し先まで
  // 後処理: 中は SMAA と弱いブルーム（光る物だけ）、高は 4 倍 MSAA とブルーム。低はなし（ブラウザの MSAA のみ）
  let composer = null;
  function setupPost() {
    if (!gfx.post) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: gfx.post === 'msaa' ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, cam));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), gfx.post === 'msaa' ? 0.3 : 0.22, 0.35, 8.0));   // 強さ・広がり・しきい値（線形の明るさ 8 以上 = 灯火だけが光る。空は 8 未満）
    composer.addPass(new OutputPass());
    if (gfx.post === 'smaa') composer.addPass(new SMAAPass());
  }
  renderer.info.autoReset = false;   // 後処理の各段の描画をまとめて数える（性能表示と予算のテスト用）
  function present() { renderer.info.reset(); if (composer) composer.render(); else renderer.render(scene, cam); }
  function resize() { const w = container.clientWidth || 960, h = container.clientHeight || 600; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); } }
  resize(); setupPost(); resize(); window.addEventListener('resize', resize);
  const hud = document.createElement('div'); hud.className = 'w3-hud'; container.appendChild(hud);
  hud.textContent = '読み込み中…（浜松駅周辺の地形・道路・建物）';
  // 右下: 速度計と回転計（canvas）、左下: 回転式のミニマップ（canvas）。スマホのボタンと重ならない位置
  const gauge = document.createElement('canvas'), mini = document.createElement('canvas');
  const isPhone = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  // スマホは操作ボタンが下にあるので、ミニマップは左上、速度計は右のボタンの上に小さく置く
  const GS = isPhone ? Math.round(Math.max(96, Math.min(150, window.innerHeight * 0.28))) : 170;
  gauge.style.cssText = 'position:fixed;right:16px;bottom:' + (isPhone ? 'calc(216px + env(safe-area-inset-bottom))' : 'calc(14px + env(safe-area-inset-bottom))') + ';width:' + GS + 'px;height:' + GS + 'px;pointer-events:none';
  mini.style.cssText = 'position:fixed;left:16px;' + (isPhone ? 'top:calc(70px + env(safe-area-inset-top))' : 'bottom:calc(14px + env(safe-area-inset-bottom))') + ';width:' + GS + 'px;height:' + GS + 'px;border-radius:50%;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.45)';
  const DPR = Math.min(2, window.devicePixelRatio || 1); [gauge, mini].forEach(c => { c.width = c.height = 170 * DPR; container.appendChild(c); });

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
      if (hsh(e.way || e.id, 7) > [1, 1, 1, 0.6, 0.25][pr.rank]) return;   // 並木のある道の割合（国道・主要地方道は全部、県道は 6 割、2 車線の道は 4 分の 1。道（way）ごとに決める）
      const L = e.line; let acc = 0, next = 8;
      for (let i = 1; i < L.length; i++) {
        const a = L[i - 1], b = L[i], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
        while (next <= acc + sl) {
          const u = (next - acc) / sl, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, dx = (b[0] - a[0]) / sl, dz = (b[1] - a[1]) / sl;
          [-1, 1].forEach(sd => {
            const off = pr.hw + pr.walk * 0.5, tx = x - dz * off * sd, tz = z + dx * off * sd;
            if (collide.grid.at(tx, tz) || world.onRoadPt(tx, tz) || sigNear(tx, tz) || world.underViaduct(tx, tz, 4)) return;   // 高架の下（4m 以内）には植えない
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
    const free = (x, z) => !collide.grid.at(x, z) && !world.onRoadPt(x, z) && !world.underViaduct(x, z, 3) && !world.signals.some(s => Math.abs(s.x - x) < 3 && Math.abs(s.z - z) < 3) && !T.some(t => Math.abs(t.x - x) < 2.5 && Math.abs(t.z - z) < 2.5);
    world.props = buildProps(scene, world.net, (x, z) => W.terrain.at(x, z) + 0.15, free, {});
    world.props.poles.concat(world.props.lights).forEach(p => { const r = 0.25; collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z - r, p.x + r, p.z + r); collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z + r, p.x - r, p.z + r); });
  }
  // 車（Khronos Car Concept。高品質なリアル調の車がそろうまでの暫定）
  if (!(TB.RaceRealCars && TB.RaceRealCars.concept)) await new Promise(r => { const s = document.createElement('script'); s.src = 'assets/vendor/real-concept.js'; s.onload = s.onerror = r; document.head.appendChild(s); });
  // 自車: 高画質は元の形（約 18 万面）、中・低は間引いた形（約 4 万面、tools/world/car_lod.mjs）
  let carData = TB.RaceRealCars && TB.RaceRealCars.concept;
  if (carData && gfx.tier !== 'high') { try { carData = await fetch('assets/data/world/props/car_concept_lod0.json').then(r => r.json()); } catch (e) { /* 元の形のまま */ } }
  const carM = carData ? decodeCar(carData, true) : { root: new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 4.4), new THREE.MeshStandardMaterial({ color: 0xb01826 })) };
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
  // 接地の高さ: 橋の上は橋の路面、歩道は縁石の高さ（+0.2m）、それ以外は地形（道路の面と同じ高さ）。道の外は滑りやすく抵抗あり
  const ground = (x, z) => {
    const by = world.bridgeY(x, z); if (by !== null) return { y: by + 0.05, mu: 1 };
    const t = W.terrain.at(x, z), onR = world.onRoadPt(x, z);
    if (world.walkG.at(x, z)) return { y: t + 0.2, mu: 1 };   // 歩道（0.5m 格子）を車道（1m 格子）より優先
    return onR ? { y: t + 0.06, mu: 1 } : { y: t + 0.02, mu: 0.8, drag: 0.08 };
  };
  car.st.y = ground(car.st.x, car.st.z).y;
  // 入力
  const keys = {};
  // Esc: 一時停止（もう一度 Esc で再開、Enter / q で終了）
  let paused = false;
  const pauseEl = document.createElement('div');
  pauseEl.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,10,14,.55);color:#fff;font-size:18px;text-align:center;line-height:2;z-index:5';
  pauseEl.innerHTML = '<div><b style="font-size:28px">一時停止</b><br>Esc / タップで再開　　Enter / Q で終了<br><small>操作: ←→ ハンドル　↑ アクセル　↓ ブレーキ・後退　スペース サイドブレーキ　X 横滑り防止（ESC）の入・切</small></div>';
  pauseEl.addEventListener('pointerdown', () => setPause(false));
  { const b = document.createElement('button'); b.textContent = '横滑り防止（ESC）の入・切'; b.style.cssText = 'position:absolute;left:50%;bottom:calc(30px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;font-size:15px';
    b.addEventListener('pointerdown', e => { e.stopPropagation(); car.s.esc = !car.s.esc; b.textContent = '横滑り防止（ESC）: ' + (car.s.esc ? '入' : '切'); }); pauseEl.appendChild(b); }
  container.appendChild(pauseEl);
  function setPause(v) { paused = v; if (engineAudio) engineAudio.mute(v); pauseEl.style.display = v ? 'flex' : 'none'; Object.keys(keys).forEach(k => { keys[k] = false; }); last = performance.now(); }
  const onKey = (e, d) => {
    if (d && e.key === 'Escape') { setPause(!paused); return; }
    if (d && paused && (e.key === 'Enter' || e.key === 'q' || e.key === 'Q')) { if (opt.onExit) opt.onExit(); return; }
    if (d && (e.key === 'x' || e.key === 'X')) { car.s.esc = !car.s.esc; toastMsg(car.s.esc ? '横滑り防止（ESC）: 入' : '横滑り防止（ESC）: 切（ドリフトしやすい）'); return; }
    keys[e.key] = d;
  };
  // 画面中央に短く出す通知
  const toastEl = document.createElement('div'); toastEl.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);padding:8px 16px;border-radius:10px;background:rgba(10,12,16,.7);color:#fff;font-size:16px;pointer-events:none;opacity:0;transition:opacity .25s;z-index:4';
  container.appendChild(toastEl); let toastT = 0;
  function toastMsg(t) { toastEl.textContent = t; toastEl.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.style.opacity = 0; }, 1600); }
  const onBlur = () => { Object.keys(keys).forEach(k => { keys[k] = false; }); };
  // エンジン音（race-audio.js の合成音。ブラウザの決まりで、最初の操作のあとに鳴らし始める）
  let engineAudio = null;
  const startAudio = () => { if (engineAudio || !(R && R.carAudio)) return; try { engineAudio = R.carAudio('super'); } catch (e) { engineAudio = null; } };
  window.addEventListener('keydown', startAudio); window.addEventListener('pointerdown', startAudio);
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
    // 縦画面（幅 520px 未満）はボタンを小さくして間隔をあける。各ボタンに短い文字も添える
    const nw = window.innerWidth < 520, B = nw ? 70 : 84, G = nw ? 8 : 12, lab = t => '<i style="position:absolute;bottom:4px;left:0;right:0;font:600 10px system-ui,sans-serif;font-style:normal;color:rgba(255,255,255,.8);text-align:center">' + t + '</i>';
    const bb = 'calc(20px + env(safe-area-inset-bottom))';
    pad.innerHTML = '<style>.w3-pad b{position:fixed;display:flex;align-items:center;justify-content:center;border-radius:18px;background:rgba(20,24,30,.42);border:1px solid rgba(255,255,255,.28);touch-action:none;user-select:none;-webkit-user-select:none}.w3-pad b.on{background:rgba(255,255,255,.3)}</style>' +
      '<b data-k="left" style="left:16px;bottom:' + bb + ';width:' + B + 'px;height:' + B + 'px">' + ICON.left + '</b>' +
      '<b data-k="right" style="left:' + (16 + B + G) + 'px;bottom:' + bb + ';width:' + B + 'px;height:' + B + 'px">' + ICON.right + '</b>' +
      '<b data-k="down" style="right:' + (16 + B + G) + 'px;bottom:' + bb + ';width:' + B + 'px;height:' + B + 'px">' + ICON.down + lab('ブレーキ') + '</b>' +
      '<b data-k="up" style="right:16px;bottom:' + bb + ';width:' + B + 'px;height:' + Math.round(B * 1.43) + 'px">' + ICON.up + lab('アクセル') + '</b>' +
      '<b data-k="hand" style="right:16px;bottom:calc(' + (20 + Math.round(B * 1.43) + G) + 'px + env(safe-area-inset-bottom));width:' + B + 'px;height:' + Math.round(B * 0.67) + 'px">' + ICON.hand + lab('サイド') + '</b>' +
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
    const portrait = cam.aspect < 1;   // 縦画面は少し遠く・高くして、車が画面の下半分を占めないように
    const back = (6.2 + Math.min(2.5, Math.abs(st.vx) * 0.03)) * (portrait ? 1.45 : 1), up = portrait ? 2.9 : 2.1;
    const want = new THREE.Vector3(st.x - fx * back, st.y + up, st.z - fz * back);
    const look = new THREE.Vector3(st.x + fx * 4, st.y + 1.1, st.z + fz * 4);
    if (firstCam) { camPos.copy(want); camLook.copy(look); firstCam = false; }
    camPos.lerp(want, Math.min(1, dt * 6)); camLook.lerp(look, Math.min(1, dt * 10));
    // 建物・木・柱にカメラが入らないよう、車からカメラへ 0.5m ずつ調べて、ふさがる手前で止める
    { const ox = st.x, oz = st.z, dx = camPos.x - ox, dz = camPos.z - oz, d = Math.hypot(dx, dz);
      for (let r = 1.5; r <= d; r += 0.5) { if (collide.grid.at(ox + dx * r / d, oz + dz * r / d)) { const k = Math.max(1.2, r - 0.6) / d; camPos.x = ox + dx * k; camPos.z = oz + dz * k; camPos.y = Math.max(camPos.y, st.y + 2.6); break; } } }
    const gy = W.terrain.at(camPos.x, camPos.z) + 0.6; if (camPos.y < gy) camPos.y = gy;
    cam.position.copy(camPos); cam.lookAt(camLook);
    cam.fov = (portrait ? 72 : 60) + Math.min(14, Math.hypot(st.vx, st.vy) * 0.25); cam.updateProjectionMatrix();
    // 影は車の周りだけ（太陽の向きに合わせて追う）
    sky.sun.position.set(st.x, st.y, st.z).addScaledVector(sky.sunDir, 400); sky.sun.target.position.set(st.x, st.y, st.z);
  }
  // 信号（race-spec.js の公式の秒数。交差点ごとに位相をずらす）
  function updateSignals(t) {
    // 交差点ごとに周期をずらす。腕の向きのグループごとに順に青（全赤を挟むので、交差する向きが同時に青にならない）
    world.signals.forEach((s, k) => {
      const cols = R && R.SPEC ? R.SPEC.phasesAt(t + (s.junction * 7.3) % 33, s.n, s.art) : ['green'];
      world.setSignal(k, cols[s.grp] || 'red');
    });
    world.signalsDone();
  }
  // 車輪の回転と前輪の舵角、ブレーキランプ
  function carVisual(dt) {
    const st = car.st;
    if (carM.wheels) Object.values(carM.wheels).forEach(w => { w.spin.rotation.x += st.vx * dt / Math.max(0.2, w.r) * (carM.flip ? -1 : 1); if (w.front) w.steer.rotation.y = st.steer; });
    if (carM.mats) carM.mats.tail.emissiveIntensity = ctl.brake > 0.1 ? 3.0 : 0.6;
  }
  function drawGauge() {
    const g = gauge.getContext('2d'), S = 170 * DPR, c = S / 2, r = S * 0.44, st = car.st;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(10,12,16,.55)'; g.beginPath(); g.arc(c, c, r + 6 * DPR, 0, Math.PI * 2); g.fill();
    // 回転計（下の 270 度）。レッドゾーンは最高回転の 90% から
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5, maxR = car.s.maxRpm, rr = Math.min(1, st.rpm / maxR);
    g.lineWidth = 7 * DPR; g.lineCap = 'butt';
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(c, c, r, a0, a0 + span); g.stroke();
    g.strokeStyle = '#d33'; g.beginPath(); g.arc(c, c, r, a0 + span * 0.9, a0 + span); g.stroke();
    g.strokeStyle = rr > 0.9 ? '#ff5040' : '#f2f2f2'; g.beginPath(); g.arc(c, c, r, a0, a0 + span * rr); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold ' + 44 * DPR + 'px system-ui,sans-serif'; g.fillText(String(car.kmh()), c, c - 4 * DPR);
    g.font = 12 * DPR + 'px system-ui,sans-serif'; g.fillText('km/h', c, c + 26 * DPR);
    g.font = 'bold ' + 18 * DPR + 'px system-ui,sans-serif'; g.fillText(ctl.reverse ? 'R' : String(st.gear), c, c + 50 * DPR);
    const tags = [st.abs && 'ABS', st.tcs && 'TCS', st.esc && 'ESC', car.s.esc === false && 'ESC 切'].filter(Boolean).join(' ');
    if (tags) { g.font = 'bold ' + 11 * DPR + 'px system-ui,sans-serif'; g.fillStyle = '#ffb347'; g.fillText(tags, c, c - 40 * DPR); }
  }
  // ミニマップ: 進む向きが上。道路（格で太さを変える）・信号の交差点・一般車・自車
  const miniEdges = world.net.edges.filter(e => !e.hidden && e.line.length >= 2).map(e => ({ L: e.line, w: Math.max(1.5, e.pr.hw * 0.5), r: e.pr.rank }));
  function drawMini() {
    const g = mini.getContext('2d'), S = 170 * DPR, c = S / 2, st = car.st, sc = S / 360;   // 半径 180m
    g.save(); g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(28,34,40,.85)'; g.fillRect(0, 0, S, S);
    g.translate(c, c); g.rotate(Math.PI + st.yaw); g.scale(sc, sc); g.translate(-st.x, -st.z);   // ゲームの x 東・z 南 → 画面（進む向きが上、右は車の右）
    g.lineCap = 'round'; g.lineJoin = 'round';
    miniEdges.forEach(e => {
      const p0 = e.L[0]; if (Math.abs(p0[0] - st.x) > 400 || Math.abs(p0[1] - st.z) > 400) return;
      g.strokeStyle = e.r <= 2 ? '#d9c27a' : e.r <= 4 ? '#e8e8e8' : '#9aa3ab'; g.lineWidth = e.w * 2;
      g.beginPath(); e.L.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    });
    g.fillStyle = '#5bc0ff'; if (traffic) traffic.cars.forEach(o => { if (o.P) { g.beginPath(); g.arc(o.P.x, o.P.z, 3.2, 0, Math.PI * 2); g.fill(); } });
    g.restore();
    // 自車（中心の矢印）
    g.save(); g.translate(c, c); g.fillStyle = '#ff4d3d'; g.strokeStyle = '#fff'; g.lineWidth = 2 * DPR;
    g.beginPath(); g.moveTo(0, -11 * DPR); g.lineTo(8 * DPR, 9 * DPR); g.lineTo(0, 5 * DPR); g.lineTo(-8 * DPR, 9 * DPR); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2 * DPR; g.beginPath(); g.arc(c, c, c - DPR, 0, Math.PI * 2); g.stroke();
  }
  // 出典（狭い画面は短く。全文はクレジットの一覧 assets/data/world/CREDITS.txt）
  const CREDIT = window.innerWidth < 900 ? '出典: 国交省 PLATEAU・地理院タイルを加工 / © OSM / 車: Khronos（CC BY 4.0）'
    : '出典: 国土交通省 PLATEAU を加工して作成 / 地理院タイル（航空写真・標高）を加工して作成 / © OpenStreetMap contributors / 車: Khronos glTF Sample Assets「Car Concept」（CC BY 4.0）';
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
    carVisual(dt);
    if (engineAudio) engineAudio.update({ speed: Math.min(1.05, car.kmh() / 230), throttle: ctl.throttle > 0.1 && !ctl.reverse });
    updateCam(dt); updateSignals(simT);
    present();
    frames++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    const info = renderer.info.render;
    drawGauge(); drawMini();
    hud.innerHTML = (hitT > 0 ? '<b style="color:#ff6a50;font-size:18px">衝突</b><br>' : '') +
      '<small>' + fps + ' fps　描画 ' + info.calls + '　三角形 ' + Math.round(info.triangles / 1000) + 'k　画質 ' + gfx.tier + '</small>' +
      '<br><small>' + CREDIT + '</small>';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const api = {
    renderer, scene, cam, car, world, gfx, W, collide, traffic,
    stop() {
      running = false; if (engineAudio) engineAudio.stop(); window.removeEventListener('keydown', startAudio); window.removeEventListener('pointerdown', startAudio);
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
    draw() { const st = car.st; drawGauge(); drawMini(); carM.root.position.set(st.x, st.y, st.z); carM.root.rotation.set(0, 0, 0); carM.root.rotateY(st.yaw); carM.root.rotateX(-st.pitch); carM.root.rotateZ(st.roll); firstCam = true; carVisual(1 / 60); updateCam(1 / 60); updateSignals(simT); present(); return renderer.domElement.toDataURL('image/jpeg', 0.9); },
    pose(x, z, yaw) { car.st.x = x; car.st.z = z; car.st.yaw = yaw; car.st.vx = car.st.vy = car.st.r = 0; firstCam = true; }
  };
  return api;
}
