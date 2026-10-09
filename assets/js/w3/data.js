/*
 * data.js — 世界データの読み込み（道路・地形・建物）と、高さの関数。
 */
import { loadPhotoMarks } from './marks.js';

export async function loadWorld(base) {
  const opt = u => fetch(base + u).then(r => r.ok ? r.json() : null).catch(() => null);   // 無くても動く（道路の範囲・実測の道幅）
  const [roadArea, roadWidth, bldgRoof, water, crossPhoto, parking, bldgOver, stops] = await Promise.all([opt('road_area.json'), opt('road_width.json'), opt('bldg_roof.json'), opt('water.json'), opt('cross_photo.json'), opt('parking.json'), opt('bldg_over.json'), opt('stops.json')]);
  const [roads, terr, bjs, bbin] = await Promise.all([
    fetch(base + 'roads.json').then(r => r.json()),
    fetch(base + 'terrain.bin').then(r => r.arrayBuffer()),
    fetch(base + 'bldg.json').then(r => r.json()),
    fetch(base + 'bldg.bin').then(r => r.arrayBuffer())
  ]);
  if (crossPhoto) roads.crossPhoto = crossPhoto;   // 航空写真で見つけた横断歩道（OSM に無いもの。tools/world/photo_cross.py）
  // 写真から読み取った路面表示（tools/world/road_marks.py）。?marks=rule のときは使わない（決まりで作る線と比べる用）
  const photoMarks = new URLSearchParams(location.search).get('marks') === 'rule' ? null : await loadPhotoMarks(base + 'road_marks.bin');
  const T = roads.terrain, U = new Uint16Array(terr), H = new Float32Array(U.length);
  for (let i = 0; i < U.length; i++) H[i] = (U[i] - 5000) / 100;
  const terrain = { x0: T.x0, z0: T.z0, nx: T.nx, nz: T.nz, cell: T.cell, H };
  terrain.at = (x, z) => {
    const fi = (x - T.x0) / T.cell, fj = (z - T.z0) / T.cell;
    const i = Math.max(0, Math.min(T.nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(T.nz - 2, Math.floor(fj)));
    const u = Math.max(0, Math.min(1, fi - i)), v = Math.max(0, Math.min(1, fj - j));
    const a = H[j * T.nx + i], b = H[j * T.nx + i + 1], c = H[(j + 1) * T.nx + i], d = H[(j + 1) * T.nx + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  // 建物: ヘッダー（JSON）＋ 位置（Int16、5cm）＋ 三角形（Uint32）＋ 建物番号（Uint16）
  const dv = new DataView(bbin), hl = dv.getUint32(0, true);
  const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(bbin, 4, hl)));
  let off = 4 + hl;
  const q = new Int16Array(bbin, off, hdr.nv * 3); off += hdr.nv * 6; off += (hdr.nv * 6) % 4;
  const idx = new Uint32Array(bbin.slice(off, off + hdr.ni * 4)); off += hdr.ni * 4;
  const bid = new Uint16Array(bbin.slice(off, off + hdr.nv * 2));
  const pos = new Float32Array(hdr.nv * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = q[i] * hdr.q;
  return { base, roads, roadArea, roadWidth, bldgRoof, water, parking, bldgOver, stops, photoMarks, terrain, bldg: { pos, idx, bid, info: bjs.b, credit: bjs.credit } };
}
