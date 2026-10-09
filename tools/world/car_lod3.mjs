/*
 * car_lod3.mjs — 一般車の遠くの形（_lod2.glb）から、さらに軽い形（_lod3.glb、約 1,600 面）を作る。駐車場に止まっている車など、数が多く遠い車に使う。
 *   node tools/world/car_lod3.mjs kei_van compact_swift ...
 * meshoptimizer の形を保つ間引き（法線も考える、実寸の許容誤差 4cm → 8cm → 15cm → 25cm。小さい塊を消すと車体に穴が開くので消さない。部品の縁は動かさない（LockBorder）＝ 部品の継ぎ目に隙間ができない）。sloppy は使わない。
 * 実行には gltf-transform と meshoptimizer が要る（node_modules のある所に写して、CARS_DIR に車のフォルダを渡す）。
 */
import fs from 'fs';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import * as fn from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const DIR = process.env.CARS_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../assets/data/world/cars');
const TARGET = 1600, ERRS = [0.04, 0.08, 0.15, 0.25];
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const info = JSON.parse(fs.readFileSync(path.join(DIR, 'cars.json'), 'utf8'));
for (const key of process.argv.slice(2)) {
  const doc = await io.read(path.join(DIR, key + '_lod2.glb')), root = doc.getRoot();
  await doc.transform(fn.dequantize());
  const count = () => { let t = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; return t; };
  for (const err of ERRS) {
    const cur = count(); if (cur <= TARGET * 1.15) break;
    const ratio = TARGET / cur;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
      const I = p.getIndices(), Pa = p.getAttribute('POSITION'), Na = p.getAttribute('NORMAL'); if (!I || I.getCount() < 12) continue;
      const pos = Float32Array.from(Pa.getArray()), idx = Uint32Array.from(I.getArray());
      const want = Math.min(idx.length, Math.max(12, Math.floor(idx.length * ratio / 3) * 3));
      const [ni] = Na ? MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, Float32Array.from(Na.getArray()), 3, [0.5, 0.5, 0.5], null, want, err, ['ErrorAbsolute', 'LockBorder'])
                      : MeshoptSimplifier.simplify(idx, pos, 3, want, err, ['ErrorAbsolute', 'LockBorder']);
      if (ni.length >= 3) { I.setArray(Pa.getCount() > 65535 ? ni : Uint16Array.from(ni)); fn.compactPrimitive(p); } else p.dispose();
    }
    await doc.transform(fn.prune());
  }
  await doc.transform(fn.prune(), fn.reorder({ encoder: MeshoptEncoder }), fn.quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const file = path.join(DIR, key + '_lod3.glb');
  await io.write(file, doc);
  const tris = Math.round(count()), kb = Math.round(fs.statSync(file).size / 1024);
  const c = info.find(x => x.key === key); if (c) c.lods.lod3 = { tris, kb };
  console.log(key, tris, '面', kb, 'KB');
}
fs.writeFileSync(path.join(DIR, 'cars.json'), JSON.stringify(info, null, 1));
