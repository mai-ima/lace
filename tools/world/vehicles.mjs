/*
 * vehicles.mjs — 外部の車のモデル（glb）を、ゲーム用にそろえて書き出す。
 *   node tools/world/vehicles.mjs <glTF-Transform と meshoptimizer のある node_modules> <元の glb のフォルダ>
 * 出力: assets/data/world/cars/<名前>_lod0.glb（近く・自車用）, _lod1.glb（一般車の近く）, _lod2.glb（遠く）, cars.json（寸法・出典）
 *
 * 処理: 不要な部品（地面の板・ナンバープレートなど）を消す → 実寸の全長に合わせて縮尺 → 前が +z、地面が y=0 → 塗装の材質を
 * 「PAINT」に名前をそろえ白にする（ゲームで色を付ける）→ 面を間引いて 3 段階に → meshopt で圧縮。
 * 元のモデルは Objaverse（Sketchfab の CC BY 4.0 作品）。作者・URL は cars.json と assets/data/world/CREDITS.txt に記録する。
 */
import path from 'path';
import fs from 'fs';
const [NM, SRC] = process.argv.slice(2);
const { NodeIO } = await import(path.join(NM, '@gltf-transform/core/dist/index.js'));
const ext = await import(path.join(NM, '@gltf-transform/extensions/dist/index.js'));
const fn = await import(path.join(NM, '@gltf-transform/functions/dist/index.js'));
const mo = await import(path.join(NM, 'meshoptimizer/index.js'));
const { MeshoptSimplifier, MeshoptEncoder } = mo;
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;

/* 車ごとの設定: 全長（m、カタログ値）、向きの補正（度）、塗装の材質（正規表現）、消す材質、元の色（塗装の基本色。一般車ではゲームで色を変える） */
const CARS = [
  { key: 'compact_swift', name: '小型ハッチバック（スイフト型）', len: 3.845, paint: /Pearl_Ablaze_Red/, drop: /License_Plate/, kind: 'compact' },
  { key: 'sedan_sylphy', name: 'セダン（シルフィ型）', len: 4.615, paint: /^wire_008008136_3$/, kind: 'sedan' },
  { key: 'sedan_accord', name: 'セダン（アコード型）', len: 4.9, paint: null, kind: 'sedan', yaw: 180 },
  { key: 'sedan_mazda3', name: 'セダン（マツダ 3 型）', len: 4.58, paint: /^material$/, kind: 'sedan', yaw: 180 },
  { key: 'suv_cx5', name: 'SUV（CX-5 型）', len: 4.545, paint: /^Main$/, kind: 'suv' },
  { key: 'super_svj', name: 'スーパーカー（V12 ミッドシップ）', len: 4.943, paint: /^CARROSSERIE$/, kind: 'super', hero: 250000, yaw: 180 },
  { key: 'kei_van', name: '軽バン（キャリイ型）', len: 3.3, paint: /^S_Boya$/, drop: /^Zemin$/, kind: 'kei', yaw: 180 }
];
const OUT = new URL('../../assets/data/world/cars/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': mo.MeshoptDecoder });
const meta = JSON.parse(fs.readFileSync(path.join(SRC, 'meta.json'), 'utf8'));
const out = [];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

