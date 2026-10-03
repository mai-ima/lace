/*
 * 車のモデル（assets/vendor/real-concept.js の Car Concept）から、一般車用の軽いモデル（LOD）を作る。
 *   node tools/world/car_lod.mjs <meshoptimizer の場所> [目標の三角形数=14000] [出力名=car_concept_lod1]
 * 出力: assets/data/world/props/car_concept_lod1.json（real-concept.js と同じ形式: 位置 Int16/1000、法線 Int8/127、三角形）
 * 部品ごとに目標の割合を決めて meshoptimizer（MIT、1.3 以降）の simplify で間引く。車内は外から見えにくいので強く間引く。
 */
import fs from 'fs';
import path from 'path';
const [mo, targetArg, nameArg] = process.argv.slice(2);
const { MeshoptSimplifier } = await import(path.resolve(mo, fs.existsSync(path.resolve(mo, 'meshopt_simplifier.module.js')) ? 'meshopt_simplifier.module.js' : 'meshopt_simplifier.js'));
await MeshoptSimplifier.ready;
globalThis.window = globalThis; globalThis.TB = {};
const src = fs.readFileSync(new URL('../../assets/vendor/real-concept.js', import.meta.url), 'utf8');
new Function(src)();
const D = TB.RaceRealCars.concept, TARGET = +(targetArg || 14000);
const share = { paint: 0.48, dark: 0.16, rim: 0.08, glass: 0.07, interior: process.env.KEEP_INTERIOR ? 0.1 : 0.02, chrome: 0.04, tire: 0.08, head: 0.03, tail: 0.03, amber: 0.01 };
const b64 = (buf) => Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('base64');
const dec = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const out = { groups: {} }; let total = 0;
for (const k of Object.keys(D.groups)) {
  if (k === 'interior' && !process.env.KEEP_INTERIOR) continue;   // 車内は、色の濃いガラス越しにはほぼ見えないので一般車では省く（自車用は KEEP_INTERIOR=1）
  const g = D.groups[k], P = dec(g.p, Int16Array), N = dec(g.n, Int8Array), I = dec(g.i, g.i32 ? Uint32Array : Uint16Array);
  const pos = new Float32Array(P.length); for (let i = 0; i < P.length; i++) pos[i] = P[i] / 1000;
  const tris = I.length / 3, want = Math.min(tris, Math.max(12, Math.round(TARGET * (share[k] || 0.02))));
  let idx = new Uint32Array(I);
  if (want < tris) {
    const [r] = MeshoptSimplifier.simplify(idx, pos, 3, want * 3, 0.02, ['LockBorder']);
    idx = r.length >= 3 ? r : idx;
    // 目標まで減らないときは、許す誤差を広げ、縁の固定もやめてもう一度
    // （小さな離れた部品は Prune で消す。それでも多いときは simplifySloppy）
    for (const err of [0.05, 0.1]) if (idx.length / 3 > want * 1.5) { const [r2] = MeshoptSimplifier.simplify(new Uint32Array(I), pos, 3, want * 3, err, MeshoptSimplifier.simplifySloppy ? ['Prune'] : []); if (r2.length >= 3) idx = r2; }
    if (idx.length / 3 > want * 1.5 && MeshoptSimplifier.simplifySloppy) { const [r3] = MeshoptSimplifier.simplifySloppy(new Uint32Array(I), pos, 3, null, want * 3, 1.0); if (r3.length >= 3) idx = r3; }
  }
  // 使う頂点だけ残す
  const map = new Map(), np = [], nn = [], ni = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) { const v = idx[i]; if (!map.has(v)) { map.set(v, np.length / 3); np.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nn.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); } ni[i] = map.get(v); }
  const big = np.length / 3 > 65535;
  out.groups[k] = { p: b64(new Int16Array(np)), n: b64(new Int8Array(nn)), i: b64(big ? ni : new Uint16Array(ni)), i32: big };
  total += ni.length / 3;
  console.log(k, tris, '→', ni.length / 3);
}
const dst = new URL('../../assets/data/world/props/' + (nameArg || 'car_concept_lod1') + '.json', import.meta.url);
fs.writeFileSync(dst, JSON.stringify(out));
console.log('合計', total, '三角形', fs.statSync(dst).size, 'バイト');
