/*
 * app.js — 3D 自由走行（試作: 浜松駅周辺 2.4km 四方）。
 * 地形・航空写真・道路網・路面表示・PLATEAU の建物・信号・車両物理・追従カメラ・HUD。
 */
import * as THREE from 'three';
import { loadWorld } from './data.js';
import { buildWorld, buildSky } from './world.js';
import { makeCar, makeColliders } from './vehicle.js';
import { makeParked } from './parked.js';
import { makeGrid } from './grid.js';
import { loadImpostor, plantTrees } from './trees.js';
import { buildProps } from './props.js';
import { makeGarage } from './garage.js';
import { makeTraffic } from './traffic.js';
import { loadGLB, fleetParts, playerCar, toFloat as toFloatGeo } from './cars.js';
import { NIGHT, makeCarGlows, lampLayout, makeGlowPoints, makeLightPools } from './lights.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** 品質の段階（GPU 名で自動判定。iPhone 17 は高、Intel 内蔵は中） */
export function detectGfx(renderer, force) {
  let name = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { /* ignore */ }
  const low = /SwiftShader|llvmpipe|Software/i.test(name), intel = /Intel/i.test(name), apple = /Apple/i.test(name);
  const tier = force || (low ? 'low' : intel ? 'mid' : apple ? 'high' : 'high');
  // 超高（ultra）: 三角形・描画回数の予算を考えず品質を最大にする（画面の解像度は端末のまま、MSAA 8 倍、影の地図 8192 で広く、描画距離 4km、
  // 一般車・駐車中の車・小物・標識を遠くまで細かく）。それ以外は高と同じ
  const T = { low: { pr: 0.75, shadows: 0, far: 1400 }, mid: { pr: 0.85, shadows: 1, far: 1300, post: 'smaa' }, high: { pr: 1, shadows: 2, far: 2600, post: 'msaa', ao: true, csm: true },
    ultra: { pr: 1, shadows: 3, far: 4000, post: 'msaa', ao: true, csm: true } }[tier] || {};
  return Object.assign({ tier, gpu: name, orthoZ: 17, hi: tier === 'high' || tier === 'ultra', ultra: tier === 'ultra' }, T);
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
    if (!wheels[key]) { const steer = new THREE.Group(), spin = new THREE.Group(); steer.position.copy(c); steer.add(spin); parent.add(steer); wheels[key] = { steer, spin, key, front: key[1] === 'F', r: (b.max.y - b.min.y) / 2 }; }
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
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: gfx.post === 'msaa' ? (gfx.ultra ? 8 : 4) : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, cam));
    // 環境光の遮蔽（GTAO、高画質）: 建物の根元・壁の隅・縁石・車の下など、光が回り込みにくい所を暗くする（半径 1m、16 方向、ノイズ除去あり）
    if ((gfx.ao || opt.ao) && !opt.noAo) {
      const ao = new GTAOPass(scene, cam, size.x, size.y);
      ao.blendIntensity = 0.85;
      ao.normalMaterial.flatShading = true; ao.normalMaterial.needsUpdate = true;   // 建物は法線を持たず面の向きを画面上で求める（flatShading）ので、下書きの法線も同じ方法で
      ao.updateGtaoMaterial({ radius: +(opt.aoR || 1.0), distanceExponent: 1, thickness: 1, scale: 1, samples: 16, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      // 加算の光（灯り・光だまり）と電線（深度を書かない半透明）は、遮蔽の計算に入れない
      const hide = ao._overrideVisibility.bind(ao);
      ao._overrideVisibility = () => { hide(); scene.traverse(o => { if (o.isMesh && o.visible && o.material && o.material.transparent && !o.material.depthWrite) { o.visible = false; ao._visibilityCache.push(o); } }); };
      composer.addPass(ao);
    }
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), gfx.post === 'msaa' ? 0.3 : 0.22, 0.35, 8.0));   // 強さ・広がり・しきい値（線形の明るさ 8 以上 = 灯火だけが光る。空は 8 未満）
    composer.addPass(new OutputPass());
    if (gfx.post === 'smaa') composer.addPass(new SMAAPass());
  }
  renderer.info.autoReset = false;   // 後処理の各段の描画をまとめて数える（性能表示と予算のテスト用）
  let csm = null;   // カスケード影（高画質。下で作る）
  function present() { if (world.update) world.update(cam.position.x, cam.position.z, cam); renderer.info.reset(); if (csm) { cam.updateMatrixWorld(); csm.update(); } if (composer) composer.render(); else renderer.render(scene, cam); }
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
  const sky = buildSky(scene, renderer, { shadows: gfx.shadows, far: gfx.far, elev: opt.elev, azim: opt.azim, time: opt.time });
  const world = buildWorld(scene, W, gfx);
  const T0 = W.terrain, collide = makeColliders(W.bldg, { x0: T0.x0, z0: T0.z0, size: (T0.nx - 1) * T0.cell }, makeGrid, world.roadTris, world.pierTris);
  // 川には入れない（水面を当たり判定に塗ってから、橋の上の道路の範囲を消す）
  if (world.waterTris) {
    world.waterTris((ax, az, bx, bz, cx, cz) => collide.grid.tri(ax, az, bx, bz, cx, cz));
    collide.grid.clear = true; world.roadTris((ax, az, bx, bz, cx, cz) => collide.grid.tri(ax, az, bx, bz, cx, cz)); collide.grid.clear = false;
  }
  // 信号機: 外部の日本の信号機のモデル（Objaverse 収録の Sketchfab CC BY 4.0 作品を tools/world/signal_glb.mjs で取り出したもの）に差し替える
  if (world.useSignalModels) try {
    const one = sc => { let r = null; sc.updateMatrixWorld(true); sc.traverse(o => { if (o.isMesh && !r) { const g = toFloatGeo(o.geometry); g.applyMatrix4(o.matrixWorld); r = { geometry: g, material: o.material }; } }); return r; };
    const [sh, sp] = await Promise.all(['signal_head', 'signal_ped'].map(k => loadGLB('assets/data/world/props/' + k + '.glb')));
    world.useSignalModels(one(sh), one(sp));
  } catch (e) { console.warn('信号機のモデルを読めませんでした', e); }
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
            let off = pr.hw + pr.walk * 0.5;
            // 実測の歩道があれば、外へ探して歩道の幅の中ほど（車道側から 1.2m、狭ければ中央）に植える
            if (W.roadArea && W.roadArea.walk) {
              let o1 = Math.max(1, pr.hw - 2); while (o1 < pr.hw + 8 && !world.walkG.at(x - dz * o1 * sd, z + dx * o1 * sd)) o1 += 0.25;
              if (o1 >= pr.hw + 8) return;
              let o2 = o1; while (o2 < o1 + 8 && world.walkG.at(x - dz * o2 * sd, z + dx * o2 * sd)) o2 += 0.25;
              if (o2 - o1 < 2.0) return;   // 2m 未満の歩道には植えない
              off = o1 + Math.min(1.2, (o2 - o1) / 2);
            }
            const tx = x - dz * off * sd, tz = z + dx * off * sd;
            if (collide.grid.at(tx, tz) || sigNear(tx, tz) || world.underViaduct(tx, tz, 4)) return;
            if (W.roadArea && W.roadArea.walk ? !world.walkG.at(tx, tz) : world.onRoadPt(tx, tz)) return;   // 実測の歩道の上だけに植える   // 高架の下（4m 以内）には植えない
            const r = hsh(tx, tz);
            spots.push({ x: tx, y: W.terrain.at(tx, tz) + 0.14, z: tz, h: 8 + r * 4, yaw: r * 6.283 });
          });
          next += 11 + hsh(x, z) * 3;
        }
        acc += sl;
      }
    });
    // 航空写真から見つけた実際の樹冠（tools/world/trees_from_ortho.py）があれば、それを使う（道路沿いの規則で植えた木は使わない）
    const real = await fetch('assets/data/world/center/trees.json').then(r => r.ok ? r.json() : null).catch(() => null);
    if (real && real.trees.length) {
      spots.length = 0;
      real.trees.forEach(([x, z, r]) => {
        if (collide.grid.at(x, z) || world.onRoadPt(x, z) || sigNear(x, z) || world.underViaduct(x, z, 3)) return;
        const k = hsh(x, z);
        spots.push({ x, y: world.walkG.at(x, z) ? W.terrain.atRoad(x, z) + 0.14 : W.terrain.at(x, z), z, h: Math.max(5, Math.min(14, 4 + r * 1.7)) * (0.9 + k * 0.2), yaw: k * 6.283 });
      });
    }
    world.trees = plantTrees(scene, imp, spots, { shadows: gfx.shadows > 0 });
    spots.forEach(p => { const r = 0.35; collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z - r, p.x + r, p.z + r); collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z + r, p.x - r, p.z + r); });   // 幹の当たり判定
    world.treeSpots = spots;
  } catch (e) { console.warn('街路樹を読めませんでした', e); }
  // 電柱・電線・街灯（建物・車道・木・信号と重ならない所）
  {
    const T = world.treeSpots || [];
    const free = (x, z) => !collide.grid.at(x, z) && !world.onRoadPt(x, z) && !world.underViaduct(x, z, 3) && !world.signals.some(s => Math.abs(s.x - x) < 3 && Math.abs(s.z - z) < 3) && !T.some(t => Math.abs(t.x - x) < 2.5 && Math.abs(t.z - z) < 2.5);
    // 外部のモデル（電柱: 日本の腕金・碍子・変圧器つき、道路照明: カーブしたテーパーポール）。距離で細かい形と粗い形を切り替える
    let models = null;
    try {
      const PR = 'assets/data/world/props/', pinfo = await fetch(PR + 'props.json').then(r => r.json());
      const load = async (key, fix) => { const [a, b] = await Promise.all(['lod0', 'lod1'].map(l => loadGLB(PR + key + '_' + l + '.glb'))); const m = { lod0: fleetParts(a).parts, lod1: fleetParts(b).parts, h: pinfo.find(x => x.key === key).h }; if (fix) fix(m); return m; };
      const tint = (m, r, g, b) => ['lod0', 'lod1'].forEach(k => m[k].forEach(pt => { const c = pt.geometry.attributes.color; if (c && c.itemSize === 3) { for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * r, c.getY(i) * g, c.getZ(i) * b); c.needsUpdate = true; } }));
      // 道路照明はアームがローカルの +x を向くように（モデルの向きを頂点の重心で判定）
      const armX = m => { let sx = 0, n = 0; m.lod0.forEach(pt => { const P = pt.geometry.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) > m.h * 0.8) { sx += P.getX(i); n++; } }); if (n && sx / n < 0) ['lod0', 'lod1'].forEach(k => m[k].forEach(pt => pt.geometry.rotateY(Math.PI)));
        // 灯具の位置（アームの先端の下面）: 高い所の頂点で x がいちばん大きい所の付近
        let hx = 0; m.lod0.forEach(pt => { const P = pt.geometry.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) > m.h * 0.7) hx = Math.max(hx, P.getX(i)); });
        let hy = Infinity; m.lod0.forEach(pt => { const P = pt.geometry.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) > m.h * 0.7 && P.getX(i) > hx - 0.6) hy = Math.min(hy, P.getY(i)); });
        m.head = { x: hx - 0.3, y: hy - 0.02 }; };
      models = { pole: await load('utility_pole_jp', m => tint(m, 0.74, 0.73, 0.70)), light: await load('streetlight_curve', m => { armX(m); tint(m, 0.62, 0.64, 0.66); }) };
    } catch (e) { console.warn('付属物のモデルを読めませんでした', e); }
    world.props = buildProps(scene, world.net, (x, z) => world.walkG.at(x, z) ? W.terrain.atRoad(x, z) + 0.15 : W.terrain.at(x, z), free, { models, inBld: (x, z) => collide.grid.at(x, z), lightFar: gfx.ultra ? 520 : gfx.hi ? 300 : 220, ultra: gfx.ultra, onWalk: W.roadArea && W.roadArea.walk ? (x, z) => world.walkG.at(x, z) : null });
    // 並べ直しは毎フレームの更新で（自車の位置が決まってから）
    // 夕方・夜の灯り: 街灯（LED、白に近い）と防犯灯の光の点、真下の地面の光だまり
    { const P = world.props;
      makeGlowPoints(scene, P.lightHeads || [], [16, 15, 13], 0.42);
      makeGlowPoints(scene, P.secLamps || [], [13, 13.5, 14], 0.22);
      makeLightPools(scene, (P.lightHeads || []).map(h => ({ x: h.x, y: W.terrain.atRoad(h.x, h.z), z: h.z, r: 12 })), [0.42, 0.38, 0.32]);
      makeLightPools(scene, (P.secLamps || []).map(h => ({ x: h.x, y: W.terrain.at(h.x, h.z), z: h.z, r: 6.5 })), [0.22, 0.22, 0.23]); }
    world.props.poles.concat(world.props.lights).forEach(p => { const r = 0.25; collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z - r, p.x + r, p.z + r); collide.grid.tri(p.x - r, p.z - r, p.x + r, p.z + r, p.x - r, p.z + r); });
  }
  // 飲み物の自動販売機: OSM の位置（amenity=vending_machine、tools/world/build_stops.py）。正面（モデルの +z）をいちばん近い車道へ向ける。
  // 建物の中に入っている点は、車道の向きへ 0.5m ずつずらす。夜は正面（商品の並ぶ所）がほのかに光る
  if (W.stops && W.stops.vend && W.stops.vend.length) try {
    const sc = await loadGLB('assets/data/world/props/vending_jp_lod0.glb'), parts = fleetParts(sc).parts, N = W.stops.vend.length;
    const dirs = [...Array(16)].map((_, i) => [Math.sin(i * Math.PI / 8), Math.cos(i * Math.PI / 8)]);
    const Ms = W.stops.vend.map(([x, z]) => {
      let best = null;
      for (let r = 1; r <= 14 && !best; r += 1) for (const [dx, dz] of dirs) if (world.onRoadPt(x + dx * r, z + dz * r)) { best = [dx, dz]; break; }
      const [dx, dz] = best || [0, 1];
      for (let k = 0; k < 12 && collide.grid.at(x, z); k++) { x += dx * 0.5; z += dz * 0.5; }
      const y = world.walkG.at(x, z) ? W.terrain.atRoad(x, z) + 0.15 : W.terrain.at(x, z);
      const r = 0.55; collide.grid.tri(x - r, z - r, x + r, z - r, x + r, z + r); collide.grid.tri(x - r, z - r, x + r, z + r, x - r, z + r);
      return new THREE.Matrix4().makeRotationY(Math.atan2(dx, dz)).setPosition(x, y, z);
    });
    parts.forEach(pt => {
      const m = pt.material.clone();
      const glow = m.map && 'emissive' in m; if (glow) { m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = m.map; m.emissiveIntensity = 0; }
      const im = new THREE.InstancedMesh(pt.geometry, m, N); im.castShadow = im.receiveShadow = true;
      if (glow) im.onBeforeRender = () => { m.emissiveIntensity = NIGHT.value * 0.8; };
      Ms.forEach((M, i) => im.setMatrixAt(i, M)); im.computeBoundingSphere(); scene.add(im);
    });
  } catch (e) { console.warn('自販機のモデルを読めませんでした', e); }
  // 車: 外部の高品質なモデル（Objaverse 収録の Sketchfab CC BY 4.0 作品を tools/world/vehicles.mjs で変換）
  const CARS = 'assets/data/world/cars/';
  const carInfo = await fetch(CARS + 'cars.json').then(r => r.json());
  // 自車（車庫）: 切り替えられる車。モデルは高画質のときは hero（面が多い）があればそれを使う。物理の値は車ごと
  const GARAGE = [
    { key: 'compact_swift', name: '小型ハッチバック', color: 0xb3121c, spec: { mass: 920, wb: 2.45, track: 1.5, cgH: 0.5, Iz: 1300, power: 67e3, maxRpm: 6400, gears: [3.545, 1.904, 1.28, 0.966, 0.757], final: 4.388, wheelR: 0.29, tqR: 118 / 0.29, drive: 'ff', cd: 0.32, area: 2.1 } },   // 1.2L・5 速 MT・FF（91PS、車両重量 約 900kg）
    { key: 'super_svj', name: 'スーパーカー（V12・4WD）', color: 0xe8740c, spec: { mass: 1525, wb: 2.7, track: 1.7, cgH: 0.42, Iz: 2500, power: 566e3, maxRpm: 8700, idleRpm: 1000, gears: [3.91, 2.44, 1.81, 1.46, 1.19, 0.97, 0.84], final: 3.3, wheelR: 0.35, mu: 1.28, cd: 0.36, area: 1.9, brake: 1.3, drive: '4wd', steerMax: 0.58, rearMu: 1.12, tqR: 720 / 0.35 } },
    { key: 'sedan_mazda3', name: 'セダン', color: 0x8c1c1c, spec: { mass: 1350, wb: 2.73, power: 115e3, tqR: 213 / 0.32, drive: 'ff', wheelR: 0.32 } },
    { key: 'suv_cx5', name: 'SUV', color: 0x2a3d66, spec: { mass: 1600, wb: 2.7, track: 1.6, cgH: 0.62, power: 140e3, tqR: 252 / 0.35, drive: '4wd', wheelR: 0.35, mu: 1.0 } },
    { key: 'kei_van', name: '軽バン', color: 0xf4f4f2, spec: { mass: 900, wb: 2.35, track: 1.3, cgH: 0.72, Iz: 1100, power: 36e3, maxRpm: 6000, gears: [3.6, 2.2, 1.45, 1.0], final: 5.1, wheelR: 0.28, tqR: 63 / 0.28, cd: 0.42, area: 2.6, drive: 'fr', mu: 0.95 } }
  ].filter(c => carInfo.some(i => i.key === c.key));
  let carM = null, garageIdx = Math.max(0, GARAGE.findIndex(c => c.key === (opt.carKey || 'compact_swift')));
  const headL = new THREE.SpotLight(0xfff2de, 380, 140, 0.5, 0.65, 2); headL.position.set(0, 0.75, 1.6); headL.target.position.set(0, -0.6, 22); headL.visible = false;   // 夜のヘッドライト（ロービーム: 前方 40m ほどの路面が見える明るさ。影なし）
  const myGlow = makeCarGlows(scene, 1); let myLay = null;
  // 自車の接地影（車体の下のぼかした暗い楕円。影の地図では細かい隙間まで暗くならず、車が浮いて見えるため）
  const myBlob = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 6, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.8)'); gr.addColorStop(0.65, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    m.renderOrder = 2; scene.add(m); return m;
  })();
  async function loadPlayer(G) {
    const info = carInfo.find(i => i.key === G.key) || {}, hero = gfx.hi && info.lods && info.lods.hero;
    let m;
    try {
      const sc = await loadGLB(CARS + G.key + (hero ? '_hero' : '_lod0') + '.glb');
      const pc = playerCar(sc, opt.carColor || G.color), g = new THREE.Group(); g.add(pc.root);
      const wheels = pc.wheels || {};   // 形で見つけた車輪（タイヤ・ホイール・ナットが一緒に回る）
      if (!pc.wheels && pc.wheelGeo) splitWheels(pc.wheelGeo, pc.wheelMat, g, wheels);
      m = { root: g, wheels, flip: false, tails: pc.tails, setColor: pc.setColor };
      // 影は粗い形（lod2、約 6 千面。法線をならした滑らかな形）で落とす: 影のカメラにだけ見えるレイヤー 1 に置き、細かい形は影を落とさない
      // （影の地図の 1 画素は数 cm なので、影の形は細かい形と見分けがつかない）
      try {
        const sh = await loadGLB(CARS + G.key + '_lod2.glb'); sh.traverse(o => { if (o.isMesh) { o.layers.set(1); o.castShadow = true; o.receiveShadow = false; } });
        g.traverse(o => { if (o.isMesh) o.castShadow = false; }); g.add(sh);
      } catch (e) { /* 粗い形が無ければ細かい形で影を落とす */ }
    } catch (e) {
      console.warn('自車のモデルを読めませんでした', e);
      m = { root: new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 4.2), new THREE.MeshStandardMaterial({ color: 0xb01826 })) };
    }
    const size = new THREE.Box3().setFromObject(m.root).getSize(new THREE.Vector3());
    if (carM) { scene.remove(carM.root); carM.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } }); }
    carM = m; scene.add(carM.root); carM.root.add(headL); carM.root.add(headL.target);
    headL.position.set(0, Math.min(0.8, size.y * 0.5), size.z / 2 - 0.3);
    myLay = lampLayout(size); carM.size = size;
  }
  await loadPlayer(GARAGE[garageIdx] || { key: 'compact_swift', color: 0xb3121c, spec: {} });
  // 一般車: 7 車種。日本の交通に近い割合（軽バン・軽トラ・コンパクト・セダン・SUV）と、車種ごとの色の割合
  const W_TYPES = { kei_van: 20, kei_truck_acty: 10, compact_swift: 22, sedan_sylphy: 13, sedan_accord: 9, sedan_mazda3: 12, suv_cx5: 14 };
  const KEI_COLORS = [0xf4f4f2, 0xf4f4f2, 0xf4f4f2, 0xc9ccd0, 0x9aa0a6];
  let traffic = null;
  try {
    const types = await Promise.all(carInfo.filter(c => W_TYPES[c.key]).map(async c => {
      const [n, f] = await Promise.all([loadGLB(CARS + c.key + '_lod1.glb'), loadGLB(CARS + c.key + '_lod2.glb')]);
      return { key: c.key, weight: W_TYPES[c.key], len: c.size.l, near: fleetParts(n), far: fleetParts(f), colors: c.key === 'kei_van' ? KEI_COLORS : null };
    }));
    types.forEach(T => { T.lay = lampLayout(T.near.size); });
    traffic = makeTraffic(scene, world.net, { types, glows: makeCarGlows(scene, 64), count: gfx.tier === 'low' ? 24 : gfx.ultra ? 90 : 48, near: gfx.ultra ? 24 : gfx.hi ? 8 : 3, maxFar: gfx.ultra ? 90 : gfx.hi ? 40 : 10, shadows: gfx.hi, farDist: gfx.ultra ? 480 : gfx.hi ? 320 : 200 });
  } catch (e) { console.warn('一般車を読めませんでした', e); }
  // 駐車場に止まっている車: いちばん軽い形（_lod3）。画質ごとに、描く範囲と台数の上限（超高は上限なし）
  try {
    const PT = await Promise.all(carInfo.filter(c => W_TYPES[c.key] && c.lods && c.lods.lod3).map(async c => ({ key: c.key, weight: W_TYPES[c.key], size: c.size, colors: c.key === 'kei_van' ? KEI_COLORS : null, parts: fleetParts(await loadGLB(CARS + c.key + (gfx.ultra ? '_lod2.glb' : '_lod3.glb'))).parts })));   // 超高は一段細かい形
    const PQ = { low: [60, 6], mid: [90, 10], high: [160, 48], ultra: [400, 400] }[gfx.tier] || [90, 10];
    const parked = makeParked(scene, world.street && world.street.parked, PT, { R: PQ[0], MAX: PQ[1], shadows: gfx.hi, collide: collide.grid });
    if (parked) { const prev = world.update; world.update = (x, z, c) => { prev(x, z, c); parked.update(x, z); }; world.parked = parked; }
  } catch (e) { console.warn('駐車中の車を読めませんでした', e); }
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
  const carSpec = G => Object.assign({}, (G && G.spec) || {}, opt.car || {});
  let car = makeCar(carSpec(GARAGE[garageIdx]));
  const setBox = () => { car.st.HL = carM.size.z / 2 - 0.05; car.st.HW = Math.max(0.7, carM.size.x / 2 - 0.12); };   // ミラーの分を少し引く
  setBox();
  // 車の切り替え: ガレージ画面（C キー・一時停止画面のボタン）で車と塗装を選ぶ。位置と向きは引き継いで、止まった状態から
  let switching = false, curColor = opt.carColor || (GARAGE[garageIdx] && GARAGE[garageIdx].color);
  async function selectCar(i, color) {
    if (switching) return; switching = true;
    const G = GARAGE[i], old = car.st, esc = car.s.esc;
    if (i !== garageIdx || !carM) {
      garageIdx = i; toastMsg('読み込み中: ' + G.name);
      await loadPlayer(G); setupCsm();
      car = makeCar(carSpec(G)); car.s.esc = esc;
      Object.assign(car.st, { x: old.x, z: old.z, y: old.y, yaw: old.yaw }); setBox(); firstCam = true;
    }
    if (color !== undefined && carM.setColor) { carM.setColor(color); curColor = color; }
    toastMsg('車: ' + G.name);
    switching = false;
  }
  const switchCar = step => selectCar((garageIdx + step + GARAGE.length) % GARAGE.length, GARAGE[(garageIdx + step + GARAGE.length) % GARAGE.length].color);
  const garage = makeGarage(container, GARAGE.map(G => ({ key: G.key, name: G.name, color: G.color, s: makeCar(carSpec(G)).s, size: (carInfo.find(c => c.key === G.key) || {}).size, thumb: CARS + 'thumb_' + G.key + '.jpg' })),
    (i, color) => { last = performance.now(); selectCar(i, color); });
  const openGarage = () => { if (paused) setPause(false); Object.keys(keys).forEach(k => { keys[k] = false; }); garage.open(garageIdx, curColor); };
  /* カスケード影（CSM、高画質）: 視界を手前から 3 段に分け、段ごとの影の地図（2048）で 700m 先まで影を落とす（手前ほど細かい）。
     ふつうの太陽の影（車の周り 280m 四方）の代わり。材質の独自の加工（onBeforeCompile）は残して、影の計算をつなげる */
  function setupCsm() {
    if (!csm) return;
    scene.traverse(o => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(m => {
        if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial) || (m.defines && m.defines.USE_CSM)) return;
        const prev = m.onBeforeCompile; csm.setupMaterial(m); const cf = m.onBeforeCompile;
        m.onBeforeCompile = function (sh, r) { if (prev && prev !== cf) prev.call(this, sh, r); cf.call(this, sh, r); };
        m.needsUpdate = true;
      });
    });
  }
  function syncCsm() {
    if (!csm) return;
    csm.lightDirection.copy(sky.sunDir).negate();
    csm.lights.forEach(l => { l.color.copy(sky.sun.color); l.intensity = sky.sun.intensity; });
    sky.sun.intensity = 0; sky.sun.castShadow = false; sky.sun.visible = false;   // 非表示にして光の数から外す（CSM のシェーダーは最初の平行光を段の光とみなすので、順番がずれないように）
  }
  if (opt.csm) {   // 試験中（URL に csm=1）: 手前の路面が一様に暗くなる問題が残っているので、既定では使わない
    csm = new CSM({ maxFar: 700, cascades: 3, mode: 'practical', parent: scene, shadowMapSize: 2048, lightDirection: sky.sunDir.clone().negate(), lightIntensity: sky.sun.intensity, lightNear: 1, lightFar: 3000, lightMargin: 250, camera: cam, shadowBias: +(opt.csmBias || -0.0006) });
    csm.fade = true;
    csm.lights.forEach(l => { l.shadow.normalBias = +(opt.csmNB || 0.1); l.shadow.camera.layers.enable(1); });   // 影だけを落とす粗い形（レイヤー 1）も
    syncCsm();
    const st0 = sky.setTime; sky.setTime = m => { st0(m); syncCsm(); };
  }
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
    const onR = world.onRoadPt(x, z), tr = W.terrain.atRoad ? W.terrain.atRoad(x, z) : W.terrain.at(x, z);   // 道路の面は窪みを埋めた高さ
    if (world.walkG.at(x, z)) return { y: tr + 0.17, mu: 1 };   // 歩道（高さ 15cm。0.5m 格子）を車道（1m 格子）より優先
    return onR ? { y: tr + 0.06, mu: 1 } : { y: W.terrain.at(x, z) + 0.02, mu: 0.8, drag: 0.08 };
  };
  car.st.y = ground(car.st.x, car.st.z).y;
  // 入力
  const keys = {};
  // Esc: 一時停止（もう一度 Esc で再開、Enter / q で終了）
  let paused = false;
  const pauseEl = document.createElement('div');
  pauseEl.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,10,14,.55);color:#fff;font-size:18px;text-align:center;line-height:2;z-index:5';
  pauseEl.innerHTML = '<div><b style="font-size:28px">一時停止</b><br>Esc / タップで再開　　Enter / Q で終了<br><small>操作: ←→ ハンドル　↑ アクセル　↓ ブレーキ・後退　スペース サイドブレーキ　X 横滑り防止（ESC）の入・切　T 時間帯　C ガレージ（車と塗装）</small></div>';
  pauseEl.addEventListener('pointerdown', () => setPause(false));
  { const b = document.createElement('button'); b.textContent = '横滑り防止（ESC）の入・切'; b.style.cssText = 'position:absolute;left:50%;bottom:calc(30px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;font-size:15px';
    b.addEventListener('pointerdown', e => { e.stopPropagation(); car.s.esc = !car.s.esc; b.textContent = '横滑り防止（ESC）: ' + (car.s.esc ? '入' : '切'); }); pauseEl.appendChild(b); }
  const TIME_NAME = { day: '昼', dusk: '夕方', night: '夜' }, TIME_ORDER = ['day', 'dusk', 'night'];
  const nextTime = () => { const m = TIME_ORDER[(TIME_ORDER.indexOf(sky.mode) + 1) % 3]; sky.setTime(m); return m; };
  { const b = document.createElement('button'); b.textContent = '時間帯: ' + TIME_NAME[sky.mode] + '（T）'; b.style.cssText = 'position:absolute;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;font-size:15px';
    b.addEventListener('pointerdown', e => { e.stopPropagation(); b.textContent = '時間帯: ' + TIME_NAME[nextTime()] + '（T）'; }); pauseEl.appendChild(b); }
  { const b = document.createElement('button'); b.textContent = 'ガレージ（車と塗装を選ぶ・C）'; b.style.cssText = 'position:absolute;left:50%;bottom:calc(138px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;font-size:15px';
    b.addEventListener('pointerdown', e => { e.stopPropagation(); openGarage(); }); pauseEl.appendChild(b); }
  // 画質: 自動 → 低 → 中 → 高 → 超高。選ぶと保存して読み直す
  { const NAMES = { '': '自動', low: '低', mid: '中', high: '高', ultra: '超高' }, ORDER = ['', 'low', 'mid', 'high', 'ultra'];
    let cur = ''; try { cur = localStorage.getItem('w3.tier') || ''; } catch (e) { /* 保存できない環境 */ }
    const b = document.createElement('button'); b.textContent = '画質: ' + NAMES[cur] + '（いま ' + NAMES[gfx.tier] + '）'; b.style.cssText = 'position:absolute;left:50%;bottom:calc(192px + env(safe-area-inset-bottom));transform:translateX(-50%);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;font-size:15px';
    b.addEventListener('pointerdown', e => {
      e.stopPropagation(); cur = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
      try { if (cur) localStorage.setItem('w3.tier', cur); else localStorage.removeItem('w3.tier'); } catch (er) { /* 保存できない環境 */ }
      const u = new URL(location.href); if (cur) u.searchParams.set('tier', cur); else u.searchParams.delete('tier'); location.href = u.toString();
    }); pauseEl.appendChild(b); }
  container.appendChild(pauseEl);
  function setPause(v) { paused = v; if (engineAudio) engineAudio.mute(v); pauseEl.style.display = v ? 'flex' : 'none'; Object.keys(keys).forEach(k => { keys[k] = false; }); last = performance.now(); }
  const onKey = (e, d) => {
    if (garage.isOpen) { if (d) garage.key(e.key); return; }   // ガレージを開いている間は、キーはガレージの操作
    if (d && e.key === 'Escape') { setPause(!paused); return; }
    if (d && paused && (e.key === 'Enter' || e.key === 'q' || e.key === 'Q')) { if (opt.onExit) opt.onExit(); return; }
    if (d && (e.key === 'x' || e.key === 'X')) { car.s.esc = !car.s.esc; toastMsg(car.s.esc ? '横滑り防止（ESC）: 入' : '横滑り防止（ESC）: 切（ドリフトしやすい）'); return; }
    if (d && (e.key === 'c' || e.key === 'C')) { openGarage(); return; }
    if (d && (e.key === 't' || e.key === 'T')) { toastMsg('時間帯: ' + TIME_NAME[nextTime()]); return; }
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
    const vk = Math.abs(car.st.vx) * 3.6, rate = s ? (s * ctl.steer < 0 ? 9 : 6.5 - Math.min(3.5, vk / 40)) : 9;   // 切り始めは低速ほど速く、高速ほどゆっくり。逆に切る・戻すときは速く
    ctl.steer += (s - ctl.steer) * Math.min(1, dt * rate);
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
    const back = (6.2 + ((carM.size ? carM.size.z : 4) - 4) * 0.8 + Math.min(2.5, Math.abs(st.vx) * 0.03)) * (portrait ? 1.45 : 1), up = portrait ? 2.9 : 2.1;
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
    if (carM.size) { const gy = ground(st.x, st.z).y; myBlob.position.set(st.x, gy + 0.03, st.z); myBlob.rotation.set(0, st.yaw, 0); myBlob.scale.set(carM.size.x * 1.05, 1, carM.size.z * 1.05); }
    if (carM.tails) carM.tails.forEach(m => { m.emissiveIntensity = ctl.brake > 0.1 ? 2.5 : Math.max(0.25, NIGHT.value * 1.1); });
    const nightOn = NIGHT.value > 0.3;
    if (headL.visible !== nightOn) headL.visible = nightOn;
    if (NIGHT.value > 0.01) { carM.root.updateMatrix(); myGlow.set(0, carM.root.matrix, myLay, ctl.brake > 0.1); myGlow.commit(1); } else myGlow.commit(0);
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
  // ミニマップの下絵: 実際の道路の形（PLATEAU の車道・歩道）を最初に 1 枚の画像に描いておく。無ければ道の中心線（切り詰める前の全体）
  const MT = W.terrain, mSpan = (MT.nx - 1) * MT.cell, MPX = 2048, mK = MPX / mSpan;
  const miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = MPX;
  { const g = miniBase.getContext('2d');
    const fillTris = (A, col) => { if (!A || !A.v) return; const q = W.roadArea.q, v = A.v, I = A.i; g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.6; g.beginPath();
      for (let t = 0; t < I.length; t += 3) { const a = I[t] * 2, b = I[t + 1] * 2, c2 = I[t + 2] * 2;
        g.moveTo((v[a] * q - MT.x0) * mK, (v[a + 1] * q - MT.z0) * mK); g.lineTo((v[b] * q - MT.x0) * mK, (v[b + 1] * q - MT.z0) * mK); g.lineTo((v[c2] * q - MT.x0) * mK, (v[c2 + 1] * q - MT.z0) * mK); g.closePath(); }
      g.fill(); g.stroke(); };
    if (W.roadArea) { fillTris(W.roadArea.walk, '#5d6670'); fillTris(W.roadArea.car, '#c9cdd2'); }
    // 幹線は色を付けて重ねる（国道・主要地方道は黄、県道は白）
    g.lineCap = 'round'; g.lineJoin = 'round';
    world.net.edges.forEach(e => {
      const L = e.pts || e.line; if (e.hidden || !L || L.length < 2) return;
      if (W.roadArea && e.pr.rank > 2) return;
      g.strokeStyle = e.pr.rank <= 2 ? '#e2c66e' : e.pr.rank <= 4 ? '#e8e8e8' : '#9aa3ab'; g.lineWidth = Math.max(1.5, e.pr.hw * (W.roadArea ? 0.8 : 2)) * mK;
      g.beginPath(); L.forEach((p, i) => (i ? g.lineTo((p[0] - MT.x0) * mK, (p[1] - MT.z0) * mK) : g.moveTo((p[0] - MT.x0) * mK, (p[1] - MT.z0) * mK))); g.stroke();
    });
  }
  function drawMini() {
    const g = mini.getContext('2d'), S = 170 * DPR, c = S / 2, st = car.st, sc = S / 360;   // 半径 180m
    g.save(); g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(28,34,40,.85)'; g.fillRect(0, 0, S, S);
    g.translate(c, c); g.rotate(Math.PI + st.yaw); g.scale(sc, sc); g.translate(-st.x, -st.z);   // ゲームの x 東・z 南 → 画面（進む向きが上、右は車の右）
    g.imageSmoothingEnabled = true; g.drawImage(miniBase, MT.x0, MT.z0, mSpan, mSpan);
    // 一般車: 進む向きの分かる三角の印（白い縁取り）。画面の大きさがどの端末でも同じになるよう、1 画素あたりの m で大きさを決める
    if (traffic) { const k = 1 / sc * DPR; g.fillStyle = '#4fb6ff'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2 * k;
      traffic.cars.forEach(o => { if (!o.P || Math.abs(o.P.x - st.x) > 260 || Math.abs(o.P.z - st.z) > 260) return; const fx = Math.sin(o.P.yaw), fz = Math.cos(o.P.yaw), r = 5 * k;
        g.beginPath(); g.moveTo(o.P.x + fx * r, o.P.z + fz * r); g.lineTo(o.P.x - fx * r * 0.7 + fz * r * 0.6, o.P.z - fz * r * 0.7 - fx * r * 0.6); g.lineTo(o.P.x - fx * r * 0.7 - fz * r * 0.6, o.P.z - fz * r * 0.7 + fx * r * 0.6); g.closePath(); g.fill(); g.stroke(); }); }
    g.restore();
    // 自車（中心の矢印）
    g.save(); g.translate(c, c); g.fillStyle = '#ff4d3d'; g.strokeStyle = '#fff'; g.lineWidth = 2 * DPR;
    g.beginPath(); g.moveTo(0, -11 * DPR); g.lineTo(8 * DPR, 9 * DPR); g.lineTo(0, 5 * DPR); g.lineTo(-8 * DPR, 9 * DPR); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2 * DPR; g.beginPath(); g.arc(c, c, c - DPR, 0, Math.PI * 2); g.stroke();
  }
  // 出典（狭い画面は短く。全文はクレジットの一覧 assets/data/world/CREDITS.txt）
  const CREDIT = window.innerWidth < 900 ? '出典: 国交省 PLATEAU・地理院タイルを加工 / © OSM / 車: Sketchfab の CC BY 4.0 作品（作者は一覧に）'
    : '出典: 国土交通省 PLATEAU を加工して作成 / 地理院タイル（航空写真・標高）を加工して作成 / © OpenStreetMap contributors / 車: ' + carInfo.map(c => c.source.author).join('・') + '（Sketchfab、CC BY 4.0。assets/data/world/CREDITS.txt）';
  let last = performance.now(), acc = 0, simT = 0, running = true, frames = 0, fpsT = 0, fps = 0, hitT = 0;
  const STEP = 1 / 120;
  function frame(now) {
    if (!running) return;
    // 遅い端末でも実時間で進める（物理は固定刻みで最大 0.25 秒ぶんまで追いつく）
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (paused || garage.isOpen) { last = performance.now(); requestAnimationFrame(frame); return; }
    readInput(dt);
    acc += dt;
    while (acc >= STEP) {
      car.step(STEP, ctl, ground);
      const hit = collide(car.st); if (hit > 3) hitT = 0.4;
      acc -= STEP; simT += STEP;
    }
    trafficStep(dt);
    if (world.props && world.props.update) world.props.update(car.st.x, car.st.z);
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
  setupCsm();   // ここまでに作った材質（道路・建物・一般車・自車）にカスケード影を
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
    draw() { const st = car.st; drawGauge(); drawMini(); if (world.props && world.props.update) world.props.update(st.x, st.z);  carM.root.position.set(st.x, st.y, st.z); carM.root.rotation.set(0, 0, 0); carM.root.rotateY(st.yaw); carM.root.rotateX(-st.pitch); carM.root.rotateZ(st.roll); firstCam = true; carVisual(1 / 60); updateCam(1 / 60); updateSignals(simT); present(); return renderer.domElement.toDataURL('image/jpeg', 0.9); },
    /** 検証用: 真上から見た正射投影（中心 x, z、半分の幅 half m、画素 px）。航空写真と並べて比べる */
    shotTop(x, z, half, px) {
      const oc = new THREE.OrthographicCamera(-half, half, half, -half, 1, 2000), y = W.terrain.at(x, z);
      oc.position.set(x, y + 600, z); oc.up.set(0, 0, -1); oc.lookAt(x, y, z);   // 画像の上が北（−z）
      const fog = scene.fog, sz = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio(); scene.fog = null;
      if (world.props && world.props.update) world.props.update(x, z); if (world.update) world.update(x, z + 1e5); if (world.photoMarks) world.photoMarks.update(x, z);   // 遠くのまとまりはまとめて描き、路面表示は真下の分を描く
      renderer.setPixelRatio(1); renderer.setSize(px || 800, px || 800, false); renderer.render(scene, oc);
      const url = renderer.domElement.toDataURL('image/jpeg', 0.92);
      scene.fog = fog; renderer.setPixelRatio(pr); renderer.setSize(sz.x, sz.y, false); return url;
    },
    /** 時間帯 'day' | 'dusk' | 'night' */
    setTime(m) { sky.setTime(m); },
    /** 車を切り替える（step: 1 で次の車） */
    switchCar(step) { return switchCar(step === undefined ? 1 : step); },
    pose(x, z, yaw) { car.st.x = x; car.st.z = z; car.st.yaw = yaw; car.st.vx = car.st.vy = car.st.r = 0; firstCam = true; }
  };
  return api;
}
