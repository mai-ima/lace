#!/usr/bin/env node
/*
 * インポスター（8 方向の板ポリゴン用の画像）を作る。
 *   node tools/world/impostor.js <モデル.gltf> <出力名> [方向の数=8] [画素=512]
 * 出力: assets/data/world/props/<出力名>_albedo.webp（色と不透明度）、_normal.webp（法線）、<出力名>.json（寸法）
 * モデルは http で配信して読む（tools/world/impostor.html）。WebP への変換は Python（Pillow）。
 */
const path = require('path'), fs = require('fs'), http = require('http'), { execFileSync } = require('child_process');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/opt/node-tools/node_modules/playwright').chromium; }
const ROOT = path.resolve(__dirname, '../..');
const [src, name, n = '8', px = '512'] = process.argv.slice(2);
const srcDir = path.dirname(path.resolve(src));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u.startsWith('/model/') ? path.join(srcDir, u.slice(7)) : path.join(ROOT, u);
  if (!fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=6000'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/tools/world/impostor.html?src=/model/${path.basename(src)}&n=${n}&px=${px}`);
  await p.waitForFunction(() => document.title === 'done', null, { timeout: 900000, polling: 2000 });
  const out = await p.evaluate(() => window.__out);
  await b.close(); srv.close();
  const dir = path.join(ROOT, 'assets/data/world/props'); fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync('/tmp/imp-');
  ['albedo', 'normal'].forEach(k => out[k].forEach((u, i) => fs.writeFileSync(path.join(tmp, `${k}_${i}.png`), Buffer.from(u.split(',')[1], 'base64'))));
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
tmp, dst, n, px = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
A = Image.new('RGBA', (n * px, px)); Nm = Image.new('RGBA', (n * px, px))
for i in range(n):
    a = Image.open(f'{tmp}/albedo_{i}.png').convert('RGBA'); m = Image.open(f'{tmp}/normal_{i}.png').convert('RGBA')
    m.putalpha(a.getchannel('A')); A.paste(a, (i * px, 0)); Nm.paste(m, (i * px, 0))
A.save(dst + '_albedo.webp', quality=88, method=6); Nm.save(dst + '_normal.webp', quality=92, method=6)
`, tmp, path.join(dir, name), String(out.n), String(out.px)]);
  const meta = { n: out.n, px: out.px, height: out.height, width: out.width, half: out.half, centerY: out.centerY };
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(meta));
  console.log(name, JSON.stringify(meta), fs.statSync(path.join(dir, name + '_albedo.webp')).size, fs.statSync(path.join(dir, name + '_normal.webp')).size);
});
