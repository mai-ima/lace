/*
 * landmarks.js — 名所を独自に作る（既存の 3D モデルは使わない）。形は写真と PLATEAU の高さ、模様はコードで描いたテクスチャ。
 * 設計書: docs/landmarks/README.md。今あるのは L1 アクトタワー。
 *
 * 置き方: PLATEAU の建物（W.bldg）の中から名所の建物を探し（重心と高さ）、その建物の頂点を決めた高さへ切り下げて隠し、
 * 代わりに作った形を置く。向き・長さ・幅は隠した建物の頂点の主軸から求めるので、地図とずれない。
 */
import * as THREE from 'three';
import { NIGHT } from './lights.js';

/* ---- 共通: 高さごとに断面（外形の関数）を押し出した壁。uv は（周の長さ m, 高さ m） ---- */
function prism(outline, N, rings) {
  // rings: [{ y, s, o }]（高さ・外形の倍率・長い向きのずらし）。下から上へ
  const pos = [], uv = [], idx = [];
  const P = rings.map(r => { const pts = []; for (let i = 0; i <= N; i++) pts.push(outline(i / N * Math.PI * 2, r.s, r.o)); return pts; });
  rings.forEach((r, k) => {
    let acc = 0;
    P[k].forEach((p, i) => { if (i) acc += Math.hypot(p[0] - P[k][i - 1][0], p[1] - P[k][i - 1][1]); pos.push(p[0], r.y, p[1]); uv.push(acc, r.y); });
  });
  const W = N + 1;
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < N; i++) {
    const a = k * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/* 外形の内側を平らにふさぐ（屋上） */
function cap(outline, N, y, s, o) {
  const pos = [0, y, 0], uv = [0, 0], idx = [];
  const c = outline(0, 0, o); pos[0] = c[0]; pos[2] = c[1];
  for (let i = 0; i <= N; i++) { const p = outline(i / N * Math.PI * 2, s, o); pos.push(p[0], y, p[1]); uv.push(p[0], p[1]); }
  for (let i = 1; i <= N; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/* 円の外形のうち、角度 t0〜t1 の帯だけ（青いガラスの縦帯など） */
function band(outline, t0, t1, n, y0, y1, s, o, push) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * i / n, p = outline(t, s, o), q = outline(t + 1e-3, s, o);
    const tx = q[0] - p[0], tz = q[1] - p[1], L = Math.hypot(tx, tz) || 1, nx = tz / L, nz = -tx / L;   // 外向き
    pos.push(p[0] + nx * push, y0, p[1] + nz * push, p[0] + nx * push, y1, p[1] + nz * push);
    uv.push(i / n, y0, i / n, y1);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---- 模様（キャンバスに描く） ---- */
function canvasTex(w, h, draw, srgb) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* アクトタワーの外壁: ピンクがかったベージュのタイル（目地と色むら）に、縦長の四角い窓が柱間 3.6m・階 4.4m で並ぶ。
   1 枚 = 柱間 4 つ × 4 階（14.4m × 17.6m）。夜の窓明かりは別の 1 枚（同じ並びで、点く窓をばらばらに） */
const BAY = 3.6, FLR = 4.4, TW = BAY * 4, TH = FLR * 4;   // 写真で下段（地上 118m まで）の窓の列は約 27 段 → 階 4.4m
function actFacade() {
  const PX = 40, w = Math.round(TW * PX), h = Math.round(TH * PX), r = rnd(7);
  const map = canvasTex(w, h, (g) => {
    g.fillStyle = '#c4a391'; g.fillRect(0, 0, w, h);
    // タイルの色むら（1 枚 0.4m × 0.2m 相当の小さな濃淡）
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 16) {
      const k = (r() - 0.5) * 14; g.fillStyle = `rgba(${k > 0 ? 255 : 60},${k > 0 ? 240 : 40},${k > 0 ? 230 : 30},${Math.abs(k) / 120})`; g.fillRect(x, y, 16, 8);
    }
    // 目地（階ごとの太い線と、パネルの縦の線）
    g.fillStyle = 'rgba(90,70,60,.35)';
    for (let f = 0; f < 4; f++) g.fillRect(0, Math.round((f + 1) * FLR * PX) - 2, w, 2);
    for (let b = 0; b < 8; b++) g.fillRect(Math.round(b * BAY / 2 * PX), 0, 1, h);
    // 窓（ガラスは空を映す青灰、上に庇の影、周りに縁）
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) {
      const x0 = Math.round((b * BAY + BAY / 2 - 0.7) * PX), y0 = Math.round((f * FLR + 1.3) * PX), ww = Math.round(1.4 * PX), hh = Math.round(1.7 * PX);
      g.fillStyle = '#8e786d'; g.fillRect(x0 - 3, y0 - 3, ww + 6, hh + 6);
      const gr = g.createLinearGradient(0, y0, 0, y0 + hh); gr.addColorStop(0, '#5e7186'); gr.addColorStop(1, '#2c3542');
      g.fillStyle = gr; g.fillRect(x0, y0, ww, hh);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0, y0, ww, 4);
      g.fillStyle = 'rgba(200,210,220,.25)'; g.fillRect(x0 + ww / 2 - 1, y0, 2, hh);   // 方立
    }
  });
  const glow = canvasTex(w, h, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let f = 0; f < 4; f++) for (let b = 0; b < 4; b++) {
      if (r() < 0.45) continue;
      const x0 = Math.round((b * BAY + BAY / 2 - 0.7) * PX), y0 = Math.round((f * FLR + 1.3) * PX), ww = Math.round(1.4 * PX), hh = Math.round(1.7 * PX);
      const k = 0.55 + r() * 0.45; g.fillStyle = `rgb(${Math.round(255 * k)},${Math.round(205 * k)},${Math.round(140 * k)})`; g.fillRect(x0, y0 + 4, ww, hh - 4);
    }
  });
  [map, glow].forEach(t => t.repeat.set(1 / TW, 1 / TH));
  return { map, glow };
}
/* ルーバー（細い横板が 0.25m ごとに並ぶ帯）と、展望室のガラスの方立 */
function louverTex() {
  const t = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#aeb3b6'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = '#e6e9ea'; g.fillRect(0, y, w, 3); g.fillStyle = '#6d7276'; g.fillRect(0, y + 5, w, 2); } });
  t.repeat.set(1 / 2, 1 / 2); return t;
}
function mullionTex() {
  const t = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#2d4a52'; g.fillRect(0, 0, w, h); g.fillStyle = '#9aa5a8'; g.fillRect(0, 0, 4, h); g.fillRect(0, 0, w, 3); g.fillRect(0, 34, w, 2); });
  t.repeat.set(1 / 1.6, 1 / 3.2); return t;
}

