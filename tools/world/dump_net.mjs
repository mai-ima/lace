/*
 * 道路網（assets/js/w3/roadnet.js）を Node で組み立てて、車道の中心線・半幅・交差点を書き出す（build_tran.py の 2 段目で使う）。
 *   node tools/world/dump_net.mjs assets/data/world/center > /tmp/world/net.json
 */
import fs from 'fs';
import path from 'path';
import { build } from '../../assets/js/w3/roadnet.js';
const dir = process.argv[2];
const D = JSON.parse(fs.readFileSync(path.join(dir, 'roads.json'), 'utf8'));
const W = fs.existsSync(path.join(dir, 'road_width.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'road_width.json'), 'utf8')) : null;
// 車道の範囲を作るときは、実測の車道の幅（4・5 番目の値）は使わない（車道の範囲 → 幅 → 範囲 … と広がり続けないように）
if (W) Object.keys(W).forEach(k => { W[k] = W[k].slice(0, 3); });
const net = build(D, () => 0, W);
// 路面表示の読み取り（road_marks.py）用に、道の番号・切り詰めた線・車線の数と幅・一方通行も書く
const edges = net.edges.filter(e => !e.hidden && e.pts.length >= 2).map(e => ({ id: e.id, way: e.way, pts: e.pts.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), line: e.line.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]),
  hw: e.pr.hw, rank: e.pr.rank, walk: e.pr.walk, fw: e.pr.fw, bw: e.pr.bw, lw: +e.pr.lw.toFixed(3), one: e.pr.one ? 1 : 0, internal: e.internal ? 1 : 0, off: e.offArea ? 1 : 0 }));
// 交差点: 中心と、腕ごとの向き（中心から外へ向かう単位ベクトル）と半幅。build_tran.py で隅切りのある交差点の形（腕の帯の凸包）にする
const nodes = [...net.nodes.values()].filter(n => n.arms.length >= 3).map(n => ({ x: n.x, z: n.z, sig: n.sig ? 1 : 0, r: Math.max(...n.arms.map(a => a.e.pr.hw)),
  arms: n.arms.filter(a => !a.e.hidden && a.e.pts.length >= 2).map(a => {
    const P = a.e.pts, atA = Math.hypot(P[0][0] - n.x, P[0][1] - n.z) <= Math.hypot(P[P.length - 1][0] - n.x, P[P.length - 1][1] - n.z);
    const q = atA ? P[Math.min(1, P.length - 1)] : P[Math.max(0, P.length - 2)], d = Math.hypot(q[0] - n.x, q[1] - n.z) || 1;
    return { dx: +((q[0] - n.x) / d).toFixed(4), dz: +((q[1] - n.z) / d).toFixed(4), hw: a.e.pr.hw, rank: a.e.pr.rank, one: a.e.pr.one ? 1 : 0, len: +P.reduce((s, p, i) => i ? s + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0, 0).toFixed(1), internal: a.e.internal ? 1 : 0 };
  }) }));
process.stdout.write(JSON.stringify({ edges, nodes }));
