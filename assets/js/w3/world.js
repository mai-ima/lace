/*
 * world.js — 3D の世界を組み立てる（地形・航空写真の地面・道路・路面表示・建物・信号・空と光）。
 * three.js r186（ES モジュール）。品質の段階（gfx）で影や描画距離を変える。
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { build, markings, signals, ribbon } from './roadnet.js';

const LAT0 = 34.7037, LON0 = 137.7351, KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KZ = 110574;

/** 写真の素材（race-tex.js の Poly Haven CC0）を、世界の座標で繰り返すテクスチャに */
function photoTex(key, rep, color) {
  const src = window.TB && TB.RaceTex && TB.RaceTex[key];
  if (!src) return null;
  const t = new THREE.TextureLoader().load(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 地理院の航空写真（z17）を 1 枚のテクスチャにまとめる（地形の範囲） */
function orthoTexture(terr, z, onReady) {
  const n = 2 ** z;
  const lon = x => LON0 + x / KX, lat = zz => LAT0 - zz / KZ;
  const tx = l => (l + 180) / 360 * n, ty = la => (1 - Math.log(Math.tan(la * Math.PI / 180) + 1 / Math.cos(la * Math.PI / 180)) / Math.PI) / 2 * n;
  const X0 = terr.x0, X1 = terr.x0 + (terr.nx - 1) * terr.cell, Z0 = terr.z0, Z1 = terr.z0 + (terr.nz - 1) * terr.cell;
  const W = 4096, Hh = 4096;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d'); g.fillStyle = '#6d7363'; g.fillRect(0, 0, W, Hh);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const i0 = Math.floor(tx(lon(X0))), i1 = Math.floor(tx(lon(X1))), j0 = Math.floor(ty(lat(Z0))), j1 = Math.floor(ty(lat(Z1)));
  const la = t => Math.atan(Math.sinh(Math.PI * (1 - 2 * t / n))) * 180 / Math.PI;
  let left = (i1 - i0 + 1) * (j1 - j0 + 1);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      const x0 = (i / n * 360 - 180 - LON0) * KX, x1 = ((i + 1) / n * 360 - 180 - LON0) * KX;
      const z0 = (LAT0 - la(j)) * KZ, z1 = (LAT0 - la(j + 1)) * KZ;
      g.drawImage(im, (x0 - X0) / (X1 - X0) * W, (z0 - Z0) / (Z1 - Z0) * Hh, (x1 - x0) / (X1 - X0) * W, (z1 - z0) / (Z1 - Z0) * Hh);
      tex.needsUpdate = true; if (--left === 0 && onReady) onReady();
    };
    let tries = 0;
    const url = `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${i}/${j}.jpg`;
    im.onerror = () => { if (++tries < 4) setTimeout(() => { im.src = url + '?r=' + tries; }, 400 * tries + Math.random() * 400); else if (--left === 0 && onReady) onReady(); };
    im.src = url;
  }
  return tex;
}