/* ---- L1 アクトタワー ---- */
function actTower(info) {
  const { a, b } = info;   // 長い向きの半分・短い向きの半分（m）
  const N = 160;
  // 外形: 真上の航空写真（VIRTUAL SHIZUOKA）では、一方の端（-x）が太く丸く、もう一方（+x）がやや細い卵形。o は長い向きのずらし（m）
  const outline = (t, s, o) => {
    const c = Math.cos(t), sn = Math.sin(t);
    return [o + a * s * c, b * s * sn * (1 - 0.17 * c) / 1.0];
  };
  const H = info.h;   // PLATEAU の冠の頂の高さ（地面から）
  const k = H / 217;   // 写真・PLATEAU の段の高さ（地上 118m・132m・屋上 197m・冠の頂 217m）をこの塔の高さに合わせる
  const yStep = 118 * k, yStep2 = 124 * k, yRoof = 197 * k, sU = 0.9, oU = 0;   // 上段は全周が 3〜5m 引っ込み、その間をルーバーが斜めにつなぐ
  const g = new THREE.Group();
  const fac = actFacade();
  const facM = new THREE.MeshStandardMaterial({ map: fac.map, roughness: 0.62, metalness: 0.08, emissive: 0xffffff, emissiveMap: fac.glow, emissiveIntensity: 0 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x24405e, roughness: 0.12, metalness: 0.75, emissive: 0x6f8fb0, emissiveIntensity: 0 });
  const bandM = new THREE.MeshStandardMaterial({ color: 0x3a5466, roughness: 0.1, metalness: 0.7, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const louM = new THREE.MeshStandardMaterial({ map: louverTex(), roughness: 0.45, metalness: 0.55 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0x8c8f90, roughness: 0.8, metalness: 0.1 });
  const crownM = new THREE.MeshStandardMaterial({ map: mullionTex(), roughness: 0.1, metalness: 0.6, emissive: 0xbfe6ff, emissiveIntensity: 0 });
  const diskM = new THREE.MeshStandardMaterial({ color: 0xc9cdcf, roughness: 0.35, metalness: 0.7 });
  const add = (geo, m, shadow) => { const me = new THREE.Mesh(geo, m); me.castShadow = shadow !== false; me.receiveShadow = true; g.add(me); return me; };
  // 下段（地面〜段）と、段のルーバー（外へ少し張り出した庇から上段の壁へ斜めに上がる）
  add(prism(outline, N, [{ y: 0, s: 1, o: 0 }, { y: yStep, s: 1, o: 0 }]), facM);
  add(prism(outline, N, [{ y: yStep, s: 1.012, o: 0 }, { y: yStep2, s: sU + 0.02, o: oU }]), louM);
  add(cap(outline, N, yStep, 1.0, 0), roofM, false);
  // 上段（段〜屋上）、段のすぐ上のガラスの横帯 3 本と、屋上の下の横帯 1 本
  add(prism(outline, N, [{ y: yStep2, s: sU, o: oU }, { y: yRoof, s: sU, o: oU }]), facM);
  for (let i = 0; i < 3; i++) { const y0 = yStep2 + (1.2 + i * 3.7) * k; add(prism(outline, N, [{ y: y0, s: sU + 0.004, o: oU }, { y: y0 + 1.9 * k, s: sU + 0.004, o: oU }]), bandM, false); }
  add(prism(outline, N, [{ y: yRoof - 7 * k, s: sU + 0.004, o: oU }, { y: yRoof - 5.3 * k, s: sU + 0.004, o: oU }]), bandM, false);
  // 屋上の縁（パラペット）と屋上
  add(prism(outline, N, [{ y: yRoof, s: sU, o: oU }, { y: yRoof + 1.6 * k, s: sU, o: oU }]), roofM);
  add(cap(outline, N, yRoof + 0.6 * k, sU * 0.985, oU), roofM, false);
  // 青いガラスの縦帯: 細い方の端（+長い向き）を地面から屋上まで通る（階段・エレベーターの部分）
  add(band(outline, -0.2, 0.2, 16, 1.5, yStep, 1, 0, 0.18), glassM);
  add(band(outline, -0.22, 0.22, 16, yStep2, yRoof, sU, oU, 0.18), glassM);
  // 冠: 円筒のガラスの展望室（航空写真で直径約 30m、塔の中ほど）と、張り出した円盤の屋根（上はヘリポート）
  const cx = 0, R0 = Math.min(b * 0.62, 16), cyl = (rt, rb, h, y, m, seg) => { const c = new THREE.CylinderGeometry(rt, rb, h, seg || 64, 1, false); c.translate(cx, y + h / 2, 0); return add(c, m); };
  cyl(R0 * 0.82, R0 * 0.82, 2.0 * k, yRoof + 0.6 * k, roofM);
  const cr = new THREE.CylinderGeometry(R0 * 0.86, R0 * 0.9, 10.5 * k, 64, 1, true); cr.translate(cx, yRoof + 2.6 * k + 5.25 * k, 0);
  { const uv = cr.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * R0 * 0.88, uv.getY(i) * 10.5 * k); }
  add(cr, crownM);
  cyl(R0 * 1.06, R0 * 0.94, 1.1 * k, yRoof + 13.1 * k, diskM);
  cyl(R0, R0 * 1.06, 1.2 * k, yRoof + 14.2 * k, diskM);
  // ヘリポート（灰の円に、黄の H と円。上から見える）
  { const hp = new THREE.CircleGeometry(R0 * 0.98, 64); hp.rotateX(-Math.PI / 2); hp.translate(cx, yRoof + 15.42 * k, 0);
    const ht = canvasTex(256, 256, (g2, w, h) => { g2.fillStyle = '#7d7f80'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#4b4d4f'; g2.fillRect(48, 48, 160, 160);
      g2.strokeStyle = '#e8c21a'; g2.lineWidth = 8; g2.beginPath(); g2.arc(128, 128, 54, 0, Math.PI * 2); g2.stroke();
      g2.fillStyle = '#e8c21a'; g2.fillRect(100, 92, 12, 72); g2.fillRect(144, 92, 12, 72); g2.fillRect(100, 122, 56, 12); });
    ht.repeat.set(1, 1); const hm = new THREE.MeshStandardMaterial({ map: ht, roughness: 0.85 });
    { const uv = hp.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i)); }
    add(hp, hm, false); }
  // 夜: 窓明かり・帯・冠が光る（夜の度合い NIGHT に合わせる）
  const mats = [[facM, 1.25], [bandM, 0.9], [crownM, 1.1], [glassM, 0.25]];
  g.children[0].onBeforeRender = () => { const n = NIGHT.value; mats.forEach(([m, s]) => { m.emissiveIntensity = n * n * s; }); };
  return g;
}

