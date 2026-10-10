/*
 * props_glb.mjs — 外部の道路の付属物のモデル（glb）を、ゲーム用にそろえて書き出す。
 *   node tools/world/props_glb.mjs <glTF-Transform と meshoptimizer のある node_modules> <元の glb のフォルダ（meta.json つき）>
 * 出力: assets/data/world/props/<名前>_lod0.glb, _lod1.glb と props.json（寸法・出典）
 * 処理: 節の変形を頂点に焼き込む → 高さ（m）に合わせて縮尺 → 柱の根元（下 0.5m の頂点の中心）を原点、地面を y=0 → 材質ごとにまとめる
 *       → 面を間引く（細かい部品が多いものは sloppy）→ meshopt で圧縮。
 */
import path from 'path';
import fs from 'fs';
const [NM, SRC] = process.argv.slice(2);
const { NodeIO } = await import(path.join(NM, '@gltf-transform/core/dist/index.js'));
const ext = await import(path.join(NM, '@gltf-transform/extensions/dist/index.js'));
const fn = await import(path.join(NM, '@gltf-transform/functions/dist/index.js'));
const mo = await import(path.join(NM, 'meshoptimizer/index.js'));
const { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } = mo;
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const PROPS = [
  { key: 'streetlight_curve', src: 'light_city', name: '道路照明（カーブしたテーパーポール・LED 灯具）', h: 10, lods: [['lod0', 8000], ['lod1', 1500]] },
  { key: 'utility_pole_jp', src: 'pole_japan', name: '電柱（日本・腕金・碍子・変圧器つき）', h: 12, lods: [['lod0', 9000], ['lod1', 1800]] },
  { key: 'vending_jp', src: 'vending_jp', name: '飲み物の自動販売機（日本、正面が +z）', h: 1.83, lods: [['lod0', 3000], ['lod1', 700]] }
];
const OUT = new URL('../../assets/data/world/props/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const meta = JSON.parse(fs.readFileSync(path.join(SRC, 'meta.json'), 'utf8'));
const res = [];
for (const C of PROPS) {
  const M = meta.find(m => m.key === C.src);
  const info = { key: C.key, name: C.name, h: C.h, lods: {}, source: { title: M.name, author: M.user, license: M.lic === 'by' ? 'CC BY 4.0' : M.lic, url: M.url, via: 'Objaverse (allenai/objaverse)', modified: '縮尺・原点・面の間引き・圧縮' } };
  for (const [lod, target] of C.lods) {
    const doc = await io.read(path.join(SRC, C.src + '.glb')), root = doc.getRoot();
    await doc.transform(fn.dedup(), fn.flatten());
    // 頂点を世界座標へ
    const prims = []; for (const node of root.listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; const W = node.getWorldMatrix(); for (const p of mesh.listPrimitives()) prims.push({ p, W }); }
    const done = new Set(), v = [0, 0, 0];
    let ymin = Infinity, ymax = -Infinity;
    for (const { p, W } of prims) {
      const a = p.getAttribute('POSITION'); if (done.has(a)) continue; done.add(a);
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const x = W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12], y = W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13], z = W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14]; a.setElement(i, [x, y, z]); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
      const n = p.getAttribute('NORMAL'); if (n && !done.has(n)) { done.add(n); for (let i = 0; i < n.getCount(); i++) { n.getElement(i, v); const x = W[0] * v[0] + W[4] * v[1] + W[8] * v[2], y = W[1] * v[0] + W[5] * v[1] + W[9] * v[2], z = W[2] * v[0] + W[6] * v[1] + W[10] * v[2], l = Math.hypot(x, y, z) || 1; n.setElement(i, [x / l, y / l, z / l]); } }
    }
    for (const node of root.listNodes()) node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
    const k = C.h / (ymax - ymin);
    // 柱の根元: 下 0.5m（縮尺後）の頂点の中心
    let bx = 0, bz = 0, bn = 0; const done2 = new Set();
    for (const { p } of prims) { const a = p.getAttribute('POSITION'); if (done2.has(a)) continue; done2.add(a); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); if ((v[1] - ymin) * k < 0.5) { bx += v[0]; bz += v[2]; bn++; } } }
    bx /= bn || 1; bz /= bn || 1;
    const done3 = new Set();
    for (const { p } of prims) { const a = p.getAttribute('POSITION'); if (done3.has(a)) continue; done3.add(a); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); a.setElement(i, [(v[0] - bx) * k, (v[1] - ymin) * k, (v[2] - bz) * k]); } }
    await doc.transform(fn.join({ keepNamed: false }), fn.weld(), fn.prune());
    let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
    if (target < tris) {
      await doc.transform(fn.simplify({ simplifier: MeshoptSimplifier, ratio: target / tris, error: 0.01, lockBorder: false }), fn.prune());
      let t1 = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t1 += p.getIndices().getCount() / 3;
      if (t1 > target * 1.3) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
        const I = p.getIndices(), n = I.getCount(); if (n / 3 < 60) continue;
        const pos = p.getAttribute('POSITION').getArray(), P32 = pos instanceof Float32Array ? pos : Float32Array.from(pos);
        const [ni] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(I.getArray()), P32, 3, null, Math.max(36, Math.floor(n * target / t1 / 3) * 3), 1.0);
        if (ni.length >= 3) I.setArray(p.getAttribute('POSITION').getCount() > 65535 ? ni : Uint16Array.from(ni)); else p.dispose();
      }
      await doc.transform(fn.prune());
    }
    let t2 = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t2 += p.getIndices().getCount() / 3;
    await doc.transform(fn.reorder({ encoder: MeshoptEncoder }), fn.quantize());
    doc.createExtension(ext.EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: ext.EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    const file = path.join(OUT, C.key + '_' + lod + '.glb');
    await io.write(file, doc);
    info.lods[lod] = { tris: Math.round(t2), kb: Math.round(fs.statSync(file).size / 1024) };
  }
  res.push(info); console.log(C.key, JSON.stringify(info.lods));
}
fs.writeFileSync(path.join(OUT, 'props.json'), JSON.stringify(res, null, 1));