export function buildWorld(scene, W, gfx) {
  const out = { group: new THREE.Group(), anim: [] };
  scene.add(out.group);
  const terr = W.terrain;
  /* --- 地形 --- */
  const geo = new THREE.PlaneGeometry((terr.nx - 1) * terr.cell, (terr.nz - 1) * terr.cell, terr.nx - 1, terr.nz - 1);
  geo.rotateX(-Math.PI / 2);
  const pa = geo.attributes.position;
  for (let j = 0; j < terr.nz; j++) for (let i = 0; i < terr.nx; i++) {
    const k = j * terr.nx + i;
    pa.setX(k, terr.x0 + i * terr.cell); pa.setZ(k, terr.z0 + j * terr.cell); pa.setY(k, terr.H[k] - 0.15);
  }
  geo.computeVertexNormals();
  // 同梱の航空写真（tools/world/ortho.py で作成）を使う。無ければ地理院タイルから組み立てる
  out.orthoReady = new Promise(r => {
    out.ortho = new THREE.TextureLoader().load(W.base + 'ortho.jpg', () => r(), undefined, () => {
      const t = orthoTexture(terr, gfx.orthoZ || 17, r); groundMat.map = t; groundMat.needsUpdate = true; out.ortho = t;
    });
    out.ortho.colorSpace = THREE.SRGBColorSpace; out.ortho.anisotropy = 8;
  });
  const groundMat = new THREE.MeshStandardMaterial({ map: out.ortho, roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(geo, groundMat); ground.receiveShadow = true; out.group.add(ground);

  /* --- 道路網 --- */
  const net = build(W.roads, (x, z) => terr.at(x, z));
  out.net = net;
  const asph = photoTex('asphalt', 1, true), conc = photoTex('concrete', 1, true);
  function worldUV(g, s) { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / s; uv[i * 2 + 1] = p.getZ(i) / s; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
  const roadGeos = [], walkGeos = [];
  function strip(R, y0, side) {   // R: ribbon の結果。2 本の縁の間の面
    const n = R.length, pos = new Float32Array(n * 6), ix = [];
    for (let i = 0; i < n; i++) { pos.set([R[i][0], R[i][4] + y0, R[i][1], R[i][2], R[i][4] + y0, R[i][3]], i * 6); if (i) { const a = (i - 1) * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    return upGeo(pos, ix);
  }
  // 面が上を向くように三角形の向きをそろえる（上から見て反時計回り）
  function upGeo(pos, ix) {
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
      if (uz * vx - ux * vz < 0) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; }   // 法線の y 成分 = uz*vx - ux*vz
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals(); return g;
  }
  function wall(R, yTop, yBot, useA) {   // 縁石の側面
    const n = R.length, pos = new Float32Array(n * 6), ix = [];
    for (let i = 0; i < n; i++) { const x = useA ? R[i][0] : R[i][2], z = useA ? R[i][1] : R[i][3]; pos.set([x, R[i][4] + yTop, z, x, R[i][4] + yBot, z], i * 6); if (i) { const a = (i - 1) * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals(); return g;
  }
  net.edges.forEach(e => {
    if (e.line.length < 2) return;
    const pr = e.pr;
    let g = strip(ribbon(e, -pr.hw, pr.hw), 0.05, true);
    roadGeos.push(g);
    if (pr.walk > 0) [[-1], [1]].forEach(([s]) => {
      const a = s < 0 ? -pr.hw - pr.walk : pr.hw, b = s < 0 ? -pr.hw : pr.hw + pr.walk;
      walkGeos.push(strip(ribbon(e, a, b), 0.2, true));
      const R = ribbon(e, s < 0 ? -pr.hw : pr.hw, s < 0 ? -pr.hw : pr.hw);
      walkGeos.push(wall(R, 0.2, 0.04, true));
    });
  });
  net.junctions.forEach(n => {
    const P = n.poly, m = P.length, pos = new Float32Array((m + 1) * 3), ix = [];
    let cx = 0, cz = 0; P.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= m; cz /= m;
    pos.set([cx, terr.at(cx, cz) + 0.055, cz], 0);
    P.forEach((p, i) => { pos.set([p[0], terr.at(p[0], p[1]) + 0.055, p[1]], (i + 1) * 3); ix.push(0, i + 1, ((i + 1) % m) + 1); });
    roadGeos.push(upGeo(pos, ix));
  });
  const roadMat = new THREE.MeshStandardMaterial({ map: asph, color: 0xa4a6aa, roughness: 0.9, metalness: 0 });
  if (asph) asph.repeat.set(1, 1);
  // 舗装のむら: 大きな面の明暗（補修の跡・打ち替え）と、細かいざらつき。世界座標の値で作るので継ぎ目が出ない
  roadMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRP;
      float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rh(i), rh(i + vec2(1, 0)), f.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float big = rn(vRP.xz / 38.0) * 0.6 + rn(vRP.xz / 9.0) * 0.4;
        vec2 pc = floor(vRP.xz / 7.0); float patchy = step(0.86, rh(pc)) * step(0.15, fract(vRP.x / 7.0)) * step(fract(vRP.x / 7.0), 0.85) * step(0.2, fract(vRP.z / 7.0)) * step(fract(vRP.z / 7.0), 0.75);
        diffuseColor.rgb *= 0.84 + 0.26 * big;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.78, patchy);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor - 0.08 * big, 0.6, 1.0);');
  };
  const roads = new THREE.Mesh(worldUV(mergeGeometries(roadGeos), 6), roadMat); roads.receiveShadow = true; out.group.add(roads);
  if (walkGeos.length) {
    const walk = new THREE.Mesh(worldUV(mergeGeometries(walkGeos), 3), new THREE.MeshStandardMaterial({ map: conc, color: 0xb8b6ae, roughness: 0.9, side: THREE.DoubleSide }));
    walk.receiveShadow = true; out.group.add(walk);
  }
  /* --- 路面表示 --- */
  const mk = markings(net), mp = new Float32Array(mk.length * 12), mc = new Float32Array(mk.length * 12), mi = [];
  const white = [0.92, 0.92, 0.9], yellow = [0.95, 0.72, 0.15];
  mk.forEach((m, k) => {
    m.q.forEach((p, j) => { mp.set([p[0], terr.at(p[0], p[1]) + 0.075, p[1]], k * 12 + j * 3); mc.set(m.c === 'y' ? yellow : white, k * 12 + j * 3); });
    const b = k * 4; mi.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('color', new THREE.BufferAttribute(mc, 3)); mg.setIndex(mi); mg.computeVertexNormals();
  const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const marks = new THREE.Mesh(mg, markMat); marks.receiveShadow = true; out.group.add(marks);

  /* --- 建物（PLATEAU LOD2）: 用途と高さで、壁・屋根・窓を変える --- */
  const B = W.bldg, bg = new THREE.BufferGeometry(), nb = B.info.length;
  bg.setAttribute('position', new THREE.BufferAttribute(B.pos, 3));
  bg.setIndex(new THREE.BufferAttribute(B.idx, 1));
  // 建物ごとの下端と上端（頂点から）
  const yLo = new Float32Array(nb).fill(1e9), yHi = new Float32Array(nb).fill(-1e9);
  for (let v = 0; v < B.bid.length; v++) { const k = B.bid[v], y = B.pos[v * 3 + 1]; if (y < yLo[k]) yLo[k] = y; if (y > yHi[k]) yHi[k] = y; }
  // 種類: 0 戸建て 1 共同住宅 2 店舗・事務所 3 工場・倉庫 4 学校・病院など
  const KIND = { '住宅': 0, '店舗等併用住宅': 0, '共同住宅': 1, '店舗等併用共同住宅': 1, '宿泊施設': 1, '商業施設': 2, '業務施設': 2, '商業系複合施設': 2, '運輸倉庫施設': 3, '工場': 3, '文教厚生施設': 4 };
  // 外壁（浜松の写真で多い色: 白〜ベージュのサイディング、灰色のタイル、薄茶のタイル）と屋根（灰・こげ茶・青灰・赤茶）
  const WALL = [[[0.86, 0.84, 0.78], [0.8, 0.76, 0.68], [0.9, 0.9, 0.88], [0.7, 0.68, 0.64], [0.78, 0.72, 0.62]],
    [[0.84, 0.82, 0.78], [0.74, 0.72, 0.7], [0.8, 0.74, 0.66], [0.88, 0.87, 0.84]],
    [[0.72, 0.74, 0.76], [0.8, 0.8, 0.78], [0.64, 0.66, 0.68], [0.76, 0.72, 0.66]],
    [[0.78, 0.8, 0.8], [0.68, 0.72, 0.76], [0.84, 0.84, 0.82]],
    [[0.86, 0.84, 0.8], [0.8, 0.78, 0.72]]];
  const ROOF = [[[0.36, 0.37, 0.39], [0.3, 0.24, 0.2], [0.3, 0.36, 0.42], [0.5, 0.3, 0.24], [0.48, 0.48, 0.46]],
    [[0.62, 0.62, 0.6]], [[0.58, 0.58, 0.56], [0.5, 0.52, 0.54]], [[0.7, 0.72, 0.72], [0.52, 0.58, 0.64], [0.6, 0.6, 0.58]], [[0.6, 0.6, 0.58]]];
  const col = new Float32Array(B.pos.length), roof = new Float32Array(B.pos.length), bi = new Float32Array(B.pos.length);
  const hash = (k, s2) => (((k + 1) * 2654435761 ^ (s2 * 40503)) >>> 0) / 4294967296;
  for (let v = 0; v < B.bid.length; v++) {
    const k = B.bid[v], inf = B.info[k] || {}, h = yHi[k] - yLo[k];
    let kind = KIND[inf.u]; if (kind === undefined) kind = h > 12 ? 2 : 0;
    if (kind === 0 && h > 11) kind = 1;
    const wl = WALL[kind], rf = ROOF[kind];
    const w = wl[Math.floor(hash(k, 1) * wl.length)], r = rf[Math.floor(hash(k, 2) * rf.length)], j = 0.94 + hash(k, 3) * 0.1;
    col.set([w[0] * j, w[1] * j, w[2] * j], v * 3); roof.set([r[0] * j, r[1] * j, r[2] * j], v * 3);
    bi.set([yLo[k], yHi[k], kind + hash(k, 4) * 0.5], v * 3);
  }
  bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bg.setAttribute('aRoof', new THREE.BufferAttribute(roof, 3));
  bg.setAttribute('aBld', new THREE.BufferAttribute(bi, 3));
  const bmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, flatShading: true });
  // 窓（シェーダー）: 階の高さは種類ごと（戸建て 2.9m・共同住宅 2.9m・事務所 3.6m）、1 階は店の大きなガラス、屋上の手すり部分は窓なし
  bmat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aRoof; attribute vec3 aBld; varying vec3 vWP; varying vec3 vRoof; varying vec3 vBld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vRoof = aRoof; vBld = aBld;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vRoof; varying vec3 vBld;\nfloat h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wdx = dFdx(vWP), wdy = dFdy(vWP); vec3 fn = normalize(cross(wdx, wdy));
        float kind = floor(vBld.z), rel = vWP.y - vBld.x, top = vBld.y - vBld.x;
        if (abs(fn.y) > 0.3) { diffuseColor.rgb = vRoof; }
        else {
          float fh = kind < 1.5 ? 2.9 : 3.6, bay = kind < 0.5 ? 3.4 : kind < 1.5 ? 3.0 : kind < 2.5 ? 1.8 : 6.0;
          float u = dot(vWP.xz, normalize(vec2(-fn.z, fn.x)));
          float fl = floor(rel / fh), fy = fract(rel / fh), fu = fract(u / bay), cell = h21(vec2(floor(u / bay), fl) + vBld.z * 7.0);
          float wy0 = kind < 0.5 ? 0.3 : kind < 1.5 ? 0.32 : 0.22, wy1 = kind < 1.5 ? 0.78 : 0.86;
          float wu0 = kind < 0.5 ? 0.3 : kind < 1.5 ? 0.12 : 0.04, wu1 = 1.0 - wu0;
          float win = step(wy0, fy) * step(fy, wy1) * step(wu0, fu) * step(fu, wu1);
          if (kind > 2.5 && kind < 3.5) win *= step(0.62, fy) * step(fy, 0.8) * step(0.5, cell);   // 工場は高い位置の横長窓だけ
          if (kind < 0.5) win *= step(0.25, cell);   // 戸建ては窓の無い面も混ぜる
          win *= step(rel, top - 0.9) * step(0.0, rel);
          float shop = (kind > 1.5 && kind < 2.5 && rel < 3.8) ? 1.0 : 0.0;
          if (shop > 0.5) win = step(0.06, fract(u / 4.5)) * step(0.15, rel) * step(rel, 3.0);
          float mull = (kind > 1.5 && kind < 2.5) ? step(0.94, fract(u / 1.2)) : 0.0;
          vec3 sky = mix(vec3(0.2, 0.25, 0.3), vec3(0.5, 0.6, 0.68), clamp(fy * 0.8 + cell * 0.3, 0.0, 1.0));
          vec3 glass = mix(vec3(0.1, 0.12, 0.14), sky, 0.35 + 0.4 * cell);
          if (shop > 0.5) glass = mix(vec3(0.18, 0.17, 0.15), vec3(0.42, 0.4, 0.36), cell);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * (1.0 - mull * 0.8));
          // 階ごとの床の帯（共同住宅のベランダ・事務所の腰壁）と、屋上の笠木
          float band = (kind > 0.5 && kind < 2.5) ? step(fy, 0.08) * step(fh, rel) : 0.0;
          diffuseColor.rgb *= 1.0 - band * 0.12;
          diffuseColor.rgb *= 1.0 - 0.18 * step(top - 0.25, rel);
          diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 4.0, rel);   // 地面の近くは少し暗く（汚れ・陰）
        }`);
  };
  const bmesh = new THREE.Mesh(bg, bmat); bmesh.castShadow = true; bmesh.receiveShadow = true; out.group.add(bmesh);

  /* --- 信号機（LED 薄型の横型 3 灯、φ250、灯器の下端 5.0m 以上） --- */
  const sigs = signals(net);
  out.signals = sigs;
  const poleG = new THREE.CylinderGeometry(0.13, 0.15, 6.2, 10); poleG.translate(0, 3.1, 0);
  const armG = new THREE.BoxGeometry(0.09, 0.09, 1); armG.translate(0, 0, 0.5);
  const headG = new THREE.BoxGeometry(1.05, 0.37, 0.12);
  const lampG = new THREE.CircleGeometry(0.11, 16);
  const metal = new THREE.MeshStandardMaterial({ color: 0x8f969c, roughness: 0.5, metalness: 0.6 });
  const headM = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6 });
  const off = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.3 });
  const lampM = { green: new THREE.MeshStandardMaterial({ color: 0x0b2a22, emissive: 0x00e0b0, emissiveIntensity: 0 }), yellow: new THREE.MeshStandardMaterial({ color: 0x2a2208, emissive: 0xffb000, emissiveIntensity: 0 }), red: new THREE.MeshStandardMaterial({ color: 0x2a0b0b, emissive: 0xff2010, emissiveIntensity: 0 }) };
  out.sigGroups = [];
  sigs.forEach(s => {
    const g = new THREE.Group(); g.position.set(s.x, terr.at(s.x, s.z), s.z); g.rotation.y = s.face;
    g.add(new THREE.Mesh(poleG, metal));
    // アームは柱から道路の上へ（進んでくる車から見て右へ伸ばす）
    const arm = new THREE.Mesh(armG, metal); arm.scale.z = s.arm; arm.rotation.y = -Math.PI / 2; arm.position.y = 5.9; g.add(arm);
    const head = new THREE.Group(); head.position.set(-Math.min(s.arm, 4) + 0.7, 5.6, 0.05);
    head.add(new THREE.Mesh(headG, headM));
    const L = {};
    ['green', 'yellow', 'red'].forEach((c, i) => { const m = new THREE.Mesh(lampG, off); m.position.set(-0.34 + i * 0.34, 0, 0.065); head.add(m); L[c] = m; });   // 正面から見て左から青・黄・赤
    g.add(head);
    out.group.add(g);
    out.sigGroups.push({ s, L });
  });
  out.lampM = lampM; out.lampOff = off;
  return out;
}

/** 空・太陽・環境光・霧 */
export function buildSky(scene, renderer, opt) {
  const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = 4; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  const sunDir = new THREE.Vector3();
  const elev = opt.elev !== undefined ? opt.elev : 38, azim = opt.azim !== undefined ? opt.azim : 160;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
  u.sunPosition.value.copy(sunDir);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.copy(sunDir).multiplyScalar(400);
  sun.castShadow = opt.shadows > 0;
  sun.shadow.mapSize.set(opt.shadows > 1 ? 4096 : 2048, opt.shadows > 1 ? 4096 : 2048);
  const S = 140; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 1200 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd4dde8, 0x6a6458, 0.55); scene.add(hemi);
  scene.fog = new THREE.Fog(0xc4d2de, 400, opt.far || 2600);
  // 空の色から環境マップ（反射と間接光）
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); Object.keys(u).forEach(k => { if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value; }); envScene.add(sky2);
  scene.environment = pm.fromScene(envScene, 0.02).texture; scene.environmentIntensity = 0.12;   // Preetham の空は値が大きいので弱める
  return { sky, sun, sunDir, hemi };
}
