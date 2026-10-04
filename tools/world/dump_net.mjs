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
const net = build(D, () => 0, W);
const edges = net.edges.filter(e => !e.hidden && e.pts.length >= 2).map(e => ({ pts: e.pts.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), hw: e.pr.hw, rank: e.pr.rank, walk: e.pr.walk }));
const nodes = [...net.nodes.values()].filter(n => n.arms.length >= 3).map(n => ({ x: n.x, z: n.z, r: Math.max(...n.arms.map(a => a.e.pr.hw)) }));
process.stdout.write(JSON.stringify({ edges, nodes }));
