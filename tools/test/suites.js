/*
 * テストの中身。各関数は Playwright の page を受け取り、{ ok, msg, data } を返す。
 * data を返したものは golden（tools/test/golden/<名前>.json）と比べる。
 */

/* 全モード × 代表コース × 車種を、自動運転・固定 dt で走らせて記録する */
async function golden(page) {
  const data = await page.evaluate(() => {
    const R = window.TB.Race, T = R._test, out = {};
    const tracks = ['coast', 'r_suzuka', 'city'];
    const cars = ['pod', 'ae86', 'gt'];
    const modes = ['race', 'time', 'touge', 'duel', 'elim', 'arcade', 'chase', 'traffic', 'coins', 'sp', 'gymkhana', 'brake', 'drag'];
    const rnd = v => Math.round(v * 1e4) / 1e4;
    function fieldFor(mode) {
      const f = R.makeField(mode === 'race' || mode === 'elim' || mode === 'arcade' ? 4 : 1, 0.95);
      if (mode === 'chase') f[0].target = true;
      return f;
    }
    function cfgFor(mode, track, car) {
      if (mode === 'gymkhana' || mode === 'brake' || mode === 'drag') return T.miniCfg(mode);
      const c = T.baseCfg({ track: track, mode: mode, field: fieldFor(mode), weather: 'clear' });
      if (mode === 'coins') c.track = track;
      return c;
    }
    let k = 0;
    modes.forEach(mode => {
      const tl = mode === 'gymkhana' || mode === 'brake' || mode === 'drag' ? [tracks[0]] : tracks;
      tl.forEach(track => cars.forEach(carId => {
        window.__seed(1234 + (k++) * 7919);
        const cfg = cfgFor(mode, track, carId); cfg.recordEvents = true;
        const c0 = R.car(carId); cfg.car = { id: carId, body: c0.body, color: '#c33', stats: R.effStats(c0, {}) };
        const s = R.Session(cfg); s.W = 480; s.H = 270;
        R.auto = true;
        const rec = [];
        for (let i = 0; i < 60 * 40; i++) {
          s.update(1 / 60);
          if (i % 30 === 29) { const f = s.info(); rec.push([rnd(f.total || 0), rnd(f.x), rnd(f.speed), rnd(f.damage), f.place, Math.round(f.score || 0), f.state, rnd(f.timer || 0)]); }
          if (s.state && s.state() === 'done') break;
        }
        R.auto = false;
        const res = s.result ? s.result() : null;
        out[mode + ':' + track + ':' + carId] = { rec: rec, events: s.events().length ? s.events().map(e => e[0] + ' ' + e[1]).join(',') : '', result: res ? { place: res.place, reason: res.reason, time: res.time !== null && res.time !== undefined ? rnd(res.time) : null, score: res.score } : null };
        s.stop();
      }));
    });
    return out;
  });
  return { ok: true, msg: Object.keys(data).length + ' 件', data: data };
}

/* 不変条件: NaN が出ない、速度が範囲内、共有のコース仕様を書き換えない、走行距離が次へ漏れない */
async function invariants(page) {
  const r = await page.evaluate(() => {
    const R = window.TB.Race, T = R._test, bad = [];
    const snap = id => JSON.stringify(R.TRACKS[id], (k, v) => typeof v === 'function' ? undefined : v);
    ['coast', 'r_suzuka', 'city'].forEach(id => {
      const before = snap(id);
      const c = T.baseCfg({ track: id, mode: 'race', field: R.makeField(3, 0.95) });
      const s = R.Session(c); s.W = 480; s.H = 270; R.auto = true;
      for (let i = 0; i < 60 * 30; i++) {
        s.update(1 / 60);
        const f = s.info();
        ['total', 'x', 'speed', 'damage'].forEach(k => { if (typeof f[k] !== 'number' || !isFinite(f[k])) bad.push(id + ' ' + k + '=' + f[k] + ' @' + i); });
        if (f.pos !== undefined && f.trackLen && Math.abs(((f.total % f.trackLen) + f.trackLen) % f.trackLen - f.pos) > 1 && Math.abs(Math.abs(((f.total % f.trackLen) + f.trackLen) % f.trackLen - f.pos) - f.trackLen) > 1) bad.push(id + ' pos≠total @' + i);
        if (bad.length > 5) break;
      }
      R.auto = false; s.stop();
      if (snap(id) !== before) bad.push(id + ': R.TRACKS の仕様が書き換えられた');
    });
    // world を走ったあとの走行距離（R._km）が、次のレースの結果に混ざらないこと
    R._km = 0;
    return bad;
  });
  return { ok: r.length === 0, msg: r.slice(0, 6).join('; ') };
}

