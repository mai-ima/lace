/*
 * cars.js — 外部の車のモデル（tools/world/vehicles.mjs で変換した glb）を読み、描画しやすい形にまとめる。
 * - 一般車用: テクスチャの無い不透明な部品は、材質の色・金属感・粗さを頂点に焼き込んで 1 つの形にまとめる（描画 1 回）。
 *   塗装の部品（材質名 PAINT）だけ、インスタンスごとの色を掛ける。ガラス（半透明）とテクスチャのある部品は別に残す。
 * - 自車用: 元の形のまま（材質も元のまま）。塗装の色だけ変えられる。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
export const loadGLB = url => loader.loadAsync(url).then(g => g.scene);

/** 量子化（meshopt の整数）された頂点データを浮動小数に戻した複製（行列を掛けたり、まとめたりできるように） */
export function toFloat(src) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = src.attributes[k]; if (!a) continue;
    const n = a.count, sz = a.itemSize, out = new Float32Array(n * sz);
    for (let i = 0; i < n; i++) { out[i * sz] = a.getX(i); if (sz > 1) out[i * sz + 1] = a.getY(i); if (sz > 2) out[i * sz + 2] = a.getZ(i); }
    g.setAttribute(k, new THREE.BufferAttribute(out, sz));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1));
  return g;
}

