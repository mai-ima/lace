/*
 * world.js — 3D の世界を組み立てる（地形・航空写真の地面・道路・路面表示・建物・信号・空と光）。
 * three.js r186（ES モジュール）。品質の段階（gfx）で影や描画距離を変える。
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { build, markings, signals, ribbon } from './roadnet.js';
import { makeGrid } from './grid.js';

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
  // 地形は 200m 四方（40 マス）のチャンクに分ける（画面外は描かない）。UV は全体の航空写真に合わせる
  // 格子の間隔: 低画質だけ 10m（中・高は DEM のまま 5m。粗くすると道路の下から地面が出る所がある）
  const ST = gfx.tier === 'low' ? 2 : 1, CH = 40, terrGeos = [];
  const spanX = (terr.nx - 1) * terr.cell, spanZ = (terr.nz - 1) * terr.cell;
  for (let cj = 0; cj < terr.nz - 1; cj += CH) for (let ci = 0; ci < terr.nx - 1; ci += CH) {
    const w = Math.min(CH, terr.nx - 1 - ci) / ST | 0, h = Math.min(CH, terr.nz - 1 - cj) / ST | 0;
    const pos = new Float32Array((w + 1) * (h + 1) * 3), uv = new Float32Array((w + 1) * (h + 1) * 2), ix = [];
    for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) {
      const k = j * (w + 1) + i, gi = ci + i * ST, gj = cj + j * ST, x = terr.x0 + gi * terr.cell, z = terr.z0 + gj * terr.cell;
      pos.set([x, terr.H[gj * terr.nx + gi] - 0.15, z], k * 3); uv.set([(x - terr.x0) / spanX, 1 - (z - terr.z0) / spanZ], k * 2);
      if (i < w && j < h) ix.push(k, k + w + 1, k + 1, k + 1, k + w + 1, k + w + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals(); g.computeBoundingSphere();
    terrGeos.push(g);
  }
  // 同梱の航空写真（tools/world/ortho.py で作成）を使う。無ければ地理院タイルから組み立てる
  out.orthoReady = new Promise(r => {
    out.ortho = new THREE.TextureLoader().load(W.base + 'ortho.jpg', () => r(), undefined, () => {
      const t = orthoTexture(terr, gfx.orthoZ || 17, r); groundMat.map = t; groundMat.needsUpdate = true; out.ortho = t;
    });
    out.ortho.colorSpace = THREE.SRGBColorSpace; out.ortho.anisotropy = 8;
  });
  const groundMat = new THREE.MeshStandardMaterial({ map: out.ortho, roughness: 0.95, metalness: 0 });
  // 近くで航空写真のぼけを隠す: 写真の色から「緑（草）」か「それ以外（土・舗装）」かを見て、細かい質感（2.5m 周期）を明るさだけ重ねる。
  // 遠くでは重ねない（繰り返し模様が見えないように）
  const grassT = photoTex('grass', 1, true), dirtT = photoTex('asphalt', 1, true);
  if (grassT && dirtT) {
    groundMat.onBeforeCompile = sh => {
      sh.uniforms.tGrass = { value: grassT }; sh.uniforms.tDirt = { value: dirtT };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP; uniform sampler2D tGrass; uniform sampler2D tDirt;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float dist = length(vGP - cameraPosition), near = 1.0 - smoothstep(25.0, 140.0, dist);
          if (near > 0.0) {
            vec3 o = diffuseColor.rgb; float green = clamp((o.g - max(o.r, o.b)) * 8.0 + 0.2, 0.0, 1.0);
            vec3 g1 = texture2D(tGrass, vGP.xz / 1.6).rgb * 0.5 + texture2D(tGrass, vGP.xz / 7.0).rgb * 0.5, d1 = texture2D(tDirt, vGP.xz / 2.2).rgb * 0.6 + texture2D(tGrass, vGP.xz / 9.0).rgb * 0.4;
            float lg = dot(g1, vec3(0.333)) / 0.118, ld = dot(d1, vec3(0.333)) / 0.106;   // 質感の明るさ（線形の色で平均を 1 に）
            float detail = mix(ld, lg, green);
            detail = 1.0 + (detail - 1.0) * 1.6;   // 質感の濃淡を強める（写真の素材は濃淡が小さい）
            diffuseColor.rgb = mix(o, o * clamp(detail, 0.5, 1.6), near * 0.9);
          }`);
    };
  }
  terrGeos.forEach(g => { const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; out.group.add(m); });

  /* --- 道路網 --- */
  const net = build(W.roads, (x, z) => terr.at(x, z));
  out.net = net;
  const asph = photoTex('asphalt', 1, true);
  // 面の向きで UV を変える（上向きの面は xz、壁は「水平の位置 × 高さ」。縦に引き伸ばされない）
  function boxUV(g, s) { const p = g.attributes.position, nn = g.attributes.normal, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const up = Math.abs(nn.getY(i)) > 0.5; uv[i * 2] = (up ? p.getX(i) : p.getX(i) * Math.abs(nn.getZ(i)) + p.getZ(i) * Math.abs(nn.getX(i))) / s; uv[i * 2 + 1] = (up ? p.getZ(i) : p.getY(i)) / s; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
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
    if (e.line.length < 2 || e.hidden) return;
    const pr = e.pr;
    let g = strip(ribbon(e, -pr.hw, pr.hw), 0.05, true);
    roadGeos.push(g);
    if (pr.walk > 0 && !e.internal) [[-1], [1]].forEach(([s]) => {
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
  // まとめた交差点（上下線が分かれた大通りどうし）: 外へ出る腕の切り口を包む面。中央分離帯の切れ目も舗装にする
  net.groups.forEach(C => {
    const P = C.poly, m = P.length; if (m < 3) return;
    const pos = new Float32Array((m + 1) * 3), ix = [];
    pos.set([C.x, terr.at(C.x, C.z) + 0.045, C.z], 0);
    P.forEach((p, i) => { pos.set([p[0], terr.at(p[0], p[1]) + 0.045, p[1]], (i + 1) * 3); ix.push(0, i + 1, ((i + 1) % m) + 1); });
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
  // 車道の三角形を外へ渡す（当たり判定で「走れる所」として使う）
  out.roadTris = fn => roadGeos.forEach(g => { const P = g.attributes.position.array, I = g.index.array; for (let t = 0; t < I.length; t += 3) fn(P[I[t] * 3], P[I[t] * 3 + 2], P[I[t + 1] * 3], P[I[t + 1] * 3 + 2], P[I[t + 2] * 3], P[I[t + 2] * 3 + 2]); });
  const roads = new THREE.Mesh(worldUV(mergeGeometries(roadGeos), 6), roadMat); roads.receiveShadow = true; out.group.add(roads);
  if (walkGeos.length) {
    const walk = new THREE.Mesh(boxUV(mergeGeometries(walkGeos), 3), new THREE.MeshStandardMaterial({ map: asph, color: 0xd6d4ce, roughness: 0.9, side: THREE.DoubleSide })   /* 歩道: 明るめのアスファルト舗装 */);
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
  const col = new Float32Array(B.pos.length), roof = new Float32Array(B.pos.length), bi = new Float32Array(B.pos.length), cen = new Float32Array(B.bid.length * 2);
  const bcx = new Float64Array(nb), bcz = new Float64Array(nb), bcn = new Uint32Array(nb);
  for (let v = 0; v < B.bid.length; v++) { const k = B.bid[v]; bcx[k] += B.pos[v * 3]; bcz[k] += B.pos[v * 3 + 2]; bcn[k]++; }
  const hash = (k, s2) => (((k + 1) * 2654435761 ^ (s2 * 40503)) >>> 0) / 4294967296;
  for (let v = 0; v < B.bid.length; v++) {
    const k = B.bid[v], inf = B.info[k] || {}, h = yHi[k] - yLo[k];
    let kind = KIND[inf.u]; if (kind === undefined) kind = h > 12 ? 2 : 0;
    if (kind === 0 && h > 11) kind = 1;
    const wl = WALL[kind], rf = ROOF[kind];
    const w = wl[Math.floor(hash(k, 1) * wl.length)], r = rf[Math.floor(hash(k, 2) * rf.length)], j = 0.94 + hash(k, 3) * 0.1;
    col.set([w[0] * j, w[1] * j, w[2] * j], v * 3); roof.set([r[0] * j, r[1] * j, r[2] * j], v * 3);
    bi.set([yLo[k], yHi[k], kind + hash(k, 4) * 0.5], v * 3);
    cen.set([Math.round(bcx[k] / bcn[k]), Math.round(bcz[k] / bcn[k])], v * 2);
  }
  bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bg.setAttribute('aRoof', new THREE.BufferAttribute(roof, 3));
  bg.setAttribute('aBld', new THREE.BufferAttribute(bi, 3));
  bg.setAttribute('aCen', new THREE.BufferAttribute(cen, 2));
  const bmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, flatShading: true });
  // 窓（シェーダー）: 階の高さは種類ごと（戸建て 2.9m・共同住宅 2.9m・事務所 3.6m）、1 階は店の大きなガラス、屋上の手すり部分は窓なし
  bmat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aRoof; attribute vec3 aBld; attribute vec2 aCen; varying vec3 vWP; varying vec3 vRoof; varying vec3 vBld; varying vec2 vCen;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vRoof = aRoof; vBld = aBld; vCen = aCen;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vRoof; varying vec3 vBld; varying vec2 vCen;\nfloat h21(vec2 p) { p = mod(p, 263.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wdx = dFdx(vWP), wdy = dFdy(vWP); vec3 fn = normalize(cross(wdx, wdy));
        float kind = floor(vBld.z), rel = vWP.y - vBld.x, top = vBld.y - vBld.x;
        if (abs(fn.y) > 0.3) { diffuseColor.rgb = vRoof; }
        else {
          float fh = kind < 1.5 ? 2.9 : 3.6, bay = kind < 0.5 ? 3.4 : kind < 1.5 ? 3.0 : kind < 2.5 ? 1.8 : 6.0;
          // 壁に沿った座標（建物の中心を原点にして、法線の微小な誤差で値がぶれないようにする）
          vec2 wd = normalize(vec2(-fn.z, fn.x)); wd = normalize(floor(wd * 512.0 + 0.5));
          float u = dot(vWP.xz - vCen, wd);
          float fl = floor(rel / fh), fy = fract(rel / fh), fu = fract(u / bay), cell = h21(vec2(floor(u / bay), fl) + floor(fract(vBld.z) * 64.0 + 0.5) * 7.0);   // 建物ごとの値は補間の誤差を丸めてから使う
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
          // 遠くでは窓の格子がちらつくので、画素あたりの格子の大きさに応じて平均の色へ寄せる
          float fw = max(length(fwidth(vWP.xz)) / bay, fwidth(vWP.y) / fh), far2 = smoothstep(0.18, 0.5, fw);
          float cover = (wy1 - wy0) * (wu1 - wu0) * (kind > 2.5 && kind < 3.5 ? 0.1 : kind < 0.5 ? 0.75 : 1.0);
          win = mix(win * (1.0 - mull * 0.8), cover, far2);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
          // 階ごとの床の帯（共同住宅のベランダ・事務所の腰壁）と、屋上の笠木
          float band = (kind > 0.5 && kind < 2.5) ? step(fy, 0.08) * step(fh, rel) : 0.0;
          diffuseColor.rgb *= 1.0 - band * 0.12;
          diffuseColor.rgb *= 1.0 - 0.18 * step(top - 0.25, rel);
          diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 4.0, rel);   // 地面の近くは少し暗く（汚れ・陰）
        }`);
  };
  // 建物は重心の位置で 200m 四方のチャンクに分ける（頂点は共有し、三角形の番号だけ分ける）
  const cx = new Float32Array(nb), cz = new Float32Array(nb), cn = new Uint32Array(nb);
  for (let v = 0; v < B.bid.length; v++) { const k = B.bid[v]; cx[k] += B.pos[v * 3]; cz[k] += B.pos[v * 3 + 2]; cn[k]++; }
  const chunks = new Map();
  for (let t = 0; t < B.idx.length; t += 3) {
    const k = B.bid[B.idx[t]], key = Math.floor(cx[k] / cn[k] / 200) + ',' + Math.floor(cz[k] / cn[k] / 200);
    let c = chunks.get(key); if (!c) chunks.set(key, c = []); c.push(B.idx[t], B.idx[t + 1], B.idx[t + 2]);
  }
  out.buildingMeshes = [];
  chunks.forEach(ix => {
    const g = new THREE.BufferGeometry(); ['position', 'color', 'aRoof', 'aBld', 'aCen'].forEach(n => g.setAttribute(n, bg.getAttribute(n)));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(ix), 1));
    const sp = new THREE.Sphere(), V = new THREE.Vector3(), box = new THREE.Box3();
    for (let i = 0; i < ix.length; i++) box.expandByPoint(V.fromArray(B.pos, ix[i] * 3));
    box.getBoundingSphere(sp); g.boundingSphere = sp; g.boundingBox = box;
    const m = new THREE.Mesh(g, bmat); m.castShadow = true; m.receiveShadow = true; out.group.add(m); out.buildingMeshes.push(m);
  });

  /* --- 鉄道の高架橋（東海道新幹線・東海道本線・遠州鉄道。OSM では全区間が bridge）。
         桁（幅 5m・厚さ 1.4m）、壁高欄（高さ 1.0m）、橋脚（10m ごと）。レール面の高さは路線ごとの目安 --- */
  const railGeos = [];
  // 道路の範囲（1m 格子）。高架橋は道路をまたぐので、道路の上（と 1.5m 以内）には橋脚を置かない
  const roadG = makeGrid(terr.x0, terr.z0, (terr.nx - 1) * terr.cell, 1.0);
  out.roadTris((ax, az, bx, bz, cx, cz) => roadG.tri(ax, az, bx, bz, cx, cz));
  out.onRoadPt = (x, z) => roadG.at(x, z) === 1;
  const onRoad = out.onRoad = (x, z) => { for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (roadG.at(x + a * 0.75, z + b * 0.75)) return true; return false; };
  out.pierTris = [];
  const railH = t => (/新幹線/.test(t.name || '') ? 11 : /遠州/.test(t.name || '') ? 8.5 + (+(t.layer || 1) - 1) * 5 : 8.5);
  const RP = W.roads.p;
  W.roads.ways.forEach(w => {
    if (w.k !== 'rail' || !(w.t.bridge && w.t.bridge !== 'no')) return;
    const H = railH(w.t), pts = w.n.map(i => [RP[i * 3], RP[i * 3 + 1]]);
    // 3m ごとに分けて、地面の高さを長い範囲でならした上に置く（地面の細かい起伏で桁が波打たないように）
    const L = []; for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(l / 3)); for (let j = k === 1 ? 0 : 1; j <= m; j++) L.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]); }
    if (L.length < 2) return;
    const yy = L.map(p => terr.at(p[0], p[1])), ys = yy.map((_, i) => { let s0 = 0, c = 0; for (let k = Math.max(0, i - 15); k <= Math.min(yy.length - 1, i + 15); k++) { s0 += yy[k]; c++; } return s0 / c + H; });
    const hw = 2.5, n = L.length;
    const side = (off) => L.map((p, i) => { const q = L[Math.min(n - 1, i + 1)], r = L[Math.max(0, i - 1)], dx = q[0] - r[0], dz = q[1] - r[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * off, p[1] + dx / l * off]; });
    const A = side(-hw), Bs = side(hw);
    const quadStrip = (P, Q, yA, yB) => { const pos = new Float32Array(n * 6), ix = []; for (let i = 0; i < n; i++) { pos.set([P[i][0], yA(i), P[i][1], Q[i][0], yB(i), Q[i][1]], i * 6); if (i) { const a = (i - 1) * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals(); return g; };
    railGeos.push(quadStrip(A, Bs, i => ys[i], i => ys[i]));                       // 上面
    railGeos.push(quadStrip(A, Bs, i => ys[i] - 1.4, i => ys[i] - 1.4));           // 下面
    railGeos.push(quadStrip(A, A, i => ys[i] + 1.0, i => ys[i] - 1.4));            // 側面と壁高欄
    railGeos.push(quadStrip(Bs, Bs, i => ys[i] + 1.0, i => ys[i] - 1.4));
    // 橋脚（10m ごと、1.6m 角）
    for (let i = 0; i < n; i += 3) {
      const p = L[i], gy = terr.at(p[0], p[1]), h = ys[i] - 1.4 - gy; if (h < 1 || onRoad(p[0], p[1])) continue;
      const g = new THREE.BoxGeometry(1.6, h, 1.6); g.translate(p[0], gy + h / 2, p[1]); railGeos.push(g);
      out.pierTris.push([p[0] - 0.8, p[1] - 0.8, p[0] + 0.8, p[1] - 0.8, p[0] + 0.8, p[1] + 0.8], [p[0] - 0.8, p[1] - 0.8, p[0] + 0.8, p[1] + 0.8, p[0] - 0.8, p[1] + 0.8]);
    }
  });
  if (railGeos.length) {
    const rg = mergeGeometries(railGeos.map(g => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; }));
    rg.computeVertexNormals();
    const rmat = new THREE.MeshStandardMaterial({ color: 0xb4b2ac, roughness: 0.9, side: THREE.DoubleSide });   // 打ち放しコンクリートの明るい灰色
    const rail = new THREE.Mesh(boxUV(rg, 4), rmat); rail.castShadow = true; rail.receiveShadow = true; out.group.add(rail);
  }

  /* --- 信号機（LED 薄型の横型 3 灯、φ250、フードなし）。下端 5.6m、柱は進んでくる車の左、アームは車線の上へ。
         すべてインスタンス描画（部品ごとに 1 回の描画）で、灯の点灯はインスタンスの色で切り替える --- */
  const sigs = signals(net), NS = sigs.length;
  out.signals = sigs;
  const SH = (window.TB && TB.Race && TB.Race.SPEC && TB.Race.SPEC.signalHead) || { height: 0.37, width: 1.05, minBottom: 5.6 };
  const headY = SH.minBottom + SH.height / 2, armY = headY + SH.height / 2 + 0.22, poleH = armY + 0.25;
  const poleG = new THREE.CylinderGeometry(0.11, 0.14, 1, 8, 1, true); poleG.translate(0, 0.5, 0);
  const armG = new THREE.CylinderGeometry(0.055, 0.065, 1, 6, 1, true); armG.rotateZ(Math.PI / 2); armG.translate(0.5, 0, 0);
  const headG = new THREE.BoxGeometry(SH.width, SH.height, 0.14);
  const brG = new THREE.BoxGeometry(0.06, 0.22, 0.06);
  const lampG = new THREE.CircleGeometry(0.115, 12);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa1a7, roughness: 0.45, metalness: 0.7 });
  const headM = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.55, metalness: 0.2 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const inst = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); im.castShadow = m !== lampMat; im.receiveShadow = true; out.group.add(im); return im; };
  const poles = inst(poleG, metal, NS), arms = inst(armG, metal, NS), heads = inst(headG, headM, NS), brs = inst(brG, metal, NS), lamps = inst(lampG, lampMat, NS * 3);
  const M4 = new THREE.Matrix4(), base = new THREE.Matrix4(), loc = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1);
  sigs.forEach((s, k) => {
    base.makeRotationY(s.face).setPosition(s.x, terr.at(s.x, s.z), s.z);
    const hx = s.arm - 0.55;   // 灯器の中心（ローカル +x = 運転者から見て右 = 道路の上）
    poles.setMatrixAt(k, M4.copy(base).multiply(loc.makeScale(1, poleH, 1)));
    arms.setMatrixAt(k, M4.copy(base).multiply(loc.compose(V.set(0, armY, 0), Q.identity(), new THREE.Vector3(s.arm, 1, 1))));
    brs.setMatrixAt(k, M4.copy(base).multiply(loc.makeTranslation(hx, armY - 0.11, 0)));
    heads.setMatrixAt(k, M4.copy(base).multiply(loc.makeTranslation(hx, headY, 0)));
    for (let i = 0; i < 3; i++) {   // 正面から見て左から青・黄・赤
      const lx = hx - 0.34 + i * 0.34;
      lamps.setMatrixAt(k * 3 + i, M4.copy(base).multiply(loc.makeTranslation(lx, headY, 0.071)));
    }
  });
  [poles, arms, heads, brs, lamps].forEach(m => { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); });
  // 点灯の色（LED の青は青緑）。消灯は暗い灰
  const LIT = { green: new THREE.Color(0.6, 14, 10), yellow: new THREE.Color(16, 9, 0.4), red: new THREE.Color(16, 1.0, 0.6) }, DARK = new THREE.Color(0.05, 0.055, 0.06);   // 点灯は線形の明るさで強く（後処理のブルームで光って見える）
  const ORDER = ['green', 'yellow', 'red'];
  out.setSignal = (k, phase) => { for (let i = 0; i < 3; i++) lamps.setColorAt(k * 3 + i, ORDER[i] === phase ? LIT[phase] : DARK); };
  out.signalsDone = () => { if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true; };
  sigs.forEach((s, k) => out.setSignal(k, 'red')); out.signalsDone();
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
  const S = opt.shadows > 1 ? 140 : 100; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 520 });   // 太陽は車から 400m の所。高さ 240m までの物の影が届く範囲だけを撮る
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd4dde8, 0x6a6458, 0.55); scene.add(hemi);
  scene.fog = new THREE.Fog(0xc4d2de, Math.min(400, (opt.far || 2600) * 0.3), opt.far || 2600);
  // 空の色から環境マップ（反射と間接光）
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); Object.keys(u).forEach(k => { if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value; }); envScene.add(sky2);
  scene.environment = pm.fromScene(envScene, 0.02).texture; scene.environmentIntensity = 0.12;   // Preetham の空は値が大きいので弱める
  return { sky, sun, sunDir, hemi, dispose() { pm.dispose(); sky2.material.dispose(); sky2.geometry.dispose(); } };
}
