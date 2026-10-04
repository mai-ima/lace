/*
 * world.js — 3D の世界を組み立てる（地形・航空写真の地面・道路・路面表示・建物・信号・空と光）。
 * three.js r186（ES モジュール）。品質の段階（gfx）で影や描画距離を変える。
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { build, markings, signals, ribbon } from './roadnet.js';
import { makeGrid } from './grid.js';
import { NIGHT } from './lights.js';

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
  /* --- 川（国土地理院の水域）: 水域の中の地形を川底まで掘り下げる（道路の窪み埋めより先に。橋の路面は窪み埋めの高さで渡る） --- */
  const waterCells = new Uint8Array(terr.nx * terr.nz), waterBank = new Float32Array(terr.nx * terr.nz), waters = [];
  if (W.water && W.water.water) {
    const q = W.water.q, H = terr.H, C = terr.cell;
    W.water.water.forEach(wt => {
      const rings = wt.rings.map(r => { const a = []; for (let i = 0; i < r.length; i += 2) a.push([r[i] * q, r[i + 1] * q]); return a; });
      const inside = (x, z) => { let c = false; rings.forEach(R => { for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const a = R[i], b = R[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } }); return c; };
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; rings[0].forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
      const bankY = rings.map(R => R.map(p => terr.at(p[0], p[1])));   // 護岸の上端（掘る前の地形の高さ）
      for (let j = Math.max(0, Math.floor((z0 - terr.z0) / C)); j <= Math.min(terr.nz - 1, Math.ceil((z1 - terr.z0) / C)); j++)
        for (let i = Math.max(0, Math.floor((x0 - terr.x0) / C)); i <= Math.min(terr.nx - 1, Math.ceil((x1 - terr.x0) / C)); i++) {
          const k = j * terr.nx + i; if (inside(terr.x0 + i * C, terr.z0 + j * C)) { H[k] = Math.min(H[k], wt.bed); waterCells[k] = 1; waterBank[k] = wt.bank; }
        }
      waters.push({ wt, rings, bankY, inside });
    });
    out.inWater = (x, z) => waters.some(w => w.inside(x, z));
  }
  /* --- 地形の窪みを道路の範囲だけ埋める: 標高データ（5m）には、駅前の地下広場・地下道の入口などの掘り下げが入っていて、
         その上の歩道や車道が急に下がる。道路の範囲（PLATEAU の車道・歩道）にある窪み（周り 45m の中央値より 0.8m 以上低い）は
         中央値まで上げる。ただし OSM の道路の高さも下がっている所（線路の下をくぐるアンダーパスなど本物の掘り下げ）は残す --- */
  if (W.roadArea && W.roadArea.car) {
    const nx = terr.nx, nz = terr.nz, H = terr.H, C = terr.cell, K = 4, med = new Float32Array(nx * nz), buf = new Float32Array((2 * K + 1) ** 2);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let n = 0; for (let b = -K; b <= K; b++) { const jj = Math.max(0, Math.min(nz - 1, j + b)); for (let a = -K; a <= K; a++) buf[n++] = H[jj * nx + Math.max(0, Math.min(nx - 1, i + a))]; }
      const arr = buf.slice(0, n).sort(); med[j * nx + i] = arr[n >> 1];
    }
    const roadMask = makeGrid(terr.x0 - C / 2, terr.z0 - C / 2, (nx) * C, C), q = W.roadArea.q;
    [W.roadArea.car, W.roadArea.walk].forEach(A => { if (!A) return; const v = A.v, I = A.i; for (let t = 0; t < I.length; t += 3) roadMask.tri(v[I[t] * 2] * q, v[I[t] * 2 + 1] * q, v[I[t + 1] * 2] * q, v[I[t + 1] * 2 + 1] * q, v[I[t + 2] * 2] * q, v[I[t + 2] * 2 + 1] * q); });
    const keep = new Uint8Array(nx * nz), RP = W.roads.p;   // 本物の掘り下げ（OSM の道路の高さも中央値より 1m 以上低い）の周り 10m
    W.roads.ways.forEach(w => { if (w.k !== 'road') return; w.n.forEach(k => {
      const x = RP[k * 3], z = RP[k * 3 + 1], y = RP[k * 3 + 2], i = Math.round((x - terr.x0) / C), j = Math.round((z - terr.z0) / C); if (i < 0 || j < 0 || i >= nx || j >= nz) return;
      if (y < med[j * nx + i] - 1.0) for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz) keep[jj * nx + ii] = 1; }
    }); });
    // 道路の面の高さ（Hf）: 窪みをすべて中央値まで埋めた高さ。地形（H）は道路の範囲の中だけ埋める（地下広場そのものは残す）
    const Hf = Float32Array.from(H);
    for (let k = 0; k < Hf.length; k++) if (waterCells[k]) Hf[k] = Math.max(Hf[k], waterBank[k]);   // 橋の路面（道路の範囲）は川の上でも岸の高さ
    let filled = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (keep[k] || med[k] - H[k] < 0.8) continue;
      Hf[k] = med[k];
      if (!waterCells[k] && roadMask.at(terr.x0 + i * C, terr.z0 + j * C)) { H[k] = med[k]; filled++; }
    }
    out.pitsFilled = filled;
    terr.atRoad = (x, z) => {
      const fi = (x - terr.x0) / C, fj = (z - terr.z0) / C;
      const i = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(nz - 2, Math.floor(fj)));
      const u = Math.max(0, Math.min(1, fi - i)), v = Math.max(0, Math.min(1, fj - j));
      return (Hf[j * nx + i] * (1 - u) + Hf[j * nx + i + 1] * u) * (1 - v) + (Hf[(j + 1) * nx + i] * (1 - u) + Hf[(j + 1) * nx + i + 1] * u) * v;
    };
  }
  if (!terr.atRoad) terr.atRoad = terr.at;
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
            // 近くでは航空写真をぼかした色（約 5m 単位。写り込んだ車や細かい影が消える）を使い、細かい模様は素材の質感で描く
            vec3 lo = texture2D(map, vMapUv, 3.5).rgb * vec3(1.04, 1.0, 0.9);   // 写真全体の青緑の色かぶりを少し戻す
            diffuseColor.rgb = mix(diffuseColor.rgb, lo, near * 0.8);
            vec3 o = diffuseColor.rgb; float green = clamp((o.g - max(o.r, o.b)) * 8.0 + 0.2, 0.0, 1.0);
            vec3 g1 = texture2D(tGrass, vGP.xz / 1.6).rgb * 0.5 + texture2D(tGrass, vGP.xz / 7.0).rgb * 0.5, d1 = texture2D(tDirt, vGP.xz / 2.2).rgb * 0.6 + texture2D(tGrass, vGP.xz / 9.0).rgb * 0.4;
            float lg = dot(g1, vec3(0.333)) / 0.118, ld = dot(d1, vec3(0.333)) / 0.106;   // 質感の明るさ（線形の色で平均を 1 に）
            float detail = mix(ld, lg, green);
            detail = 1.0 + (detail - 1.0) * 2.2;   // 質感の濃淡を強める（写真の素材は濃淡が小さい。ぼかした色の上なので強めに）
            diffuseColor.rgb = mix(o, o * clamp(detail, 0.5, 1.6), near * 0.9);
          }`);
    };
  }
  terrGeos.forEach(g => { const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; out.group.add(m); });

  /* --- 道路網 --- */
  const net = build(W.roads, (x, z) => terr.at(x, z), W.roadWidth);   // 道幅は PLATEAU の道路の範囲で実測した値（tools/world/build_tran.py）
  /* --- 橋の路面の高さ: データの高さ（標高データの点）は、川の上では川面を補間した低い値になり、橋の端で道路より最大 3m 以上低くなる
         （車が落ち込む・跳ねる）。両端は、つながる道路の面の高さに合わせる（別の橋と続く端はそのまま）。
         道路・線路をまたぐ高い橋（データが両端を結ぶ線より 2m 以上高い）はデータの高さを残し、それ以外（川の橋）は両端を結ぶ線に
         小さな反り（長さの 1%、最大 0.4m）をつける。どちらも勾配は 10% までにならす --- */
  {
    const isBr = e => e.pr.bridge && !e.hidden;
    const shared = (e, id) => { const n = net.nodes.get(id); return n && n.arms.some(a => a.e !== e && isBr(a.e)); };
    net.edges.forEach(e => {
      if (!isBr(e)) return;
      [e.line, e.pts].forEach(L => {
        if (!L || L.length < 2 || L[0].length < 3) return;
        const s = [0]; for (let i = 1; i < L.length; i++) s.push(s[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));
        const len = s[s.length - 1] || 1, n = L.length;
        const pinA = !shared(e, e.a), pinB = !shared(e, e.b);
        const yA = pinA ? terr.atRoad(L[0][0], L[0][1]) : L[0][2], yB = pinB ? terr.atRoad(L[n - 1][0], L[n - 1][1]) : L[n - 1][2];
        const base = i => yA + (yB - yA) * s[i] / len;
        let high = false; for (let i = 1; i < n - 1; i++) if (L[i][2] - base(i) > 2) high = true;
        const y = L.map((p, i) => high ? Math.max(base(i), p[2]) : base(i) + Math.min(0.4, len * 0.01) * Math.sin(Math.PI * s[i] / len));
        y[0] = yA; y[n - 1] = yB;
        for (let i = 1; i < n; i++) y[i] = Math.min(y[i], y[i - 1] + 0.1 * (s[i] - s[i - 1]));   // 勾配 10% まで（a 端から）
        for (let i = n - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] + 0.1 * (s[i + 1] - s[i]));   // （b 端から）
        L.forEach((p, i) => { p[2] = y[i]; });
      });
    });
  }
  // PLATEAU の道路の範囲の外を通る細い道（駐車場の通路・敷地の中の私道など。住宅地の道より格下）は、帯も路面表示も描かない（地面は航空写真のまま）
  if (W.roadArea && W.roadArea.car) {
    const g = makeGrid(terr.x0, terr.z0, (terr.nx - 1) * terr.cell, 1.0), q = W.roadArea.q;
    [W.roadArea.car, W.roadArea.walk].forEach(A => { if (!A) return; const v = A.v, I = A.i; for (let t = 0; t < I.length; t += 3) g.tri(v[I[t] * 2] * q, v[I[t] * 2 + 1] * q, v[I[t + 1] * 2] * q, v[I[t + 1] * 2 + 1] * q, v[I[t + 2] * 2] * q, v[I[t + 2] * 2 + 1] * q); });
    net.edges.forEach(e => {
      if (e.pr.rank < 7 || e.line.length < 2) return;
      let n = 0, inn = 0; const L = e.pts || e.line;
      for (let i = 1; i < L.length; i++) { const a = L[i - 1], b = L[i], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)); for (let k = 0; k < m; k++) { n++; inn += g.at(a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m); } }
      if (n >= 4 && inn / n < 0.3) e.offArea = true;
    });
  }
  out.net = net;
  const asph = photoTex('asphalt', 1, true);
  // 面の向きで UV を変える（上向きの面は xz、壁は「水平の位置 × 高さ」。縦に引き伸ばされない）
  function boxUV(g, s) { const p = g.attributes.position, nn = g.attributes.normal, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const up = Math.abs(nn.getY(i)) > 0.5; uv[i * 2] = (up ? p.getX(i) : p.getX(i) * Math.abs(nn.getZ(i)) + p.getZ(i) * Math.abs(nn.getX(i))) / s; uv[i * 2 + 1] = (up ? p.getZ(i) : p.getY(i)) / s; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
  function worldUV(g, s) { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / s; uv[i * 2 + 1] = p.getZ(i) / s; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
  const roadGeos = [], walkGeos = [];
  function strip(R, y0, side, onTerrain) {   // R: ribbon の結果。2 本の縁の間の面。onTerrain: 高さを道路の面の地形（窪みを埋めた高さ）に合わせる（橋以外）
    if (onTerrain) {   // 途中で地形に沿わせる点を足す（頂点の間の直線が地形より浮いて路面表示を覆わないように）。
      // 地形が直線から 2cm 以上ずれる所だけ半分に分けていく（2m まで）。平らな直線の道は点を増やさない
      const lerp = (a, b, u) => a.map((v, j) => v + (b[j] - v) * u);
      const dev = (a, b) => [0.25, 0.5, 0.75].some(u => { const m = lerp(a, b, u);
        return Math.abs(terr.atRoad(m[0], m[1]) - (terr.atRoad(a[0], a[1]) * (1 - u) + terr.atRoad(b[0], b[1]) * u)) > 0.02 || Math.abs(terr.atRoad(m[2], m[3]) - (terr.atRoad(a[2], a[3]) * (1 - u) + terr.atRoad(b[2], b[3]) * u)) > 0.02; });
      const D = [R[0]];
      const add = (a, b) => { const l = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(b[2] - a[2], b[3] - a[3])); if (l > 2 && dev(a, b)) { const m = lerp(a, b, 0.5); add(a, m); add(m, b); } else D.push(b); };
      for (let i = 1; i < R.length; i++) add(R[i - 1], R[i]);
      R = D;
    }
    const n = R.length, pos = new Float32Array(n * 6), ix = [];
    for (let i = 0; i < n; i++) {
      const ya = onTerrain ? terr.atRoad(R[i][0], R[i][1]) : R[i][4], yb = onTerrain ? terr.atRoad(R[i][2], R[i][3]) : R[i][4];
      pos.set([R[i][0], ya + y0, R[i][1], R[i][2], yb + y0, R[i][3]], i * 6); if (i) { const a = (i - 1) * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    return upGeo(pos, ix);
  }
  // 地図全体の 1 つの形を、S m 四方のまとまりに分けて描く（画面の外のまとまりは描かない）。三角形の重心でまとまりを決める
  function addChunked(g, mat, S, shadow) {
    const pos = g.attributes.position.array, I = g.index ? g.index.array : null, nt = I ? I.length / 3 : pos.length / 9, M = new Map();
    const vi = (t, k) => I ? I[t * 3 + k] : t * 3 + k;
    for (let t = 0; t < nt; t++) {
      const a = vi(t, 0) * 3, b = vi(t, 1) * 3, c = vi(t, 2) * 3;
      const key = Math.floor((pos[a] + pos[b] + pos[c]) / 3 / S) + ',' + Math.floor((pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 / S);
      let L = M.get(key); if (!L) M.set(key, L = []); L.push(t);
    }
    const names = Object.keys(g.attributes), meshes = [];
    M.forEach(ts => {
      const remap = new Map(), ix = [];
      ts.forEach(t => { for (let k = 0; k < 3; k++) { const v = vi(t, k); let n = remap.get(v); if (n === undefined) { n = remap.size; remap.set(v, n); } ix.push(n); } });
      const ng = new THREE.BufferGeometry();
      names.forEach(nm => { const A = g.attributes[nm], s = A.itemSize, arr = new A.array.constructor(remap.size * s); remap.forEach((n, v) => { for (let k = 0; k < s; k++) arr[n * s + k] = A.array[v * s + k]; }); ng.setAttribute(nm, new THREE.BufferAttribute(arr, s, A.normalized)); });
      ng.setIndex(ix); ng.computeBoundingSphere();
      const m = new THREE.Mesh(ng, mat); m.receiveShadow = true; if (shadow) m.castShadow = true; out.group.add(m); meshes.push(m);
    });
    return meshes;
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
    if (e.line.length < 2 || e.hidden || e.offArea) return;
    const pr = e.pr;
    let g = strip(ribbon(e, -pr.hw, pr.hw), pr.bridge ? 0.05 : 0.02, true, !pr.bridge);   // 路面表示（+0.075）より必ず下に
    roadGeos.push(g);
    if (pr.walk > 0 && !e.internal && !(W.roadArea && W.roadArea.walk)) [[-1], [1]].forEach(([s]) => {   // 実測の歩道（PLATEAU）があるときは使わない
      const a = s < 0 ? -pr.hw - pr.walk : pr.hw, b = s < 0 ? -pr.hw : pr.hw + pr.walk;
      const wg = strip(ribbon(e, a, b), 0.2, true); walkGeos.push(wg); (out.walkTopGeos = out.walkTopGeos || []).push(wg);
      const R = ribbon(e, s < 0 ? -pr.hw : pr.hw, s < 0 ? -pr.hw : pr.hw);
      walkGeos.push(wall(R, 0.2, 0.04, true));
    });
  });
  net.junctions.forEach(n => {
    if (n.arms && n.arms.length && n.arms.every(a => a.e.offArea || a.e.hidden)) return;   // 描かない私道どうしの交差点
    const P = n.poly, m = P.length, pos = new Float32Array((m + 1) * 3), ix = [];
    let cx = 0, cz = 0; P.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= m; cz /= m;
    pos.set([cx, terr.atRoad(cx, cz) + 0.03, cz], 0);
    P.forEach((p, i) => { pos.set([p[0], terr.atRoad(p[0], p[1]) + 0.03, p[1]], (i + 1) * 3); ix.push(0, i + 1, ((i + 1) % m) + 1); });
    roadGeos.push(upGeo(pos, ix));
  });
  // まとめた交差点（上下線が分かれた大通りどうし）: 外へ出る腕の切り口を包む面。中央分離帯の切れ目も舗装にする
  net.groups.forEach(C => {
    const P = C.poly, m = P.length; if (m < 3) return;
    const pos = new Float32Array((m + 1) * 3), ix = [];
    pos.set([C.x, terr.atRoad(C.x, C.z) + 0.025, C.z], 0);
    P.forEach((p, i) => { pos.set([p[0], terr.atRoad(p[0], p[1]) + 0.025, p[1]], (i + 1) * 3); ix.push(0, i + 1, ((i + 1) % m) + 1); });
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
  // 道路の範囲（PLATEAU、測量に基づく道路縁）を舗装として敷く。交差点の角・道幅・接続の形が実際どおりになる
  const triGeo = (T, dy) => { const n = T.v.length / 2, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const x = T.v[i * 2] * W.roadArea.q, z = T.v[i * 2 + 1] * W.roadArea.q; pos.set([x, terr.atRoad(x, z) + dy, z], i * 3); } return upGeo(pos, Array.from(T.i)); };
  const WALK_H = 0.15;   // 歩道の高さ（縁石の段）
  if (W.roadArea) {
    const A = W.roadArea;
    out.areaGeo = triGeo(A.car || A, 0.035);   // 車道（下で、車道の帯より奥に描く別のメッシュにする）
    if (A.walk) out.walkAreaGeo = triGeo(A.walk, WALK_H);
  }
  // 車道の三角形を外へ渡す（当たり判定で「走れる所」として使う）
  const triEach = (gs, fn) => gs.forEach(g => { const P = g.attributes.position.array, I = g.index.array; for (let t = 0; t < I.length; t += 3) fn(P[I[t] * 3], P[I[t] * 3 + 2], P[I[t + 1] * 3], P[I[t + 1] * 3 + 2], P[I[t + 2] * 3], P[I[t + 2] * 3 + 2]); });
  out.roadTris = fn => triEach(roadGeos.concat([out.areaGeo, out.walkAreaGeo].filter(Boolean)), fn);   // 走れる所（車道と歩道）
  out.carTris = fn => triEach(roadGeos.concat([out.areaGeo].filter(Boolean)), fn);   // 車道だけ
  addChunked(worldUV(mergeGeometries(roadGeos), 6), roadMat, 1200);
  if (out.areaGeo) {
    // 車道（PLATEAU の道路の範囲から歩道を除いた部分）: 車道の帯と同じアスファルト。帯より奥に描く
    const am = roadMat.clone(); am.onBeforeCompile = roadMat.onBeforeCompile; am.customProgramCacheKey = () => 'roadArea';
    am.polygonOffset = true; am.polygonOffsetFactor = 2; am.polygonOffsetUnits = 2;
    addChunked(worldUV(out.areaGeo.clone(), 6), am, 1200);
  }
  if (out.walkAreaGeo) {
    // 歩道・広場: 明るい灰色のブロック舗装（30cm 角を 1 枚ずつ明るさを変える）。高さ 15cm
    const wm = new THREE.MeshStandardMaterial({ color: 0xb9b6b0, roughness: 0.9, metalness: 0 });
    wm.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;\nfloat wh(vec2 p) { p = mod(p, 251.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 t = vWXZ / vec2(0.3, 0.15); t.x += floor(t.y) * 0.5;   // 互い違いのブロック
          vec2 f = fract(t), fw = fwidth(t);
          float joint = (1.0 - smoothstep(0.0, max(fw.x, 0.02) * 1.5, f.x) * smoothstep(0.0, max(fw.y, 0.02) * 1.5, f.y));
          float far = smoothstep(0.3, 0.8, max(fw.x, fw.y));
          float tone = 0.9 + 0.16 * wh(floor(t));
          // 舗装の色は航空写真から（ぼかして車・人・影の影響を減らす）。明るさは一定の範囲に収め、街路樹の緑は灰色に寄せる
          vec2 ouv = vec2((vWXZ.x - uOX.x) / uOX.z, 1.0 - (vWXZ.y - uOX.y) / uOX.w);
          vec3 oc = texture2D(tOrtho, ouv, 2.5).rgb, ocS = texture2D(tOrtho, ouv, 4.5).rgb;
          oc = max(oc, ocS * 0.85);
          float ol = dot(oc, vec3(0.299, 0.587, 0.114));
          if (oc.g > oc.r && oc.g > oc.b) oc = mix(oc, vec3(ol), 0.85);
          vec3 pav = oc / max(ol, 0.02) * clamp(ol * 1.25, 0.2, 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, pav, uOrthoOn * 0.8);
          diffuseColor.rgb *= mix(tone * (1.0 - joint * 0.35), 0.96, far);`);
      sh.uniforms.tOrtho = { value: out.ortho }; sh.uniforms.uOX = { value: new THREE.Vector4(terr.x0, terr.z0, spanX, spanZ) }; sh.uniforms.uOrthoOn = { value: 1 };
      sh.fragmentShader = sh.fragmentShader.replace('varying vec2 vWXZ;\nfloat wh', 'varying vec2 vWXZ; uniform sampler2D tOrtho; uniform vec4 uOX; uniform float uOrthoOn;\nfloat wh');
    };
    addChunked(out.walkAreaGeo, wm, 1200);
    // 縁石: 歩道の縁で車道に接する所に、高さ 15cm の側面
    const C = W.roadArea.curb || [], q = W.roadArea.q, cp = [], ci = [];
    for (let k = 0; k < C.length; k += 4) {
      const ax = C[k] * q, az = C[k + 1] * q, bx = C[k + 2] * q, bz = C[k + 3] * q, ya = terr.atRoad(ax, az), yb = terr.atRoad(bx, bz), b = cp.length / 3;
      cp.push(ax, ya + WALK_H, az, bx, yb + WALK_H, bz, ax, ya + 0.02, az, bx, yb + 0.02, bz); ci.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    if (cp.length) {
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setIndex(ci); cg.computeVertexNormals();
      addChunked(cg, new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.85, side: THREE.DoubleSide }), 1200);
    }
  }
  if (walkGeos.length) {
    const walk = new THREE.Mesh(boxUV(mergeGeometries(walkGeos), 3), new THREE.MeshStandardMaterial({ map: asph, color: 0xd6d4ce, roughness: 0.9, side: THREE.DoubleSide })   /* 歩道: 明るめのアスファルト舗装 */);
    walk.receiveShadow = true; out.group.add(walk);
  }
  /* --- 平面駐車場（OSM と PLATEAU の土地利用。tools/world/build_parking.py）: アスファルトの舗装と、区画の白線（幅 15cm）。
         地面（地形の高さ − 0.15m）の 6cm 上。1200m 四方のまとまりごとに描く --- */
  if (W.parking && W.parking.lots) {
    const q = W.parking.q, gY = (x, z) => terr.at(x, z) - 0.09, CHK = new Map();
    const chunk = (x, z) => { const k = Math.floor(x / 1200) + ',' + Math.floor(z / 1200); let c = CHK.get(k); if (!c) CHK.set(k, c = { P: [], I: [], L: [], LI: [] }); return c; };
    W.parking.lots.forEach(lot => {
      const v = lot.tri.v, I = lot.tri.i; if (!I.length) return;
      const c = chunk(v[0] * q, v[1] * q), b = c.P.length / 3;
      for (let i = 0; i < v.length; i += 2) { const x = v[i] * q, z = v[i + 1] * q; c.P.push(x, gY(x, z), z); }
      for (let t = 0; t < I.length; t += 3) {   // 法線が上を向く順に
        const A = I[t] * 2, B = I[t + 1] * 2, Cc = I[t + 2] * 2;
        const up = (v[B + 1] - v[A + 1]) * (v[Cc] - v[A]) - (v[B] - v[A]) * (v[Cc + 1] - v[A + 1]) > 0;
        if (up) c.I.push(b + I[t], b + I[t + 1], b + I[t + 2]); else c.I.push(b + I[t], b + I[t + 2], b + I[t + 1]);
      }
      const Ls = lot.lines;
      for (let i = 0; i < Ls.length; i += 4) {
        const ax = Ls[i] * q, az = Ls[i + 1] * q, bx = Ls[i + 2] * q, bz = Ls[i + 3] * q, len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
        const nx = -(bz - az) / len * 0.075, nz = (bx - ax) / len * 0.075, n = Math.max(1, Math.ceil(len / 2.5)), lb = c.L.length / 3;
        for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, y = gY(x, z) + 0.012; c.L.push(x + nx, y, z + nz, x - nx, y, z - nz); }
        for (let k = 0; k < n; k++) { const a = lb + k * 2; c.LI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    });
    const pm = new THREE.MeshStandardMaterial({ map: asph, color: 0x9c9ea2, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    pm.onBeforeCompile = roadMat.onBeforeCompile; pm.customProgramCacheKey = () => 'parking';   // 車道と同じ舗装のむら
    const lm = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
    let nLots = 0;
    CHK.forEach(c => {
      if (c.I.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(c.P, 3)); g.setIndex(c.I); g.computeVertexNormals(); g.computeBoundingSphere(); const m = new THREE.Mesh(worldUV(g, 6), pm); m.receiveShadow = true; out.group.add(m); nLots++; }
      if (c.LI.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(c.L, 3)); g.setIndex(c.LI);
        const nrm = new Float32Array(c.L.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, lm); m.receiveShadow = true; out.group.add(m);
      }
    });
    out.parkingChunks = nLots;
  }
  /* --- 建物（PLATEAU LOD2）: 用途と高さで、壁・屋根・窓を変える --- */
  const B = W.bldg, bg = new THREE.BufferGeometry(), nb = B.info.length;
  bg.setAttribute('position', new THREE.BufferAttribute(B.pos, 3));
  bg.setIndex(new THREE.BufferAttribute(B.idx, 1));
  // 建物ごとの下端と上端（頂点から）
  const yLo = new Float32Array(nb).fill(1e9), yHi = new Float32Array(nb).fill(-1e9);
  for (let v = 0; v < B.bid.length; v++) { const k = B.bid[v], y = B.pos[v * 3 + 1]; if (y < yLo[k]) yLo[k] = y; if (y > yHi[k]) yHi[k] = y; }
  // 道路の上の屋根（アーケード・歩道の上の屋根。tools/world/bldg_over.py）: PLATEAU では地面からの箱なので、屋根の厚み 0.6m だけ残して浮かせ、
  // 歩道の上に柱（直径 0.3m）を立てる。下は車・人が通れる（当たり判定は柱だけ）
  if (W.bldgOver && W.bldgOver.over) {
    const over = new Map(W.bldgOver.over.map(o => [o.id, o]));
    for (let v = 0; v < B.bid.length; v++) { const o = over.get(B.bid[v]); if (o && B.pos[v * 3 + 1] < o.top - 0.6) B.pos[v * 3 + 1] = o.top - 0.6; }
    const cols = [], q = W.bldgOver.q;
    over.forEach(o => { yLo[o.id] = o.top - 0.6; for (let i = 0; i < o.cols.length; i += 2) cols.push([o.cols[i] * q, o.cols[i + 1] * q, o.top - 0.6]); });
    if (cols.length) {
      const cg = new THREE.CylinderGeometry(0.15, 0.15, 1, 10, 1, true); cg.translate(0, 0.5, 0);
      const cm = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.5, metalness: 0.55 }), cols.length);
      const M4 = new THREE.Matrix4();
      cols.forEach(([x, z, top], i) => { const g = terr.atRoad(x, z) + 0.15; M4.makeScale(1, Math.max(0.5, top - g), 1).setPosition(x, g, z); cm.setMatrixAt(i, M4); });
      cm.castShadow = true; cm.receiveShadow = true; cm.computeBoundingSphere(); out.group.add(cm);
      out.overCols = cols;
    }
  }
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
    const rc = W.bldgRoof && W.bldgRoof.roof[k];   // 航空写真から求めた実際の屋根の色（sRGB → 線形）
    if (rc) roof.set(rc.map(c => Math.pow(c / 255, 2.2) * 1.15), v * 3);
    bi.set([yLo[k], yHi[k], kind + hash(k, 4) * 0.5], v * 3);
    cen.set([Math.round(bcx[k] / bcn[k]), Math.round(bcz[k] / bcn[k])], v * 2);
  }
  bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bg.setAttribute('aRoof', new THREE.BufferAttribute(roof, 3));
  bg.setAttribute('aBld', new THREE.BufferAttribute(bi, 3));
  bg.setAttribute('aCen', new THREE.BufferAttribute(cen, 2));
  const bmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, flatShading: true });
  // 外壁の写真素材（Poly Haven CC0、8 種を 1 枚に縦に並べた walls.jpg → 2D 配列テクスチャ）。読み込むまでは白
  const wallTex = new THREE.DataArrayTexture(new Uint8Array([255, 255, 255, 255]).buffer ? new Uint8Array(4 * 8).fill(255) : null, 1, 1, 8);
  wallTex.colorSpace = THREE.SRGBColorSpace; wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.needsUpdate = true;
  { const im = new Image(); im.onload = () => {
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data, L = im.height / im.width;
      wallTex.image = { data: new Uint8Array(d.buffer), width: im.width, height: im.width, depth: L };
      wallTex.generateMipmaps = true; wallTex.minFilter = THREE.LinearMipmapLinearFilter; wallTex.magFilter = THREE.LinearFilter; wallTex.anisotropy = 4; wallTex.needsUpdate = true;
    }; im.src = W.base + '../walls.jpg'; }
  // ビルの外壁の写真（ambientCG CC0、6 種を縦に並べた facades.jpg）: 0 ガラスのカーテンウォール 1 横連窓のオフィス 2〜4 石・タイル張りに窓 5 ガラスとパネル
  const facTex = new THREE.DataArrayTexture(new Uint8Array(4 * 6).fill(128), 1, 1, 6);
  facTex.colorSpace = THREE.SRGBColorSpace; facTex.wrapS = facTex.wrapT = THREE.RepeatWrapping; facTex.needsUpdate = true;
  { const im = new Image(); im.onload = () => {
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
      facTex.image = { data: new Uint8Array(g.getImageData(0, 0, im.width, im.height).data.buffer), width: im.width, height: im.width, depth: im.height / im.width };
      facTex.generateMipmaps = true; facTex.minFilter = THREE.LinearMipmapLinearFilter; facTex.magFilter = THREE.LinearFilter; facTex.anisotropy = 4; facTex.needsUpdate = true;
    }; im.src = W.base + '../facades.jpg'; }
  // 窓（シェーダー）: 階の高さは種類ごと（戸建て 2.9m・共同住宅 2.9m・事務所 3.6m）、1 階は店の大きなガラス、屋上の手すり部分は窓なし
  bmat.onBeforeCompile = sh => {
    sh.uniforms.tWall = { value: wallTex }; sh.uniforms.tFac = { value: facTex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aRoof; attribute vec3 aBld; attribute vec2 aCen; varying vec3 vWP; varying vec3 vRoof; varying vec3 vBld; varying vec2 vCen; varying vec3 vRel;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vRoof = aRoof; vBld = aBld; vCen = aCen; vRel = vec3(transformed.x - aCen.x, transformed.y - aBld.x, transformed.z - aCen.y);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vRoof; varying vec3 vBld; varying vec2 vCen; varying vec3 vRel;\nuniform highp sampler2DArray tWall; uniform highp sampler2DArray tFac; float gMask = 0.0; float gLit = 0.0; vec3 gLitC = vec3(0.0); vec3 gFn = vec3(0.0, 1.0, 0.0);\nfloat h21(vec2 p) { p = mod(p, 263.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // 面の向きは建物の中心からの相対座標（値が小さく精度が高い）の微分で求める。ワールド座標だと数百 m の値の誤差で窓の縁がギザギザになる
        vec3 wdx = dFdx(vRel), wdy = dFdy(vRel); vec3 fn = normalize(cross(wdx, wdy)); gFn = fn;
        float kind = floor(vBld.z), rel = vWP.y - vBld.x, top = vBld.y - vBld.x;
        if (abs(fn.y) > 0.3) { diffuseColor.rgb = vRoof; }
        else {
          float fh = kind < 1.5 ? 2.9 : 3.6, bay = kind < 0.5 ? 3.4 : kind < 1.5 ? 3.0 : kind < 2.5 ? 1.8 : 6.0;
          // 壁に沿った座標（建物の中心を原点にして、法線の微小な誤差で値がぶれないようにする）
          vec2 wd = normalize(vec2(-fn.z, fn.x));
          float u = dot(vRel.xz, wd);
          // 外壁の素材: 用途ごとに候補から建物ごとに選ぶ（0/1 タイル 2/3 塗り壁 4 プレキャスト 5 パネル 6 リブ 7 波形鋼板）
          float hb = fract(fract(vBld.z) * 7.13 + 0.17);
          float layer = kind < 0.5 ? (hb < 0.6 ? 2.0 : 3.0) : kind < 1.5 ? (hb < 0.3 ? 0.0 : hb < 0.55 ? 1.0 : hb < 0.8 ? 3.0 : 5.0)
                      : kind < 2.5 ? (hb < 0.3 ? 0.0 : hb < 0.55 ? 1.0 : hb < 0.8 ? 4.0 : 5.0) : kind < 3.5 ? (hb < 0.6 ? 7.0 : 6.0) : (hb < 0.5 ? 4.0 : 2.0);
          vec3 wt = texture(tWall, vec3(u / 3.0, rel / 3.0, layer)).rgb;
          diffuseColor.rgb *= clamp(wt * 3.0, 0.0, 1.6);
          float fl = floor(rel / fh), fy = fract(rel / fh), fu = fract(u / bay), cell = h21(vec2(floor(u / bay), fl) + floor(fract(vBld.z) * 64.0 + 0.5) * 7.0);   // 建物ごとの値は補間の誤差を丸めてから使う
          float hb2 = fract(hb * 13.7 + 0.31), cell2 = fract(cell * 31.7 + 0.13);
          vec3 wallC = diffuseColor.rgb;
          // 窓の範囲（階・柱間の中の割合）。種類ごと: 戸建ては大小の窓が混ざり、事務所は横に連なる窓、工場は高い位置の横長窓
          float wy0 = 0.32, wy1 = 0.78, wu0 = 0.14, wu1 = 0.86, slide = 1.0, has = 1.0;
          if (kind < 0.5) { has = step(0.22, cell); if (cell < 0.5) { wu0 = 0.38; wu1 = 0.62; wy0 = 0.45; wy1 = 0.76; slide = 0.0; } else { wu0 = 0.22; wu1 = 0.78; wy0 = 0.3; wy1 = 0.74; } }
          else if (kind < 1.5) { wu0 = 0.18; wu1 = 0.82; }
          else if (kind < 2.5) { wy0 = 0.26; wy1 = 0.9; wu0 = 0.0; wu1 = 1.0; slide = 0.0; }
          else if (kind < 3.5) { wy0 = 0.62; wy1 = 0.8; has = step(0.5, cell); slide = 0.0; }
          else { wy0 = 0.28; wy1 = 0.84; wu0 = 0.06; wu1 = 0.94; }
          has *= step(rel, top - 0.9) * step(0.0, rel);
          // 共同住宅の南面はベランダ: 床版の小口・手すり壁・奥まった掃き出し窓（上の階の床の陰で暗い）
          float balc = (kind > 0.5 && kind < 1.5 && fn.z > 0.55 && rel > 2.0) ? 1.0 : 0.0;
          if (balc > 0.5) { fu = fract(u / 6.0); wu0 = 0.08; wu1 = 0.92; wy0 = 0.42; wy1 = 0.94; slide = 1.0; has = step(rel, top - 0.9); }
          float bu = balc > 0.5 ? 6.0 : bay;
          float fwU = 0.06 / bu, fwY = 0.06 / fh;   // 窓枠（アルミ）の太さ 6cm
          float inR = has * step(wu0, fu) * step(fu, wu1) * step(wy0, fy) * step(fy, wy1);
          float inG = step(wu0 + fwU, fu) * step(fu, wu1 - fwU) * step(wy0 + fwY, fy) * step(fy, wy1 - fwY);
          float mid = slide * step(abs(fu - 0.5 * (wu0 + wu1)), fwU * 0.7);   // 引き違い窓の召し合わせ
          float mull = (kind > 1.5 && kind < 2.5 && rel > 3.8) ? step(1.0 - 0.06 / 1.2, fract(u / 1.2)) : 0.0;   // カーテンウォールの方立て
          float gl = inR * inG * (1.0 - mid) * (1.0 - mull);
          float frm = inR - gl;
          // ガラスの奥: 暗い室内・カーテン・すりガラス（戸建ての小窓）。上端は庇と窓の奥行きの陰
          vec3 inside = mix(vec3(0.035, 0.04, 0.045), vec3(0.09, 0.085, 0.08), cell2);
          if (cell2 > 0.55 && kind < 2.5) inside = mix(inside, vec3(0.42, 0.38, 0.3) * (0.6 + 0.4 * cell), step(0.5 * (wu0 + wu1) + (cell > 0.5 ? 0.1 : -0.1), fu) * 0.85 + 0.15 * cell);
          if (kind < 0.5 && cell < 0.5) inside = vec3(0.42, 0.44, 0.45);
          inside *= mix(1.0, 0.55, smoothstep(wy1 - 0.14, wy1, fy));
          vec3 frameC = hb2 < 0.55 ? vec3(0.5, 0.51, 0.52) : vec3(0.16, 0.14, 0.12);   // シルバーかブロンズのアルミ
          vec3 detail = wallC;
          if (balc > 0.5) {
            float slab = step(fy, 0.07), par = step(0.07, fy) * step(fy, 0.4), div = step(fract(u / 6.0), 0.012);
            vec3 parC = hb2 < 0.5 ? wallC * 1.06 : vec3(0.6, 0.64, 0.66);   // 手すり壁（外壁と同じ材か、すりガラスのパネル）
            detail = mix(wallC * mix(0.62, 0.34, smoothstep(0.4, 1.0, fy)), parC, par);
            detail = mix(detail, wallC * 1.1, slab);
            detail = mix(detail, wallC * 0.5, div * (1.0 - slab));
            inR *= 1.0 - par - slab; gl *= 1.0 - par - slab; frm = inR - gl;
          } else if (kind < 1.5) {
            float sill = has * step(wu0 - 0.02, fu) * step(fu, wu1 + 0.02) * step(wy0 - 0.03, fy) * step(fy, wy0);   // 窓台の水切り
            detail = mix(detail, vec3(0.7, 0.7, 0.68), sill);
          } else if (kind < 2.5 && rel > 3.8) {
            detail = mix(wallC, wallC * 0.82, step(wy1, fy) + step(fy, wy0) * 0.5);   // 腰壁の目地
          } else if (kind > 2.5 && kind < 3.5 && rel < 4.2 && cell > 0.72) {
            float sh = step(0.15, fract(u / 5.0)) * step(fract(u / 5.0), 0.85);   // 搬入口のシャッター
            detail = mix(detail, vec3(0.62, 0.63, 0.63) * (0.92 + 0.08 * step(0.5, fract(rel / 0.12))), sh * step(0.02, rel) * step(rel, 3.8));
          }
          float shop = (kind > 1.5 && kind < 2.5 && rel < 3.8) ? 1.0 : 0.0;   // 1 階の店のガラス
          if (shop > 0.5) { float su = fract(u / 4.5); inR = step(0.04, su) * step(su, 0.97) * step(0.15, rel) * step(rel, 3.0); gl = inR * step(0.05, su) * step(su, 0.96) * step(0.2, rel) * step(rel, 2.95); frm = inR - gl; inside = mix(vec3(0.2, 0.19, 0.17), vec3(0.5, 0.47, 0.42), cell); }
          detail = mix(detail, frameC, frm);
          detail = mix(detail, inside, gl);
          // 遠くでは窓の格子がちらつくので、画素あたりの格子の大きさに応じて平均の色へ寄せる
          float fw = max(length(fwidth(vWP.xz)) / bay, fwidth(vWP.y) / fh), far2 = smoothstep(0.18, 0.5, fw);
          float cover = (wy1 - wy0) * (wu1 - wu0) * (kind > 2.5 && kind < 3.5 ? 0.1 : kind < 0.5 ? 0.6 : 1.0) * step(0.0, rel) * step(rel, top - 0.9);
          vec3 avg = mix(wallC * (balc > 0.5 ? 0.7 : 1.0), vec3(0.06, 0.065, 0.07), cover);
          diffuseColor.rgb = mix(detail, avg, far2);
          gMask = mix(gl, cover * 0.8, far2);
          // 夜の窓明かり: 部屋ごとに点いているか（住宅は 5 割、事務所は 4 割、工場は 2 割）と色（電球色・昼白色）
          float onP = kind < 1.5 ? 0.5 : kind < 2.5 ? 0.4 : kind < 3.5 ? 0.2 : 0.25;
          float on = step(1.0 - onP, fract(cell * 17.3 + cell2 * 5.1));
          gLitC = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.55, fract(cell2 * 9.7))) * (0.6 + 0.6 * cell);
          gLitC *= 0.55 + 0.45 * smoothstep(wy0, wy1, fy);   // 天井の照明で上ほど明るい
          if (shop > 0.5) {   // 夜も開いている店は半分。天井の照明で上ほど明るく、棚の段で横縞
            on = step(0.65, cell);
            float shelf = 0.75 + 0.25 * step(0.5, fract(rel / 0.45)) * step(rel, 1.8);
            gLitC = mix(vec3(1.0, 0.86, 0.66), vec3(0.92, 0.95, 1.0), step(0.5, cell2)) * (0.15 + 0.3 * smoothstep(0.2, 2.9, rel)) * shelf;
          }
          gLit = mix(gl * on, cover * onP * 0.8, far2);
          // ビル（商業・事務所・学校など、高さ 10m 以上）の 2 階より上は、実際の建物の外壁の写真を階の高さ・柱の間隔に合わせて貼る
          if ((kind > 1.5 && kind < 2.5 || kind > 3.5) && top > 10.0 && rel > fh && rel < top - 0.6) {
            float hp = fract(hb * 5.31 + 0.7);
            float fl = top > 25.0 ? (hp < 0.35 ? 0.0 : hp < 0.6 ? 5.0 : hp < 0.85 ? 1.0 : 3.0) : (hp < 0.4 ? 1.0 : hp < 0.6 ? 2.0 : hp < 0.8 ? 3.0 : 4.0);
            float nf = fl < 0.5 ? 10.0 : fl < 1.5 ? 8.0 : fl > 4.5 ? 9.0 : 5.0, nb = fl < 0.5 ? 10.0 : fl < 1.5 ? 13.0 : fl > 4.5 ? 9.0 : 5.0, bw2 = fl > 1.5 && fl < 4.5 ? 3.0 : 1.6;
            vec3 fc = texture(tFac, vec3(u / (nb * bw2), -(rel - fh) / (nf * 3.6), fl)).rgb;
            float lum = dot(fc, vec3(0.3, 0.59, 0.11)), gmk = clamp((0.4 - lum) * 5.0, 0.0, 1.0) * step(0.0, fc.b - fc.r + 0.03);
            diffuseColor.rgb = fc * (0.92 + 0.16 * hb2);
            gMask = gmk * 0.9;
            float onc = step(0.55, h21(vec2(floor(u / bw2), floor(rel / 3.6)) + floor(fract(vBld.z) * 64.0 + 0.5) * 7.0));
            gLit = gmk * onc * 0.8; gLitC = mix(vec3(1.0, 0.86, 0.66), vec3(0.86, 0.93, 1.0), step(0.5, hb2));
          }
          // 階ごとの床の帯（共同住宅のベランダ・事務所の腰壁）と、屋上の笠木
          float band = (kind > 0.5 && kind < 2.5) ? step(fy, 0.08) * step(fh, rel) : 0.0;
          diffuseColor.rgb *= 1.0 - band * 0.12;
          diffuseColor.rgb *= 1.0 - 0.18 * step(top - 0.25, rel);
          diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 4.0, rel);   // 地面の近くは少し暗く（汚れ・陰）
        }`)
      // ガラスはつやがある（太陽の照り返し）
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, gMask);')
      // ガラスに映る空と街（フレネル: 斜めから見るほど強く映る）。光の当たり方によらないので発光として足す
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (gMask > 0.001) {
          vec3 Vd = normalize(vWP - cameraPosition), Rr = reflect(Vd, gFn);
          vec3 sk = Rr.y > 0.0 ? mix(vec3(0.72, 0.78, 0.84), vec3(0.32, 0.46, 0.7), sqrt(Rr.y)) : mix(vec3(0.24, 0.24, 0.25), vec3(0.12, 0.12, 0.13), sqrt(-Rr.y));
          float Fr = 0.1 + 0.9 * pow(1.0 - clamp(dot(-Vd, gFn), 0.0, 1.0), 5.0);
          totalEmissiveRadiance += sk * Fr * gMask * uRefl * max(0.05, 1.0 - uNight * 1.25);
        }
        totalEmissiveRadiance += gLitC * gLit * uNight * uNight * 1.3;   // 夕方はまだ外が明るいので控えめ`);
    sh.uniforms.uRefl = { value: 1.0 }; sh.uniforms.uNight = NIGHT;
    sh.fragmentShader = sh.fragmentShader.replace('uniform highp sampler2DArray tWall;', 'uniform highp sampler2DArray tWall; uniform float uRefl; uniform float uNight;');
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
  const railGeos = [], piers = [], deckGeos = [];
  const chunkKey = p => Math.floor(p[0] / 400) + ',' + Math.floor(p[1] / 400);   // 400m 四方のまとまり
  const byKey = gs => { const M = new Map(); gs.forEach(g => { const k = g.userData.key || ''; if (!M.has(k)) M.set(k, []); M.get(k).push(g); }); return M; };
  const viaG = out.viaductG = makeGrid(terr.x0, terr.z0, (terr.nx - 1) * terr.cell, 1.0);
  out.underViaduct = (x, z, m) => { m = m || 0; for (let a = -m; a <= m; a += 1) for (let b = -m; b <= m; b += 1) if (viaG.at(x + a, z + b)) return true; return false; };
  // 道路の範囲（1m 格子）。高架橋は道路をまたぐので、道路の上（と 1.5m 以内）には橋脚を置かない
  const roadG = makeGrid(terr.x0, terr.z0, (terr.nx - 1) * terr.cell, 1.0);
  out.carTris((ax, az, bx, bz, cx, cz) => roadG.tri(ax, az, bx, bz, cx, cz));   // 車道だけ（歩道は信号柱・橋脚を立てられる所）
  out.onRoadPt = (x, z) => roadG.at(x, z) === 1;
  // 歩道の上面（0.5m 格子）。接地の高さ（縁石 +0.2m）に使う
  out.walkG = makeGrid(terr.x0, terr.z0, (terr.nx - 1) * terr.cell, 0.5);
  (out.walkTopGeos || []).concat(out.walkAreaGeo ? [out.walkAreaGeo] : []).forEach(g => { const P = g.attributes.position.array, I = g.index.array; for (let t = 0; t < I.length; t += 3) out.walkG.tri(P[I[t] * 3], P[I[t] * 3 + 2], P[I[t + 1] * 3], P[I[t + 1] * 3 + 2], P[I[t + 2] * 3], P[I[t + 2] * 3 + 2]); });
  // 橋（路面の高さが地形と違う所）: 線と半幅
  out.bridges = net.edges.filter(e => e.pr.bridge && !e.hidden && e.line.length >= 2).map(e => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; e.line.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
    const m = e.pr.hw + 0.5; return { L: e.line, hw: e.pr.hw, x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
  });
  out.bridgeY = (x, z) => {
    for (const b of out.bridges) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      for (let i = 1; i < b.L.length; i++) {
        const a = b.L[i - 1], c = b.L[i], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), px = a[0] + dx * u - x, pz = a[1] + dz * u - z;
        if (px * px + pz * pz <= b.hw * b.hw) return a[2] + (c[2] - a[2]) * u;
      }
    }
    return null;
  };
  const onRoad = out.onRoad = (x, z) => { for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (roadG.at(x + a * 0.75, z + b * 0.75)) return true; return false; };
  out.pierTris = [];
  (out.overCols || []).forEach(([x, z]) => { const r = 0.2; out.pierTris.push([x - r, z - r, x + r, z - r, x + r, z + r], [x - r, z - r, x + r, z + r, x - r, z + r]); });   // 道路の上の屋根の柱
  // レール面の高さ（地上から）。OSM の layer は「下を何かが通る」重なりの順で高さではないので使わない（遠州鉄道の高架も在来線と同じ程度）
  const railH = t => (/新幹線/.test(t.name || '') ? 11 : 8.5);
  const RP = W.roads.p;
  W.roads.ways.forEach(w => {
    if (w.k !== 'rail' || !(w.t.bridge && w.t.bridge !== 'no')) return;
    const H = railH(w.t), pts = w.n.map(i => [RP[i * 3], RP[i * 3 + 1]]);
    // 3m ごとに分けて、地面の高さを長い範囲でならした上に置く（地面の細かい起伏で桁が波打たないように）
    const L0 = []; for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(l / 3)); for (let j = k === 1 ? 0 : 1; j <= m; j++) L0.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]); }
    if (L0.length < 2) return;
    const yy = L0.map(p => terr.at(p[0], p[1])), ys0 = yy.map((_, i) => { let s0 = 0, c = 0; for (let k = Math.max(0, i - 15); k <= Math.min(yy.length - 1, i + 15); k++) { s0 += yy[k]; c++; } return s0 / c + H; });
    // 直線で高さの変化が一定の所は区切りを間引く（間の点の、まっすぐ結んだ線からのずれが横 3cm・高さ 2cm 未満なら省く。最長 30m）
    const keep = [0];
    for (let i = 1; i < L0.length - 1; i++) {
      const a = keep[keep.length - 1], b = i + 1, ax = L0[a][0], az = L0[a][1], dx = L0[b][0] - ax, dz = L0[b][1] - az, l2 = dx * dx + dz * dz;
      let ok = l2 < 900;
      for (let k = a + 1; ok && k < b; k++) { const u = ((L0[k][0] - ax) * dx + (L0[k][1] - az) * dz) / l2; if (Math.abs((L0[k][0] - ax) * dz - (L0[k][1] - az) * dx) / Math.sqrt(l2) > 0.03 || Math.abs(ys0[k] - (ys0[a] + (ys0[b] - ys0[a]) * u)) > 0.02) ok = false; }
      if (!ok) keep.push(i);
    }
    keep.push(L0.length - 1);
    const L = keep.map(i => L0[i]), ys = keep.map(i => ys0[i]);
    const hw = 2.5, n = L.length;
    const side = (off) => L.map((p, i) => { const q = L[Math.min(n - 1, i + 1)], r = L[Math.max(0, i - 1)], dx = q[0] - r[0], dz = q[1] - r[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * off, p[1] + dx / l * off]; });
    const A = side(-hw), Bs = side(hw);
    for (let i = 1; i < n; i++) { viaG.tri(A[i - 1][0], A[i - 1][1], Bs[i - 1][0], Bs[i - 1][1], A[i][0], A[i][1]); viaG.tri(Bs[i - 1][0], Bs[i - 1][1], Bs[i][0], Bs[i][1], A[i][0], A[i][1]); }   // 高架の下の範囲
    // 300m ほどの区間に分けて作る（区間ごとのまとまりで、画面の外は描かない・影にも回さない）
    const quadStrip = (P, Q, yA, yB, i0, i1) => { const m = i1 - i0 + 1, pos = new Float32Array(m * 6), ix = []; for (let k = 0; k < m; k++) { const i = i0 + k; pos.set([P[i][0], yA(i), P[i][1], Q[i][0], yB(i), Q[i][1]], k * 6); if (k) { const a = (k - 1) * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(ix); g.computeVertexNormals(); return g; };
    const acc = [0]; for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));
    for (let i0 = 0; i0 < n - 1;) {
      let i1 = i0 + 1; while (i1 < n - 1 && acc[i1] - acc[i0] < 300) i1++;
      const key = chunkKey(L[(i0 + i1) >> 1]);
      { // 上面（道床）: 横 0〜1・長さ方向の距離の UV を付けて、砂利・枕木・レールをシェーダーで描く
        const g = quadStrip(A, Bs, i => ys[i] + 0.02, i => ys[i] + 0.02, i0, i1), uv = new Float32Array((i1 - i0 + 1) * 4);
        for (let i = i0; i <= i1; i++) uv.set([0, acc[i], 1, acc[i]], (i - i0) * 4);
        g.setAttribute('aTU', new THREE.BufferAttribute(uv, 2)); g.userData.gauge = /新幹線/.test(w.t.name || '') ? 1.435 : 1.067; g.userData.key = key; deckGeos.push(g);
      }
      [quadStrip(A, Bs, i => ys[i], i => ys[i], i0, i1),                       // 上面
       quadStrip(A, Bs, i => ys[i] - 1.4, i => ys[i] - 1.4, i0, i1),           // 下面
       quadStrip(A, A, i => ys[i] + 1.0, i => ys[i] - 1.4, i0, i1),            // 側面と壁高欄
       quadStrip(Bs, Bs, i => ys[i] + 1.0, i => ys[i] - 1.4, i0, i1)].forEach(g => { g.userData.key = key; railGeos.push(g); });
      i0 = i1;
    }
    // 橋脚（10m ごと、1.6m 角）
    for (let i = 0; i < L0.length; i += 3) {
      const p = L0[i], gy = terr.at(p[0], p[1]), h = ys0[i] - 1.4 - gy; if (h < 1 || onRoad(p[0], p[1])) continue;
      if (piers.some(q => Math.abs(q[0] - p[0]) < 6 && Math.abs(q[1] - p[1]) < 6)) continue;   // 平行な線路の橋脚は共有する（林のように並ばないように）
      piers.push(p);
      const g = new THREE.BoxGeometry(1.6, h, 1.6); g.translate(p[0], gy + h / 2, p[1]); g.userData.key = chunkKey(p); railGeos.push(g);
      out.pierTris.push([p[0] - 0.8, p[1] - 0.8, p[0] + 0.8, p[1] - 0.8, p[0] + 0.8, p[1] + 0.8], [p[0] - 0.8, p[1] - 0.8, p[0] + 0.8, p[1] + 0.8, p[0] - 0.8, p[1] + 0.8]);
    }
  });
  if (railGeos.length) {
    const rmat = new THREE.MeshStandardMaterial({ color: 0xb4b2ac, roughness: 0.9, side: THREE.DoubleSide });   // 打ち放しコンクリートの明るい灰色
    byKey(railGeos).forEach(gs => {
      const rg = mergeGeometries(gs.map(g => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; }));
      rg.computeVertexNormals(); rg.computeBoundingSphere();
      const rail = new THREE.Mesh(boxUV(rg, 4), rmat); rail.castShadow = true; rail.receiveShadow = true; out.group.add(rail);
    });
  }
  if (deckGeos.length) {
    // 高架の上の線路: 砂利（バラスト）、0.6m ごとのコンクリート枕木、2 本のレール（狭軌 1.067m・新幹線 1.435m）
    deckGeos.forEach(g => { const n2 = g.attributes.position.count, ga = new Float32Array(n2).fill(g.userData.gauge); g.setAttribute('aGauge', new THREE.BufferAttribute(ga, 1)); });
    const dm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    dm.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGauge; attribute vec2 aTU; varying vec2 vTU; varying float vGauge;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvTU = aTU; vGauge = aGauge;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vTU; varying float vGauge; float rh(vec2 p) { p = mod(p, 289.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float w = (vTU.x - 0.5) * 5.0, along = vTU.y;   // 横（m、中心が 0）と長さ方向（m）
          float n1 = rh(floor(vec2(w, along) * 18.0)), n2 = rh(floor(vec2(w, along) * 5.0));
          vec3 ballast = mix(vec3(0.24, 0.22, 0.2), vec3(0.42, 0.39, 0.35), n1 * 0.7 + n2 * 0.3);
          float bed = 1.0 - smoothstep(1.55, 1.9, abs(w));   // 道床の幅（外は砂利の少ない平らな面）
          vec3 c = mix(vec3(0.5, 0.49, 0.46), ballast, bed);
          float slp = step(fract(along / 0.6), 0.32) * step(abs(w), 1.2);   // 枕木（幅 0.2m、長さ 2.4m）
          c = mix(c, vec3(0.55, 0.54, 0.51) * (0.9 + 0.1 * n2), slp);
          float g2 = vGauge * 0.5 + 0.035, rail = 1.0 - smoothstep(0.03, 0.05, abs(abs(w) - g2));
          c = mix(c, vec3(0.62, 0.6, 0.58), rail);
          diffuseColor.rgb = c;
          float fw2 = fwidth(along); diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.5, 0.49, 0.46), vec3(0.36, 0.34, 0.31), bed), smoothstep(0.08, 0.3, fw2));`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, 1.0 - smoothstep(0.03, 0.05, abs(abs((vTU.x - 0.5) * 5.0) - (vGauge * 0.5 + 0.035))));');
    };
    byKey(deckGeos).forEach(gs => { const dg = mergeGeometries(gs); dg.computeVertexNormals(); dg.computeBoundingSphere(); const deck = new THREE.Mesh(dg, dm); deck.receiveShadow = true; out.group.add(deck); });
  }

  /* --- 信号機（LED 薄型の横型 3 灯、φ250、フードなし）。下端 5.6m、柱は進んでくる車の左、アームは車線の上へ。
         すべてインスタンス描画（部品ごとに 1 回の描画）で、灯の点灯はインスタンスの色で切り替える --- */
  const sigs = signals(net); let NS = sigs.length;
  out.signals = sigs;
  // 柱の位置: 交差点の向こう側で、進入車線の中心の延長線上の点から運転者の左へ探し、車道の外（縁から 0.4m 以上）に出た最初の所。
  // アームは灯器が車線の中心の上に来る長さ（2〜8m）。見つからないときは、少し手前・奥にずらして探す。それでも無理なら置かない
  const offRoad = (x, z) => !(roadG.at(x, z) || roadG.at(x + 0.4, z) || roadG.at(x - 0.4, z) || roadG.at(x, z + 0.4) || roadG.at(x, z - 0.4));
  sigs.forEach(sg => {
    const lx = sg.dz, lz = -sg.dx; sg.skip = true;
    for (const along of [0, 2, -2, 4, 6, -4, 8, 10, -6, 12, 14, 16]) {
      const cx = sg.laneX + sg.dx * along, cz = sg.laneZ + sg.dz * along;
      if (!roadG.at(cx, cz)) continue;   // 車線の延長線上が車道でない（交差点の外れ）
      for (let lat = 1.5; lat <= 9; lat += 0.25) {
        const px = cx + lx * lat, pz = cz + lz * lat;
        if (offRoad(px, pz)) { sg.x = px; sg.z = pz; sg.arm = Math.max(2, Math.min(9.5, lat + 0.55)); sg.skip = false; break; }
      }
      if (!sg.skip) break;
    }
  });
  for (let i = sigs.length - 1; i >= 0; i--) if (sigs[i].skip) sigs.splice(i, 1);
  NS = sigs.length;
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
  /* --- 川: 水面（さざ波・空の映り込み）と、コンクリートの護岸（岸の高さから川底まで） --- */
  if (waters.length) {
    const q = W.water.q, WP = [], WI = [], RP = [], RI = [];
    waters.forEach(({ wt, rings, bankY }) => {
      const b = WP.length / 3, v = wt.tri.v; for (let i = 0; i < v.length; i += 2) WP.push(v[i] * q, wt.wl, v[i + 1] * q);
      for (let i = 0; i < wt.tri.i.length; i += 3) WI.push(b + wt.tri.i[i], b + wt.tri.i[i + 2], b + wt.tri.i[i + 1]);
      rings.forEach((R, ri) => { for (let i = 1; i < R.length; i++) {
        const a = R[i - 1], c = R[i], ya = Math.max(wt.wl + 0.8, bankY[ri][i - 1] + 0.1), yc = Math.max(wt.wl + 0.8, bankY[ri][i] + 0.1), k = RP.length / 3;
        RP.push(a[0], ya, a[1], c[0], yc, c[1], a[0], wt.bed - 0.3, a[1], c[0], wt.bed - 0.3, c[1]); RI.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      } });
    });
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(WP, 3)); wg.setIndex(WI); wg.computeVertexNormals();
    const wTime = { value: 0 };
    const wm = new THREE.MeshStandardMaterial({ color: 0x2c443e, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.93, side: THREE.DoubleSide });
    wm.onBeforeCompile = sh => {
      sh.uniforms.uT = wTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW; uniform float uT;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // さざ波: 向きの違う波を重ねて法線を揺らす（流れの向きは問わない）
          vec2 p = vWW.xz;
          float d1 = cos(dot(p, vec2(0.83, 0.55)) * 1.7 + uT * 1.3), d2 = cos(dot(p, vec2(-0.42, 0.91)) * 2.9 + uT * 1.9), d3 = cos(dot(p, vec2(0.21, -0.98)) * 5.3 + uT * 2.7);
          vec3 wn = normalize(vec3(d1 * 0.06 * 0.83 - d2 * 0.04 * 0.42 + d3 * 0.025 * 0.21, 1.0, d1 * 0.06 * 0.55 + d2 * 0.04 * 0.91 - d3 * 0.025 * 0.98));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`);
    };
    const water = new THREE.Mesh(wg, wm); water.receiveShadow = true; water.onBeforeRender = () => { wTime.value = performance.now() / 1000; }; out.group.add(water);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3)); rg.setIndex(RI); rg.computeVertexNormals();
    const rw = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x9c998f, roughness: 0.92, side: THREE.DoubleSide })); rw.receiveShadow = true; out.group.add(rw);
    out.waterTris = fn => { for (let i = 0; i < WI.length; i += 3) fn(WP[WI[i] * 3], WP[WI[i] * 3 + 2], WP[WI[i + 1] * 3], WP[WI[i + 1] * 3 + 2], WP[WI[i + 2] * 3], WP[WI[i + 2] * 3 + 2]); };
  }
  /* --- 橋（道路）: 路面の下の桁（厚さ 1.2m）と、両側の高欄（高さ 1.0m のコンクリートの壁と上の手すり）。地面から 1.5m 以上高い所だけ --- */
  {
    const BP = [], BI = [], quad = (a, b, c, d) => { const k = BP.length / 3; BP.push(...a, ...b, ...c, ...d); BI.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); };
    (out.bridges || []).forEach(br => {
      const L = br.L; if (L.length < 2) return;
      const mid = L[Math.floor(L.length / 2)]; if (mid[2] - terr.at(mid[0], mid[1]) < 1.5) return;
      const w = br.hw + 0.6;
      for (let i = 1; i < L.length; i++) {
        const a = L[i - 1], c = L[i], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w;
        const A = [a[0] - nx, a[2], a[1] - nz], B = [a[0] + nx, a[2], a[1] + nz], Cc = [c[0] - nx, c[2], c[1] - nz], D = [c[0] + nx, c[2], c[1] + nz];
        const dn = p => [p[0], p[1] - 1.2, p[2]], up = p => [p[0], p[1] + 1.0, p[2]];
        quad(dn(A), dn(Cc), dn(B), dn(D));                  // 桁の下面
        quad(A, Cc, dn(A), dn(Cc)); quad(B, D, dn(B), dn(D));  // 桁の側面
        quad(up(A), up(Cc), A, Cc); quad(up(B), up(D), B, D);  // 高欄
      }
    });
    if (BP.length) {
      const bg2 = new THREE.BufferGeometry(); bg2.setAttribute('position', new THREE.Float32BufferAttribute(BP, 3)); bg2.setIndex(BI); bg2.computeVertexNormals();
      const bm = new THREE.Mesh(bg2, new THREE.MeshStandardMaterial({ color: 0xbab7af, roughness: 0.85, side: THREE.DoubleSide })); bm.castShadow = true; bm.receiveShadow = true; out.group.add(bm);
    }
  }
  /* --- 路面表示（車道の中だけ。長い線は 2m ごとに分けて路面の高さに沿わせる。橋の上は橋の路面の高さ） --- */
  {
    const mk = markings(net, (x, z) => out.onRoadPt(x, z));
    const white = [0.92, 0.92, 0.9], yellow = [0.95, 0.66, 0.1];
    const hAt = (x, z) => { const by = out.bridgeY(x, z); return by !== null ? by + 0.045 : terr.atRoad(x, z) + 0.075; };
    // 交差点の中（腕の半幅の 9 割の円の中）には、外側線・中央線・車線境界線を引かない（線の重なりを防ぐ）
    const JG = new Map(), jk = (x, z) => Math.floor(x / 40) + ',' + Math.floor(z / 40);
    (net.groups || []).forEach(Cg => {   // まとめた交差点（上下線の分かれた大通りどうしなど）: 中心から最も遠い点 + 腕の半幅
      const ms = Cg.members || []; if (!ms.length) return;
      const r = Math.max(...ms.map(m => Math.hypot(m.x - Cg.x, m.z - Cg.z))) * 0.6 + Math.max(...ms.flatMap(m => m.arms.map(a2 => a2.e.pr.hw))) * 0.5;
      const k = jk(Cg.x, Cg.z); if (!JG.has(k)) JG.set(k, []); JG.get(k).push([Cg.x, Cg.z, r]);
    });
    net.nodes.forEach(n => { if (n.arms.length < 3) return; const r = Math.max(...n.arms.map(a2 => a2.e.pr.hw)) * 0.9; const k = jk(n.x, n.z); if (!JG.has(k)) JG.set(k, []); JG.get(k).push([n.x, n.z, r]); });
    const inJ = (x, z) => { const gx = Math.floor(x / 40), gz = Math.floor(z / 40); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [nx, nz, r] of JG.get((gx + i) + ',' + (gz + j)) || []) if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return true; return false; };
    const LINE = { edge: 1, center: 1, lane: 1, side: 1, zebra: 1, arrow: 1, dia: 1 };
    // ほかの道の車道の中（交差点の中・重なった道）には線を引かない。ほかの道は切り詰める前の中心線と半幅で判定する。
    // 腕が 2 本だけの点でつながる道（同じ道が OSM で分かれているだけ）は同じ道として扱う
    const SG = new Map(), sk = (i, j) => i + ',' + j, SC = 20;
    const cont = new Map();
    net.nodes.forEach(n => { if (n.arms.length !== 2) return; const [a1, a2] = n.arms; if (!cont.has(a1.e)) cont.set(a1.e, new Set()); if (!cont.has(a2.e)) cont.set(a2.e, new Set()); cont.get(a1.e).add(a2.e); cont.get(a2.e).add(a1.e); });
    net.edges.forEach(e2 => {
      if (e2.hidden) return; const Pp = e2.pts || e2.line; if (!Pp || Pp.length < 2) return;
      for (let i = 1; i < Pp.length; i++) {
        const a = Pp[i - 1], b = Pp[i], g = { e: e2, ax: a[0], az: a[1], bx: b[0], bz: b[1], hw: e2.pr.hw };
        const i0 = Math.floor((Math.min(a[0], b[0]) - g.hw) / SC), i1 = Math.floor((Math.max(a[0], b[0]) + g.hw) / SC), j0 = Math.floor((Math.min(a[1], b[1]) - g.hw) / SC), j1 = Math.floor((Math.max(a[1], b[1]) + g.hw) / SC);
        for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) { const k = sk(ii, jj); if (!SG.has(k)) SG.set(k, []); SG.get(k).push(g); }
      }
    });
    const inOther = (e, x, z) => {
      const cs = cont.get(e);
      for (const g of SG.get(sk(Math.floor(x / SC), Math.floor(z / SC))) || []) {
        if (g.e === e || (cs && cs.has(g.e))) continue;
        const dx = g.bx - g.ax, dz = g.bz - g.az, l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / l2));
        const px = g.ax + dx * u - x, pz = g.az + dz * u - z; if (px * px + pz * pz < (g.hw - 0.2) ** 2) return true;
      }
      return false;
    };
    // 400m 四方のまとまりごとに分ける（画面の外のまとまりは描かない）
    const CH = new Map(), chunkOf = (x, z) => { const k = Math.floor(x / 400) + ',' + Math.floor(z / 400); let c = CH.get(k); if (!c) CH.set(k, c = { P: [], C: [], I: [] }); return c; };
    let cur = null;
    const put = (pts, col) => { const c = cur, b = c.P.length / 3; pts.forEach(p => { c.P.push(p[0], hAt(p[0], p[1]), p[1]); c.C.push(col[0], col[1], col[2]); }); return b; };
    mk.forEach(m => {
      const col = m.c === 'y' ? yellow : white;
      if (m.tris) { for (let k = 0; k < m.tris.length; k += 3) { const t = m.tris; const cx = (t[k][0] + t[k + 1][0] + t[k + 2][0]) / 3, cz = (t[k][1] + t[k + 1][1] + t[k + 2][1]) / 3; if (!out.onRoadPt(cx, cz) || (LINE[m.t] && m.e && inOther(m.e, cx, cz))) continue; cur = chunkOf(cx, cz); const b = put([t[k], t[k + 1], t[k + 2]], col); cur.I.push(b, b + 2, b + 1); } return; }
      const q = m.q, len = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), n = Math.max(1, Math.ceil(len / (m.t === 'cw' ? 1 : 3)));
      const L = (A, B, u) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u];
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n, a0 = L(q[0], q[1], u0), a1 = L(q[0], q[1], u1), b1 = L(q[3], q[2], u1), b0 = L(q[3], q[2], u0);
        const cx = (a0[0] + a1[0] + b0[0] + b1[0]) / 4, cz = (a0[1] + a1[1] + b0[1] + b1[1]) / 4;
        if (!out.onRoadPt(cx, cz)) continue;   // 車道の外（歩道・建物）にはみ出す部分は描かない
        if (LINE[m.t] && (inJ(cx, cz) || (m.e && inOther(m.e, cx, cz)))) continue;
        cur = chunkOf(cx, cz); const b = put([a0, a1, b1, b0], col); cur.I.push(b, b + 2, b + 1, b, b + 3, b + 2);
      }
    });
    const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
    let nQuads = 0;
    CH.forEach(c => {
      if (!c.I.length) return;
      const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(c.P, 3)); mg.setAttribute('color', new THREE.Float32BufferAttribute(c.C, 3)); mg.setIndex(c.I);
      const nrm = new Float32Array(c.P.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; mg.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));   // 路面の線は上向き
      mg.computeBoundingSphere();
      const marks = new THREE.Mesh(mg, markMat); marks.receiveShadow = true; out.group.add(marks); nQuads += c.I.length / 6;
    });
    // 文字（止まれ・速度の数字）: 文字の画像を道路の向きに長く引き伸ばして貼る（実際の路面の文字と同じ縦横比）
    const LABELS = ['止まれ', '30', '40', '50'], cv = document.createElement('canvas'); cv.width = 512; cv.height = 256 * LABELS.length;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    LABELS.forEach((t, i) => { g.font = '900 ' + (t.length > 2 ? 190 : 230) + 'px "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif'; g.save(); g.translate(256, i * 256 + 128); g.scale(t.length > 2 ? 0.96 : 1.2, 1); g.fillText(t, 0, 8); g.restore(); });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const TP = [], TU = [], TI = [];
    (mk.texts || []).forEach(t => {
      const slot = LABELS.indexOf(t.txt); if (slot < 0 || !t.dx) return;
      const lx = -t.dz, lz = t.dx, bx = t.x + lx * t.off, bz = t.z + lz * t.off;
      if (!out.onRoadPt(bx, bz)) return;
      const P2 = (u, w) => { const x = bx + t.dx * u * t.dir + lx * (-w * t.dir), z = bz + t.dz * u * t.dir + lz * (-w * t.dir); return [x, hAt(x, z) + 0.004, z]; };
      const v0 = 1 - (slot + 1) / LABELS.length, v1 = 1 - slot / LABELS.length, b = TP.length / 3;
      [[P2(-t.len / 2, t.w / 2), 0, v0], [P2(-t.len / 2, -t.w / 2), 1, v0], [P2(t.len / 2, -t.w / 2), 1, v1], [P2(t.len / 2, t.w / 2), 0, v1]].forEach(([p, u, v]) => { TP.push(...p); TU.push(u, v); });
      TI.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    if (TP.length) {
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(TP, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(TU, 2)); tg.setIndex(TI); tg.computeVertexNormals();
      const tm = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tex, color: 0xebebe6, roughness: 0.62, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }));
      tm.receiveShadow = true; out.group.add(tm);
    }
    out.markCount = { quads: nQuads, texts: TI.length / 6 };
    /* --- 標識（道路標識令の様式。図柄は Canvas で描く）: 表・裏・柱をそれぞれインスタンス描画（描画 3 回） --- */
    const SL = ['stop', 'speed30', 'speed40', 'speed50', 'cross', 'oneway', 'noentry', 'nopark'], SA = document.createElement('canvas'); SA.width = 1024; SA.height = 512;
    { const g = SA.getContext('2d');
      const slot = (i, fn) => { g.save(); g.translate((i % 4) * 256, Math.floor(i / 4) * 256); fn(g); g.restore(); };
      const circle = (g, fill, ring) => { g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fillStyle = ring; g.fill(); g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
      slot(0, g => { g.beginPath(); g.moveTo(6, 22); g.lineTo(250, 22); g.lineTo(128, 236); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.beginPath(); g.moveTo(22, 31); g.lineTo(234, 31); g.lineTo(128, 216); g.closePath(); g.fillStyle = '#d0121b'; g.fill();
        g.fillStyle = '#fff'; g.font = '900 52px "Hiragino Sans","Noto Sans JP",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('止まれ', 128, 92); });
      [30, 40, 50].forEach((v, k) => slot(1 + k, g => { circle(g, '#fff', '#d0121b'); g.fillStyle = '#1b3f95'; g.font = '900 118px Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(128, 132); g.scale(0.82, 1); g.fillText(String(v), 0, 0); g.restore(); }));
      slot(4, g => { g.fillStyle = '#1b5fb4'; g.fillRect(8, 8, 240, 240); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(18, 18, 220, 220);
        g.beginPath(); g.moveTo(128, 34); g.lineTo(226, 214); g.lineTo(30, 214); g.closePath(); g.fillStyle = '#fff'; g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(128, 96, 13, 0, Math.PI * 2); g.fill(); g.lineCap = 'round'; g.lineWidth = 14; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(126, 112); g.lineTo(118, 160); g.lineTo(98, 196); g.moveTo(118, 160); g.lineTo(142, 194); g.moveTo(124, 126); g.lineTo(100, 146); g.moveTo(124, 126); g.lineTo(152, 142); g.stroke();
        g.fillStyle = '#111'; for (let k = 0; k < 5; k++) g.fillRect(58 + k * 30, 200, 18, 10); });
      slot(5, g => { g.fillStyle = '#1b5fb4'; g.fillRect(0, 64, 256, 128); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 72, 240, 112); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(36, 116); g.lineTo(170, 116); g.lineTo(170, 92); g.lineTo(226, 128); g.lineTo(170, 164); g.lineTo(170, 140); g.lineTo(36, 140); g.closePath(); g.fill(); });
      slot(6, g => { g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fillStyle = '#d0121b'; g.fill(); g.fillStyle = '#fff'; g.fillRect(38, 108, 180, 40); });
      slot(7, g => { circle(g, '#1b5fb4', '#d0121b'); g.save(); g.translate(128, 128); g.rotate(Math.PI / 4); g.fillStyle = '#d0121b'; g.fillRect(-100, -13, 200, 26); g.restore(); });
    }
    const stex = new THREE.CanvasTexture(SA); stex.colorSpace = THREE.SRGBColorSpace; stex.anisotropy = 8;
    const signs = (mk.signs || []).map(sg => {
      // 車道の上なら、進む向きの左へ路肩の外まで押し出す
      let x = sg.x, z = sg.z; const lx = -sg.nz, lz = sg.nx;
      for (let k = 0; k < 12 && out.onRoadPt(x, z); k++) { x += lx * 0.3; z += lz * 0.3; }
      if (out.onRoadPt(x, z)) return null;
      const key = sg.type === 'speed' ? 'speed' + sg.val : sg.type, i = SL.indexOf(key); if (i < 0) return null;
      const size = sg.type === 'stop' ? 0.8 : sg.type === 'oneway' ? 0.8 : 0.6, h = sg.type === 'stop' ? 2.0 : 2.3;
      return { x, z, y: terr.atRoad(x, z) + WALK_H, yaw: Math.atan2(sg.nx, sg.nz), i, size, h };
    }).filter(Boolean);
    if (signs.length) {
      const pg = new THREE.PlaneGeometry(1, 1), bg3 = new THREE.PlaneGeometry(1, 1); bg3.rotateY(Math.PI); bg3.translate(0, 0, -0.012);
      const auv = new THREE.InstancedBufferAttribute(new Float32Array(signs.length * 4), 4);
      signs.forEach((sg, k) => auv.setXYZW(k, (sg.i % 4) / 4, 1 - (Math.floor(sg.i / 4) + 1) / 2, 0.25, 0.5));
      pg.setAttribute('aUV', auv);
      const fm = new THREE.MeshStandardMaterial({ map: stex, roughness: 0.45, metalness: 0.1, alphaTest: 0.5, side: THREE.FrontSide });
      fm.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = uv * aUV.zw + aUV.xy;'); };
      fm.customProgramCacheKey = () => 'signFront';
      const bmat2 = new THREE.MeshStandardMaterial({ map: stex, color: 0x8a8d90, roughness: 0.5, metalness: 0.5, alphaTest: 0.5 });
      bmat2.onBeforeCompile = fm.onBeforeCompile; bmat2.customProgramCacheKey = () => 'signBack'; bg3.setAttribute('aUV', auv);
      const front = new THREE.InstancedMesh(pg, fm, signs.length), back = new THREE.InstancedMesh(bg3, bmat2, signs.length);
      const poleG = new THREE.CylinderGeometry(0.03, 0.03, 1, 8, 1, true); poleG.translate(0, 0.5, -0.04);
      const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0xa8acb0, roughness: 0.45, metalness: 0.6 }), signs.length);
      const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3();
      signs.forEach((sg, k) => {
        Q.setFromAxisAngle(Y, sg.yaw);
        M4.compose(V.set(sg.x, sg.y + sg.h, sg.z), Q, new THREE.Vector3(sg.size, sg.size, 1)); front.setMatrixAt(k, M4); back.setMatrixAt(k, M4);
        M4.compose(V.set(sg.x, sg.y, sg.z), Q, new THREE.Vector3(1, sg.h + sg.size * 0.3, 1)); poles.setMatrixAt(k, M4);
      });
      [front, back, poles].forEach(m => { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); out.group.add(m); });
      out.signCount = signs.length;
    }
  }

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
  sun.shadow.camera.layers.enable(1);   // 影だけを落とす粗い形（レイヤー 1）
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd4dde8, 0x6a6458, 0.55); scene.add(hemi);
  scene.fog = new THREE.Fog(0xc4d2de, Math.min(400, (opt.far || 2600) * 0.3), opt.far || 2600);
  // 空の色から環境マップ（反射と間接光）
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000); Object.keys(u).forEach(k => { if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value; }); envScene.add(sky2);
  scene.environment = pm.fromScene(envScene, 0.02).texture; scene.environmentIntensity = 0.12;   // Preetham の空は値が大きいので弱める
  // 時間帯: 昼（既定）・夕方・夜。太陽（夜は月）の向きと光、空、霧、環境光、灯りの度合い（NIGHT）をまとめて切り替える
  const TIMES = {
    day: { elev, azim, sun: [0xfff1dc, 2.6], hemi: [0xd4dde8, 0x6a6458, 0.55], fog: 0xc4d2de, env: 0.12, night: 0, tb: 4, ray: 1.6 },
    dusk: { elev: 3.5, azim: 250, sun: [0xffa66a, 1.5], hemi: [0x8f8aa0, 0x4a4038, 0.55], fog: 0x9c8f96, env: 0.5, night: 0.55, tb: 6, ray: 2.6 },
    night: { elev: 32, azim: 120, sun: [0x8fa6d8, 0.22], hemi: [0x34405e, 0x16161c, 0.42], fog: 0x0a0f18, env: 0, night: 1, tb: 2, ray: 0.4, skyElev: -14 }
  };
  // 夜空: 天頂は濃い紺、地平線の近くは街の明かりで少し明るい（光害）。描画 1 回の球
  const nightSky = new THREE.Mesh(new THREE.SphereGeometry(15000, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: 'varying vec3 vD; float h(vec3 p) { return fract(sin(dot(floor(p), vec3(12.99, 78.23, 37.71))) * 43758.55); } void main() { float y = max(vD.y, 0.0); vec3 c = mix(vec3(0.075, 0.07, 0.075), vec3(0.008, 0.013, 0.03), pow(y, 0.45)); float st = step(0.9965, h(vD * 420.0)) * smoothstep(0.08, 0.35, y) * 0.5; gl_FragColor = vec4(c + st, 1.0); }'
  }));
  nightSky.visible = false; nightSky.renderOrder = -1; nightSky.frustumCulled = false; scene.add(nightSky);
  let envRT = null;
  function setTime(mode) {
    const T = TIMES[mode] || TIMES.day;
    sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - T.elev), THREE.MathUtils.degToRad(T.azim));   // 夜は月の向き（影を落とす光）
    const skyDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - (T.skyElev !== undefined ? T.skyElev : T.elev)), THREE.MathUtils.degToRad(T.azim));
    u.sunPosition.value.copy(skyDir); u.turbidity.value = T.tb; u.rayleigh.value = T.ray;
    sun.color.set(T.sun[0]); sun.intensity = T.sun[1];
    hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2];
    scene.fog.color.set(T.fog);
    sky.visible = mode !== 'night'; nightSky.visible = mode === 'night';
    Object.keys(u).forEach(k => { if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value; });
    if (T.env > 0) { if (envRT) envRT.dispose(); envRT = pm.fromScene(envScene, 0.02); scene.environment = envRT.texture; scene.environmentIntensity = T.env * (mode === 'dusk' ? 0.4 : 1); }
    else scene.environmentIntensity = 0.0;
    NIGHT.value = T.night;
    out.mode = mode;
  }
  const out = { sky, nightSky, sun, sunDir, hemi, setTime, mode: 'day', dispose() { pm.dispose(); if (envRT) envRT.dispose(); sky2.material.dispose(); sky2.geometry.dispose(); } };
  if (opt.time && opt.time !== 'day') setTime(opt.time);
  return out;
}