/**
 * 名所を作る。B: 建物（W.bldg）、yLo・yHi: 建物ごとの下端・上端。
 * 返り値: { group, hide }（hide: 建物の番号 → この高さより上の頂点を切り下げて隠す）
 */
export function buildLandmarks(B, yLo, yHi) {
  const nb = B.info.length, group = new THREE.Group(), hide = new Map();   // 建物の番号 → この高さより上を切る
  const cx = new Float64Array(nb), cz = new Float64Array(nb), cn = new Uint32Array(nb);
  for (let v = 0; v < B.bid.length; v++) { const k = B.bid[v]; cx[k] += B.pos[v * 3]; cz[k] += B.pos[v * 3 + 2]; cn[k]++; }
  // PLATEAU ではアクトシティ全体（低層部と塔）が 1 つの建物なので、塔の部分（clip m より上）だけを切り取って隠す。
  // 範囲 r は建物の重心（低層部ごと）で探し、塔の向き・大きさは band の高さの頂点（下段の上端 = 地上 118m の外形。LOD2 の頂点は段の高さにしか無い）で求める
  const SPOTS = [{ id: 'act', x: 192, z: -210, r: 130, minH: 150, clip: 33, band: [100, 125], make: actTower }];
  SPOTS.forEach(S => {
    const ks = [];
    for (let k = 0; k < nb; k++) if (cn[k] && Math.hypot(cx[k] / cn[k] - S.x, cz[k] / cn[k] - S.z) < S.r && yHi[k] - yLo[k] > S.minH) ks.push(k);
    if (!ks.length) { console.warn("名所が見つからない", S.id); return; }
    // 隠す建物の頂点（塔の下段の上端の外形）で、主軸（長い向き）と長さ・幅を求める
    let sx = 0, sz = 0, n = 0, lo = 1e9, hi = -1e9; const pts = [];
    ks.forEach(k => { lo = Math.min(lo, yLo[k]); hi = Math.max(hi, yHi[k]); });
    for (let v = 0; v < B.bid.length; v++) if (ks.includes(B.bid[v]) && B.pos[v * 3 + 1] > lo + S.band[0] && B.pos[v * 3 + 1] < lo + S.band[1]) { pts.push([B.pos[v * 3], B.pos[v * 3 + 2]]); sx += B.pos[v * 3]; sz += B.pos[v * 3 + 2]; n++; }
    if (n < 8) { console.warn("名所の頂点が少ない", S.id, n); return; }
    const mx = sx / n, mz = sz / n; let cxx = 0, czz = 0, cxz = 0;
    pts.forEach(([x, z]) => { cxx += (x - mx) ** 2; czz += (z - mz) ** 2; cxz += (x - mx) * (z - mz); });
    const th = 0.5 * Math.atan2(2 * cxz, cxx - czz), ux = Math.cos(th), uz = Math.sin(th);
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    pts.forEach(([x, z]) => { const p = (x - mx) * ux + (z - mz) * uz, q = -(x - mx) * uz + (z - mz) * ux; a0 = Math.min(a0, p); a1 = Math.max(a1, p); b0 = Math.min(b0, q); b1 = Math.max(b1, q); });
    const ccx = mx + ux * (a0 + a1) / 2 - uz * (b0 + b1) / 2, ccz = mz + uz * (a0 + a1) / 2 + ux * (b0 + b1) / 2;
    const obj = S.make({ a: (a1 - a0) / 2, b: (b1 - b0) / 2, h: hi - lo });
    obj.position.set(ccx, lo, ccz); obj.rotation.y = -th;
    obj.userData = { landmark: S.id, a: (a1 - a0) / 2, b: (b1 - b0) / 2, h: hi - lo, th };
    group.add(obj);
    ks.forEach(k => hide.set(k, lo + (S.clip || 0)));
  });
  return { group, hide };
}