/* オープンワールドの交差点: ウインカー左・右・なしで、出口が正しく選ばれ、作り直しが 1 回までか */
async function world(page) {
  const results = [];
  for (const policy of ['left', 'right', 'none']) {
    await page.evaluate(policy => {
      const R = window.TB.Race, M = R.Map; window.__visits = []; window.__cur = null; let pressed = false, vis = null;
      if (!R.__origSession) R.__origSession = R.Session;
      const orig = R.__origSession;
      R.Session = function (cfg) {
        const oe = cfg.onEdgeEnd, edge = cfg.track.mapEdge, isRet = cfg.start && cfg.start.lockedExit !== undefined;
        if (!isRet) { pressed = false; vis = { edge, retails: 0, dirs: (cfg.exitDirs || []).join(), nav: cfg.exitNav }; window.__visits.push(vis); }
        if (oe) cfg.onEdgeEnd = function (c) { const r = oe(c); if (c.retail) vis.retails++; else if (!c.back && !c.reverse) { const e = M.exits(edge)[c.choice]; vis.dir = e && e.dir; vis.h = e && e.h; vis.end = true; } return r; };
        const s = orig(cfg); window.__cur = s; return s;
      };
      clearInterval(window.__iv);
      window.__iv = setInterval(() => {
        const s = window.__cur; if (!s || !s.cfg.exitDirs || s.cfg.exitDirs.length < 2 || pressed) return;
        const v = s.view(); if (!v.spec.stopSeg) return;
        const zl = (v.spec.stopSeg * 200 - v.pz) / 200 * 1.296;
        if (zl < 100) { pressed = true; vis.pressZl = Math.round(zl); if (policy === 'left') s.key('q', true); if (policy === 'right') s.key('e', true); }
      }, 15);
      R.admin.on = true; R.openApp('world');
    }, policy);
    await page.waitForFunction(() => [...document.querySelectorAll('.rx-item')].some(e => e.innerText.includes('出発する')), null, { timeout: 30000 });
    await page.evaluate(() => { const it = [...document.querySelectorAll('.rx-item')].find(e => e.innerText.includes('出発する')); it.click(); });
    await page.waitForTimeout(3000);
    await page.evaluate(() => { window.TB.Race.auto = true; window.TB.Race.speedup = 4; });
    await page.waitForTimeout(45000);
    const vs = await page.evaluate(() => { window.TB.Race.auto = false; window.TB.Race.speedup = 1; return window.__visits.map(v => Object.assign({}, v)); });
    let n = 0, bad = [];
    vs.forEach((v, i) => {
      if (!v.end || v.dirs.split(',').length < 2) return;
      n++;
      const nx = vs[i + 1];
      if (v.retails > 1) bad.push(policy + ' edge ' + v.edge + ' 作り直し ' + v.retails + ' 回');
      if (nx && nx.edge !== v.h) bad.push(policy + ' edge ' + v.edge + ' 次の道が違う');
      const want = policy === 'left' ? 'left' : policy === 'right' ? 'right' : null;
      if (want && v.dirs.split(',').includes(want) && v.pressZl >= 32 && v.dir !== want) bad.push(policy + ' edge ' + v.edge + ' ' + want + ' のはずが ' + v.dir);
      if (policy === 'none' && v.nav >= 0 && v.dirs.split(',')[v.nav] !== v.dir) bad.push('none edge ' + v.edge + ' ナビと違う');
    });
    results.push({ policy, n, bad });
    await page.evaluate(() => { const R = window.TB.Race; if (R.__origSession) R.Session = R.__origSession; clearInterval(window.__iv); });
    await page.goto(page.url());
    await page.waitForFunction(() => window.TB && window.TB.Race && window.TB.Race._test, null, { timeout: 20000 });
  }
  const bad = [].concat(...results.map(r => r.bad));
  const tooFew = results.filter(r => r.n < 4).map(r => r.policy);
  return { ok: bad.length === 0 && tooFew.length === 0, msg: results.map(r => r.policy + ' ' + r.n + ' 交差点').join(', ') + (tooFew.length ? ' 交差点が少なすぎる: ' + tooFew.join(',') : '') + (bad.length ? ' / ' + bad.slice(0, 5).join('; ') : '') };
}

