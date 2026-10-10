/*
 * signal_glb.mjs — 外部の日本の信号機のモデル（Objaverse 収録の Sketchfab CC BY 4.0 作品）から、ゲームで使う部品を取り出して書き出す。
 *   node tools/world/signal_glb.mjs <glTF-Transform・meshoptimizer・sharp のある node_modules> <元の glb>
 * 元: "Japanese Traffic Light"（afx_cgmotion、CC BY 4.0、https://sketchfab.com/3d-models/3e35c76a6ee24d759e39edc2f90677e1）
 * 出力: assets/data/world/props/signal_head.glb … 車両用の灯器（横型 3 灯・フード付き）。背中合わせの 2 面のうち前の 1 面だけ。
 *         原点 = 真ん中のレンズの中心（レンズの面）、+z が正面、レンズの間隔 0.34m に縮尺（灯器の幅 約 1.1m）。
 *       signal_ped.glb … 歩行者用の灯器（上が赤の止まれ、下が青の歩く人）と柱への取り付け金具。原点 = 柱の中心の地面、+z が正面、実寸。
 *       signal.json … 出典・寸法・灯の位置
 * 処理: 節の変形を頂点に焼き込む → 必要な節だけ残す → 後ろの面を除く → 原点・縮尺 → 発光の画像を外す（点灯はゲームの側で重ねる）
 *       → 画像を 512px の WebP に → meshopt で圧縮。
 */
import path from 'path';
import fs from 'fs';
const [NM, SRC] = process.argv.slice(2);
const { NodeIO } = await import(path.join(NM, '@gltf-transform/core/dist/index.js'));
const ext = await import(path.join(NM, '@gltf-transform/extensions/dist/index.js'));
const fn = await import(path.join(NM, '@gltf-transform/functions/dist/index.js'));
const mo = await import(path.join(NM, 'meshoptimizer/index.js'));
const sharp = (await import(path.join(NM, 'sharp/dist/index.mjs'))).default;
const { MeshoptEncoder, MeshoptDecoder } = mo;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const OUT = new URL('../../assets/data/world/props/', import.meta.url).pathname;
const io = new NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// 元のモデルでの位置（調べた値）: 車両用の灯器のレンズの中心 x = 1.65, 2.085, 2.52、y = 5.535、レンズの面 z = 0.40
const LENS = { x: 2.085, y: 5.535, z: 0.40, gap: 0.435 };
const PARTS = [
  { key: 'signal_head', nodes: ['Object_4', 'Object_6', 'Object_8', 'Object_10', 'Object_12', 'Object_14', 'Object_16'], front: true,
    xf: p => [(p[0] - LENS.x) * (0.34 / LENS.gap), (p[1] - LENS.y) * (0.34 / LENS.gap), (p[2] - LENS.z) * (0.34 / LENS.gap)] },
  { key: 'signal_ped', nodes: ['Object_32', 'Object_34', 'Object_36', 'Object_38'], front: false, xf: p => p }
];
const info = { source: { title: 'Japanese Traffic Light', author: 'afx_cgmotion', license: 'CC BY 4.0', url: 'https://sketchfab.com/3d-models/3e35c76a6ee24d759e39edc2f90677e1', via: 'Objaverse (allenai/objaverse)', modified: '部品の取り出し・後ろの面の削除・縮尺・原点・発光の画像の削除・画像の縮小・圧縮' }, parts: {} };
for (const P of PARTS) {
  const doc = await io.read(SRC), root = doc.getRoot();
  const keep = new Set(P.nodes);
  // 頂点を世界座標へ（節ごとに）。要らない節は外す
  const v = [0, 0, 0];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    if (!keep.has(node.getName())) { node.setMesh(null); continue; }
    const W = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION').clone(); prim.setAttribute('POSITION', a);
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); a.setElement(i, P.xf([W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12], W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13], W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14]])); }
      const n = prim.getAttribute('NORMAL');
      if (n) { const n2 = n.clone(); prim.setAttribute('NORMAL', n2); for (let i = 0; i < n2.getCount(); i++) { n2.getElement(i, v); const x = W[0] * v[0] + W[4] * v[1] + W[8] * v[2], y = W[1] * v[0] + W[5] * v[1] + W[9] * v[2], z = W[2] * v[0] + W[6] * v[1] + W[10] * v[2], l = Math.hypot(x, y, z) || 1; n2.setElement(i, [x / l, y / l, z / l]); } }
      // 背中合わせの後ろの面（z < 0 の三角形）を除く
      if (P.front) {
        const I = prim.getIndices(), A = I.getArray(), out = [];
        for (let t = 0; t < A.length; t += 3) { let zc = 0; for (let k = 0; k < 3; k++) { a.getElement(A[t + k], v); zc += v[2]; } if (zc / 3 > (-0.02 - LENS.z) * (0.34 / LENS.gap)) out.push(A[t], A[t + 1], A[t + 2]); }
        I.setArray(a.getCount() > 65535 ? Uint32Array.from(out) : Uint16Array.from(out));
      }
    }
  }
  for (const node of root.listNodes()) node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  // 発光の画像を外す（レンズが常に光って見えないように。点灯はゲームの側の光る円で表す）
  for (const m of root.listMaterials()) { m.setEmissiveTexture(null); m.setEmissiveFactor([0, 0, 0]); }
  await doc.transform(fn.prune(), fn.dedup(), fn.join({ keepNamed: false }), fn.weld(), fn.prune(),
    fn.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }));
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { tris += p.getIndices().getCount() / 3; const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); } } }
  await doc.transform(fn.reorder({ encoder: MeshoptEncoder }), fn.quantize());
  doc.createExtension(ext.EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: ext.EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const file = path.join(OUT, P.key + '.glb');
  await io.write(file, doc);
  info.parts[P.key] = { tris, kb: Math.round(fs.statSync(file).size / 1024), min: lo.map(x => +x.toFixed(3)), max: hi.map(x => +x.toFixed(3)) };
  console.log(P.key, JSON.stringify(info.parts[P.key]));
}
// 灯の位置（ゲームの側で光る円を重ねる所）
info.head = { lamps: [[-0.34, 0, 0.012], [0, 0, 0.012], [0.34, 0, 0.012]], r: 0.135 };
fs.writeFileSync(path.join(OUT, 'signal.json'), JSON.stringify(info, null, 1));
