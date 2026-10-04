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
  scene.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, g = toFloat(o.geometry); g.applyMatrix4(o.matrixWorld);
    const transparent = m.transparent || m.opacity < 0.99 || m.alphaMode === 'BLEND';
    if (transparent || m.map) { others.push({ g, m }); return; }
    // 色・金属感・粗さ・塗装かどうかを頂点に
    const n = g.attributes.position.count, col = new Float32Array(n * 3), mr = new Float32Array(n * 2), pt = new Float32Array(n);
    const c = m.color || new THREE.Color(1, 1, 1), e = m.emissive || new THREE.Color(0, 0, 0), isPaint = m.name === 'PAINT';
    for (let i = 0; i < n; i++) { col[i * 3] = c.r + e.r * 0.5; col[i * 3 + 1] = c.g + e.g * 0.5; col[i * 3 + 2] = c.b + e.b * 0.5; mr[i * 2] = m.metalness ?? 0; mr[i * 2 + 1] = m.roughness ?? 0.6; pt[i] = isPaint ? 1 : 0; }
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
  // テクスチャのある部品は材質ごとにまとめる
  const byMat = new Map();
  textured.forEach(({ g, m }) => { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g); });
  byMat.forEach((gs, m) => {
    const keep = ['position', 'normal', 'uv'].filter(a => gs.every(g => g.attributes[a]));
    gs = gs.map(g => { const h = new THREE.BufferGeometry(); keep.forEach(a => h.setAttribute(a, g.attributes[a])); h.setIndex(g.index); return h; });
    const geo = gs.length > 1 ? mergeGeometries(gs) : gs[0];
    const mm = m.clone(); if (m.name === 'PAINT' && mm.color) mm.color.setRGB(1, 1, 1);
    parts.push({ geometry: geo, material: mm, paint: m.name === 'PAINT' });
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
 * 自車: 元の細かい形のまま、材質の種類ごとにまとめる（描画回数を 30 回 → 数回に）。
 * 塗装はクリアコートのある物理材質で別に、テールランプはブレーキで光らせるので別に、車輪は回すので別に返す。
 */
export function playerCar(scene, color) {
  scene.updateMatrixWorld(true);
  const cat = { paint: [], tail: [], wheel: [], clear: [], tex: [], opaque: [] };
  scene.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, g = toFloat(o.geometry); g.applyMatrix4(o.matrixWorld);
    const nm = m.name || '', transparent = m.transparent || m.opacity < 0.99;
    if (/wheel|tire|tyre|rim|brake(?!_?light)/i.test(nm) && !m.map) cat.wheel.push({ g, m });
    else if (nm === 'PAINT' && !m.map) cat.paint.push({ g, m });
    else if (/LIGHTS_T|tail|stop/i.test(nm) && !m.map) cat.tail.push({ g, m });
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
  return { root, tails, wheelGeo: wheel && wheel.geo, wheelMat: wheel && wheel.mat, setColor: c => { if (paint) paint.color.set(c); } };
}