/* メニューを巡回して、例外が出ないこと */
async function menus(page) {
  const n = await page.evaluate(async () => {
    const R = window.TB.Race; R.openApp('title');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(500);
    let visited = 0;
    const items = () => [...document.querySelectorAll('.rx-item:not(.dis)')];
    const top = items().length;
    for (let i = 0; i < top; i++) {
      R.openApp('title'); await sleep(150);
      const it = items()[i]; if (!it || /管理者|Admin/.test(it.innerText)) continue;
      it.click(); await sleep(250); visited++;
      const sub = items();
      for (let j = 0; j < Math.min(sub.length, 6); j++) {
        const t = sub[j]; if (!t || /出発|スタート|開幕|Start|Go|戻る|Back|レース|Race/.test(t.innerText)) continue;
        t.click(); await sleep(150); visited++;
        R.openApp('title'); await sleep(100);
        items()[i] && items()[i].click(); await sleep(150);
      }
    }
    R.openApp('title');
    return visited;
  });
  return { ok: n > 20, msg: n + ' 画面' };
}

/* 3D 自由走行（world3d.html）: 例外なし、描画予算（中: 300 回・150 万三角形）、信号の矛盾なし、主要道に見えない壁なし */
async function w3(page) {
  const http = require('http'), fs = require('fs'), path = require('path'), ROOT = path.resolve(__dirname, '../..');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.bin': 'application/octet-stream', '.wasm': 'application/wasm' };
  const srv = http.createServer((q, r) => {
    if (q.url === '/favicon.ico') { r.writeHead(204); r.end(); return; }
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    await page.goto('http://127.0.0.1:' + srv.address().port + '/world3d.html?capture=1&tier=mid');
    await page.waitForFunction(() => document.title.includes('ready'), null, { timeout: 120000 });
    await page.evaluate(() => window.W3.freeze());
    await page.evaluate(() => window.W3.ready);
    const r = await page.evaluate(() => {
      const W = window.W3, R = window.TB.Race, msgs = [];
      // 描画予算（出発地点と、向きを変えた 3 方向）
      let maxCalls = 0, maxTris = 0;
      const s0 = { x: W.car.st.x, z: W.car.st.z, yaw: W.car.st.yaw };
      for (let k = 0; k < 4; k++) { W.pose(s0.x, s0.z, s0.yaw + k * Math.PI / 2); W.tick(0.05, {}); W.draw(); const i = W.renderer.info.render; maxCalls = Math.max(maxCalls, i.calls); maxTris = Math.max(maxTris, i.triangles); }
      if (maxCalls > 300) msgs.push('描画回数 ' + maxCalls + ' > 300');
      if (maxTris > 1.5e6) msgs.push('三角形 ' + maxTris + ' > 150 万');
      // 信号: 同じ交差点で、主道路と従道路が同時に青（黄）にならない
      let conflict = 0;
      const byJ = new Map(); W.world.signals.forEach(s => { if (!byJ.has(s.junction)) byJ.set(s.junction, s); });
      for (let t = 0; t < 40; t += 0.5) byJ.forEach(s => { const p = R.SPEC.phaseAt(t, s.art); if (p.phase !== 'red' && p.crossPhase !== 'red') conflict++; });
      if (conflict) msgs.push('信号の矛盾 ' + conflict);
      const car = W.car; W.pose(s0.x, s0.z, s0.yaw);
      // 当たり判定: 道路の中心線が建物の中にある点
      const g = W.collide.grid; let bad = 0; W.world.net.edges.forEach(e => e.line.forEach(q => { if (e.pr.rank <= 4 && g.at(q[0], q[1])) bad++; }));
      if (bad > 0) msgs.push('主要道の見えない壁 ' + bad + ' 点');
      return { msgs, maxCalls, maxTris, signals: W.world.signals.length, kmh: car.kmh() };
    });
    return { ok: r.msgs.length === 0, msg: r.msgs.join(' / ') || ('描画 ' + r.maxCalls + ' 回・' + Math.round(r.maxTris / 1e4) / 100 + ' 百万三角形・信号 ' + r.signals + ' 基') };
  } finally { srv.close(); }
}

module.exports = { golden, invariants, world, menus, w3 };