/** 一般車用にまとめる。返り値: { parts: [{ geometry, material, paint }], size } */
export function fleetParts(scene) {
  scene.updateMatrixWorld(true);
  const opaque = [], others = [];
  // テクスチャのある不透明な材質が多い車（材質ごとに別の画像）は、テクスチャの色を頂点の色に焼き込んで 1 回で描く
  // （一般車は 8m より遠くで見るので、頂点の色で十分。描画の回数が車種ごとに 10 回近く増えるのを防ぐ）
  const texMats = new Set(); scene.traverse(o => { if (o.isMesh && o.material.map && !(o.material.transparent || o.material.opacity < 0.99)) texMats.add(o.material); });
  const bake = texMats.size > 4, pix = new Map();
  const texel = (tex, u, v) => {
    let P = pix.get(tex);
    if (P === undefined) {
      P = null; const im = tex.image;
      if (im && im.width) { const cv = document.createElement('canvas'), w = Math.min(256, im.width), h = Math.min(256, im.height); cv.width = w; cv.height = h; const g2 = cv.getContext('2d', { willReadFrequently: true }); g2.drawImage(im, 0, 0, w, h); P = { d: g2.getImageData(0, 0, w, h).data, w, h }; }
      pix.set(tex, P);
    }
    if (!P) return [1, 1, 1];
    u = u - Math.floor(u); v = v - Math.floor(v);   // glTF のテクスチャは上下を反転しない（flipY = false）
    const x = Math.min(P.w - 1, Math.floor(u * P.w)), y = Math.min(P.h - 1, Math.floor(v * P.h)), k = (y * P.w + x) * 4, lin = c => Math.pow(c / 255, 2.2);
    return [lin(P.d[k]), lin(P.d[k + 1]), lin(P.d[k + 2])];
  };
  scene.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, g = toFloat(o.geometry); g.applyMatrix4(o.matrixWorld);
    const transparent = m.transparent || m.opacity < 0.99 || m.alphaMode === 'BLEND';
    if (transparent || (m.map && !(bake && g.attributes.uv))) { others.push({ g, m }); return; }
    // 色・金属感・粗さ・塗装かどうかを頂点に
    const n = g.attributes.position.count, col = new Float32Array(n * 3), mr = new Float32Array(n * 2), pt = new Float32Array(n);
    const c = m.color || new THREE.Color(1, 1, 1), e = m.emissive || new THREE.Color(0, 0, 0), isPaint = m.name === 'PAINT', UV = m.map ? g.attributes.uv : null;
    for (let i = 0; i < n; i++) { const t = UV ? texel(m.map, UV.getX(i), UV.getY(i)) : null; col[i * 3] = c.r * (t ? t[0] : 1) + e.r * 0.5; col[i * 3 + 1] = c.g * (t ? t[1] : 1) + e.g * 0.5; col[i * 3 + 2] = c.b * (t ? t[2] : 1) + e.b * 0.5; mr[i * 2] = m.metalness ?? 0; mr[i * 2 + 1] = m.roughness ?? 0.6; pt[i] = isPaint ? 1 : 0; }
    const h = new THREE.BufferGeometry();
    h.setAttribute('position', g.attributes.position); h.setAttribute('normal', g.attributes.normal || g.computeVertexNormals() || g.attributes.normal);
    h.setAttribute('color', new THREE.BufferAttribute(col, 3)); h.setAttribute('aMR', new THREE.BufferAttribute(mr, 2)); h.setAttribute('aPaint', new THREE.BufferAttribute(pt, 1));
    h.setIndex(g.index ? g.index : null);
    opaque.push(h.index ? h : h.toNonIndexed());
  });
  const parts = [];
  if (opaque.length) {
    const idx = opaque.every(g => g.index), geo = mergeGeometries(idx ? opaque : opaque.map(g => g.index ? g.toNonIndexed() : g));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMR; attribute float aPaint; varying vec2 vMR;')
        .replace('#include <color_vertex>', `vColor = vec4(1.0); vColor.rgb = color;
          #ifdef USE_INSTANCING_COLOR
            vColor.rgb = mix(color, color * instanceColor, aPaint);   // 塗装の部品だけ車ごとの色
          #endif
          vMR = aMR;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMR;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vMR.x;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vMR.y;');
    };
    mat.customProgramCacheKey = () => 'fleetMerged';
    parts.push({ geometry: geo, material: mat, paint: true });
  }
  // テクスチャの無い半透明の部品（ガラス・ランプのレンズ）は、色と不透明度を頂点に入れて 1 つにまとめる
  const clear = others.filter(({ m }) => !m.map), textured = others.filter(({ m }) => m.map);
  if (clear.length) {
    const gs = clear.map(({ g, m }) => {
      const n = g.attributes.position.count, col = new Float32Array(n * 4), c = m.color || new THREE.Color(1, 1, 1), a = m.opacity ?? 0.5;
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b, Math.min(0.92, Math.max(0.25, a))], i * 4);
      const h = new THREE.BufferGeometry(); h.setAttribute('position', g.attributes.position); h.setAttribute('normal', g.attributes.normal); h.setAttribute('color', new THREE.BufferAttribute(col, 4)); h.setIndex(g.index); return h;
    });
    parts.push({ geometry: mergeGeometries(gs), material: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.08, metalness: 0.1, depthWrite: false }), paint: false });
  }
  // テクスチャのある部品は、同じテクスチャの画像を使うものを 1 つにまとめる（描画の回数を減らす）。材質ごとの色は頂点の色に入れる
  const byTex = new Map();
  textured.forEach(({ g, m }) => { const key = (m.map.source && m.map.source.uuid || m.map.uuid) + (m.name === 'PAINT' ? ':paint' : ''); if (!byTex.has(key)) byTex.set(key, []); byTex.get(key).push({ g, m }); });
  byTex.forEach(list => {
    const m0 = list[0].m, keep = ['position', 'normal', 'uv'].filter(a => list.every(({ g }) => g.attributes[a]));
    const gs = list.map(({ g, m }) => {
      const h = new THREE.BufferGeometry(); keep.forEach(a => h.setAttribute(a, g.attributes[a])); h.setIndex(g.index);
      const n = g.attributes.position.count, col = new Float32Array(n * 3), c = m.name === 'PAINT' ? new THREE.Color(1, 1, 1) : (m.color || new THREE.Color(1, 1, 1));
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      h.setAttribute('color', new THREE.BufferAttribute(col, 3)); return h;
    });
    const geo = gs.length > 1 ? mergeGeometries(gs) : gs[0];
    const mm = m0.clone(); mm.vertexColors = true; if (mm.color) mm.color.setRGB(1, 1, 1);
    parts.push({ geometry: geo, material: mm, paint: m0.name === 'PAINT' });
  });
  const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3());
  return { parts, size };
}

/** 頂点に色・金属感・粗さ・塗装の印を入れて 1 つにまとめた形と、それを描く材質 */
function bakeMerged(list, paintTint) {
  const gs = list.map(({ g, m }) => {
    const n = g.attributes.position.count, col = new Float32Array(n * 3), mr = new Float32Array(n * 2), pt = new Float32Array(n);
    const c = m.color || new THREE.Color(1, 1, 1), e = m.emissive || new THREE.Color(0, 0, 0), isPaint = m.name === 'PAINT';
    for (let i = 0; i < n; i++) { col[i * 3] = c.r + e.r * 0.5; col[i * 3 + 1] = c.g + e.g * 0.5; col[i * 3 + 2] = c.b + e.b * 0.5; mr[i * 2] = m.metalness ?? 0; mr[i * 2 + 1] = m.roughness ?? 0.6; pt[i] = isPaint ? 1 : 0; }
    const h = new THREE.BufferGeometry();
    h.setAttribute('position', g.attributes.position); h.setAttribute('normal', g.attributes.normal);
    h.setAttribute('color', new THREE.BufferAttribute(col, 3)); h.setAttribute('aMR', new THREE.BufferAttribute(mr, 2)); h.setAttribute('aPaint', new THREE.BufferAttribute(pt, 1));
    h.setIndex(g.index); return h;
  });
  const geo = mergeGeometries(gs), mat = new THREE.MeshStandardMaterial({ vertexColors: true });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMR; varying vec2 vMR;').replace('#include <color_vertex>', '#include <color_vertex>\nvMR = aMR;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMR;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vMR.x;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vMR.y;');
  };
  mat.customProgramCacheKey = () => 'carMerged';
  return { geo, mat };
}

/**
 * 車輪を形で見つけて切り出す（部品や材質の名前に頼らない。テクスチャのあるタイヤ・名前の無い車輪・車体と 1 つの形の車輪も扱う）。
 * 1. 部品を、頂点（1mm でまとめる）でつながった塊に分ける。
 * 2. 車体の下の四隅にある、横から見て円い塊（直径 0.45〜1.0m）をタイヤとみなし、四隅ごとに車輪の範囲と中心を決める。
 * 3. 車輪の範囲に収まる塊を車輪の部品にする。中心（車軸）を囲む塊（タイヤ・ホイール・ナット・ディスク）は回し、
 *    囲まない塊（ブレーキのキャリパー）は向きだけ変える。
 * 返り値: { body: [{ g, m }], wheels: { RF: { c, r, spin: [{ g, m }], steer: [{ g, m }] }, ... } }。見つからなければ null
 */
export function extractWheels(list) {
  const all = new THREE.Box3(); list.forEach(({ g }) => { g.computeBoundingBox(); all.union(g.boundingBox); });
  const S = all.getSize(new THREE.Vector3());
  const comps = [];   // { li, tris: [], b: Box3 }
  list.forEach(({ g }, li) => {
    const P = g.attributes.position.array, n = P.length / 3, I = g.index ? g.index.array : null, nt = I ? I.length / 3 : n / 3;
    const weld = new Map(), wid = new Int32Array(n);
    for (let i = 0; i < n; i++) { const k = Math.round(P[i * 3] * 1000) + ',' + Math.round(P[i * 3 + 1] * 1000) + ',' + Math.round(P[i * 3 + 2] * 1000); let w = weld.get(k); if (w === undefined) { w = weld.size; weld.set(k, w); } wid[i] = w; }
    const par = new Int32Array(weld.size).map((_, i) => i), find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const vi = (t, k) => I ? I[t * 3 + k] : t * 3 + k;
    for (let t = 0; t < nt; t++) { const a = find(wid[vi(t, 0)]), b = find(wid[vi(t, 1)]), c = find(wid[vi(t, 2)]); if (a !== b) par[a] = b; const b2 = find(b); if (find(c) !== b2) par[find(c)] = b2; }
    const byRoot = new Map(), v = new THREE.Vector3();
    for (let t = 0; t < nt; t++) {
      const r = find(wid[vi(t, 0)]); let C = byRoot.get(r); if (!C) { C = { li, tris: [], b: new THREE.Box3() }; byRoot.set(r, C); comps.push(C); }
      C.tris.push(t); for (let k = 0; k < 3; k++) { const i = vi(t, k); C.b.expandByPoint(v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])); }
    }
  });
  // タイヤの候補 → 四隅の車輪の範囲
  const vol = {}, tirePts = {};
  comps.forEach(C => {
    const s = C.b.getSize(new THREE.Vector3()), c = C.b.getCenter(new THREE.Vector3());
    if (C.b.min.y > all.min.y + S.y * 0.12 || s.y < 0.45 || s.y > 1.0 || Math.abs(s.y - s.z) > s.y * 0.2 || s.x < 0.08 || s.x > 0.5) return;
    if (Math.abs(c.x - (all.min.x + all.max.x) / 2) < S.x * 0.2 || Math.abs(c.z - (all.min.z + all.max.z) / 2) < S.z * 0.2) return;
    // 輪の形か: 横から見て、中心の周り 12 方向のうち 11 方向以上に頂点がある（フェンダー・泥よけのような半円の部品を除く）
    const { g } = list[C.li], P = g.attributes.position.array, I = g.index ? g.index.array : null, bins = new Uint8Array(12);
    C.tris.forEach(t => { for (let k = 0; k < 3; k++) { const i = I ? I[t * 3 + k] : t * 3 + k, dy = P[i * 3 + 1] - c.y, dz = P[i * 3 + 2] - c.z; if (dy * dy + dz * dz > s.y * s.y * 0.04) bins[Math.floor((Math.atan2(dy, dz) + Math.PI) / (2 * Math.PI) * 12) % 12] = 1; } });
    if (bins.reduce((a, b) => a + b, 0) < 11) return;
    const key = (c.x > (all.min.x + all.max.x) / 2 ? 'R' : 'L') + (c.z > (all.min.z + all.max.z) / 2 ? 'F' : 'B');
    (vol[key] = vol[key] || new THREE.Box3()).union(C.b);
    (tirePts[key] = tirePts[key] || []).push(C);
  });
  if (Object.keys(vol).length !== 4) return null;
  const wheels = {};
  Object.entries(vol).forEach(([k, b]) => {
    const c = b.getCenter(new THREE.Vector3());
    // 車軸の向き（上から見た角度）: タイヤの頂点の広がりがいちばん小さい水平の向き。モデルの前輪がハンドルを切った形で作られていても、まっすぐに直してから回す
    let best = 0, bv = Infinity;
    for (let a = -0.6; a <= 0.6; a += 0.01) {
      const ux = Math.cos(a), uz = Math.sin(a); let s = 0, n = 0;
      tirePts[k].forEach(C => { const { g } = list[C.li], P = g.attributes.position.array, I = g.index ? g.index.array : null; for (let j = 0; j < C.tris.length; j += 4) { const i = I ? I[C.tris[j] * 3] : C.tris[j] * 3, d = (P[i * 3] - c.x) * ux + (P[i * 3 + 2] - c.z) * uz; s += d * d; n++; } });
      if (n && s / n < bv) { bv = s / n; best = a; }
    }
    wheels[k] = { c, yaw: Math.abs(best) > 0.03 ? best : 0, r: b.getSize(new THREE.Vector3()).y / 2, b: b.clone().expandByVector(new THREE.Vector3(0.03 + Math.abs(best) * 0.3, 0.03, 0.03 + Math.abs(best) * 0.3)), spin: [], steer: [] };
  });
  // 内側（車体の中心の側）へは 12cm 余分に（ハブ・ディスク）
  Object.values(wheels).forEach(w => { if (w.c.x > (all.min.x + all.max.x) / 2) w.b.min.x -= 0.12; else w.b.max.x += 0.12; });
  const take = list.map(() => new Map());   // li → (tri → { w, spin })
  comps.forEach(C => {
    const W = Object.values(wheels).find(w => w.b.containsBox(C.b)); if (!W) return;
    const hold = C.b.min.y <= W.c.y && C.b.max.y >= W.c.y && C.b.min.z <= W.c.z && C.b.max.z >= W.c.z;   // 車軸を囲む → 回る
    if (!hold) { const cc = C.b.getCenter(new THREE.Vector3()); if (Math.hypot(cc.y - W.c.y, cc.z - W.c.z) > W.r * 0.7) return; }   // 輪の縁の外寄り（泥よけなど）は車体のまま
    C.tris.forEach(t => take[C.li].set(t, { W, spin: hold }));
  });
  const sub = (g, tris, shift, yaw) => {   // 三角形を取り出した新しい形（shift: 原点をずらす、yaw: 車軸をまっすぐに直す回転）
    const I = g.index ? g.index.array : null, map = new Map(), ix = [], names = Object.keys(g.attributes);
    tris.forEach(t => { for (let k = 0; k < 3; k++) { const v0 = I ? I[t * 3 + k] : t * 3 + k; let n = map.get(v0); if (n === undefined) { n = map.size; map.set(v0, n); } ix.push(n); } });
    const h = new THREE.BufferGeometry();
    names.forEach(nm => { const A = g.attributes[nm], s = A.itemSize, arr = new Float32Array(map.size * s); map.forEach((n, v0) => { for (let k = 0; k < s; k++) arr[n * s + k] = A.array[v0 * s + k]; }); h.setAttribute(nm, new THREE.BufferAttribute(arr, s)); });
    h.setIndex(ix); if (shift) h.translate(-shift.x, -shift.y, -shift.z); if (yaw) h.rotateY(yaw); return h;
  };
  const body = [];
  list.forEach(({ g, m }, li) => {
    const T = take[li], nt = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    if (!T.size) { body.push({ g, m }); return; }
    const rest = []; for (let t = 0; t < nt; t++) if (!T.has(t)) rest.push(t);
    if (rest.length) body.push({ g: sub(g, rest), m });
    const groups = new Map(); T.forEach((o, t) => { const k = o.W.c.x + ',' + o.W.c.z + ',' + o.spin; let L = groups.get(k); if (!L) groups.set(k, L = { o, ts: [] }); L.ts.push(t); });
    groups.forEach(({ o, ts }) => (o.spin ? o.W.spin : o.W.steer).push({ g: sub(g, ts, o.W.c, o.W.yaw), m }));
  });
  return { body, wheels };
}

/**
 * 自車: 元の細かい形のまま、材質の種類ごとにまとめる（描画回数を 30 回 → 数回に）。
 * 塗装はクリアコートのある物理材質で別に、テールランプはブレーキで光らせるので別に、車輪は回すので別に返す。
 */
export function playerCar(scene, color) {
  scene.updateMatrixWorld(true);
  const cat = { paint: [], tail: [], wheel: [], clear: [], tex: [], opaque: [] };
  const src = []; scene.traverse(o => { if (!o.isMesh) return; const g = toFloat(o.geometry); g.applyMatrix4(o.matrixWorld); src.push({ g, m: o.material }); });
  const ex = extractWheels(src);   // 形で見つけた車輪（見つからなければ材質の名前で）
  (ex ? ex.body : src).forEach(({ g, m }) => {
    const nm = m.name || '', transparent = m.transparent || m.opacity < 0.99;
    if (!ex && /wheel|tire|tyre|rim|brake(?!_?light)/i.test(nm) && !m.map) cat.wheel.push({ g, m });
    else if (nm === 'PAINT' && !m.map) cat.paint.push({ g, m });
    else if (/LIGHTS_T|tail|stop|red_?lights?/i.test(nm) && !m.map) cat.tail.push({ g, m });
    else if (m.map) cat.tex.push({ g, m });
    else if (transparent) cat.clear.push({ g, m });
    else cat.opaque.push({ g, m });
  });
  const root = new THREE.Group(), add = (geo, mat, shadow) => { const me = new THREE.Mesh(geo, mat); me.castShadow = shadow; me.receiveShadow = true; root.add(me); return me; };
  const strip = gs => gs.map(({ g }) => { const h = new THREE.BufferGeometry(); h.setAttribute('position', g.attributes.position); h.setAttribute('normal', g.attributes.normal); if (g.attributes.uv) h.setAttribute('uv', g.attributes.uv); h.setIndex(g.index); return h; });
  if (cat.opaque.length) { const b = bakeMerged(cat.opaque); add(b.geo, b.mat, true); }
  let paint = null;
  if (cat.paint.length) {
    const m0 = cat.paint[0].m;
    paint = new THREE.MeshPhysicalMaterial({ color, metalness: Math.max(0.35, m0.metalness ?? 0.4), roughness: Math.min(0.35, m0.roughness ?? 0.3), clearcoat: 1, clearcoatRoughness: 0.05, name: 'PAINT' });
    add(mergeGeometries(strip(cat.paint).map(h => { h.deleteAttribute('uv'); return h; })), paint, true);
  }
  const tails = [];
  if (cat.tail.length) { const b = bakeMerged(cat.tail); b.mat.emissive = new THREE.Color(0xff1a10); b.mat.emissiveIntensity = 0; tails.push(b.mat); add(b.geo, b.mat, false); }
  if (cat.clear.length) {
    const gs = cat.clear.map(({ g, m }) => { const n = g.attributes.position.count, col = new Float32Array(n * 4), c = m.color || new THREE.Color(1, 1, 1), a = m.opacity ?? 0.5; for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b, Math.min(0.92, Math.max(0.25, a))], i * 4); const h = new THREE.BufferGeometry(); h.setAttribute('position', g.attributes.position); h.setAttribute('normal', g.attributes.normal); h.setAttribute('color', new THREE.BufferAttribute(col, 4)); h.setIndex(g.index); return h; });
    add(mergeGeometries(gs), new THREE.MeshPhysicalMaterial({ vertexColors: true, transparent: true, roughness: 0.04, metalness: 0, depthWrite: false }), false);
  }
  const byMat = new Map(); cat.tex.forEach(({ g, m }) => { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push({ g, m }); });
  byMat.forEach((list, m) => { const gs = strip(list); const keep = ['position', 'normal', 'uv'].filter(a => gs.every(h => h.attributes[a])); add(mergeGeometries(gs.map(h => { Object.keys(h.attributes).forEach(a => { if (!keep.includes(a)) h.deleteAttribute(a); }); return h; })), m, true); });
  const wheel = cat.wheel.length ? bakeMerged(cat.wheel) : null;
  // 形で見つけた車輪: 輪ごとに「向き（操舵）」の箱の中に「回転」の箱を入れ、輪の中心を原点にする。テクスチャのある部品は材質のまま
  let wheels = null;
  if (ex) {
    wheels = {};
    Object.entries(ex.wheels).forEach(([key, w]) => {
      const steer = new THREE.Group(), spin = new THREE.Group(); steer.position.copy(w.c); steer.add(spin); root.add(steer);
      const put = (parts, grp) => {
        const plain = parts.filter(p => !p.m.map), tex = parts.filter(p => p.m.map);
        if (plain.length) { const b = bakeMerged(plain); const me = new THREE.Mesh(b.geo, b.mat); me.castShadow = true; me.receiveShadow = true; grp.add(me); }
        const byM = new Map(); tex.forEach(p => { if (!byM.has(p.m)) byM.set(p.m, []); byM.get(p.m).push(p.g); });
        byM.forEach((gs, m) => { const keep = ['position', 'normal', 'uv'].filter(a => gs.every(h => h.attributes[a])); const me = new THREE.Mesh(mergeGeometries(gs.map(h => { Object.keys(h.attributes).forEach(a => { if (!keep.includes(a)) h.deleteAttribute(a); }); return h; })), m); me.castShadow = true; me.receiveShadow = true; grp.add(me); });
      };
      put(w.spin, spin); put(w.steer, steer);
      wheels[key] = { steer, spin, key, front: key[1] === 'F', r: w.r };
    });
  }
  return { root, tails, wheels, wheelGeo: wheel && wheel.geo, wheelMat: wheel && wheel.mat, setColor: c => { if (paint) paint.color.set(c); } };
}