for (const C of CARS) {
  if (only && !only.includes(C.key)) continue;
  const M = meta.find(m => m.key === C.key);
  const LODS = [['lod0', 1], ['lod1', null], ['lod2', null]].concat(C.hero ? [['hero', null]] : []);   // hero: 高画質の自車用（面を多めに残す）
  const sizes = {};
  for (const [lod] of LODS) {
    const doc = await io.read(path.join(SRC, C.key + '.glb'));
    const root = doc.getRoot();
    // 不要な部品を消す
    if (C.drop) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const mat = p.getMaterial(); if (mat && C.drop.test(mat.getName())) p.dispose(); }
    // 塗装の材質
    for (const mat of root.listMaterials()) {
      if (C.paint && C.paint.test(mat.getName())) { mat.setName('PAINT'); mat.setBaseColorFactor([1, 1, 1, 1]); mat.setMetallicFactor(Math.min(0.6, mat.getMetallicFactor())); mat.setRoughnessFactor(Math.max(0.25, mat.getRoughnessFactor())); }
    }
    await doc.transform(fn.dedup(), fn.flatten());
    // 浮いた部品（モデルに付いてくる看板・板など）を除く: 全頂点の 2〜98% の範囲から大きく外れた部品を消す
    {
      const all = [[], [], []], parts = [];
      for (const node of root.listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; const W = node.getWorldMatrix();
        for (const p of mesh.listPrimitives()) { const a = p.getAttribute('POSITION'), v = [0, 0, 0], c = [0, 0, 0], n = a.getCount();
          for (let i = 0; i < n; i++) { a.getElement(i, v); const w = [W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12], W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13], W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14]]; for (let k = 0; k < 3; k++) { c[k] += w[k] / n; if (i % 7 === 0) all[k].push(w[k]); } }
          parts.push({ p, c }); } }
      const q = (arr, f) => { const s2 = arr.slice().sort((x, y) => x - y); return s2[Math.floor(f * (s2.length - 1))]; };
      const lo = all.map(a => q(a, 0.02)), hi = all.map(a => q(a, 0.98)), span = Math.max(hi[0] - lo[0], hi[2] - lo[2]);
      let dropped = 0;
      parts.forEach(({ p, c }) => { for (let k = 0; k < 3; k++) if (c[k] < lo[k] - span * 0.08 || c[k] > hi[k] + span * 0.08) { p.dispose(); dropped++; return; } });
      if (dropped) console.log('  浮いた部品を削除', dropped);
    }
    await doc.transform(fn.join({ keepNamed: false }), fn.weld(), fn.prune());
    // 頂点を直接動かして、縮尺・向き・位置をそろえる（節の変形はすべて頂点に焼き込む）
    const scene = root.listScenes()[0];
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const prims = [];
    scene.traverse(node => {
      const mesh = node.getMesh(); if (!mesh) return;
      const W = node.getWorldMatrix();
      for (const p of mesh.listPrimitives()) prims.push({ p, W });
    });
    // 同じ primitive を複数の節が参照していることは flatten 後は無い前提。位置を世界座標へ
    const done = new Set();
    for (const { p, W } of prims) {
      const a = p.getAttribute('POSITION'); if (done.has(a)) continue; done.add(a);
      const v = [0, 0, 0];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v);
        const x = W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12], y = W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13], z = W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14];
        a.setElement(i, [x, y, z]);
        mn = [Math.min(mn[0], x), Math.min(mn[1], y), Math.min(mn[2], z)]; mx = [Math.max(mx[0], x), Math.max(mx[1], y), Math.max(mx[2], z)];
      }
      const n = p.getAttribute('NORMAL');
      if (n && !done.has(n)) { done.add(n); for (let i = 0; i < n.getCount(); i++) { n.getElement(i, v); const x = W[0] * v[0] + W[4] * v[1] + W[8] * v[2], y = W[1] * v[0] + W[5] * v[1] + W[9] * v[2], z = W[2] * v[0] + W[6] * v[1] + W[10] * v[2], l = Math.hypot(x, y, z) || 1; n.setElement(i, [x / l, y / l, z / l]); } }
    }
    scene.traverse(node => { node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); });
    // 車の長さの向き: 頂点の xz の分布の主軸（PCA）。元のモデルが斜めに置かれていても z にそろう。前後の向きは C.yaw（0 か 180）で補正
    let sxx = 0, szz = 0, sxz = 0, mxv = 0, mzv = 0, nv = 0;
    { const done3 = new Set(); for (const { p } of prims) { const a = p.getAttribute('POSITION'); if (done3.has(a)) continue; done3.add(a); const v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i += 3) { a.getElement(i, v); mxv += v[0]; mzv += v[2]; nv++; } } }
    mxv /= nv; mzv /= nv;
    { const done3 = new Set(); for (const { p } of prims) { const a = p.getAttribute('POSITION'); if (done3.has(a)) continue; done3.add(a); const v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i += 3) { a.getElement(i, v); const dx = v[0] - mxv, dz = v[2] - mzv; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; } } }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);   // 主軸の x 軸からの角度
    let yaw = 90 - th * 180 / Math.PI + (C.yaw || 0);   // 主軸を z に回す
    let ca = Math.cos(yaw * Math.PI / 180), sa = Math.sin(yaw * Math.PI / 180);
    // 回したあとの範囲で縮尺と中心を決める
    let r0 = [Infinity, -Infinity, Infinity, -Infinity];
    { const done3 = new Set(); for (const { p } of prims) { const a = p.getAttribute('POSITION'); if (done3.has(a)) continue; done3.add(a); const v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const x = v[0] * ca + v[2] * sa, z = -v[0] * sa + v[2] * ca; r0 = [Math.min(r0[0], x), Math.max(r0[1], x), Math.min(r0[2], z), Math.max(r0[3], z)]; } } }
    if (r0[1] - r0[0] > r0[3] - r0[2]) { yaw += 90; ca = Math.cos(yaw * Math.PI / 180); sa = Math.sin(yaw * Math.PI / 180); r0 = [r0[2], r0[3], -r0[1], -r0[0]]; }
    const k = C.len / (r0[3] - r0[2]), rcx = (r0[0] + r0[1]) / 2, rcz = (r0[2] + r0[3]) / 2;
    const cx = rcx * ca - rcz * sa, cz = rcx * sa + rcz * ca;   // 回す前の座標での中心
    const done2 = new Set(); let ymin = Infinity, b2 = [Infinity, -Infinity, Infinity, -Infinity, -Infinity];
    for (const { p } of prims) {
      const a = p.getAttribute('POSITION'); if (done2.has(a)) continue; done2.add(a);
      const v = [0, 0, 0];
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const x = (v[0] - cx) * k, z = (v[2] - cz) * k, y = (v[1] - mn[1]) * k; a.setElement(i, [x * ca + z * sa, y, -x * sa + z * ca]); }
      const n = p.getAttribute('NORMAL');
      if (n && !done2.has(n)) { done2.add(n); for (let i = 0; i < n.getCount(); i++) { n.getElement(i, v); n.setElement(i, [v[0] * ca + v[2] * sa, v[1], -v[0] * sa + v[2] * ca]); } }
    }
    for (const { p } of prims) { const a = p.getAttribute('POSITION'), v = [0, 0, 0]; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); b2 = [Math.min(b2[0], v[0]), Math.max(b2[1], v[0]), Math.min(b2[2], v[2]), Math.max(b2[3], v[2]), Math.max(b2[4], v[1])]; } }
    sizes.w = +(b2[1] - b2[0]).toFixed(2); sizes.l = +(b2[3] - b2[2]).toFixed(2); sizes.h = +b2[4].toFixed(2);
    // エンブレム・車名の文字を消す（STRIP_BADGE=1 のときだけ。既定は元のまま残す）: 前後の端から 0.5m 以内・高さ 0.3〜1.4m にある、つながった小さな部品
    //  （最大の寸法 0.32m 未満）を消す。灯火・ガラス・塗装の部品は対象外。センサーなどの小部品も一緒に消えるが見た目への影響は小さい
    if (process.env.STRIP_BADGE === '1') {
      let nb = 0;
      for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
        const mat = p.getMaterial(), mn = mat ? mat.getName() : '';
        if (/^PAINT$|glass|light|lamp|bulb|signal|stop/i.test(mn)) continue;
        const I = p.getIndices(); if (!I) continue;
        const idx = I.getArray(), a = p.getAttribute('POSITION'), nvx = a.getCount();
        const par = new Int32Array(nvx); for (let i = 0; i < nvx; i++) par[i] = i;
        const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
        for (let t = 0; t < idx.length; t += 3) { const r0 = find(idx[t]), r1 = find(idx[t + 1]), r2 = find(idx[t + 2]); par[r1] = r0; par[find(r2)] = r0; }
        const box = new Map(), v = [0, 0, 0];
        for (let i = 0; i < nvx; i++) { const r = find(i); a.getElement(i, v); let B = box.get(r); if (!B) box.set(r, B = [v[0], v[0], v[1], v[1], v[2], v[2]]);
          B[0] = Math.min(B[0], v[0]); B[1] = Math.max(B[1], v[0]); B[2] = Math.min(B[2], v[1]); B[3] = Math.max(B[3], v[1]); B[4] = Math.min(B[4], v[2]); B[5] = Math.max(B[5], v[2]); }
        const bad = new Set();
        for (const [r, B] of box) {
          const dim = Math.max(B[1] - B[0], B[3] - B[2], B[5] - B[4]), cy = (B[2] + B[3]) / 2, cz = (B[4] + B[5]) / 2;
          if (dim < 0.32 && cy > 0.3 && cy < 1.4 && (cz > b2[3] - 0.5 || cz < b2[2] + 0.5)) bad.add(r);
        }
        if (!bad.size) continue;
        const keep = [];
        for (let t = 0; t < idx.length; t += 3) if (!bad.has(find(idx[t]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
        nb += (idx.length - keep.length) / 3;
        if (keep.length) I.setArray(idx instanceof Uint32Array ? Uint32Array.from(keep) : Uint16Array.from(keep)); else p.dispose();
      }
      await doc.transform(fn.prune());
      if (lod === 'lod0') console.log('  エンブレム等の小部品を削除', nb, '面');
    }
    // 面を間引く（LOD）。目標: lod0 は元のまま（12 万面を超えるときは 12 万）、lod1 は約 1.4 万、lod2 は約 3 千
    let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
    // 一般車（lod1・lod2）は車内を省く（色の濃いガラス越しにはほぼ見えない）
    if (lod !== 'lod0' && lod !== 'hero') { for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const mat = p.getMaterial(); if (mat && /interior|seat|dash|steer/i.test(mat.getName())) p.dispose(); } await doc.transform(fn.prune()); tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
    const target = lod === 'hero' ? Math.min(tris, C.hero) : lod === 'lod0' ? Math.min(tris, 120000) : lod === 'lod1' ? 30000 : 6000;
    if (target < tris) await doc.transform(fn.simplify({ simplifier: MeshoptSimplifier, ratio: target / tris, error: lod === 'lod2' ? 0.02 : 0.004, lockBorder: false }), fn.prune());
    // 細かい部品が多くて減らないときは、部品の形を保たない間引き（sloppy）を材質ごとに使う
    {
      let t1 = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t1 += p.getIndices().getCount() / 3;
      if (t1 > target * 1.3) {
        const r = target / t1;
        for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
          const I = p.getIndices(), n = I.getCount(); if (n / 3 < 200) continue;
          if (p.getMaterial() && /^PAINT$|glass|Glass|GLASS/.test(p.getMaterial().getName()) && lod === 'lod1') continue;   // 車体とガラスは形を保つ（穴が開かないように）
          const pos = p.getAttribute('POSITION').getArray(), P32 = pos instanceof Float32Array ? pos : Float32Array.from(pos);
          const [ni] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(I.getArray()), P32, 3, null, Math.max(36, Math.floor(n * r / 3) * 3), 1.0);
          if (ni.length >= 3) I.setArray(ni.length > 65535 * 3 || p.getAttribute('POSITION').getCount() > 65535 ? ni : Uint16Array.from(ni)); else p.dispose();
        }
        await doc.transform(fn.prune());
      }
    }
    let t2 = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t2 += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
    // 遠くの車はテクスチャを使わない（色だけ）。近くは元のまま
    if (lod === 'lod2') for (const mat of root.listMaterials()) { mat.setBaseColorTexture(null); mat.setNormalTexture(null); mat.setMetallicRoughnessTexture(null); mat.setOcclusionTexture(null); }
    await doc.transform(fn.prune(), fn.reorder({ encoder: MeshoptEncoder }), fn.quantize());
    doc.createExtension(ext.EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: ext.EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    const file = path.join(OUT, C.key + '_' + lod + '.glb');
    await io.write(file, doc);
    sizes[lod] = { tris: Math.round(t2), kb: Math.round(fs.statSync(file).size / 1024) };
  }
  out.push({ key: C.key, name: C.name, kind: C.kind, size: { w: sizes.w, l: sizes.l, h: sizes.h }, lods: Object.assign({ lod0: sizes.lod0, lod1: sizes.lod1, lod2: sizes.lod2 }, sizes.hero ? { hero: sizes.hero } : {}), paint: !!C.paint,
    source: { title: M.name, author: M.user, license: M.lic === 'by' ? 'CC BY 4.0' : M.lic, url: M.url, via: 'Objaverse (allenai/objaverse)', modified: '縮尺・向き・塗装の材質・部品の削除・面の間引き・圧縮' } });
  console.log(C.key, JSON.stringify(out[out.length - 1].size), JSON.stringify(out[out.length - 1].lods));
}
const prev = fs.existsSync(path.join(OUT, 'cars.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'cars.json'), 'utf8')) : [];
const merged = prev.filter(p => !out.some(o => o.key === p.key)).concat(out);
fs.writeFileSync(path.join(OUT, 'cars.json'), JSON.stringify(merged, null, 1));
