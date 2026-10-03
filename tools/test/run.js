#!/usr/bin/env node
/*
 * 自動テスト（合否と終了コードを返す）。
 *   node tools/test/run.js            … すべて実行して golden と比べる
 *   node tools/test/run.js --update   … golden（基準値）を作り直す
 *   node tools/test/run.js golden invariants world   … 一部だけ
 * Playwright と Chromium は環境のもの（/opt/node-tools、/opt/pw-browsers）を使う。
 */
const path = require('path');
const fs = require('fs');
let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require('/opt/node-tools/node_modules/playwright').chromium; }

const ROOT = path.resolve(__dirname, '../..');
const GOLD = path.join(__dirname, 'golden');
const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const only = args.filter(a => !a.startsWith('--'));
const suites = require('./suites');

(async () => {
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let fails = 0, total = 0;
  for (const name of Object.keys(suites)) {
    if (only.length && !only.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    // 乱数と時計を固定して、結果を再現できるようにする（ゲームのスクリプトより先に入れる）
    await page.addInitScript(() => {
      let s = 0x2f6b1c3d;
      Math.random = function () { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const T0 = Date.UTC(2026, 9, 1, 3, 0, 0);   // 12:00 JST
      Date.now = function () { return T0; };
      window.__seed = function (v) { s = v | 0; };
    });
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.waitForFunction(() => window.TB && window.TB.Race && window.TB.Race._test, null, { timeout: 20000 });
    const t0 = Date.now();
    let res;
    try { res = await suites[name](page); } catch (e) { res = { ok: false, msg: 'exception: ' + e.message }; }
    if (errs.length) res = { ok: false, msg: (res.msg ? res.msg + ' / ' : '') + 'page errors: ' + errs.slice(0, 3).join(' | '), data: res.data };
    // golden との比較
    if (res.ok && res.data !== undefined) {
      const f = path.join(GOLD, name + '.json');
      if (UPDATE || !fs.existsSync(f)) { fs.writeFileSync(f, JSON.stringify(res.data, null, 1)); res.msg = (res.msg || '') + ' (golden を保存)'; }
      else {
        const want = JSON.parse(fs.readFileSync(f, 'utf8'));
        const diff = compare(want, res.data, '');
        if (diff.length) { res.ok = false; res.msg = 'golden と不一致 ' + diff.length + ' 件: ' + diff.slice(0, 5).join('; '); }
      }
    }
    total++; if (!res.ok) fails++;
    console.log((res.ok ? 'PASS ' : 'FAIL ') + name.padEnd(12) + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + 's ' + (res.msg || ''));
    await page.close();
  }
  await browser.close();
  console.log((fails ? 'FAILED ' : 'OK ') + (total - fails) + '/' + total);
  process.exit(fails ? 1 : 0);
})();

function compare(a, b, p) {
  const out = [];
  if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) out.push(p + ': ' + a + ' → ' + b); return out; }
  if (Array.isArray(a)) { if (!Array.isArray(b) || a.length !== b.length) { out.push(p + ': 長さ ' + (a && a.length) + ' → ' + (b && b.length)); return out; } a.forEach((x, i) => out.push(...compare(x, b[i], p + '[' + i + ']'))); return out; }
  if (a && typeof a === 'object') { const ks = new Set([...Object.keys(a), ...Object.keys(b || {})]); ks.forEach(k => out.push(...compare(a[k], (b || {})[k], p + '.' + k))); return out; }
  if (a !== b) out.push(p + ': ' + JSON.stringify(a) + ' → ' + JSON.stringify(b));
  return out;
}
