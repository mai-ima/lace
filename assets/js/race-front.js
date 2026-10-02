/*
 * race-front.js — TENRYU RACING の入口。メニュー・物語・オープンワールド・アルバイト・
 * グランプリ・ガレージと ゲーム本体。
 *
 *   GUI 版 … 1 つのウィンドウの中に「タイトル → メニュー → レース → 結果」がある
 *            （据え置き機のレースゲームのような画面遷移。キーボードでもマウスでも操作できる）
 */
(function () {
  'use strict';

  var TB = window.TB;
  var R = TB.Race;
  var U = R.util;
  var L = U.L, clamp = U.clamp, fmt = U.fmt, sfx = U.sfx, yen = U.yen, pick = U.pick;
  var def = TB.def;

  function t(v) { return TB.t(v); }
  function dailyLabel(s) {
    var d = s.daily || {};
    return d.last === R.today() ? L('本日達成済み　連続 ', 'Done today  streak ') + d.streak + L(' 日', 'd') : (d.streak && d.last === R.yesterday() ? L('連続 ', 'Streak ') + d.streak + L(' 日・今日のぶん', 'd · today\'s race') : L('毎日かわるコース', 'A new track every day'));
  }
  function trackName(id) { return typeof id === 'string' ? t(R.TRACKS[id].name) : t(id.name); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  /* =====================================================================
     共通の計算
     ===================================================================== */

  var lenCache = {};
  function trackLen(id) { if (!lenCache[id]) { var L0 = R.buildTrack(id, false, 'clear').length; if (R.needsMap(id) && !R.Map.ready) return L0; lenCache[id] = L0; } return lenCache[id]; }
  function estLap(id) { return trackLen(id) / (R.MAX * 0.8); }
  function lapTarget(track, factor) { return trackLen(track) / (R.MAX * factor) * 1000; }
  function isTouge(id) { return typeof id === 'string' && !!R.TRACKS[id].touge; }
  function loopTracks() { return R.ORDER.slice(); }

  function playerCar(s, forceId) {
    var car = R.car(forceId || s.car);
    return { id: car.id, body: car.body, color: R.carColor(s, car), stats: R.effStats(car, s.upg[car.id]),
             offroad: !!car.offroad, siren: car.body === 'police' };
  }

  /** 今の愛車に合わせたライバルの速さ */
  function carPace(s) { s = s || R.load(); return R.topOf(R.effStats(R.car(s.car), s.upg[s.car])) * 0.97; }

  function baseCfg(o) {
    var s = R.load();
    var spec = typeof o.track === 'string' ? R.TRACKS[o.track] : o.track;
    var weather = o.weather && o.weather !== 'auto' ? o.weather : (spec.weather || 'clear');
    var mode = o.mode || 'race';
    var cfg = {
      track: o.track, mirror: !!o.mirror, weather: weather, mode: mode,
      laps: o.laps || spec.laps || 2, field: o.field || [],
      traffic: o.traffic !== undefined ? o.traffic : (spec.traffic || 0),
      car: playerCar(s, o.carId), levelMul: R.LEVELS[o.level || s.level] || 1,
      bestLap: typeof o.track === 'string' ? (s.laps[R.lapKey(o.track, o.mirror)] || null) : null,
      casual: !!o.casual
    };
    if (mode === 'time') { cfg.ghost = R.loadGhost(o.track, o.mirror); cfg.field = []; cfg.traffic = 0; cfg.laps = o.laps || 3; }
    if (mode === 'arcade') { var e = estLap(o.track); cfg.timeLimit = Math.round(e * 0.6 + 6); cfg.cpBonus = Math.round(e / 3 * 1.1); cfg.traffic = o.traffic || 14; cfg.laps = o.laps || 3; }
    if (mode === 'chase') { cfg.timeLimit = 120; cfg.laps = Infinity; cfg.traffic = o.traffic !== undefined ? o.traffic : 10; }
    if (mode === 'traffic') { cfg.laps = Infinity; cfg.traffic = o.traffic || 18; }
    if (mode === 'sp') { cfg.laps = Infinity; cfg.traffic = o.traffic !== undefined ? o.traffic : 10; }
    if (mode === 'coins') { cfg.laps = Infinity; cfg.timeLimit = 60; cfg.traffic = 0; }
    if (mode === 'elim') cfg.laps = cfg.field.length;
    var A = R.admin && R.admin.on ? R.admin.v : null;   // 管理者モード（保存されない一時設定）
    if (A) {
      if (A.laps && isFinite(cfg.laps) && ['race', 'duel', 'time', 'arcade', 'touge'].indexOf(mode) >= 0 && !isTouge(o.track)) cfg.laps = A.laps;
      if (A.weather !== 'default') cfg.weather = A.weather;
    }
    return cfg;
  }

  /* ---------- ミニゲームのコース ---------- */
  var MINI_SPEC = {
    gymkhana: { id: 'mini-gym', name: { ja: 'ジムカーナ場', en: 'Gymkhana Course' }, pal: R.PAL.hwy, deco: ['tyrewall', 'soundwall', 'tyrewall'],
                weather: 'clear', p2p: true,
                build: function (b) { b.straight(15); b.curve(25, 3, 0); b.straight(20); b.curve(25, -4, 0); b.sCurves(3); b.curve(25, 5, 0); b.straight(30); b.curve(20, -5, 0); b.straight(70); } },
    brake: { id: 'mini-brake', name: { ja: 'テストコース', en: 'Test Track' }, pal: R.PAL.hwy, deco: ['soundwall', 'greensign'], weather: 'clear',
             stopZone: [300, 305], noFinish: true, build: function (b) { b.straight(150); } },
    drag: { id: 'mini-drag', name: { ja: 'ドラッグストリップ', en: 'Drag Strip' }, pal: R.PAL.hmdune, deco: ['grandstand', 'billboard', 'tyrewall'],
            weather: 'clear', finishAt: 314, build: function (b) { b.straight(150); } }
  };

  function miniCfg(kind) {
    var s = R.load(), car = playerCar(s);
    if (kind === 'coins') return baseCfg({ track: 'hamamatsu', mode: 'coins' });
    var spec = MINI_SPEC[kind];
    var cfg = { track: spec, weather: 'clear', mode: kind, laps: 1, field: [], traffic: 0, car: car, levelMul: 1 };
    if (kind === 'brake') cfg.stopAt = 302.5;
    if (kind === 'drag') {
      var top = R.topOf(car.stats);
      cfg.field = [{ name: pick(['DYNA', 'LYNX', 'JOLT', 'BOLT']), color: '#ff7043', body: pick(['muscle', 'fd', 'r32', 'evo']), ai: 'balanced', pace: top * 0.985, skill: 1 }];
    }
    return cfg;
  }

  /* ---------- 物語 ---------- */
  function storyField(ev) {
    if (ev.mode === 'duel' || ev.mode === 'chase' || ev.mode === 'touge' || ev.mode === 'sp') return [R.boss(ev.boss, ev.pace)];
    if (!ev.rivals) return [];
    var pool = ev.pool === 'gang' ? R.GANG : ev.pool === 'super' ? R.SUPERCARS : ev.pool === 'touge' ? R.TOUGE_DRIVERS : R.DRIVERS;
    var f = R.makeField(ev.rivals, ev.pace, pool);
    if (ev.boss) { f.pop(); f.unshift(R.boss(ev.boss, ev.pace * 1.02)); }
    return f;
  }
  function storyCfg(ev, st) {
    var c = baseCfg({ track: ev.track, mode: ev.mode, laps: ev.laps, field: storyField(ev), traffic: ev.traffic, carId: ev.car, weather: ev.weather });
    c.radio = ev.radio || null;
    if (st && st.filter) c.filter = st.filter;
    return c;
  }

  /* ---------- ストーリー（本編・ストーリー2・3、サブストーリー） ---------- */
  /* ---------- 「峠を使わない」設定（設定画面）。ONにすると峠の話が、サーキットの話に置き換わる ---------- */
  // WebGL の 3D 表示は開発を一時停止中。従来の疑似 3D だけを使う（コードは残してある）。true にすると設定と v キーで使える。
  R.ENABLE_3D = false;
  var NO_TOUGE_ALT = { akimine: 'circuit', usui: 'fujisp', iroha: 'isetec', hakone: 'coast', ashinoko: 'forest', tenryu: 'harbor',
                       r_haruna: 'r_tsukuba', r_usui: 'r_okayama', r_iroha: 'r_sugo', r_turnpike: 'r_motegi', r_tsubaki: 'r_autopolis', r_akagi: 'r_fuji', r_myogi: 'r_suzuka',
                       hm_tenryu: 'circuit', hm_mikata: 'fujisp', hm_oku: 'isetec', hm_bypass: 'coast', hm_tomei: 'highway', hm_city: 'hamamatsu' };
  var NO_TOUGE_WORDS = [[/峠とサーキット/g, 'サーキット'], [/峠道/g, 'コース'], [/峠の主/g, 'コースの主'], [/峠バトル/g, 'サーキットバトル'], [/ダウンヒル/g, 'レース'], [/山道/g, '道'], [/九十九折り/g, '連続カーブ'], [/ヒルクライム/g, 'タイムアタック'], [/峠/g, 'サーキット']];
  function altTrack(id) {
    if (typeof id !== 'string' || !R.TRACKS[id] || !R.TRACKS[id].touge) return id;
    var a = NO_TOUGE_ALT[id];
    return a && R.TRACKS[a] ? a : 'circuit';
  }
  function deTouge(v) {
    if (typeof v === 'string') { NO_TOUGE_WORDS.forEach(function (w) { v = v.replace(w[0], w[1]); }); return v; }
    if (Array.isArray(v)) return v.map(deTouge);
    if (v && typeof v === 'object') { var o = {}; for (var k in v) o[k] = deTouge(v[k]); return o; }
    return v;
  }
  function deToungeEvent(ev) {
    var e = {}, k;
    for (k in ev) e[k] = ev[k];
    var oldTrack = ev.track, nt = altTrack(ev.track);
    var was = nt !== oldTrack || ev.mode === 'touge';
    if (!was && !ev.talk) { ['title', 'scene', 'post', 'radio'].forEach(function (f) { if (ev[f]) e[f] = deTouge(ev[f]); }); return e; }
    if (!ev.talk) {
      e.track = nt;
      if (ev.mode === 'touge') { e.mode = 'duel'; e.laps = e.laps || 3; }
    }
    ['title', 'scene', 'post', 'radio'].forEach(function (f) { if (ev[f]) e[f] = deTouge(ev[f]); });
    // 場面の背景も置き換える
    if (e.scene) e.scene = e.scene.map(function (c) { return c && c.bg && R.TRACKS[c.bg] && R.TRACKS[c.bg].touge ? { bg: altTrack(c.bg) } : c; });
    if (ev.talk) e.track = nt;
    return e;
  }
  var derived = null, derivedFor = null, ntFlag = null;
  function stories() {
    var src = R.STORIES || [];
    if (ntFlag === null) ntFlag = !!R.load().noTouge;
    if (!ntFlag) return src;
    if (derived && derivedFor === src.length) return derived;
    derivedFor = src.length;
    derived = src.map(function (st) {
      var d = {}, k;
      for (k in st) d[k] = st[k];
      d.events = st.events.map(deToungeEvent);
      if (st.side) d.side = st.side.map(deToungeEvent);
      if (st.desc) d.desc = deTouge(st.desc);
      if (st.place) d.place = deTouge(st.place);
      return d;
    });
    return derived;
  }
  R.resetStoryView = function () { derived = null; };
  R.storyView = function () { return stories(); };
  function storyOf(sid) { return stories().filter(function (x) { return x.id === sid; })[0] || stories()[0]; }
  function progOf(s, sid) { return sid === 's1' ? (s.story || 0) : ((s.stories || {})[sid] || 0); }
  function setProg(s, sid, n) {
    if (sid === 's1') s.story = Math.max(s.story || 0, n);
    else { s.stories = s.stories || {}; s.stories[sid] = Math.max(s.stories[sid] || 0, n); }
  }
  /* ---------- ストーリーのフラグ（選択肢で決まり、分岐とエンディングに使う） ---------- */
  function flagsOf(s, sid) { s.flags = s.flags || {}; return (s.flags[sid] = s.flags[sid] || {}); }
  /** 'trust>=2 && !left' のような式を、フラグ f で評価する（式は台本に書いたものだけ） */
  function evalExpr(expr, f) {
    if (expr === undefined || expr === null || expr === '') return true;
    try {
      var scope = new Proxy(f || {}, { has: function () { return true; }, get: function (t, k) { return k === Symbol.unscopables ? undefined : (k in t ? t[k] : 0); } });
      return !!(new Function('f', 'with (f) { return (' + expr + '); }'))(scope);
    } catch (e) { return false; }
  }
  /** ルート分岐: only の式が偽の話は、そのルートでは出てこない */
  function evVisible(ev, s, sid) { return !ev.only || evalExpr(ev.only, flagsOf(s, sid)); }
  function normProg(s, st) {
    var pr = progOf(s, st.id);
    while (pr < st.events.length && !evVisible(st.events[pr], s, st.id)) pr++;
    return pr;
  }
  function fakeResult(ev) {
    var g = ev.goal || {}, r = { mode: ev.mode || 'race', reason: 'finish', place: 1, best: null, km: 0, near: 0, caught: false, score: 0, coins: 0, ghost: null, fake: true,
      list: [{ you: true, name: 'YOU', time: 0 }], sp: { me: 100, foe: 0 }, time: 0, total: 0, penalty: 0, maxCombo: 0, topKmh: 0, overtakes: 0 };
    if (g.type === 'lap') r.best = Math.round(lapTarget(ev.track, g.factor) * 0.9);
    if (g.type === 'catch') r.caught = true;
    if (g.type === 'score') r.score = (g.n || 0) + 1;
    return r;
  }

  function sideOpen(s, st, ev) { var i = st.events.map(function (e) { return e.id; }).indexOf(ev.after); return i < 0 || progOf(s, st.id) > i; }
  function sideDone(s, ev) { return !!(s.side || {})[ev.id]; }
  /** 話の id から、どのストーリーのどの話かを探す */
  function findEvent(id) {
    var hit = null;
    stories().forEach(function (st) {
      st.events.forEach(function (e, i) { if (e.id === id) hit = { st: st, ev: e, idx: i, side: false }; });
      (st.side || []).forEach(function (e, i) { if (e.id === id) hit = { st: st, ev: e, idx: i, side: true }; });
    });
    return hit;
  }

  function goalText(goal, track) {
    switch (goal.type) {
      case 'place': return L(goal.n + ' 位以内でゴール', 'Finish in the top ' + goal.n);
      case 'win': return L('1 位でゴール', 'Win');
      case 'lap': return L('どれか 1 周を ' + fmt(lapTarget(track, goal.factor)) + ' 以内で走る', 'Run a lap under ' + fmt(lapTarget(track, goal.factor)));
      case 'survive': return L('最後の 1 台まで生き残る', 'Survive every elimination');
      case 'arcade': return L('制限時間内に全周回を走りきる', 'Finish all laps before time runs out');
      case 'catch': return L('逃走車に体当たりして確保する', 'Ram the getaway car to a stop');
      case 'score': return L(goal.n + ' 点以上をとる', 'Score ' + goal.n + ' or more');
      case 'finish': return L('最後まで走りきる', 'Make it to the end');
      case 'talk': return L('話を最後まで読む', 'Read the story');
    }
    return '';
  }
  function checkGoal(goal, r, track) {
    var fin = r.reason === 'finish';
    switch (goal.type) {
      case 'place': return fin && r.place <= goal.n;
      case 'win': return fin && r.place === 1;
      case 'lap': return r.best !== null && r.best <= lapTarget(track, goal.factor);
      case 'survive': case 'arcade': return fin;
      case 'catch': return !!r.caught;
      case 'score': return r.score >= goal.n;
      case 'finish': return fin || r.place > 0;
      case 'talk': return true;
    }
    return false;
  }

  /* ---------- 結果を記録して、見せる文章を作る ---------- */
  var RACING = ['race', 'duel', 'elim', 'touge', 'sp'];
  function applyResult(ctx, r) {
    var s = R.load(), out = { title: '', sub: '', lines: [], success: null, money: 0, table: null };
    var mode = r.mode, trackId = typeof ctx.track === 'string' ? ctx.track : null;
    var racing = RACING.indexOf(mode) >= 0, fin = r.reason === 'finish', fake = !!r.fake;   // fake: 管理者モードのスキップ（記録は残さない）
    if (racing) out.table = fake ? null : r.list;
    if (fake) out.lines.push(L('（管理者モードでスキップしました）', '(skipped in admin mode)'));
    if (!fake) {
      s.stats.km = Math.round(((s.stats.km || 0) + (r.km || 0)) * 10) / 10;
      s.stats.near = (s.stats.near || 0) + (r.near || 0);
    }
    if (racing && !fake) {
      s.stats.races++;
      if (fin && r.place === 1) s.stats.wins++;
      if (fin && r.place <= 3) s.stats.podiums++;
    }
    if (!fake && trackId && r.best && ['race', 'duel', 'time', 'arcade', 'touge', 'elim'].indexOf(mode) >= 0) {
      var key = R.lapKey(trackId, ctx.mirror);
      if (!s.laps[key] || r.best < s.laps[key]) { s.laps[key] = Math.round(r.best); out.lines.push(L('★ 自己ベスト更新 ', '★ New personal best ') + fmt(r.best)); }
    }
    if (!fake && r.ghost && trackId) { R.saveGhost(trackId, ctx.mirror, r.ghost); out.lines.push(L('ゴーストを保存しました', 'Ghost saved')); }

    // 見出し
    switch (mode) {
      case 'race': case 'duel': out.title = !fin ? L('リタイア', 'Retired') : r.place === 1 ? L('優勝！', 'VICTORY!') : L(r.place + ' 位でゴール', 'Finished P' + r.place); break;
      case 'touge': out.title = r.place === 1 ? L('峠バトル 勝利！', 'TOUGE WIN!') : L('峠バトル 敗北…', 'TOUGE LOSS...'); break;
      case 'sp': out.title = r.place === 1 ? L('SP バトル 勝利！', 'SP BATTLE WON!') : L('SP バトル 敗北…', 'SP BATTLE LOST'); out.lines.push('SP ' + r.sp.me + ' vs ' + r.sp.foe); break;
      case 'elim': out.title = fin ? L('生き残った！', 'LAST ONE STANDING!') : L('脱落…', 'ELIMINATED'); break;
      case 'time': out.title = L('ベスト ', 'Best ') + fmt(r.best); break;
      case 'arcade': out.title = fin ? L('ゴール！', 'FINISH!') : L('タイムアップ', "TIME'S UP"); break;
      case 'chase': out.title = r.caught ? L('確保！', 'BUSTED!') : L('取り逃がした…', 'THEY GOT AWAY'); break;
      case 'traffic': out.title = L('スコア ', 'Score ') + r.score; break;
      case 'coins': out.title = L('コイン ', 'Coins ') + r.coins + L(' 枚', ''); break;
      case 'brake': out.title = r.reason === 'stopped' ? L('停止位置 ', 'Stopped ') + (r.stopDist > 0 ? '+' : '') + r.stopDist.toFixed(1) + 'm' : L('止まれず…', 'Overshot'); break;
      case 'drag': out.title = r.place === 1 ? L('勝ち！ ', 'WIN! ') + fmt(r.time * 1000) : L('負け… ', 'LOSS ') + fmt(r.time * 1000); break;
      case 'gymkhana': out.title = L('タイム ', 'Time ') + fmt(r.total * 1000); break;
    }
    out.sub = (trackId ? trackName(trackId) : typeof ctx.track === 'object' ? t(ctx.track.name) : '') + '  ·  ' + t((R.MODES[mode] || R.MINIS[mode] || R.CASUAL[mode] || { name: { ja: '', en: '' } }).name);
    if (r.best && ['race', 'duel', 'arcade'].indexOf(mode) >= 0) out.lines.push(L('ベストラップ ', 'Best lap ') + fmt(r.best));
    if (mode === 'traffic') out.lines.push(L('ニアミス ', 'Near misses ') + r.near + L('　最大連続 ×', '  best chain ×') + r.maxCombo);
    if (mode === 'gymkhana' && r.penalty) out.lines.push(L('走行 ', 'Run ') + fmt(r.time * 1000) + L('　ペナルティ +', '  penalty +') + r.penalty + 's');
    if (mode === 'brake') out.lines.push(L('最高速 ', 'Top speed ') + r.maxKmh + 'km/h　' + L('得点 ', 'score ') + r.score);
    if (r.topKmh && racing) out.lines.push(L('最高速 ', 'Top speed ') + r.topKmh + 'km/h' + (r.overtakes ? L('　追い抜き ', '  overtakes ') + r.overtakes : ''));

    // 賞金
    var money = 0, diff = trackId ? R.TRACKS[trackId].diff : 2, dm = 0.6 + diff * 0.15;
    var lm = { easy: 0.7, normal: 1, hard: 1.4 }[ctx.level || s.level] || 1;
    switch (ctx.kind) {
      case 'quick': if (racing && fin) money = R.PRIZE[r.place - 1] * dm * lm * 0.5; break;
      case 'party': if (fin) money = R.PRIZE[r.place - 1] * dm * lm * 0.4; money += (r.coins || 0) * 25;
        if (r.coins) out.lines.push(L('コイン ', 'Coins ') + r.coins + L(' 枚', '')); break;
      case 'gp': if (fin) money = R.PRIZE[r.place - 1] * dm; break;
      case 'daily':
        if (fin) money = R.PRIZE[r.place - 1] * dm * lm * 0.8;
        var bonus = fin ? R.dailyDone(s, r.place) : 0;
        if (bonus) { money += bonus; out.lines.push(L('デイリー達成！ ' + s.daily.streak + ' 日連続（ボーナス +', 'Daily complete! ' + s.daily.streak + '-day streak (bonus +') + yen(bonus) + ')'); }
        else if (fin && r.place <= 3) out.lines.push(L('今日のボーナスは受け取り済みです', 'Today\'s bonus is already claimed'));
        break;
      case 'touge': if (r.place === 1) { money = 1400 * dm * lm; s.stats.touge = (s.stats.touge || 0) + 1; } break;
      case 'challenge':
        if (mode === 'elim' && fin) money = 1200 * dm;
        if (mode === 'duel' && fin && r.place === 1) money = 1500 * dm;
        if (mode === 'sp' && r.place === 1) money = 1800 * dm;
        if (mode === 'arcade' && fin) money = 1000 * dm;
        if (mode === 'chase' && r.caught) money = 1500;
        if (mode === 'traffic') money = r.score / 8;
        break;
      case 'mini':
        var mk = mode, mv = mode === 'gymkhana' ? r.total * 1000 : mode === 'drag' ? r.time * 1000 : r.score;
        var lower = mode === 'gymkhana' || mode === 'drag';
        if (mode === 'coins') { money = r.coins * 20; mv = r.coins; }
        if (mode === 'drag' && r.place === 1) money = 600;
        if (mode === 'brake') money = r.score;
        if (mode === 'gymkhana') money = Math.max(0, 2400 - r.total * 20);
        if (mode === 'drag' && r.place !== 1) mv = null;
        if (mv !== null && mv !== undefined && (s.mini[mk] === undefined || (lower ? mv < s.mini[mk] : mv > s.mini[mk]))) {
          s.mini[mk] = Math.round(mv); out.lines.push(L('★ 自己ベスト', '★ Personal best'));
        }
        break;
      case 'story':
        var ev = ctx.ev, stO = storyOf(ctx.sid || 's1'), idx = stO.events.indexOf(ev);
        out.success = checkGoal(ev.goal, r, ev.track);
        out.lines.unshift(out.success ? L('目標達成：', 'Objective complete: ') + goalText(ev.goal, ev.track) : L('目標未達成：', 'Objective failed: ') + goalText(ev.goal, ev.track));
        if (out.success) {
          if (ctx.side) { s.side = s.side || {}; money = s.side[ev.id] ? ev.reward * 0.3 : ev.reward; s.side[ev.id] = true; }
          else { money = progOf(s, stO.id) > idx ? ev.reward * 0.3 : ev.reward; setProg(s, stO.id, idx + 1); }
          if (ev.boss) s.bosses[ev.boss] = true;
          if (ev.unlock && s.owned.indexOf(ev.unlock) < 0) { s.owned.push(ev.unlock); out.lines.push(L('新しい車「', 'New car: ') + t(R.car(ev.unlock).name) + L('」が手に入った！', '')); }
        }
        break;
    }
    money = Math.round(money);
    s.money += money; out.money = money;
    if (money) out.lines.push(L('賞金 +', 'Prize +') + yen(money) + L('（所持 ', ' (total ') + yen(s.money) + ')');
    R.checkAch(s).forEach(function (a) {
      out.lines.push(L('実績「', 'Achievement: ') + t(a.name) + L('」を解除', '') + (a.reward ? ' +' + yen(a.reward) : ''));
    });
    R.save(s);
    if (money) sfx('coin');
    return out;
  }

  /* =====================================================================
     グランプリ（カップ戦）
     ===================================================================== */

  function Cup(cupId) {
    var cup = R.CUPS.filter(function (c) { return c.id === cupId; })[0];
    var pool = cup.pool === 'touge' ? R.TOUGE_DRIVERS : cup.pool === 'super' ? R.SUPERCARS : R.DRIVERS;
    var field = R.makeField(Math.min(7, pool.length), cup.pace, pool);
    var st = { cup: cup, idx: 0, points: {}, field: field, done: false };
    st.cfg = function () {
      var id = cup.tracks[st.idx];
      return baseCfg({ track: id, laps: isTouge(id) ? 1 : cup.laps, field: field.map(function (d) { var o = {}; for (var k in d) o[k] = d[k]; return o; }) });
    };
    st.result = function (r) {
      var sum = applyResult({ kind: 'gp', track: cup.tracks[st.idx] }, r);
      (r.list || []).forEach(function (e, i) { var n = e.you ? 'YOU' : e.name; st.points[n] = (st.points[n] || 0) + (r.reason === 'finish' || !e.you ? (R.POINTS[i] || 0) : 0); });
      st.idx++;
      sum.lines.push(L('第 ' + st.idx + ' 戦 / 全 ' + cup.tracks.length + ' 戦', 'Round ' + st.idx + ' of ' + cup.tracks.length));
      return sum;
    };
    st.table = function () {
      return ['YOU'].concat(field.map(function (d) { return d.name; }))
        .map(function (n) { return { n: n, p: st.points[n] || 0 }; }).sort(function (a, b) { return b.p - a.p; });
    };
    st.over = function () { return st.idx >= cup.tracks.length; };
    st.finish = function () {
      var pos = st.table().findIndex(function (e) { return e.n === 'YOU'; }) + 1;
      var bonus = pos <= 3 ? cup.bonus[pos - 1] : 0;
      R.edit(function (s) {
        s.money += bonus;
        if (pos <= 3 && (!s.cups[cup.id] || pos < s.cups[cup.id])) s.cups[cup.id] = pos;
        if (pos === 1) s.stats.titles++;
      });
      return { pos: pos, bonus: bonus };
    };
    return st;
  }

  /* =====================================================================
     オープンワールド（アルバイトもここで）
     ===================================================================== */

  function hash(str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 2147483647; return h || 1; }
  function srand(seed) { var s = seed; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }

  /*
   * オープンワールド: 浜松市の実際の道路網（OpenStreetMap）を交差点から交差点へ走る。
   * 交差点ではウインカー（Q / E）で曲がる方向を選ぶ。車線の数は実際の道のまま。
   */
  function World(opts) {
    var M = R.Map;
    var w = { job: opts.job || null, earned: 0, trips: 0, visited: [], clock: 0, order: null, flash: null, damage: 0, dist: 0 };
    var carId = w.job === 'taxi' ? 'taxi' : null;
    var PL = R.worldPlaces();
    var startId = PL[opts.start] ? opts.start : 'hm_eki';
    var node = PL[startId].node;
    var h = -1, exits = [], hist = [], turn = 0, line = null, curSpec = null, dest = opts.dest || null;
    var placeAt = {};
    Object.keys(PL).forEach(function (k) { placeAt[PL[k].node] = k; });

    function dirArrow(d) { return { left: '←', right: '→', straight: '↑', uturn: '↶' }[d] || '↑'; }
    function dirWord(d) { return { left: L('左折', 'left'), right: L('右折', 'right'), straight: L('直進', 'straight'), uturn: L('Uターン', 'U-turn') }[d] || ''; }
    function exitLabel(ex) {
      var to = M.to(ex.h), pk = placeAt[to];
      var nm = pk ? t(R.NODES[pk].name) : M.roadName(ex.h);
      return nm;
    }
    function limitOf(e) { return e.ms || (e.c === 0 ? 100 : e.c === 5 ? 60 : e.c <= 2 ? 50 : 40); }
    function spec() {
      var e = M.edgeOf(h), toN = M.nodes[M.to(h)];
      exits = M.exits(h);
      var sig = toN.sig && exits.length > 1;
      var jn = exits.length > 1 || toN.out.length > 1 ? { signal: sig, w: 10 + (e.c <= 2 ? 8 : 0) } : null;
      var forks = exits.length > 1 ? exits.map(function (ex) { return dirArrow(ex.dir) + ' ' + exitLabel(ex); }) : null;
      // 先の景色: ナビの道順 → なければ直進に近い道
      var tail = -1, tn = targetNode();
      if (tn >= 0 && tn !== M.to(h)) { var rt0 = M.route(M.to(h), tn); if (rt0 && rt0.hs.length) tail = rt0.hs[0]; }
      if (tail < 0 && exits.length) tail = exits.reduce(function (a2, b2) { return Math.abs(b2.ang) < Math.abs(a2.ang) ? b2 : a2; }).h;
      var sp = M.edgeSpec(h, { turn: turn, junction: jn, fork: forks, tail: tail });
      sp.limit = limitOf(e);
      line = null;
      curSpec = sp;
      return sp;
    }
    function trafficFor(e) { return ({ 0: 9, 1: 8, 2: 7, 3: 5, 4: 3, 5: 2 })[e.c] || 2; }
    function cfgFor(start) {
      var sp = spec(), e = M.edgeOf(h), s = R.load();
      var dflt = 0, best = 9;
      exits.forEach(function (ex, i) { if (Math.abs(ex.ang) < best) { best = Math.abs(ex.ang); dflt = i; } });
      return {
        track: sp, mode: 'world', laps: Infinity, weather: opts.weather || 'clear', field: [],
        traffic: trafficFor(e), car: playerCar(s, carId), levelMul: 1,
        exits: exits.length, exitDirs: exits.map(function (x) { return x.dir; }), exitDefault: dflt,
        canBack: hist.length > 0, start: start,
        hud: hud, onTick: tick, drawMap: drawMap, navInfo: navInfo,
        onViolation: violation, onBusted: busted, onEscape: escaped
      };
    }

    /* --- 違反・警察 --- */
    w.fines = 0; w.violations = 0;
    function fine(n, why) {
      var paid = R.edit(function (s) { var p2 = Math.min(s.money, n); s.money -= p2; return p2; });
      w.fines += paid; w.earned -= paid;
      w.flash = { text: why + L('　反則金 -', '  fine -') + yen(paid), t: 4.5 };
    }
    function violation(kind, seen, over) {
      w.violations++;
      if (w.order) w.order.bad = (w.order.bad || 0) + 1;
      if (kind === 'orbis') { fine(9000 + Math.round((over || 0) * 300), L('オービス（' + Math.round(over) + 'km/h 超過）', 'Speed camera (' + Math.round(over) + ' over)')); return; }
      var why = { signal: L('信号無視', 'Red light'), speed: L('速度違反', 'Speeding'), accident: L('事故', 'Accident'), copHit: L('パトカーに衝突', 'Hit a police car') }[kind];
      if (!seen) w.flash = { text: why + L('（見られていない…）', ' (unseen...)'), t: 3 };
    }
    function busted() { fine(15000, L('確保された', 'Busted')); }
    function escaped() { w.flash = { text: L('警察を振り切った！', 'Lost the police!'), t: 4 }; }

    /* --- 仕事 --- */
    function newOrder(at) {
      var lim = { taxi: [1200, 9000], delivery: [900, 7000], food: [500, 3500] }[w.job];
      var keys = Object.keys(PL).filter(function (k) { return PL[k].node !== at; }), pick2 = null, rt = null;
      for (var tries = 0; tries < 30 && !pick2; tries++) {
        var k = pick(keys), r2 = M.route(at, PL[k].node);
        if (r2 && r2.len >= lim[0] && r2.len <= lim[1]) { pick2 = k; rt = r2; }
      }
      if (!pick2) { pick2 = pick(keys); rt = M.route(at, PL[pick2].node) || { len: 3000, time: 300 }; }
      var time = Math.round(rt.time * ({ taxi: 1.35, delivery: 1.45, food: 1.25 }[w.job]) + 20);
      var fare = Math.round((({ taxi: 500, delivery: 300, food: 450 })[w.job] + rt.len * ({ taxi: 0.42, delivery: 0.25, food: 0.3 }[w.job])) / 10) * 10;
      var who = w.job === 'taxi' ? t(pick(R.PASSENGERS)) : w.job === 'food' ? L('うなぎ弁当', 'eel lunch box') : null;
      var parcel = w.job === 'delivery' ? pick(R.PARCELS) : null;
      w.order = { dest: pick2, node: PL[pick2].node, time: time, left: time, fare: fare, who: who || t(parcel), fragile: parcel && parcel.fragile, dmg0: w.damage, km: rt.len / 1000 };
      w.flash = { text: w.job === 'taxi' ? L('お客さん（' + w.order.who + '）「' + t(R.NODES[pick2].name) + 'まで」', 'Fare (' + w.order.who + '): "' + t(R.NODES[pick2].name) + ', please"')
                                         : L(w.order.who + ' を ' + t(R.NODES[pick2].name) + ' へ', 'Deliver ' + w.order.who + ' to ' + t(R.NODES[pick2].name)), t: 5 };
    }
    function arrive(nd) {
      var k = placeAt[nd];
      if (k && w.visited.indexOf(k) < 0) w.visited.push(k);
      if (k) {
        var first = R.edit(function (s) { s.visited = s.visited || {}; if (s.visited[k]) return false; s.visited[k] = true; if (!w.job) s.money += 300; return true; });
        if (first && !w.job) { w.earned += 300; w.flash = { text: L('初めて訪れた！ ' + t(R.NODES[k].name) + '  +300 円', 'First visit! ' + t(R.NODES[k].name) + ' +300'), t: 4 }; sfx('coin'); }
        else if (!w.job) w.flash = { text: t(R.NODES[k].name), t: 3 };
      }
      if (dest && !w.job && PL[dest] && nd === PL[dest].node) { w.flash = { text: L('目的地に着きました：', 'Arrived: ') + t(R.NODES[dest].name), t: 5 }; sfx('win'); dest = null; }
      if (w.order && nd === w.order.node) {
        var o = w.order, late = o.left <= 0;
        var base = o.fare * (late ? 0.5 : 1), tip = late ? 0 : o.fare * 0.5 * (o.left / o.time);
        var pen = Math.max(0, w.damage - o.dmg0) * o.fare * (o.fragile ? 1.2 : 0.5) + (o.bad || 0) * o.fare * 0.25;
        var pay = Math.max(50, Math.round((base + tip - pen) / 10) * 10);
        w.earned += pay; w.trips++;
        R.edit(function (s) {
          s.money += pay; s.stats.jobs = (s.stats.jobs || 0) + 1; s.stats.earned = (s.stats.earned || 0) + pay;
          if (w.job === 'taxi' && s.owned.indexOf('taxi') < 0) s.owned.push('taxi');
        });
        w.flash = { text: (late ? L('遅刻… ', 'Late... ') : L('到着！ ', 'Arrived! ')) + '+' + yen(pay) + (tip > 0 ? L('（チップ込み）', ' (incl. tip)') : ''), t: 4 };
        sfx(late ? 'bad' : 'win');
        w.damage = 0;
        newOrder(nd);
        return true;
      }
      return false;
    }
    var lastT = 0;
    function tick(dt, info) {
      w.clock += dt; w.damage = info.damage;
      w.dist += Math.abs(info.speed) * dt / R.SEG * 1.296;
      if (w.order) w.order.left -= dt;
      if (w.flash) { w.flash.t -= dt; if (w.flash.t <= 0) w.flash = null; }
      lastT = info.frac || 0;
    }
    function targetNode() { return w.order ? w.order.node : dest && PL[dest] ? PL[dest].node : -1; }
    /** 次の交差点でどちらへ行けばよいか（ナビ） */
    function navInfo() {
      var tn = targetNode();
      if (tn < 0 || exits.length === 0) return null;
      var at = M.to(h);
      if (at === tn) return { arrow: '◎', text: L('この先の交差点が目的地', 'Destination at the next junction'), dir: 'goal' };
      var rt = M.route(at, tn);
      if (!rt || !rt.hs.length) return null;
      var nx = rt.hs[0], i = exits.findIndex(function (ex) { return ex.h === nx; });
      if (i < 0) return { arrow: 'redo', text: L('次の交差点で進める方向へ（遠回り）', 'Take any exit (reroute)'), dir: 'any' };
      var d = exits[i].dir;
      return { arrow: dirArrow(d), text: L('次の交差点を ' + dirWord(d), 'Next junction: ' + dirWord(d)) + (exits.length > 1 && d !== 'straight' ? L('（' + (d === 'left' ? 'Q' : 'E') + ' でウインカー）', ' (blinker ' + (d === 'left' ? 'Q' : 'E') + ')') : ''), dir: d, km: rt.len / 1000 };
    }
    function hud() {
      var lines = [], e = M.edgeOf(h), toN = M.to(h);
      var area = M.nearName(M.nodes[toN].x, M.nodes[toN].z, 700);
      if (w.job) {
        var o = w.order;
        lines.push({ t: L('行き先: ', 'To: ') + t(R.NODES[o.dest].name) + '（' + o.who + '）' + ' ' + o.km.toFixed(1) + 'km' });
        lines.push({ t: (o.left > 0 ? L('残り ', 'Time ') + Math.ceil(o.left) + L(' 秒', 's') : L('遅刻中', 'LATE')) + L('　報酬 ', '  pay ') + yen(o.fare), c: o.left < 15 ? '#ff8a80' : '#e8e8f0' });
      } else {
        lines.push({ t: M.roadName(h) + (area ? L('　・' + area + '付近', '  near ' + area) : '') });
        if (dest && PL[dest]) lines.push({ t: L('目的地: ', 'Destination: ') + t(R.NODES[dest].name), c: '#9fe8c8' });
      }
      if (exits.length > 1) lines.push({ t: L('交差点: ', 'Junction: ') + exits.map(function (ex) { return dirArrow(ex.dir) + ' ' + exitLabel(ex); }).join('　'), c: '#9fe8c8' });
      if (w.flash) lines.push({ t: w.flash.text, c: '#ffd93d' });
      var title = w.job ? t(R.JOBS[w.job].name) + L('　稼ぎ ', '  earned ') + yen(w.earned) : L('浜松市', 'Hamamatsu') + L('　走行 ', '  driven ') + (w.dist / 1000).toFixed(1) + 'km';
      return { title: title, lines: lines };
    }
    /** ミニマップ（北が上。実際の道の形） */
    function drawMap(g, x, y, size, frac) {
      var p = M.pts(h), n = p.length / 3, e = M.edgeOf(h), L0 = e.len * frac, d = 0, k = 0;
      while (k < n - 2) { var dd = Math.hypot(p[k * 3 + 3] - p[k * 3], p[k * 3 + 4] - p[k * 3 + 1]); if (d + dd >= L0) break; d += dd; k++; }
      var f = Math.min(1, (L0 - d) / Math.max(1, Math.hypot(p[k * 3 + 3] - p[k * 3], p[k * 3 + 4] - p[k * 3 + 1])));
      var cx = p[k * 3] + (p[k * 3 + 3] - p[k * 3]) * f, cz = p[k * 3 + 1] + (p[k * 3 + 4] - p[k * 3 + 1]) * f;
      var hd = Math.atan2(p[k * 3 + 3] - p[k * 3], p[k * 3 + 4] - p[k * 3 + 1]);
      var span = 900, sc = size / span, ox = x + size / 2, oy = y + size / 2;
      g.save(); g.beginPath(); g.rect(x + 2, y + 2, size - 4, size - 4); g.clip();
      g.fillStyle = 'rgba(20,28,24,.55)'; g.fillRect(x, y, size, size);
      function P2(px, pz) { return [ox + (px - cx) * sc, oy + (pz - cz) * sc]; }
      var gx = Math.floor(cx / 200), gz = Math.floor(cz / 200), seen = {};
      for (var a = -3; a <= 3; a++) for (var b = -3; b <= 3; b++) (M.egrid[(gx + a) + ',' + (gz + b)] || []).forEach(function (id) {
        if (seen[id]) return; seen[id] = 1;
        var E = M.edges[id], q = E.pts;
        g.strokeStyle = E.c === 0 || E.c === 5 ? '#4dd0e1' : E.c <= 2 ? '#ffcc80' : 'rgba(230,235,240,.75)';
        g.lineWidth = E.c <= 2 || E.c === 5 ? 2.2 : 1.3;
        g.beginPath();
        for (var i = 0; i < q.length / 3; i++) { var s2 = P2(q[i * 3], q[i * 3 + 1]); if (i) g.lineTo(s2[0], s2[1]); else g.moveTo(s2[0], s2[1]); }
        g.stroke();
      });
      // 道順
      var tn = targetNode();
      if (tn >= 0) {
        var rt = M.route(M.to(h), tn);
        if (rt) {
          g.strokeStyle = 'rgba(92,207,160,.95)'; g.lineWidth = 3; g.beginPath();
          var s0 = P2(cx, cz); g.moveTo(s0[0], s0[1]);
          for (var j = k + 1; j < n; j++) { var s3 = P2(p[j * 3], p[j * 3 + 1]); g.lineTo(s3[0], s3[1]); }
          rt.hs.slice(0, 12).forEach(function (hh) { var q2 = M.pts(hh); for (var i2 = 1; i2 < q2.length / 3; i2++) { var s4 = P2(q2[i2 * 3], q2[i2 * 3 + 1]); g.lineTo(s4[0], s4[1]); } });
          g.stroke();
          var T2 = M.nodes[tn], tp = P2(T2.x, T2.z);
          g.fillStyle = Math.floor(w.clock * 3) % 2 ? '#ff5252' : '#ffd93d';
          g.beginPath(); g.arc(clamp(tp[0], x + 6, x + size - 6), clamp(tp[1], y + 6, y + size - 6), 4, 0, Math.PI * 2); g.fill();
        }
      }
      // 自車（向きの矢印）
      g.translate(ox, oy); g.rotate(-hd + Math.PI);
      g.fillStyle = '#5ccfa0'; g.strokeStyle = '#0b1a12'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText('N', x + size - 10, y + 14);
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(x + size - 10, y + 17); g.lineTo(x + size - 10, y + 24); g.stroke();
    }

    function go(newH, tn) { if (h >= 0) { hist.push(h); if (hist.length > 30) hist.shift(); } h = newH; turn = tn || 0; }
    w.first = function () {
      if (w.job) newOrder(node);
      var outs = M.nodes[node].out.slice(), tn = targetNode(), pickH = -1;
      if (tn >= 0 && tn !== node) { var rt = M.route(node, tn); if (rt && rt.hs.length) pickH = rt.hs[0]; }
      if (pickH < 0) outs.forEach(function (o) { var E = M.edgeOf(o); if (pickH < 0 || E.c < M.edgeOf(pickH).c || (E.c === M.edgeOf(pickH).c && E.len > M.edgeOf(pickH).len)) pickH = o; });
      if (pickH < 0) pickH = M.edges[0].id * 2;
      arrive(node);
      go(pickH, 0);
      return cfgFor(null);
    };
    w.next = function (carry) {
      if (carry.back) {   // バックで前の道へ戻る
        var pv = hist.pop();
        if (pv === undefined) return null;
        h = pv; turn = 0;
        return cfgFor({ speed: carry.speed, x: carry.x, nitro: carry.nitro, damage: carry.damage, fromEnd: 8, rev: true });
      }
      if (carry.reverse) {   // その場で U ターン
        var rv = M.rev(h);
        if (rv < 0) { w.flash = { text: L('一方通行のため U ターンできません', 'One-way: no U-turn'), t: 3 }; return null; }
        go(rv, 0);
        return cfgFor({ speed: 0, x: carry.x, nitro: carry.nitro, damage: carry.damage, frac: 1 - carry.frac });
      }
      var fixed = arrive(M.to(h));
      var ci = Math.min(carry.choice || 0, exits.length - 1), ex = exits[ci] || exits[0];
      go(ex.h, ex.ang);
      return cfgFor({ speed: carry.speed, x: carry.x, nitro: carry.nitro, damage: fixed ? 0 : carry.damage, total: 0, copGap: carry.copGap });
    };
    w.summary = function () {
      var out = [];
      if (w.job) out.push(L('完了 ', 'Jobs done ') + w.trips + L(' 件　稼ぎ ', '  earned ') + yen(w.earned));
      else out.push(L('訪れた場所 ', 'Places visited ') + (w.visited.map(function (n) { return t(R.NODES[n].name); }).join('・') || '—'));
      if (!w.job && w.earned) out.push(L('初訪問ボーナス +', 'First-visit bonus +') + yen(w.earned));
      if (w.violations) out.push(L('違反 ', 'Violations ') + w.violations + L(' 回　反則金 ', '  fines ') + yen(w.fines));
      out.push(L('走行距離 ', 'Distance ') + (w.dist / 1000).toFixed(1) + ' km　' + L('走行時間 ', 'Drive time ') + fmt(w.clock * 1000));
      return out;
    };
    w.here = function () { return { h: h, node: M.to(h) }; };
    return w;
  }

  /** 実在の地図に載っている場所（R.NODES の名前 + 地図の交差点） */
  R.worldPlaces = function () {
    var M = R.Map, out = {};
    if (!M.ready) return out;
    Object.keys(M.places).forEach(function (k) {
      if (!R.NODES[k]) return;
      var p = M.places[k];
      out[k] = { x: p[0], z: p[1], node: p[2] };
    });
    return out;
  };

  /* =====================================================================
     GUI 版（1 つのウィンドウの中で遊ぶ）
     ===================================================================== */

  var App = null;

  function openApp(route) {
    if (App && !App.closed) { App.win.focus(); if (route) App.route(route); return; }
    App = createApp();
    App.route(route || 'title');
  }

  function createApp() {
    var app = { closed: false, stack: [], sel: 0, sess: null, demo: null, mode: 'menu', cmd: '', keyHook: null, runOpts: null, paused: false };
    var win = TB.Win.open({ title: 'TENRYU RACING', width: 960, maximized: true, bodyClass: 'rx-body',
                            onClose: function () { cleanup(); } });
    app.win = win;
    var stage = el('div', 'rx-stage'), cv = el('canvas', 'rx-canvas'), over = el('div', 'rx-over'), padBox = el('div', 'rx-padbox');
    stage.appendChild(cv); stage.appendChild(over);
    win.body.appendChild(stage); win.body.appendChild(padBox);
    var g = cv.getContext('2d');
    function portrait() { return window.innerHeight > window.innerWidth * 1.1; }
    function sizeCanvas() {
      var p = portrait();
      cv.width = p ? 540 : 960; cv.height = p ? 900 : 540;
    }
    sizeCanvas();

    function startDemo() {
      if (R.Music) R.Music.play('title');
      if (cv) cv.style.filter = '';
      var ids = loopTracks();
      var id = ids[Math.floor(Math.random() * ids.length)];
      app.demo = R.Session({ track: id, weather: R.TRACKS[id].weather, demo: true, laps: Infinity, field: R.makeField(6, 0.95), traffic: R.TRACKS[id].traffic || 0,
                             car: playerCar(R.load()) });
      app.demo.W = cv.width; app.demo.H = cv.height;
      app.demoT = 0;
    }
    startDemo();

    var last = null, raf = 0;
    function frame(now) {
      if (app.closed) return;
      if (last === null) last = now;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (app.sess) {
        if (!app.paused) for (var st = 0; st < (R.speedup || 1) && app.sess; st++) app.sess.update(dt);
        if (app.r3d && app.r3dSess === app.sess) { try { app.r3d.render(); } catch (e) { console.error(e); detach3D(); } app.sess.renderHud(g); }
        else app.sess.render(g);
      } else if (app.demo) {
        app.demo.update(dt); app.demo.render(g);
        app.demoT += dt;
        if (app.demoT > 40) startDemo();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    /* --- キー --- */
    function onKey(k) {
      if (app.keyHook && app.keyHook(k) !== false) return;
      if (app.mode === 'race' && app.sess) {
        if (k === 'Escape' || k === 'p' || k === 'P') { pause(); return; }
        if (k === 'o' || k === 'O' || k === 'F2') { pause(); adminOverlay(); return; }
        if (R.ENABLE_3D && (k === 'v' || k === 'V')) { R.edit(function (s) { s.r3d = !s.r3d; }); if (R.load().r3d) attach3D(); else detach3D(); return; }
        app.sess.key(k, true);
        return;
      }
      var f = focusables();
      if (!f.length) { if (k === 'Escape' || k === 'Backspace') back(); return; }
      var cur = f[app.sel] || f[0];
      var cols = parseInt((cur.closest('[data-cols]') || { getAttribute: function () { return '1'; } }).getAttribute('data-cols'), 10) || 1;
      if (k === 'ArrowDown' || k === 's' || k === 'j') move(cols);
      else if (k === 'ArrowUp' || k === 'w' || k === 'k') move(-cols);
      else if ((k === 'ArrowLeft' || k === 'ArrowRight') && app.curScreen && app.curScreen.tabs && !cur._lr && app.tabKeys) { app.tabKeys(k === 'ArrowLeft' ? -1 : 1); sfx('click'); }
      else if (k === 'ArrowLeft' || k === 'a' || k === 'h') { if (cur._lr) { cur._lr(-1); sfx('click'); } else move(-1); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'l') { if (cur._lr) { cur._lr(1); sfx('click'); } else move(1); }
      else if (k === 'Enter' || k === ' ') { cur.click(); }
      else if (k === 'Escape' || k === 'Backspace' || k === 'q') back();
    }
    function onKeyUp(k) { if (app.mode === 'race' && app.sess) app.sess.key(k, false); }
    TB.Term.capture(onKey, onKeyUp);

    function focusables() { return Array.prototype.slice.call(over.querySelectorAll('.rx-f:not(.dis)')); }
    function move(d) {
      var f = focusables(); if (!f.length) return;
      app.sel = clamp(app.sel + d, 0, f.length - 1);
      highlight(); sfx('click');
    }
    function highlight() {
      var f = focusables();
      f.forEach(function (x, i) { x.classList.toggle('on', i === app.sel); });
      var cur = f[app.sel];
      if (cur) { cur.scrollIntoView({ block: 'nearest' }); if (cur._focus) cur._focus(); }
    }

    /* --- 画面の切り替え --- */
    function show(screen, keepSel) {
      over.classList.remove('hidden');
      over.innerHTML = '';
      app.keyHook = null; app.curScreen = screen; app.tabKeys = null;
      if (R.Music && R.Music.album && R.Music.album.active && !screen.isAlbum) R.Music.album.stop();
      screen.build(over);
      if (!keepSel) app.sel = screen.sel || 0;
      var f = focusables();
      f.forEach(function (x, i) {
        x.addEventListener('mouseenter', function () { app.sel = i; highlight(); });
      });
      app.sel = clamp(app.sel, 0, Math.max(0, f.length - 1));
      highlight();
    }
    function go(screen) { if (app.stack.length) app.stack[app.stack.length - 1].sel = app.sel; app.stack.push(screen); show(screen); }
    function replace(screen) { app.stack.pop(); app.stack.push(screen); show(screen); }
    function back() {
      if (app.stack.length <= 1) { win.close(); return; }
      app.stack.pop(); sfx('click');
      var top = app.stack[app.stack.length - 1];
      show(top, false);
    }
    function home() { app.stack = app.stack.slice(0, 1); show(app.stack[0]); }
    function refresh() { show(app.stack[app.stack.length - 1], true); }
    app.go = go; app.back = back;

    /* --- 部品 --- */
    function panel(title, sub) {
      var p = el('div', 'rx-panel');
      var h = el('div', 'rx-h'); h.appendChild(el('span', 'rx-h-t', title));
      if (sub) h.appendChild(el('span', 'rx-h-s', sub));
      if (R.admin && R.admin.on) h.appendChild(el('span', 'rx-adm', 'ADMIN'));
      var money = el('span', 'rx-money', yen(R.load().money));
      h.appendChild(money);
      p.appendChild(h);
      return p;
    }
    function item(label, sub, on, opt) {
      opt = opt || {};
      var b = el('button', 'rx-item rx-f' + (opt.dis ? ' dis' : '') + (opt.cls ? ' ' + opt.cls : ''));
      b.type = 'button';
      if (opt.icon) { var ic = el('span', 'rx-ic'); ic.appendChild(R.iconNode(opt.icon, 22)); b.appendChild(ic); }
      var tx = el('span', 'rx-tx');
      tx.appendChild(el('span', 'rx-l', label));
      if (sub) tx.appendChild(el('span', 'rx-s', sub));
      b.appendChild(tx);
      if (opt.right) b.appendChild(el('span', 'rx-r', opt.right));
      b.addEventListener('click', function (e) { e.preventDefault(); if (opt.dis) { sfx('bad'); return; } sfx('click'); on(); });
      if (opt.focus) b._focus = opt.focus;
      return b;
    }
    function list(items, cols) {
      var d = el('div', 'rx-list' + (cols > 1 ? ' grid' : ''));
      if (cols > 1) { d.setAttribute('data-cols', String(cols)); d.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))'; }
      items.forEach(function (x) { d.appendChild(x); });
      return d;
    }
    function optRow(label, get, change) {
      var b = el('button', 'rx-item rx-opt rx-f');
      b.type = 'button';
      var l = el('span', 'rx-l', label), v = el('span', 'rx-v');
      function upd() { v.textContent = '◀ ' + get() + ' ▶'; }
      b.appendChild(l); b.appendChild(v); upd();
      b._lr = function (d) { change(d); upd(); };
      b.addEventListener('click', function (e) {
        var r = b.getBoundingClientRect();
        b._lr(e.clientX && e.clientX < r.left + r.width * 0.6 ? -1 : 1); sfx('click');
      });
      return b;
    }
    function hint(text) { return el('div', 'rx-hint', text || L('↑↓←→ 選ぶ　Enter 決定　Esc 戻る', '↑↓←→ select  Enter confirm  Esc back')); }
    function preview(track, w, h, weather, mirror) {
      var c = el('canvas', 'rx-prev'); c.width = w || 320; c.height = h || 180;
      try { R.drawPreview(c, track, weather, mirror); } catch (e) { /* ignore */ }
      return c;
    }
    function statBars(stats) {
      var d = el('div', 'rx-stats');
      [['spd', L('最高速', 'Speed')], ['acc', L('加速', 'Accel')], ['grp', L('グリップ', 'Grip')], ['arm', L('頑丈さ', 'Armor')], ['nit', L('ニトロ', 'Nitro')]].forEach(function (p) {
        var row = el('div', 'rx-stat');
        row.appendChild(el('span', 'rx-stat-l', p[1]));
        var bar = el('span', 'rx-bar'), fill = el('span', 'rx-fill');
        fill.style.width = clamp(stats[p[0]] / 12 * 100, 2, 100) + '%';
        bar.appendChild(fill); row.appendChild(bar);
        row.appendChild(el('span', 'rx-stat-v', stats[p[0]].toFixed(1)));
        d.appendChild(row);
      });
      return d;
    }

    /* =================== 各画面 =================== */

    var SCREENS = {};

    SCREENS.title = function () {
      return { build: function (o) {
        var s = R.load();
        var box = el('div', 'rx-title');
        var logo = el('div', 'rx-logo', 'TENRYU RACING'); logo.addEventListener('click', function () { if (TB.secretTap) TB.secretTap(); }); box.appendChild(logo);
        box.appendChild(el('div', 'rx-tag', L('本格レーシング ── 峠からサーキット、浜松から名古屋まで', 'Mountain passes, circuits, Hamamatsu to Nagoya')));
        box.appendChild(el('div', 'rx-carline', L('愛車 ', 'Car ') + t(R.car(s.car).name) + '　·　' + yen(s.money) + '　·　' + L('難易度 ', 'Level ') + t(R.LEVEL_NAMES[s.level])));
        var done = Math.min(s.story, R.STORY.length);
        var items = [
          item(L('ストーリー', 'Story'), done + ' / ' + R.STORY.length, function () { go(SCREENS.story()); }, { icon: 'book' }),
          item(L('オープンワールド', 'Open World'), L('浜松・東名・名古屋', 'Hamamatsu–Nagoya'), function () { go(SCREENS.world(null)); }, { icon: 'map' }),
          item(L('アルバイト', 'Part-time Jobs'), L('タクシー・宅配・出前', 'Taxi, parcels, food'), function () { go(SCREENS.jobs()); }, { icon: 'taxi' }),
          item(L('デイリーレース', 'Daily Race'), dailyLabel(s), function () { go(SCREENS.daily()); }, { icon: 'calendar' }),
          item(L('グランプリ', 'Grand Prix'), L('カップ戦', 'Cups'), function () { go(SCREENS.gp()); }, { icon: 'trophy' }),
          item(L('クイックレース', 'Quick Race'), L('コース・天気を選ぶ', 'Pick track & weather'), function () { go(SCREENS.quick(false, 'all')); }, { icon: 'flag' }),
          item(L('実在コース', 'Real Tracks'), L('鈴鹿・富士などのサーキット／榛名・碓氷などの峠／浜松の公道', 'Real circuits, mountain passes and Hamamatsu roads'), function () { go(SCREENS.quick(false, 'circuit')); }, { icon: 'map' }),
          item(L('峠バトル', 'Touge Battle'), L('ダウンヒル 1 対 1', 'Downhill 1v1'), function () { go(SCREENS.touge()); }, { icon: 'mountain' }),
          item(L('タイムアタック', 'Time Attack'), L('ゴーストと勝負', 'Beat your ghost'), function () { go(SCREENS.trackPick('time')); }, { icon: 'stopwatch' }),
          item(L('チャレンジ', 'Challenges'), L('脱落戦・追跡など', 'Elimination, chase…'), function () { go(SCREENS.challenges()); }, { icon: 'flame' }),
          item(L('ミニゲーム', 'Mini Games'), L('ジムカーナ・ゼロヨン', 'Gymkhana, drag'), function () { go(SCREENS.minis()); }, { icon: 'target' }),
          item(L('カジュアル', 'Casual'), L('コイン・加速パネルあり', 'Coins & boost pads'), function () { go(SCREENS.casual()); }, { icon: 'balloon' }),
          item(L('ガレージ', 'Garage'), s.owned.length + L(' 台所有', ' owned'), function () { go(SCREENS.garage()); }, { icon: 'wrench' }),
          item(L('実績', 'Achievements'), Object.keys(s.ach || {}).length + ' / ' + R.ACHIEVEMENTS.length, function () { go(SCREENS.achievements()); }, { icon: 'medal' }),
          item(L('記録', 'Records'), '', function () { go(SCREENS.records()); }, { icon: 'chart' }),
          item(L('アルバム', 'Album'), L('曲を聴く', 'Listen to the music'), function () { go(SCREENS.album()); }, { icon: 'sound' }),
          item(L('設定・遊び方', 'Settings & Help'), '', function () { go(SCREENS.settings()); }, { icon: 'gear' }),
          item(L('管理者モード', 'Admin mode'), R.admin && R.admin.on ? 'ON' : L('スキップ・数値の変更（保存なし）', 'Skip & tweak (not saved)'), function () { go(SCREENS.admin()); }, { icon: 'tool' })
        ];
        box.appendChild(list(items, 2));
        box.appendChild(hint());
        o.appendChild(box);
      } };
    };

    /* ---------- ストーリー（タブで本編・ストーリー2・3・サブストーリーを切り替え） ---------- */
    SCREENS.story = function (tab0) {
      if (tab0) app.storyTab = tab0;
      return { build: function (o) {
        var tab = app.storyTab || 's1', st0 = null;
        var s = R.load(), sts = stories();
        // 浜松の公道コースの目標タイムは地図がないと計れないので、先に読み込む
        if (!R.Map.ready && sts.some(function (x) { return x.events.concat(x.side || []).some(function (e) { return R.needsMap(e.track); }); })) R.Map.load(function () { if (app.curScreen && app.curScreen.tabs) refresh(); });
        var p = panel(L('ストーリー', 'Story'), L('上のタブでストーリーを切り替え（← → でも可）', 'Switch stories with the tabs (or ← →)'));
        // タブ
        var tabs = el('div', 'rx-tabs');
        var keys = sts.map(function (x) { return x.id; }).concat(['side']);
        keys.forEach(function (k) {
          var st = k === 'side' ? null : storyOf(k);
          var label = k === 'side' ? L('サブストーリー', 'Side stories') : t(st.name);
          var prog = k === 'side' ? '' : ' ' + Math.min(progOf(s, k), st.events.length) + '/' + st.events.length;
          var b = el('button', 'rx-tab' + (k === tab ? ' on' : ''), label + prog);
          b.addEventListener('click', function () { app.storyTab = k; refresh(); });
          tabs.appendChild(b);
        });
        p.appendChild(tabs);
        app.tabKeys = function (d) { var i = keys.indexOf(tab); app.storyTab = keys[(i + d + keys.length) % keys.length]; refresh(); };
        var items = [], firstOpen = 0;
        if (tab === 'side') {
          sts.forEach(function (st) {
            if (!st.side || !st.side.length) return;
            items.push(el('div', 'rx-sec', t(st.name)));
            st.side.forEach(function (ev, i) {
              var open = sideOpen(s, st, ev), done = sideDone(s, ev), who = R.CHARS[ev.char] ? t(R.CHARS[ev.char].name) : '';
              var need = findEvent(ev.after);
              items.push(item((done ? '[済] ' : open ? '★ ' : '[未] ') + t(ev.title),
                              (who ? who + L(' の話　', "'s story  ") : '') + (ev.talk ? L('会話', 'Scene') : trackName(ev.track)) + '　' + (open ? goalText(ev.goal, ev.track) : L('「', 'after "') + (need ? t(need.ev.title) : '') + L('」のあとで開放', '"')),
                              function () { storyEvent(st.id, i, true, true); }, { dis: !open, right: yen(ev.reward) }));
            });
          });
        } else {
          var st = storyOf(tab), pr = normProg(s, st0 = storyOf(tab)), unl = !!(R.admin && R.admin.on && R.admin.v.unlockAll);
          var head = el('div', 'rx-story-head');
          head.appendChild(el('div', 'rx-s', '【' + st.era + '・' + st.place + '】' + (st.hero && R.CHARS[st.hero] ? L('　主人公: ', '  Hero: ') + t(R.CHARS[st.hero].name) : '')));
          head.appendChild(el('div', 'rx-s', t(st.desc)));
          if (st.endings && st.endings.length) {
            var seenE = (s.endings || {})[st.id] || {}, nSeen = st.endings.filter(function (e) { return seenE[e.id]; }).length;
            head.appendChild(el('div', 'rx-s rx-endsum', L('エンディング ', 'Endings ') + nSeen + ' / ' + st.endings.length + '　' +
              st.endings.map(function (e) { return seenE[e.id] ? '★' + t(e.name) : '？？？'; }).join('　')));
          }
          p.appendChild(head);
          if (st.endings) st.endings.forEach(function (e) {
            if (((s.endings || {})[st.id] || {})[e.id]) items.push(item(L('エンディングを見直す: ', 'Replay ending: ') + t(e.name), t(e.hint || ''), function () { scene([{ bgm: 'ending' }, { title: 'ENDING', sub: t(e.name) }].concat(e.scene || []), function () { refresh(); }, st.filter, { sid: st.id, replay: true }); }, { icon: '🎬' }));
          });
          st.chapters.forEach(function (ch) {
            var evs = st.events.filter(function (e) { return e.ch === ch.id && evVisible(e, s, st.id); });
            if (!evs.length) return;
            items.push(el('div', 'rx-sec', t(ch.name)));
            evs.forEach(function (ev) {
              var idx = st.events.indexOf(ev), locked = idx > pr && !unl, cleared = idx < pr;
              if (idx === pr) firstOpen = items.filter(function (x) { return x.classList.contains('rx-f'); }).length;
              items.push(item((cleared ? '[済] ' : locked ? '[未] ' : '▶ ') + t(ev.title),
                              ev.talk ? L('会話・物語', 'Story scene') : trackName(ev.track) + '　' + t((R.MODES[ev.mode] || R.MODES.race).name) + '　' + goalText(ev.goal, ev.track),
                              function () { storyEvent(st.id, idx, true); }, { dis: locked, right: yen(ev.reward) }));
            });
          });
        }
        p.appendChild(list(items));
        p.appendChild(hint(L('↑↓ 選ぶ　← → タブ切り替え　Enter 決定　Esc 戻る', '↑↓ pick  ← → tabs  Enter start  Esc back')));
        o.appendChild(p);
        this.sel = firstOpen;
      }, sel: 0, tabs: true };
    };

    function evOf(sid, idx, side) { var st = storyOf(sid); return side ? st.side[idx] : st.events[idx]; }
    function isReplay(sid, idx, side) { var s = R.load(), st = storyOf(sid), ev = evOf(sid, idx, side); return side ? sideDone(s, ev) : idx < progOf(s, sid); }
    function storyEvent(sid, idx, withScene, side) {
      var ev = evOf(sid, idx, side), st = storyOf(sid);
      function brief() { go(SCREENS.brief(sid, idx, side)); }
      var ctx = { sid: sid, replay: isReplay(sid, idx, side) };
      if (ev.talk) { scene(ev.scene || [], function () { runStory(sid, idx, side); }, st.filter, ctx); return; }   // 会話だけの話: そのまま次へ
      if (withScene && ev.scene) scene(ev.scene, brief, st.filter, ctx); else brief();
    }

    SCREENS.brief = function (sid, idx, side) {
      var st = storyOf(sid), ev = evOf(sid, idx, side);
      return { build: function (o) {
        var s = R.load();
        if (R.needsMap(ev.track) && !R.Map.ready) { var me = this; R.Map.load(function () { if (app.curScreen === me) refresh(); }); }
        var chName = side ? L('サブストーリー', 'Side story') : t((st.chapters.filter(function (c) { return c.id === ev.ch; })[0] || { name: '' }).name);
        var p = panel(t(ev.title), t(st.name) + '　' + chName);
        var row = el('div', 'rx-row');
        var pvBox = el('div', 'rx-pv');
        function drawPv() {
          if (R.needsMap(ev.track) && !R.Map.ready) { pvBox.innerHTML = ''; pvBox.appendChild(el('div', 'rx-s', L('地図を読み込み中…', 'Loading map...'))); R.Map.load(drawPv); return; }
          pvBox.innerHTML = ''; var c2 = preview(ev.track, 400, 225); if (st.filter) c2.style.filter = st.filter; pvBox.appendChild(c2);
        }
        drawPv();
        row.appendChild(pvBox);
        var info = el('div', 'rx-info');
        var replay = side ? sideDone(s, ev) : idx < progOf(s, sid);
        [[L('コース', 'Track'), trackName(ev.track)], [L('種目', 'Mode'), t((R.MODES[ev.mode] || R.MODES.race).name)],
         [L('目標', 'Goal'), goalText(ev.goal, ev.track)], [L('報酬', 'Reward'), yen(ev.reward) + (replay ? L('（再挑戦は 3 割）', ' (30% on replay)') : '')],
         [L('車', 'Car'), ev.car ? t(R.car(ev.car).name) + L('（指定）', ' (fixed)') : t(R.car(s.car).name)]].forEach(function (kv) {
          var d = el('div', 'rx-kv'); d.appendChild(el('span', 'rx-k', kv[0])); d.appendChild(el('span', 'rx-vv', kv[1])); info.appendChild(d);
        });
        if (ev.boss) info.appendChild(el('div', 'rx-boss', 'BOSS: ' + R.BOSSES[ev.boss].name));
        row.appendChild(info);
        p.appendChild(row);
        p.appendChild(list([
          item(L('スタート', 'Start'), '', function () { runStory(sid, idx, side); }, { icon: 'flag', cls: 'accent' }),
          item(L('会話をもう一度', 'Replay scene'), '', function () { if (ev.scene) scene(ev.scene, function () { refresh(); }, st.filter, { sid: sid, replay: isReplay(sid, idx, side) }); }, { icon: 'chat', dis: !ev.scene }),
          item(L('ガレージ', 'Garage'), '', function () { go(SCREENS.garage()); }, { icon: 'wrench', dis: !!ev.car }),
          item(L('管理者パネル', 'Admin panel'), R.admin && R.admin.on ? 'ON' : L('数値の変更・スキップ', 'Tweak / skip'), function () { go(SCREENS.admin()); }, { icon: 'tool' }),
          R.admin && R.admin.on ? item(L('このバトルをスキップ', 'Skip this battle'), L('成功扱い（記録は残りません）', 'Counts as a win (no records)'), function () { skipStory(sid, idx, side); }, { icon: 'skip' }) : null,
          item(L('戻る', 'Back'), '', function () { back(); }, { icon: 'back' })
        ].filter(Boolean), 2));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };

    function runStory(sid, idx, side) {
      var ev = evOf(sid, idx, side), o = storyOpts(sid, idx, side);
      app.cmd = 'story ' + ev.id;
      if (ev.talk) {   // 会話だけの話（レースなし）: 報酬を受け取って、そのまま後日談へ
        var sum = o.onResult(fakeResult(ev));
        toast(L('第 ' + (idx + 1) + ' 話　完了', 'Chapter ' + (idx + 1) + ' complete') + (sum.money ? '　+' + yen(sum.money) : ''));
        setTimeout(o.winFlow, 900);
        return;
      }
      run(o);
    }
    /** 管理者モード: レースをせずに成功扱いにして、結果画面へ */
    function skipStory(sid, idx, side) {
      var o = storyOpts(sid, idx, side), r = o.skip(), sum = o.onResult(r);
      app.runOpts = o;
      if (app.sess) { app.sess.stop(); app.sess = null; }
      detach3D(); startDemo(); padBox.innerHTML = '';
      results(sum, r, o);
    }
    function storyOpts(sid, idx, side) {
      var st = storyOf(sid), ev = evOf(sid, idx, side);
      var ctx = { sid: sid, replay: isReplay(sid, idx, side) };
      var storyCtx = { kind: 'story', ev: ev, sid: sid, side: side, track: ev.track };
      function afterWin() {
        if (side) { app.stack = app.stack.slice(0, 2); show(app.stack[1]); return; }
        if (ev.final) { endingThen(st, ev); return; }
        var nx = idx + 1, s2 = R.load();
        while (nx < st.events.length && !evVisible(st.events[nx], s2, sid)) { (function (k) { R.edit(function (s3) { setProg(s3, sid, k + 1); }); })(nx); nx++; }
        app.stack = app.stack.slice(0, 2);
        if (nx < st.events.length) { show(app.stack[1]); storyEvent(sid, nx, true); } else show(app.stack[1]);
      }
      function winFlow() { if (ev.post) scene(ev.post, afterWin, st.filter, ctx); else afterWin(); }
      return {
        winFlow: winFlow,
        make: function () { return storyCfg(ev, st); },
        onResult: function (r) { return applyResult(storyCtx, r); },
        skip: function () { return fakeResult(ev); },
        buttons: function (sum) {
          if (sum.success) return [{ label: L('次へ', 'Continue'), on: winFlow },
                                   { label: L('ストーリー一覧', 'Story list'), on: function () { app.stack = app.stack.slice(0, 2); show(app.stack[1]); } }];
          return [{ label: L('リトライ', 'Retry'), on: function () { runStory(sid, idx, side); } },
                  { label: L('作戦を練る（戻る）', 'Back to briefing'), on: function () { refresh(); } }];
        }
      };
    }
    /** 画面の中央に短い通知を出す */
    function toast(text) {
      var d = el('div', 'rx-toast', text);
      over.classList.remove('hidden'); over.appendChild(d);
      setTimeout(function () { d.remove(); }, 1400);
    }
    /** 最後の話のあと: フラグに合うエンディングを選んで見せ、記録する */
    function endingThen(st, ev) {
      var s = R.load(), f = flagsOf(s, st.id), ends = ev.endings || st.endings || [];
      if (!ends.length) { credits(st); return; }
      var pick = null;
      ends.forEach(function (e) { if (!pick && evalExpr(e.when, f)) pick = e; });
      if (!pick) pick = ends[ends.length - 1];
      R.edit(function (s2) { s2.endings = s2.endings || {}; (s2.endings[st.id] = s2.endings[st.id] || {})[pick.id] = 1; });
      var lines = [{ bgm: 'ending' }, { title: 'ENDING ' + (ends.indexOf(pick) + 1) + ' / ' + ends.length, sub: t(pick.name) }].concat(pick.scene || []);
      scene(lines, function () { credits(st, pick); }, st.filter, { sid: st.id, replay: true });
    }

    /* 会話シーン。背景・立ち絵（表情つき）・演出（揺れ・フラッシュ・集中線・擬音）・章タイトル・ナレーション・VS 画面 */
    function scene(lines0, done, filter, ctx) {
      ctx = ctx || {};
      var lines = lines0.slice();   // 選択肢で行を差し込むので、元の台本は変えない
      if (R.Music) R.Music.play(lines.some(function (ln) { return ln && ln.bgm === 'tension'; }) ? 'tension' : 'story');
      over.classList.remove('hidden');
      over.innerHTML = '';
      var root = el('div', 'rx-scn');
      var bg = el('canvas', 'rx-scn-bg'); bg.width = 960; bg.height = 540;
      var speed = el('canvas', 'rx-scn-speed'); speed.width = 960; speed.height = 540;
      var faceL = el('canvas', 'rx-scn-face left'), faceR = el('canvas', 'rx-scn-face right');
      faceL.width = faceL.height = faceR.width = faceR.height = 192;
      var sfxEl = el('div', 'rx-scn-sfx'), flashEl = el('div', 'rx-scn-flash');
      var box = el('div', 'rx-scn-box'), name = el('div', 'rx-name'), text = el('div', 'rx-text'), more = el('div', 'rx-more', '▼ Enter / クリック　s スキップ');
      box.appendChild(name); box.appendChild(text); box.appendChild(more);
      var card = el('div', 'rx-scn-card'), narr = el('div', 'rx-scn-narr'), vs = el('div', 'rx-scn-vs'), choiceEl = el('div', 'rx-scn-choice');
      [bg, speed, faceL, faceR, el('div', 'rx-scn-bar top'), el('div', 'rx-scn-bar bottom'), sfxEl, box, narr, card, vs, choiceEl, flashEl].forEach(function (x) { root.appendChild(x); });
      over.appendChild(root);
      if (filter) root.style.filter = filter;

      // 集中線
      (function () {
        var g3 = speed.getContext('2d'); g3.translate(480, 270);
        for (var i = 0; i < 90; i++) {
          var a = i / 90 * Math.PI * 2 + Math.random() * 0.05, r0 = 150 + Math.random() * 120, w = 0.004 + Math.random() * 0.01;
          g3.fillStyle = 'rgba(255,255,255,' + (0.25 + Math.random() * 0.35) + ')';
          g3.beginPath(); g3.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          g3.lineTo(Math.cos(a - w) * 700, Math.sin(a - w) * 700); g3.lineTo(Math.cos(a + w) * 700, Math.sin(a + w) * 700); g3.fill();
        }
      })();
      function setBg(track, weather) {
        try { if (!(R.drawScene && R.SCENES && R.SCENES[track] && R.drawScene(bg, track))) R.drawPreview(bg, track, weather || null, false, true); } catch (e) { /* ignore */ }
        root.classList.remove('pan'); void root.offsetWidth; root.classList.add('pan');
      }
      setBg('tenryu');

      var i = 0, shown = 0, timer = 0, full = '', mode = 'line', autoT = 0;
      function fxOf(str) {
        var o = { list: (str || '').split(/\s+/), emo: null, sfx: null };
        o.list.forEach(function (x) { if (x.indexOf('emo:') === 0) o.emo = x.slice(4); if (x.indexOf('sfx:') === 0) o.sfx = x.slice(4); });
        o.has = function (k) { return o.list.indexOf(k) >= 0; };
        return o;
      }
      function pulse(cls, ms) { root.classList.remove(cls); void root.offsetWidth; root.classList.add(cls); setTimeout(function () { root.classList.remove(cls); }, ms); }
      function hideAll() { card.className = 'rx-scn-card'; narr.className = 'rx-scn-narr'; vs.className = 'rx-scn-vs'; choiceEl.className = 'rx-scn-choice'; box.classList.remove('hide'); }
      function typeInto(elm, str, cb) {
        full = str; shown = 0; elm.textContent = '';
        clearInterval(timer);
        timer = setInterval(function () {
          shown += 1; elm.textContent = full.slice(0, shown);
          if (shown % 3 === 0) sfx('step');
          if (shown >= full.length) { clearInterval(timer); if (cb) cb(); }
        }, 32);
      }
      var curText = '';
      // 台詞の言い回しから、表情をもう一段こまかくする（台本に emo:laugh などと書いても使える）
      function refineEmo(emo, tx) {
        tx = tx || '';
        if (!emo || ['laugh', 'worry', 'blush', 'cry', 'think', 'sleepy', 'wink', 'smug', 'determined', 'panic', 'tired', 'gentle'].indexOf(emo) >= 0) return emo;
        var h = 0; for (var q = 0; q < tx.length; q++) h = (h * 31 + tx.charCodeAt(q)) >>> 0;
        if (emo === 'smile') {
          if (/(はは|ははっ|あはは|やった|最高|笑)/.test(tx) || /！！/.test(tx)) return 'laugh';
          if (/(ありがとう|うれしい|嬉しい|照れ|恥ずかし|えへ)/.test(tx)) return h % 2 ? 'blush' : 'gentle';
          if (/(眠|おやすみ|ふわ)/.test(tx)) return 'sleepy';
          if (/(任せ|いたずら|ふふ|なんてね)/.test(tx)) return 'wink';
          if (/(。|…)$/.test(tx) && h % 3 === 0) return 'gentle';
        } else if (emo === 'sad') {
          if (/(泣|涙|ごめん|うう|ううっ)/.test(tx)) return 'cry';
          if (/(……|心配|大丈夫か|どうしよう)/.test(tx)) return h % 2 ? 'worry' : 'sad';
          if (/(疲|つかれ)/.test(tx)) return 'tired';
        } else if (emo === 'shock') {
          if (/(え！|えっ|うわ|ええ|まさか)/.test(tx) && /！/.test(tx)) return 'panic';
        } else if (emo === 'cool') {
          if (/(ふん|フン|ふっ|当然|だろう|ドヤ)/.test(tx)) return 'smug';
          if (/(？|か。|だろうか)/.test(tx)) return 'think';
          if (/(必ず|勝つ|行く|やる|絶対|負けない|走る)/.test(tx)) return 'determined';
        } else if (emo === 'angry') {
          if (/(まって|待って|ちが|違う)/.test(tx)) return 'panic';
        }
        return emo;
      }
      function portrait(cvs, who, emo) {
        var ch = R.CHARS[who] || R.CHARS.mina;
        cvs.getContext('2d').clearRect(0, 0, 192, 192);
        R.drawPortrait(cvs, ch.face, refineEmo(emo, curText));
      }
      var onL = null, onR = null;
      function showLine() {
        clearInterval(timer); clearTimeout(autoT);
        hideAll();
        if (i >= lines.length) { app.keyHook = null; done(); return; }
        var ln = lines[i];
        if (ln.bg) { setBg(ln.bg, ln.weather); i++; showLine(); return; }
        if (ln.title) {
          mode = 'card'; box.classList.add('hide');
          card.innerHTML = ''; card.appendChild(el('div', 'rx-card-t', ln.title)); card.appendChild(el('div', 'rx-card-s', ln.sub || ''));
          card.className = 'rx-scn-card show'; sfx('lap');
          autoT = setTimeout(adv, 2600);
          return;
        }
        if (ln.narr) {
          mode = 'narr'; box.classList.add('hide');
          narr.className = 'rx-scn-narr show';
          typeInto(narr, ln.narr);
          return;
        }
        if (ln.when !== undefined) {   // 条件つきの行: フラグで台詞を差し込む
          var fl = ctx.sid ? flagsOf(R.load(), ctx.sid) : {};
          var ins = evalExpr(ln.when, fl) ? ln.lines : ln.otherwise;
          if (ins && ins.length) lines.splice.apply(lines, [i + 1, 0].concat(ins));
          i++; showLine(); return;
        }
        if (ln.bgm && R.Music) { R.Music.play(ln.bgm); i++; showLine(); return; }
        if (ln.choice) {
          // 選択肢: 選んだものの台詞を、この行のあとに差し込む
          mode = 'choice'; box.classList.add('hide');
          choiceEl.innerHTML = '';
          if (ln.ask) choiceEl.appendChild(el('div', 'rx-choice-q', ln.ask));
          var csel = 0, btns = [];
          var pick1 = function (k) {
            var opt = ln.choice[k];
            if (opt.set && ctx.sid && !ctx.replay) R.edit(function (s2) { var f2 = flagsOf(s2, ctx.sid); for (var fk in opt.set) f2[fk] = opt.set[fk]; });
            app.keyHook = sceneKeys;
            lines.splice.apply(lines, [i + 1, 0].concat(opt.lines || []));
            sfx('click'); choiceEl.className = 'rx-scn-choice'; mode = 'line';
            i++; showLine();
          };
          ln.choice.forEach(function (opt, k) {
            var bt = el('button', 'rx-choice-btn', (k + 1) + '. ' + opt.t);
            bt.addEventListener('click', function (e) { e.stopPropagation(); pick1(k); });
            choiceEl.appendChild(bt); btns.push(bt);
          });
          var hi = function () { btns.forEach(function (bt, k) { bt.classList.toggle('on', k === csel); }); };
          hi();
          choiceEl.className = 'rx-scn-choice show';
          app.keyHook = function (k) {
            if (k === 'ArrowUp' || k === 'ArrowLeft') { csel = (csel + btns.length - 1) % btns.length; hi(); }
            else if (k === 'ArrowDown' || k === 'ArrowRight') { csel = (csel + 1) % btns.length; hi(); }
            else if (k === 'Enter' || k === ' ') { pick1(csel); }
            else if (/^[1-9]$/.test(k) && +k <= btns.length) { pick1(+k - 1); }
            return true;
          };
          return;
        }
        if (ln.vs) {
          if (R.Music) R.Music.play('tension');
          mode = 'vs'; box.classList.add('hide');
          vs.innerHTML = '';
          ln.vs.forEach(function (who, k) {
            var side = el('div', 'rx-vs-side ' + (k ? 'r' : 'l'));
            var c2 = el('canvas'); c2.width = c2.height = 192; portrait(c2, who, k ? 'angry' : 'cool');
            side.appendChild(c2); side.appendChild(el('div', 'rx-vs-name', TB.t((R.CHARS[who] || {}).name || who)));
            side.style.setProperty('--c', (R.CHARS[who] || {}).color || '#fff');
            vs.appendChild(side);
            if (!k) vs.appendChild(el('div', 'rx-vs-mark', 'VS'));
          });
          vs.className = 'rx-scn-vs show'; pulse('flash', 300); sfx('go');
          autoT = setTimeout(adv, 2800);
          return;
        }
        // せりふ
        mode = 'line';
        var who = ln[0], fx = fxOf(ln[2]), ch = R.CHARS[who] || { name: who, color: '#fff' };
        var left = who === 'you' || (who === 'mina' && !fx.has('right'));
        var cvs = left ? faceL : faceR;
        if ((left ? onL : onR) !== who) { cvs.classList.remove('in'); void cvs.offsetWidth; cvs.classList.add('in'); }
        if (left) onL = who; else onR = who;
        curText = typeof ln[1] === 'string' ? ln[1] : (ln[1] && (ln[1].ja || ln[1].en)) || '';
        portrait(cvs, who, fx.emo);
        faceL.classList.toggle('dim', !left); faceR.classList.toggle('dim', left);
        faceL.classList.toggle('empty', !onL); faceR.classList.toggle('empty', !onR);
        cvs.classList.toggle('zoom', fx.has('zoom'));
        name.textContent = TB.t(ch.name); name.style.color = ch.color;
        box.style.setProperty('--c', ch.color);
        speed.classList.toggle('on', fx.has('lines'));
        if (fx.has('shake')) pulse('shake', 450);
        if (fx.has('flash')) pulse('flash', 350);
        if (fx.sfx) { sfxEl.textContent = fx.sfx; sfxEl.classList.remove('pop'); void sfxEl.offsetWidth; sfxEl.classList.add('pop'); sfx('hit'); }
        else sfxEl.classList.remove('pop');
        typeInto(text, TB.t(ln[1]));
      }
      function adv() {
        if ((mode === 'line' || mode === 'narr') && shown < full.length) {
          shown = full.length; (mode === 'narr' ? narr : text).textContent = full; clearInterval(timer); return;
        }
        i++; showLine();
      }
      root.addEventListener('click', function () { if (mode !== 'choice') adv(); });
      var sceneKeys = function (k) {
        if (mode === 'choice') return true;
        if (k === 'Enter' || k === ' ') adv();
        else if (k === 's' || k === 'S' || k === 'Escape') { i = lines.length; showLine(); }
        return true;
      };
      app.keyHook = sceneKeys;
      showLine();
    }

    function credits(st, pick) {
      over.innerHTML = '';
      var box = el('div', 'rx-credits');
      var lines = st && st.id !== 's1'
        ? ['THE END', '', t(st.name), L('ストーリー完結！', 'Story complete!'), '', L('サブストーリーのタブで、その後の話が読めます', 'More in the Side stories tab'), '', 'Thank you for playing.']
        : ['THE END', '', 'TENRYU RACING', L('本編「天竜の白い亡霊」完結！', 'Main story complete!'), '',
           L('番外編「峠の走り屋たち」が開放されました', 'Extra chapter "Legends of the Pass" unlocked'), L('プロトタイプ ZERO がガレージに届きました', 'Prototype ZERO is in your garage'),
           L('ストーリー2・3、サブストーリーもどうぞ', 'Try Stories 2 & 3 and the side stories'), '', 'Thank you for playing.'];
      if (pick && st.endings) {
        var seenE = (R.load().endings || {})[st.id] || {}, nSeen = st.endings.filter(function (e) { return seenE[e.id]; }).length;
        lines = lines.slice(0, 4).concat(['', L('エンディング: ', 'Ending: ') + t(pick.name), L('達成 ', 'Reached ') + nSeen + ' / ' + st.endings.length + L('　（別の選択で、別の結末が見られます）', '  (other choices lead to other endings)')], lines.slice(4));
      }
      lines.forEach(function (ln, i) { box.appendChild(el('div', i === 0 ? 'rx-end' : '', ln)); });
      over.appendChild(box);
      sfx('win');
      app.keyHook = function () { app.keyHook = null; app.stack = app.stack.slice(0, 2); show(app.stack[1]); return true; };
      box.addEventListener('click', function () { app.keyHook(); });
    }

    /* ---------- オープンワールド・アルバイト ---------- */
    SCREENS.world = function (job) {
      var start = 'hm_eki', dest = null, pickMode = 'start';
      var view = { cx: -2500, cz: -2500, scale: 0.034 };
      return { build: function (o) {
        var p = panel(job ? t(R.JOBS[job].name) : L('オープンワールド（浜松市・実在の道路）', 'Open World — real Hamamatsu roads'),
                      job ? t(R.JOBS[job].desc) : L('浜松市全域の実在の道路・交差点・信号を走る（OpenStreetMap・国土地理院のデータ）', 'Drive every real road, junction and signal of Hamamatsu (OpenStreetMap / GSI data)'));
        o.appendChild(p);
        var wait = el('div', 'rx-s', L('地図を読み込み中…', 'Loading the map...'));
        p.appendChild(wait);
        R.Map.load(function (ok) {
          wait.remove();
          if (!ok) { p.appendChild(el('div', 'rx-s', L('地図データを読み込めませんでした。', 'Could not load the map data.'))); p.appendChild(list([item(L('戻る', 'Back'), '', back, { icon: 'back' })])); return; }
          var PL = R.worldPlaces();
          var row = el('div', 'rx-row');
          var mc = el('canvas', 'rx-map'); mc.width = 900; mc.height = 560;
          var conv = null;
          function label(k) { return t(R.NODES[k].name); }
          function drawBig() {
            var rt = null;
            if (dest && PL[dest] && PL[start]) { var r2 = R.Map.route(PL[start].node, PL[dest].node); rt = r2 ? r2.hs : null; }
            conv = R.Map.drawMap(mc, view, { places: PL, sel: start, dest: dest, route: rt, label: label });
          }
          drawBig();
          var drag = null;
          mc.addEventListener('mousedown', function (e) { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false }; });
          window.addEventListener('mouseup', function () { setTimeout(function () { drag = null; }, 0); });
          mc.addEventListener('mousemove', function (e) {
            if (!drag) return;
            var r = mc.getBoundingClientRect(), k = mc.width / r.width;
            var dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
            if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
            view.cx = drag.cx - dx / view.scale; view.cz = drag.cz - dy / view.scale; drawBig();
          });
          mc.addEventListener('wheel', function (e) { e.preventDefault(); view.scale = clamp(view.scale * (e.deltaY < 0 ? 1.25 : 0.8), 0.006, 0.6); drawBig(); }, { passive: false });
          mc.addEventListener('click', function (e) {
            if (drag && drag.moved) return;
            var r = mc.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * mc.width, my = (e.clientY - r.top) / r.height * mc.height;
            var best = null, bd = 16;
            Object.keys(PL).forEach(function (k) { var q = conv.toScreen(PL[k].x, PL[k].z), d = Math.hypot(q[0] - mx, q[1] - my); if (d < bd) { bd = d; best = k; } });
            if (!best) return;
            if (pickMode === 'dest' && !job) dest = best === start ? null : best; else start = best;
            sfx('click'); drawBig(); refresh();
          });
          row.appendChild(mc);
          var info = el('div', 'rx-info');
          info.appendChild(el('div', 'rx-s', L('交差点で曲がるときは Q（左）／ E（右）でウインカーを出します。出していなければ直進。ナビの矢印（← → ↑）に従うと目的地へ。↓を押し続けると停止後バック、R で U ターン。地図はドラッグで移動・ホイールで拡大。',
                                                 'At junctions signal with Q (left) / E (right); no signal = straight. Follow the nav arrows. Hold ↓ after stopping to reverse, R to U-turn. Drag / wheel the map.')));
          if (job === 'taxi') info.appendChild(el('div', 'rx-s', L('タクシーの車で走ります。', 'You drive the company taxi.')));
          var keys = Object.keys(PL);
          var rows = [];
          function refresh() { rows.forEach(function (f) { f(); }); }
          var r1 = optRow(L('出発地', 'Start'), function () { return label(start); }, function (d) { start = keys[(keys.indexOf(start) + d + keys.length) % keys.length]; view.cx = PL[start].x; view.cz = PL[start].z; drawBig(); });
          info.appendChild(r1);
          if (!job) {
            info.appendChild(optRow(L('目的地', 'Destination'), function () { return dest ? label(dest) : L('なし（自由に走る）', 'none (free roam)'); }, function (d) {
              var ks = [null].concat(keys.filter(function (k) { return k !== start; }));
              dest = ks[(ks.indexOf(dest) + d + ks.length) % ks.length]; drawBig();
            }));
            info.appendChild(optRow(L('地図のクリック', 'Map click sets'), function () { return pickMode === 'start' ? L('出発地', 'start') : L('目的地', 'destination'); }, function () { pickMode = pickMode === 'start' ? 'dest' : 'start'; }));
          }
          info.appendChild(optRow(L('地図の範囲', 'Map zoom'), function () { return view.scale < 0.012 ? L('全域', 'whole city') : view.scale < 0.05 ? L('市街地', 'urban') : L('中心部', 'centre'); }, function (d) {
            var zs = [0.009, 0.034, 0.12], i = zs.findIndex(function (z) { return z >= view.scale - 1e-4; });
            view.scale = zs[clamp((i < 0 ? 2 : i) + d, 0, 2)];
            if (view.scale === 0.009) { view.cx = 3000; view.cz = -27000; } else if (PL[start]) { view.cx = PL[start].x; view.cz = PL[start].z; }
            drawBig();
          }));
          info.appendChild(item(L('出発する', 'Go'), '', function () { runWorld(job, start, dest); }, { icon: 'car', cls: 'accent' }));
          info.appendChild(item(L('戻る', 'Back'), '', function () { back(); }, { icon: 'back' }));
          row.appendChild(info);
          p.appendChild(row);
          p.appendChild(hint());
          app.sel = 0; highlight();
        });
      } };
    };

    SCREENS.jobs = function () {
      return { build: function (o) {
        var s = R.load();
        var p = panel(L('アルバイト', 'Part-time Jobs'), L('完了 ', 'Done ') + (s.stats.jobs || 0) + L(' 件　累計 ', '  total ') + yen(s.stats.earned || 0));
        p.appendChild(list(Object.keys(R.JOBS).map(function (k) {
          var j = R.JOBS[k];
          return item(t(j.name), t(j.desc), function () { go(SCREENS.world(k)); }, { icon: j.icon });
        }).concat([item(L('戻る', 'Back'), '', back, { icon: 'back' })])));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };

    function runWorld(job, start, dest) {
      R.Map.load(function (ok) {
        if (!ok) return;
        var w = World({ job: job, start: start, dest: dest });
        app.cmd = job ? 'job ' + job + ' ' + start : 'world ' + start;
        run({ make: function () { return w.first(); }, chain: w.next, world: w });
      });
    }

    /* ---------- グランプリ ---------- */
    SCREENS.gp = function () {
      return { build: function (o) {
        var s = R.load();
        var p = panel(L('グランプリ', 'Grand Prix'), L('上位 3 位でメダル。次のカップが開きます', 'Top 3 wins a medal and unlocks the next cup'));
        p.appendChild(list(R.CUPS.map(function (c) {
          var un = R.cupUnlocked(s, c), m = s.cups[c.id];
          return item(t(c.name), c.tracks.map(trackName).join(' / '), function () { go(SCREENS.cup(c.id)); },
                      { icon: un ? 'trophy' : 'lock', dis: !un, right: m ? t(R.MEDALS[m]) : '' });
        }).concat([item(L('戻る', 'Back'), '', back, { icon: 'back' })])));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    SCREENS.cup = function (cupId) {
      var cup = R.CUPS.filter(function (c) { return c.id === cupId; })[0];
      return { build: function (o) {
        var p = panel(t(cup.name), L('全 ' + cup.tracks.length + ' 戦・ポイント制', cup.tracks.length + ' rounds, points'));
        var row = el('div', 'rx-thumbs');
        cup.tracks.forEach(function (id, i) {
          var c = el('div', 'rx-thumb'); c.appendChild(preview(id, 200, 112)); c.appendChild(el('div', 'rx-s', (i + 1) + '. ' + trackName(id))); row.appendChild(c);
        });
        p.appendChild(row);
        p.appendChild(el('div', 'rx-s', L('ポイント: ', 'Points: ') + R.POINTS.join('-') + L('　優勝ボーナス ', '  winner bonus ') + yen(cup.bonus[0])));
        p.appendChild(list([item(L('開幕！', 'Start the cup'), '', function () { runCup(Cup(cupId)); }, { icon: 'flag', cls: 'accent' }),
                            item(L('戻る', 'Back'), '', back, { icon: 'back' })], 2));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    function runCup(st) {
      app.cmd = 'gp ' + st.cup.id;
      run({
        make: st.cfg,
        onResult: st.result,
        buttons: function () {
          var tbl = function () { return standingsLines(st); };
          if (st.over()) return [{ label: L('最終結果へ', 'Final standings'), on: function () { cupEnd(st); } }];
          return [{ label: L('次のレースへ（第 ' + (st.idx + 1) + ' 戦）', 'Next race (round ' + (st.idx + 1) + ')'), on: function () { runCup(st); } }];
        },
        extra: function () { return standingsLines(st); }
      });
    }
    function standingsLines(st) {
      return st.table().map(function (e, i) { return (i + 1) + '. ' + (e.n === 'YOU' ? L('あなた', 'YOU') : e.n) + '  ' + e.p + 'pt'; });
    }
    function cupEnd(st) {
      var f = st.finish();
      app.mode = 'menu'; app.sess = null;
      over.classList.remove('hidden'); over.innerHTML = '';
      var p = panel(t(st.cup.name) + L(' 最終結果', ' — final'), '');
      p.appendChild(el('div', 'rx-big', f.pos === 1 ? L('総合優勝！', 'CHAMPION!') : f.pos <= 3 ? L('総合 ' + f.pos + ' 位', 'Overall P' + f.pos) : L('総合 ' + f.pos + ' 位', 'Overall P' + f.pos)));
      var tb = el('div', 'rx-table');
      st.table().forEach(function (e, i) { var d = el('div', 'rx-tr' + (e.n === 'YOU' ? ' me' : '')); d.appendChild(el('span', '', (i + 1) + '. ' + (e.n === 'YOU' ? L('あなた', 'YOU') : e.n))); d.appendChild(el('span', '', e.p + ' pt')); tb.appendChild(d); });
      p.appendChild(tb);
      if (f.bonus) p.appendChild(el('div', 'rx-s', L('ボーナス +', 'Bonus +') + yen(f.bonus)));
      p.appendChild(list([item(L('グランプリへ', 'Back to Grand Prix'), '', function () { app.stack = app.stack.slice(0, 2); show(app.stack[1]); }, { icon: 'back' })]));
      o_focus();
      function o_focus() { over.appendChild(p); app.sel = 0; highlight(); }
      if (f.pos === 1) sfx('win');
    }

    /* ---------- クイックレース ---------- */
    var quickOpt = { track: 'coast', laps: 2, level: null, weather: 'auto', mirror: false, rivals: 7 };
    var CATS = [
      { k: 'all', n: { ja: 'すべて', en: 'All' }, f: function () { return R.ALL_TRACKS; } },
      { k: 'circuit', n: { ja: '実在のサーキット', en: 'Real circuits' }, f: function () { return R.REAL_CIRCUITS; } },
      { k: 'touge', n: { ja: '実在の峠', en: 'Real mountain passes' }, f: function () { return R.REAL_TOUGE; } },
      { k: 'hm', n: { ja: '浜松の公道', en: 'Hamamatsu public roads' }, f: function () { return R.REAL_ROADS; } },
      { k: 'fic', n: { ja: 'オリジナル', en: 'Original tracks' }, f: function () { return R.ALL_TRACKS.filter(function (id) { return !R.TRACKS[id].real; }); } }
    ];
    SCREENS.quick = function (casual, cat) {
      if (cat) quickOpt.cat = cat;
      var C = CATS.filter(function (c) { return c.k === (quickOpt.cat || 'all'); })[0] || CATS[0];
      var tracks = C.f();
      if (tracks.indexOf(quickOpt.track) < 0) quickOpt.track = tracks[0];
      return { build: function (o) {
        var s = R.load();
        if (!quickOpt.level) quickOpt.level = s.level;
        var p = panel(casual ? L('パーティレース', 'Party Race') : L('クイックレース', 'Quick Race'), casual ? t(R.CASUAL.party.desc) : L('コース・周回・天気を選んで走る', 'Choose track, laps and weather'));
        var row = el('div', 'rx-row');
        var pv = el('div', 'rx-pv');
        function drawPv() {
          if (R.needsMap(quickOpt.track) && !R.Map.ready) { pv.innerHTML = ''; pv.appendChild(el('div', 'rx-s', L('地図を読み込み中…', 'Loading map...'))); R.Map.load(drawPv); return; }
          pv.innerHTML = ''; pv.appendChild(preview(quickOpt.track, 400, 225, quickOpt.weather === 'auto' ? null : quickOpt.weather, quickOpt.mirror));
          var tr0 = R.TRACKS[quickOpt.track];
          pv.appendChild(el('div', 'rx-s', (tr0.region ? '【' + tr0.region + '】' : '') + t(tr0.desc)));
        }
        drawPv();
        row.appendChild(pv);
        var col = el('div', 'rx-info');
        var W2 = ['auto'].concat(Object.keys(R.WEATHERS));
        col.appendChild(optRow(L('区分', 'Category'), function () { return t(C.n); }, function (d) {
          var i2 = CATS.indexOf(C); C = CATS[(i2 + d + CATS.length) % CATS.length]; quickOpt.cat = C.k; tracks = C.f(); quickOpt.track = tracks[0]; drawPv();
        }));
        col.appendChild(optRow(L('コース', 'Track'), function () { var tr = R.TRACKS[quickOpt.track]; return trackName(quickOpt.track) + ' ' + '★'.repeat(tr.diff); }, function (d) {
          quickOpt.track = tracks[(tracks.indexOf(quickOpt.track) + d + tracks.length) % tracks.length]; drawPv();
        }));
        col.appendChild(optRow(L('周回', 'Laps'), function () { return isTouge(quickOpt.track) ? L('1（峠は一本勝負）', '1 (point to point)') : String(quickOpt.laps); }, function (d) { quickOpt.laps = clamp(quickOpt.laps + d, 1, 9); }));
        col.appendChild(optRow(L('難易度', 'Level'), function () { return t(R.LEVEL_NAMES[quickOpt.level]); }, function (d) { var ks = ['easy', 'normal', 'hard']; quickOpt.level = ks[(ks.indexOf(quickOpt.level) + d + 3) % 3]; }));
        col.appendChild(optRow(L('天気', 'Weather'), function () { return quickOpt.weather === 'auto' ? L('コース標準', 'Track default') : t(R.WEATHERS[quickOpt.weather]); }, function (d) { quickOpt.weather = W2[(W2.indexOf(quickOpt.weather) + d + W2.length) % W2.length]; drawPv(); }));
        col.appendChild(optRow(L('ミラー（左右反転）', 'Mirror'), function () { return quickOpt.mirror ? 'ON' : 'OFF'; }, function () { quickOpt.mirror = !quickOpt.mirror; drawPv(); }));
        col.appendChild(optRow(L('ライバル', 'Rivals'), function () { return quickOpt.rivals + L(' 台', ''); }, function (d) { quickOpt.rivals = clamp(quickOpt.rivals + d, 1, 7); }));
        col.appendChild(item(L('車: ', 'Car: ') + t(R.car(s.car).name), L('ガレージで変える', 'Change in garage'), function () { go(SCREENS.garage()); }, { icon: 'wrench' }));
        col.appendChild(item(L('スタート', 'Start'), '', function () { runQuick(casual); }, { icon: 'flag', cls: 'accent' }));
        row.appendChild(col);
        p.appendChild(row);
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    function runQuick(casual) {
      var q = { track: quickOpt.track, laps: quickOpt.laps, level: quickOpt.level, weather: quickOpt.weather, mirror: quickOpt.mirror };
      app.cmd = (casual ? 'party ' : 'quick ') + q.track + ' ' + q.laps + ' ' + q.level + ' ' + q.weather + (q.mirror ? ' mirror' : '');
      var pool = isTouge(q.track) ? R.TOUGE_DRIVERS : R.DRIVERS;
      run({
        make: function () { return baseCfg({ track: q.track, laps: q.laps, level: q.level, weather: q.weather, mirror: q.mirror, casual: casual,
                                             field: R.makeField(Math.min(quickOpt.rivals, pool.length), carPace(), pool) }); },
        onResult: function (r) { return applyResult({ kind: casual ? 'party' : 'quick', track: q.track, mirror: q.mirror, level: q.level }, r); }
      });
    }

    /* ---------- 峠バトル ---------- */
    var tougeOpt = { track: 'akimine', rival: 0 };
    SCREENS.touge = function () {
      return { build: function (o) {
        var s = R.load();
        var p = panel(L('峠バトル', 'Touge Battle'), t(R.MODES.touge.desc));
        var row = el('div', 'rx-row');
        var pv = el('div', 'rx-pv');
        function drawPv() { pv.innerHTML = ''; pv.appendChild(preview(tougeOpt.track, 400, 225)); pv.appendChild(el('div', 'rx-s', t(R.TRACKS[tougeOpt.track].desc))); }
        drawPv();
        row.appendChild(pv);
        var col = el('div', 'rx-info');
        col.appendChild(optRow(L('峠', 'Pass'), function () { return trackName(tougeOpt.track); }, function (d) { var a = R.TOUGE; tougeOpt.track = a[(a.indexOf(tougeOpt.track) + d + a.length) % a.length]; drawPv(); }));
        col.appendChild(optRow(L('相手', 'Rival'), function () { var r = R.TOUGE_DRIVERS[tougeOpt.rival]; return r.name + '（' + t(R.car({ fc: 'fc', fd: 'fd', r32: 'r32', s13: 's13', evo: 'evo', gc8: 'gc8' }[r.body]).name) + '）'; },
                                function (d) { tougeOpt.rival = (tougeOpt.rival + d + R.TOUGE_DRIVERS.length) % R.TOUGE_DRIVERS.length; }));
        col.appendChild(el('div', 'rx-s', L('峠の勝利数 ', 'Touge wins ') + (s.stats.touge || 0) + L('　ベスト ', '  best ') + fmt(s.laps[tougeOpt.track])));
        col.appendChild(item(L('車: ', 'Car: ') + t(R.car(s.car).name), L('おすすめ: AE86・FC・FD・ZN8', 'Try AE86, FC, FD, ZN8'), function () { go(SCREENS.garage()); }, { icon: 'wrench' }));
        col.appendChild(item(L('バトル開始', 'Battle!'), '', function () { runTouge(); }, { icon: 'mountain', cls: 'accent' }));
        col.appendChild(item(L('タイムアタック（この峠）', 'Time attack this pass'), '', function () { runSingle('time', tougeOpt.track); }, { icon: 'stopwatch' }));
        row.appendChild(col);
        p.appendChild(row);
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    function runTouge() {
      var tr = tougeOpt.track, d = R.TOUGE_DRIVERS[tougeOpt.rival];
      app.cmd = 'touge ' + tr + ' ' + d.name.toLowerCase();
      run({
        make: function () { return baseCfg({ track: tr, mode: 'touge', field: [{ name: d.name, color: d.color, body: d.body, ai: d.ai, skill: 0.95, pace: Math.max(0.86, carPace()) }] }); },
        onResult: function (r) { return applyResult({ kind: 'touge', track: tr }, r); }
      });
    }

    /* ---------- コースを選ぶ（タイムアタック・チャレンジ） ---------- */
    SCREENS.trackPick = function (mode, extra) {
      var tracks = mode === 'time' ? R.ALL_TRACKS : mode === 'sp' ? ['tomei', 'highway', 'desert', 'city', 'nagoya'] : loopTracks();
      return { build: function (o) {
        var s = R.load();
        var p = panel(t((R.MODES[mode] || R.CASUAL[mode]).name), t((R.MODES[mode] || R.CASUAL[mode]).desc || { ja: '', en: '' }));
        p.appendChild(list(tracks.map(function (id) {
          var best = s.laps[id];
          return item(trackName(id), '★'.repeat(R.TRACKS[id].diff) + (R.TRACKS[id].touge ? L('　峠', '  pass') : '') + (mode === 'time' && R.loadGhost(id) ? L('　ゴーストあり', '  ghost') : ''),
                      function () { runSingle(mode, id, extra); }, { right: best ? fmt(best) : '' });
        }), 3));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };

    function runSingle(mode, track, extra) {
      extra = extra || {};
      app.cmd = mode + ' ' + track + (extra.boss ? ' ' + extra.boss : '');
      var kind = mode === 'time' ? 'time' : mode === 'party' ? 'party' : 'challenge';
      run({
        make: function () {
          var field = [];
          var cp = carPace();
          if (mode === 'elim') field = R.makeField(5, cp);
          if (mode === 'duel') field = [extra.boss ? R.boss(extra.boss, Math.max(cp, 0.9)) : { name: 'MONO', color: '#eee', body: 'formula', ai: 'technician', skill: 1, pace: cp }];
          if (mode === 'chase') field = [R.boss('phantom', 0.88)];
          if (mode === 'sp') field = [R.boss(pick(['yoiyami', 'tekkamen', 'root', 'hayate2']), Math.max(cp, 0.9))];
          if (mode === 'party') field = R.makeField(7, cp);
          return baseCfg({ track: track, mode: mode === 'party' ? 'race' : mode, field: field, carId: mode === 'chase' ? 'police' : null, casual: mode === 'party' });
        },
        onResult: function (r) { return applyResult({ kind: kind, track: track }, r); }
      });
    }

    SCREENS.challenges = function () {
      return { build: function (o) {
        var s = R.load();
        var p = panel(L('チャレンジ', 'Challenges'), '');
        var items = ['elim', 'duel', 'sp', 'arcade', 'chase', 'traffic'].map(function (m) {
          return item(t(R.MODES[m].name), t(R.MODES[m].desc), function () {
            if (m === 'duel') go(SCREENS.duel()); else go(SCREENS.trackPick(m));
          }, { icon: { elim: 'skull', duel: 'swords', sp: 'moon', arcade: 'timer', chase: 'police', traffic: 'road' }[m] });
        });
        items.push(item(L('戻る', 'Back'), '', back, { icon: 'back' }));
        p.appendChild(list(items));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    SCREENS.duel = function () {
      return { build: function (o) {
        var s = R.load();
        var p = panel(L('デュエル — 相手を選ぶ', 'Duel — pick a rival'), L('ストーリーで倒したボスと再戦できます', 'Rematch bosses you beat in the story'));
        var items = Object.keys(R.BOSSES).filter(function (k) { return k !== 'phantom'; }).map(function (k) {
          var ok = !!s.bosses[k];
          return item(R.BOSSES[k].name, ok ? L('撃破済み', 'defeated') : L('ストーリーで倒すと開放', 'beat in story to unlock'), function () { go(SCREENS.trackPick('duel', { boss: k })); }, { icon: ok ? 'swords' : 'lock', dis: !ok });
        });
        items.unshift(item('MONO', L('フォーミュラの腕利き（いつでも）', 'Formula ace (always available)'), function () { go(SCREENS.trackPick('duel')); }, { icon: 'swords' }));
        items.push(item(L('戻る', 'Back'), '', back, { icon: 'back' }));
        p.appendChild(list(items, 2));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };

    /* ---------- ミニゲーム・カジュアル ---------- */
    SCREENS.minis = function () {
      return { build: function (o) {
        var s = R.load();
        var p = panel(L('ミニゲーム', 'Mini Games'), '');
        var items = Object.keys(R.MINIS).map(function (k) {
          var b = s.mini[k];
          return item(t(R.MINIS[k].name), t(R.MINIS[k].desc), function () { runMini(k); },
                      { icon: { gymkhana: 'diamond', drag: 'signal', brake: 'stop' }[k], right: b !== undefined ? (k === 'brake' ? b + L('点', 'pt') : fmt(b)) : '' });
        });
        items.push(item(L('戻る', 'Back'), '', back, { icon: 'back' }));
        p.appendChild(list(items));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    SCREENS.casual = function () {
      return { build: function (o) {
        var s = R.load();
        var p = panel(L('カジュアル', 'Casual'), L('本格志向ではないお楽しみ枠。ここだけコインと加速パネルが出ます', 'Just for fun — the only place with coins and boost pads'));
        p.appendChild(list([
          item(t(R.CASUAL.party.name), t(R.CASUAL.party.desc), function () { go(SCREENS.quick(true)); }, { icon: 'party' }),
          item(t(R.CASUAL.coins.name), t(R.CASUAL.coins.desc), function () { runMini('coins'); }, { icon: 'coin', right: s.mini.coins !== undefined ? s.mini.coins + L(' 枚', '') : '' }),
          item(L('戻る', 'Back'), '', back, { icon: 'back' })
        ]));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    function runMini(kind) {
      app.cmd = 'mini ' + kind;
      run({ make: function () { return miniCfg(kind); },
            onResult: function (r) { return applyResult({ kind: 'mini', track: kind === 'coins' ? 'hamamatsu' : MINI_SPEC[kind] }, r); } });
    }

    /* ---------- ガレージ ---------- */
    var garageSel = null;
    SCREENS.garage = function () {
      return { build: function (o) {
        var s = R.load();
        if (!garageSel) garageSel = s.car;
        var p = panel(L('ガレージ', 'Garage'), s.owned.length + ' / ' + R.CARS.length + L(' 台', ' cars'));
        var row = el('div', 'rx-row garage');
        var lst = el('div', 'rx-list rx-cars');
        var detail = el('div', 'rx-detail');
        var carCv = el('canvas', 'rx-carcv'); carCv.width = 360; carCv.height = 200;
        function showCar(id) {
          garageSel = id;
          var car = R.car(id), s2 = R.load(), own = R.ownedCar(s2, id), locked = R.carLocked(s2, car);
          detail.innerHTML = '';
          detail.appendChild(carCv);
          R.drawCarCard(carCv, car.body, R.carColor(s2, car));
          detail.appendChild(el('div', 'rx-cname', t(car.name) + '　[' + car.cls + ']' + (car.fun ? L('　お遊び', '  fun') : '')));
          detail.appendChild(el('div', 'rx-s', t(car.desc)));
          detail.appendChild(statBars(R.effStats(car, s2.upg[id])));
          detail.appendChild(el('div', 'rx-s', L('エンジン: ', 'Engine: ') + R.soundName(car.body)));
          var acts = el('div', 'rx-acts');
          function act(label, on, dis) { var b = el('button', 'rx-btn', label); b.type = 'button'; if (dis) b.disabled = true; b.addEventListener('click', function (e) { e.stopPropagation(); on(); }); acts.appendChild(b); }
          act(L('♪ エンジン音を聞く', '♪ Hear the engine'), function () {
            var au = R.carAudio(car.body), t0 = performance.now();
            (function f() {
              var e = (performance.now() - t0) / 1000;
              au.update({ speed: 0, throttle: e < 0.5 || (e > 1.1 && e < 1.7) || (e > 2.1 && e < 2.4) });
              if (e < 3.4) requestAnimationFrame(f); else au.stop();
            })();
          });
          if (own) {
            act(s2.car === id ? L('乗車中', 'In use') : L('この車に乗る', 'Drive this'), function () { R.edit(function (x) { x.car = id; }); sfx('coin'); refresh(); }, s2.car === id);
            act(L('色を変える', 'Repaint'), function () { R.edit(function (x) { var i = x.paint[id] === undefined ? car.paint : x.paint[id]; x.paint[id] = (i + 1) % R.PAINTS.length; }); sfx('click'); showCar(id); });
            R.UPGRADES.forEach(function (u) {
              var lv = (s2.upg[id] || {})[u.id] || 0, cost = lv < 3 ? R.upgCost(car, lv) : 0;
              act(t(u.name) + ' ' + '■'.repeat(lv) + '□'.repeat(3 - lv) + (lv < 3 ? '  ' + yen(cost) : ''), function () {
                var ok = R.edit(function (x) { if (x.money < cost) return false; x.money -= cost; x.upg[id] = x.upg[id] || {}; x.upg[id][u.id] = lv + 1; return true; });
                sfx(ok ? 'coin' : 'bad'); refresh();
              }, lv >= 3 || s2.money < cost);
            });
          } else if (locked) {
            act(L('ストーリー・アルバイトで入手', 'Earned through story / jobs'), function () {}, true);
          } else {
            act(L('購入 ', 'Buy ') + yen(car.price), function () {
              var ok = R.edit(function (x) { if (x.money < car.price) return false; x.money -= car.price; x.owned.push(id); x.car = id; return true; });
              sfx(ok ? 'win' : 'bad'); refresh();
            }, s2.money < car.price);
          }
          detail.appendChild(acts);
        }
        var selIdx = 0, fi = 0;
        // グループ分け: 通常 / ストーリー / ローポリ / 高品質リアル
        var GROUPS = [
          [L('通常の車両', 'Standard'), function (c) { return !c.lowpoly && !c.real && !c.era; }],
          [L('ストーリーの車両', 'Story cars'), function (c) { return !!c.era; }],
          [L('ローポリ', 'Low-poly'), function (c) { return !!c.lowpoly; }],
          [L('高品質リアル（外部モデル）', 'High-detail (external models)'), function (c) { return !!c.real; }]
        ];
        var ordered = [];
        GROUPS.forEach(function (gp) { var cs = R.CARS.filter(gp[1]); if (cs.length) ordered.push({ head: gp[0] }); ordered = ordered.concat(cs); });
        ordered.forEach(function (car) {
          if (car.head) { lst.appendChild(el('div', 'rx-sec', car.head)); return; }
          var i = fi++;
          var own = R.ownedCar(s, car.id), locked = R.carLocked(s, car);
          if (car.id === garageSel) selIdx = i;
          lst.appendChild(item((s.car === car.id ? '▶ ' : '') + t(car.name), '[' + car.cls + '] ' + (own ? L('所有', 'owned') : locked ? L('未開放', 'locked') : yen(car.price)),
                               function () { showCar(car.id); var f = detail.querySelector('.rx-btn:not([disabled])'); if (f) f.focus(); },
                               { icon: own ? 'car' : locked ? 'lock' : 'tag', focus: function () { showCar(car.id); } }));
        });
        row.appendChild(lst); row.appendChild(detail);
        p.appendChild(row);
        p.appendChild(hint(L('↑↓ 車を選ぶ　ボタンはクリック　Esc 戻る', '↑↓ pick a car  click buttons  Esc back')));
        o.appendChild(p);
        this.sel = selIdx;
        showCar(garageSel);
      }, sel: 0 };
    };

    /* ---------- 記録・設定 ---------- */
    /* ---------- デイリーレース ---------- */
    SCREENS.daily = function () {
      return { build: function (o) {
        var s = R.load(), key = R.today(), sp = R.dailySpec(key), d = s.daily || {};
        var p = panel(L('デイリーレース', 'Daily Race'), L('日付で決まる全員共通のコース。表彰台で連続日数とボーナス', 'Same track for everyone each day. Podium for a streak and bonus'));
        var row = el('div', 'rx-row');
        var pv = el('div', 'rx-pv');
        function drawPv() {
          if (R.needsMap(sp.track) && !R.Map.ready) { pv.innerHTML = ''; pv.appendChild(el('div', 'rx-s', L('地図を読み込み中…', 'Loading map...'))); R.Map.load(drawPv); return; }
          pv.innerHTML = ''; pv.appendChild(preview(sp.track, 400, 225, sp.weather === 'auto' ? null : sp.weather, sp.mirror));
        }
        drawPv();
        row.appendChild(pv);
        var col = el('div', 'rx-info');
        var tb = el('div', 'rx-table cols');
        [[L('日付', 'Date'), String(key).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')],
         [L('コース', 'Track'), trackName(sp.track)],
         [L('周回', 'Laps'), sp.laps + (sp.mirror ? L('（ミラー）', ' (mirror)') : '')],
         [L('天気', 'Weather'), sp.weather === 'auto' ? L('コース標準', 'Track default') : t(R.WEATHERS[sp.weather])],
         [L('難易度', 'Level'), t(R.LEVEL_NAMES[sp.level])],
         [L('ライバル', 'Rivals'), sp.rivals + L(' 台', '')],
         [L('連続日数', 'Streak'), (d.last === key || d.last === R.yesterday() ? d.streak : 0) + L(' 日（最高 ', 'd (best ') + (d.best || 0) + ')'],
         [L('今日', 'Today'), d.last === key ? L('達成済み', 'Done') : L('未達成（3 位以内でボーナス）', 'Not yet (top 3 for bonus)')]
        ].forEach(function (kv) { var r2 = el('div', 'rx-tr'); r2.appendChild(el('span', '', kv[0])); r2.appendChild(el('span', '', kv[1])); tb.appendChild(r2); });
        col.appendChild(tb);
        col.appendChild(item(L('車: ', 'Car: ') + t(R.car(s.car).name), L('ガレージで変える', 'Change in garage'), function () { go(SCREENS.garage()); }, { icon: 'wrench' }));
        col.appendChild(item(L('スタート', 'Start'), '', function () { runDaily(); }, { icon: 'flag', cls: 'accent' }));
        col.appendChild(item(L('戻る', 'Back'), '', back, { icon: 'back' }));
        row.appendChild(col);
        p.appendChild(row);
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    function runDaily() {
      var sp = R.dailySpec(R.today());
      app.cmd = 'daily';
      var pool = R.DRIVERS;
      run({
        make: function () { return baseCfg({ track: sp.track, laps: sp.laps, level: sp.level, weather: sp.weather, mirror: sp.mirror,
                                             field: R.makeField(Math.min(sp.rivals, pool.length), carPace(), pool) }); },
        onResult: function (r) { return applyResult({ kind: 'daily', track: sp.track, mirror: sp.mirror, level: sp.level }, r); }
      });
    }

    /* ---------- 実績 ---------- */
    SCREENS.achievements = function () {
      return { build: function (o) {
        var fresh = R.edit(function (s) { return R.checkAch(s); });
        if (fresh.length) sfx('coin');
        var s = R.load(), have = Object.keys(s.ach || {}).length;
        var p = panel(L('実績', 'Achievements'), have + ' / ' + R.ACHIEVEMENTS.length + (fresh.length ? L('　新しく ', '  ') + fresh.length + L(' 個解除！', ' unlocked!') : ''));
        var tb = el('div', 'rx-table');
        R.ACHIEVEMENTS.forEach(function (a) {
          var on = !!s.ach[a.id], r2 = el('div', 'rx-tr');
          var r2n = el('span', ''); r2n.appendChild(R.iconNode(on ? a.icon : 'lock', 18)); r2n.appendChild(document.createTextNode(' ' + t(a.name))); r2.appendChild(r2n);
          r2.appendChild(el('span', '', t(a.desc) + (a.reward ? '　' + (on ? '済　' : '+') + yen(a.reward) : (on ? '　済' : ''))));
          if (!on) r2.style.opacity = '.6';
          tb.appendChild(r2);
        });
        p.appendChild(tb);
        p.appendChild(list([item(L('戻る', 'Back'), '', back, { icon: 'back' })]));
        o.appendChild(p);
      } };
    };

    SCREENS.album = function () {
      return { isAlbum: true, build: function (o) {
        var M = R.Music, A = M && M.album;
        var p = panel(L('アルバム', 'Album'), L('曲を選ぶと流れます。一曲が終わると次の曲へ進みます。', 'Pick a song. It moves on to the next one when it ends.'));
        if (!A) { p.appendChild(el('div', 'rx-s', L('音楽が使えません。', 'Music is unavailable.'))); p.appendChild(list([item(L('戻る', 'Back'), '', back, { icon: 'back' })])); o.appendChild(p); return; }
        var s0 = R.load(), muted = (s0.bgm !== undefined && s0.bgm <= 0) || TB.store.get('sound', '1') !== '1';
        if (muted) p.appendChild(el('div', 'rx-s', L('いまは音が切れています（設定の「効果音」と「BGM の音量」を上げてください）。', 'Sound is off. Turn on Sound and raise the BGM volume in Settings.')));
        var now = el('div', 'rx-big', '');
        p.appendChild(now);
        var ctrl = el('div', 'rx-row');
        function refreshNow() {
          var t = A.tracks[A.idx];
          now.textContent = A.active ? L('再生中: ', 'Now playing: ') + t.name : L('停止中', 'Stopped');
          Array.prototype.forEach.call(rows, function (r, i) { r.classList.toggle('playing', A.active && i === A.idx); });
        }
        var rows = [];
        var lst = el('div', 'rx-list');
        A.tracks.forEach(function (tr, i) {
          var mm = Math.floor(tr.secs / 60), ss = String(tr.secs % 60).padStart(2, '0');
          var it = item((i + 1) + '. ' + tr.name, tr.desc, function () { A.play(i); refreshNow(); }, { icon: 'sound', right: mm + ':' + ss });
          rows.push(it); lst.appendChild(it);
        });
        p.appendChild(lst);
        var rep = { all: L('全曲をくり返す', 'Repeat all'), one: L('この曲をくり返す', 'Repeat one'), none: L('くり返さない', 'No repeat') };
        var bar = list([
          item(L('前の曲', 'Previous'), '', function () { A.prev(); refreshNow(); }, { icon: 'back' }),
          item(L('停止', 'Stop'), '', function () { A.stop(); refreshNow(); }, { icon: 'stop' }),
          item(L('次の曲', 'Next'), '', function () { A.next(); refreshNow(); }, { icon: 'skip' }),
          item(L('くり返し: ', 'Repeat: ') + rep[A.repeat], '', function () { A.setRepeat(A.repeat === 'all' ? 'one' : A.repeat === 'one' ? 'none' : 'all'); refresh(); }, { icon: 'loop' }),
          item(L('戻る', 'Back'), '', function () { A.stop(); back(); }, { icon: 'back' })
        ], 5);
        p.appendChild(bar);
        o.appendChild(p);
        A.onChange = function () { if (app.curScreen && app.curScreen.isAlbum && !app.closed) refreshNow(); };
        refreshNow();
      } };
    };

    SCREENS.records = function () {
      return { build: function (o) {
        var s = R.load(), st = s.stats;
        var p = panel(L('記録', 'Records'), '');
        var tb = el('div', 'rx-table cols');
        [[L('レース', 'Races'), st.races], [L('優勝', 'Wins'), st.wins], [L('表彰台', 'Podiums'), st.podiums], [L('カップ総合優勝', 'Cup titles'), st.titles],
         [L('峠バトル勝利', 'Touge wins'), st.touge || 0], [L('走行距離', 'Distance'), (st.km || 0).toFixed(1) + ' km'], [L('ニアミス', 'Near misses'), st.near || 0],
         [L('アルバイト', 'Jobs'), (st.jobs || 0) + L(' 件 / ', ' / ') + yen(st.earned || 0)], [L('ストーリー', 'Story'), Math.min(s.story, R.STORY.length) + ' / ' + R.STORY.length],
         [L('実績', 'Achievements'), Object.keys(s.ach || {}).length + ' / ' + R.ACHIEVEMENTS.length],
         [L('デイリー連続（最高）', 'Daily streak (best)'), ((s.daily && s.daily.streak) || 0) + ' (' + ((s.daily && s.daily.best) || 0) + ')'],
         [L('所持金', 'Credits'), yen(s.money)]].forEach(function (kv) { var d = el('div', 'rx-tr'); d.appendChild(el('span', '', kv[0])); d.appendChild(el('span', '', String(kv[1]))); tb.appendChild(d); });
        p.appendChild(tb);
        p.appendChild(el('div', 'rx-sec', L('自己ベスト（ラップ／峠は全区間）', 'Best laps (whole run for passes)')));
        var tb2 = el('div', 'rx-table cols3');
        R.ALL_TRACKS.forEach(function (id) { var d = el('div', 'rx-tr'); d.appendChild(el('span', '', trackName(id))); d.appendChild(el('span', '', fmt(s.laps[id]))); tb2.appendChild(d); });
        p.appendChild(tb2);
        p.appendChild(el('div', 'rx-sec', L('カップ', 'Cups')));
        p.appendChild(el('div', 'rx-s', R.CUPS.map(function (c) { return t(c.name) + ' ' + (s.cups[c.id] ? t(R.MEDALS[s.cups[c.id]]) : '—'); }).join('　')));
        p.appendChild(list([item(L('戻る', 'Back'), '', back, { icon: 'back' })]));
        o.appendChild(p);
      } };
    };
    /* ---------- 管理者モード（保存されない一時設定。スキップ・数値の変更・初期値に戻す） ---------- */
    function stepVal(list, cur, d) {
      var i = list.indexOf(cur); if (i < 0) i = list.reduce(function (b, v, k) { return Math.abs(v - cur) < Math.abs(list[b] - cur) ? k : b; }, 0);
      return list[clamp(i + d, 0, list.length - 1)];
    }
    function buildAdmin(p, rebuild) {
      var A = R.admin, v = A.v;
      p.appendChild(el('div', 'rx-s', L('※ ここでの設定は保存されません。ページを閉じる・再読み込み・「初期値に戻す」で元に戻ります。', 'Nothing here is saved. Reloading or pressing Reset restores the defaults.')));
      p.appendChild(optRow(L('管理者モード', 'Admin mode'), function () { return A.on ? 'ON' : 'OFF'; }, function () { A.on = !A.on; rebuild(); }));
      /* 所持金（管理者モードが ON のときだけ変えられる。こちらはセーブデータに反映される） */
      p.appendChild(el('div', 'rx-sec', L('所持金', 'Money')));
      var MSTEP = [1000, 10000, 100000, 1000000, 10000000];
      A.moneyStep = A.moneyStep || 10000;
      function setMoney(n) { if (!A.on) { sfx('bad'); return; } R.edit(function (s) { s.money = clamp(Math.round(n), 0, 999999999); }); sfx('coin'); rebuild(); }
      p.appendChild(optRow(L('所持金', 'Money'), function () { return yen(R.load().money) + (A.on ? '' : L('（管理者モード ON で変更可）', ' (turn admin ON to edit)')); },
        function (d) { setMoney(R.load().money + d * A.moneyStep); }));
      p.appendChild(optRow(L('増減の単位', 'Step'), function () { return yen(A.moneyStep); }, function (d) { A.moneyStep = stepVal(MSTEP, A.moneyStep, d); }));
      var mrow = el('div', 'rx-row');
      var inp = el('input', 'gg-input'); inp.type = 'number'; inp.min = 0; inp.max = 999999999; inp.placeholder = L('金額を入力', 'Amount'); inp.value = String(R.load().money);
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') setMoney(parseInt(inp.value, 10) || 0); });
      mrow.appendChild(inp); p.appendChild(mrow);
      p.appendChild(list([
        item(L('この金額にする', 'Set to this amount'), '', function () { setMoney(parseInt(inp.value, 10) || 0); }, { icon: 'coin', dis: !A.on }),
        item(L('0 円にする', 'Set to 0'), '', function () { setMoney(0); }, { icon: 'coin', dis: !A.on }),
        item(L('100,000 円にする', 'Set to 100,000'), '', function () { setMoney(100000); }, { icon: 'coin', dis: !A.on }),
        item(L('10,000,000 円にする', 'Set to 10,000,000'), '', function () { setMoney(10000000); }, { icon: 'coin', dis: !A.on })
      ], 2));
      function num(label, key, list, fmtv) {
        p.appendChild(optRow(label, function () { return (fmtv || function (x) { return '× ' + x; })(v[key]); }, function (d) { v[key] = stepVal(list, v[key], d); }));
      }
      function flag(label, key) { p.appendChild(optRow(label, function () { return v[key] ? 'ON' : 'OFF'; }, function () { v[key] = !v[key]; })); }
      num(L('最高速', 'Top speed'), 'speed', [0.5, 0.75, 1, 1.25, 1.5, 2, 3]);
      num(L('加速', 'Acceleration'), 'accel', [0.5, 0.75, 1, 1.25, 1.5, 2, 3]);
      num(L('操作性（ハンドル・グリップ）', 'Handling'), 'grip', [0.5, 0.75, 1, 1.25, 1.5, 2]);
      num(L('ライバルの速さ', 'Rival speed'), 'rival', [0.5, 0.7, 0.85, 1, 1.1, 1.25, 1.5]);
      num(L('一般車の量', 'Traffic'), 'traffic', [0, 0.5, 1, 1.5, 2, 3]);
      num(L('制限時間（アーケード・追跡）', 'Time limit'), 'time', [0.5, 1, 1.5, 2, 3, 5]);
      flag(L('ニトロ無限', 'Infinite nitro'), 'nitro');
      flag(L('無敵（傷つかない）', 'Invincible'), 'god');
      flag(L('自動運転', 'Autopilot'), 'auto');
      p.appendChild(optRow(L('周回数（次のレースから）', 'Laps (next race)'), function () { return v.laps ? v.laps + L(' 周', '') : L('標準', 'default'); }, function (d) { v.laps = clamp(v.laps + d, 0, 9); }));
      var W2 = ['default'].concat(Object.keys(R.WEATHERS));
      p.appendChild(optRow(L('天気（次のレースから）', 'Weather (next race)'), function () { return v.weather === 'default' ? L('標準', 'default') : t(R.WEATHERS[v.weather]); }, function (d) { v.weather = W2[clamp(W2.indexOf(v.weather) + d, 0, W2.length - 1)]; }));
      flag(L('すべての話を開放（ストーリー）', 'Unlock every story scene'), 'unlockAll');
      p.appendChild(item(L('初期値に戻す', 'Reset to defaults'), L('すべての項目をもとの値に（管理者モードも OFF）', 'Every value back to default (admin off)'), function () { A.v = R.adminDefaults(); A.on = false; rebuild(); }, { icon: 'redo' }));
    }
    SCREENS.admin = function () {
      return { build: function (o) {
        var p = panel(L('管理者モード', 'Admin mode'), L('スキップ・数値の変更（保存されません）', 'Skip and tweak values (not saved)'));
        buildAdmin(p, function () { refresh(); });
        p.appendChild(list([item(L('戻る', 'Back'), '', back, { icon: 'back' })]));
        p.appendChild(hint());
        o.appendChild(p);
      } };
    };
    /** レース中に開く管理者パネル（開いている間は一時停止。数値はすぐ反映） */
    function adminOverlay() {
      over.classList.remove('hidden'); over.innerHTML = '';
      var p = panel(L('管理者パネル', 'Admin panel'), L('保存されません', 'Not saved'));
      buildAdmin(p, adminOverlay);
      p.appendChild(list([item(L('レースに戻る', 'Back to the race'), '', pause, { icon: 'back' })]));
      over.appendChild(p);
      app.sel = 0; highlight();
      app.keyHook = function (k) { if (k === 'Escape' || k === 'p' || k === 'P' || k === 'o' || k === 'O' || k === 'F2') { pause(); return true; } return false; };
    }

    SCREENS.settings = function () {
      return { build: function (o) {
        var p = panel(L('設定・遊び方', 'Settings & Help'), '');
        p.appendChild(optRow(L('難易度（標準）', 'Default level'), function () { return t(R.LEVEL_NAMES[R.load().level]); }, function (d) {
          R.edit(function (s) { var ks = ['easy', 'normal', 'hard']; s.level = ks[(ks.indexOf(s.level) + d + 3) % 3]; });
        }));
        p.appendChild(optRow(L('BGM の音量', 'Music volume'), function () { var v = R.load().bgm; v = v === undefined ? 0.6 : v; return v <= 0 ? L('なし', 'off') : Math.round(v * 10) + ' / 10'; },
          function (d) { R.edit(function (s) { var v = s.bgm === undefined ? 0.6 : s.bgm; s.bgm = Math.round(clamp(v + d * 0.1, 0, 1) * 10) / 10; }); if (R.Music) { R.Music.refresh(); if (!R.Music.current) R.Music.play('title'); } }));
        if (R.ENABLE_3D) p.appendChild(optRow(L('描画', 'Renderer'), function () { return R.load().r3d ? L('3D（WebGL・試験版）', '3D (WebGL, beta)') : L('疑似 3D（標準）', 'Pseudo-3D (default)'); },
          function () { R.edit(function (s) { s.r3d = !s.r3d; }); }));
        p.appendChild(optRow(L('ストーリーで峠を使う', 'Use mountain passes in stories'), function () { return R.load().noTouge ? L('使わない（サーキットに置き換え）', 'No (circuits instead)') : L('使う', 'Yes'); },
          function () { R.edit(function (s) { s.noTouge = !s.noTouge; ntFlag = !!s.noTouge; }); R.resetStoryView(); }));
        p.appendChild(optRow(L('効果音', 'Sound'), function () { return TB.store.get('sound', '1') === '1' ? 'ON' : 'OFF'; }, function () { TB.Sfx.set(TB.store.get('sound', '1') !== '1'); }));
        var help = el('div', 'rx-help');
        [L('←→ ハンドル　↑ アクセル　↓ ブレーキ　スペース ニトロ（ゼロヨンではシフトアップ）', '←→ steer  ↑ gas  ↓ brake  space nitro (shift up in drag)'),
         L('v レース中に 3D 表示（WebGL）と疑似 3D を切り替え', 'v toggles 3D (WebGL) / pseudo-3D during a race'),
         L('p / Esc 一時停止　r（止まって）オープンワールドで U ターン', 'p / Esc pause  r (stopped) U-turn in open world'),
         L('前の車の真後ろにつくとスリップストリームで加速し、ニトロも溜まります。', 'Draft right behind a car to gain speed and refill nitro.'),
         L('峠はガードレールで囲まれています。こすると減速。後追いから始まり、150m 引き離せば即勝利。', 'Passes have guardrails. Touge starts from behind; 150m gap wins instantly.'),
         L('雨・雪では滑ります。4WD（オフロード対応）の車は影響が小さめ。', 'Rain and snow reduce grip. AWD cars suffer less.'),
         L('コインや加速パネルは「カジュアル」だけ。ほかのモードは本格仕様です。', 'Coins and boost pads appear only in Casual. Everything else is serious.')].forEach(function (x) { help.appendChild(el('div', '', '・' + x)); });
        p.appendChild(help);
        p.appendChild(list([item(L('戻る', 'Back'), '', back, { icon: 'back' })]));
        o.appendChild(p);
      } };
    };

    /* =================== 走る =================== */

    function run(opts) {
      app.runOpts = opts;
      app.demo = null;
      if (app.sess) app.sess.stop();
      over.innerHTML = ''; over.classList.add('hidden');
      app.mode = 'race'; app.paused = false; app.keyHook = null;
      sizeCanvas();
      var cfg = opts.make();
      if (R.needsMap(cfg.track) && !R.Map.ready) {   // 浜松の公道コースは地図を読んでから
        app.mode = 'loading';
        R.Map.load(function () { if (app.runOpts === opts && !app.closed) { app.mode = 'race'; startRun(cfg, opts); } });
        return;
      }
      startRun(cfg, opts);
    }
    function startRun(cfg, opts) {
      cv.style.filter = cfg.filter || '';
      if (R.Music) R.Music.play(R.Music.forRace(cfg));
      prep(cfg, opts);
      app.sess = R.Session(cfg);
      app.sess.W = cv.width; app.sess.H = cv.height;
      padBox.innerHTML = ''; padBox.appendChild(R.makePad(function () { return app.sess; }));
      if (R.ENABLE_3D && R.load().r3d) attach3D(); else detach3D();
    }

    /* --- 3D 表示（WebGL） --- */
    var cv3 = null;
    function attach3D() {
      if (!app.sess) return;
      if (!R.can3D()) { detach3D(); return; }
      R.load3D(function (ok) {
        if (!ok || !app.sess || app.closed) return;
        var bodyNow = app.sess.cfg.car && app.sess.cfg.car.body;
        if (R.BODIES[bodyNow] && R.BODIES[bodyNow].real && !(TB.RaceRealCars && TB.RaceRealCars[R.BODIES[bodyNow].real])) { R.loadRealCar(bodyNow, function () { attach3D(); }); return; }
        if (!cv3) { cv3 = el('canvas', 'rx-canvas rx-canvas3d'); stage.insertBefore(cv3, cv); }
        cv3.width = cv.width; cv3.height = cv.height;
        cv3.style.filter = (app.sess.cfg && app.sess.cfg.filter) || '';
        try {
          if (!app.r3d) app.r3d = R.Render3D(cv3, app.sess); else app.r3d.rebuild(app.sess);
          app.r3d.resize(cv.width, cv.height);
          app.r3dSess = app.sess;
          cv.classList.add('overlay');
        } catch (e) { console.error(e); detach3D(); }
      });
    }
    function detach3D() {
      if (app.r3d) { try { app.r3d.dispose(); } catch (e) { /* ignore */ } }
      app.r3d = null; app.r3dSess = null;
      if (cv3) { cv3.remove(); cv3 = null; }
      cv.classList.remove('overlay');
    }
    function prep(cfg, opts) {
      cfg.onFinish = function (r) {
        var sum = opts.onResult ? opts.onResult(r) : applyResult({ kind: 'none', track: cfg.track }, r);
        setTimeout(function () { if (app.sess && app.sess.cfg === cfg) results(sum, r, opts); }, 1100);
      };
      if (opts.chain) cfg.onEdgeEnd = function (carry) {
        var nx = opts.chain(carry);
        if (!nx) return;
        setTimeout(function () {
          if (!app.sess || app.mode !== 'race') return;
          var keys = app.sess.keys, old = app.sess;
          old.stop();
          prep(nx, opts);
          app.sess = R.Session(nx);
          app.sess.W = cv.width; app.sess.H = cv.height;
          for (var k in keys) app.sess.keys[k] = keys[k];
          if (app.r3d) { try { app.r3d.rebuild(app.sess); app.r3dSess = app.sess; } catch (e) { detach3D(); } }
        }, 0);
      };
    }
    function results(sum, r, opts) {
      app.mode = 'result';
      if (app.sess) app.sess.releaseKeys();
      padBox.innerHTML = '';
      over.classList.remove('hidden'); over.innerHTML = '';
      var p = panel(sum.title, sum.sub);
      p.classList.add('rx-result');
      var won = sum.success === true || (sum.success == null && r && r.place === 1 && r.reason !== 'eliminated' && r.reason !== 'timeout');
      var lost = sum.success === false || (r && (r.reason === 'eliminated' || r.reason === 'timeout' || r.reason === 'wrecked'));
      if (won || lost) { var st = el('div', 'rx-stamp ' + (won ? 'win' : 'lose'), won ? 'WIN' : 'LOSE'); over.appendChild(st); setTimeout(function () { st.remove(); }, 2600); if (won) sfx('win'); }
      if (R.Music) { if (won || lost) R.Music.jingle(won ? 'win' : 'lose'); else R.Music.stop(); }
      if (sum.success !== null && sum.success !== undefined) p.appendChild(el('div', 'rx-big ' + (sum.success ? 'ok' : 'ng'), sum.success ? L('MISSION CLEAR', 'MISSION CLEAR') : L('MISSION FAILED', 'MISSION FAILED')));
      if (sum.table) {
        var tb = el('div', 'rx-table');
        sum.table.forEach(function (e, i) {
          var d = el('div', 'rx-tr' + (e.you ? ' me' : ''));
          var nm = el('span', ''); var sw = el('i', 'rx-sw'); sw.style.background = e.you ? r && app.sess ? app.sess.cfg.car.color : '#5ccfa0' : e.color || '#888'; nm.appendChild(sw);
          nm.appendChild(document.createTextNode((i + 1) + '. ' + (e.you ? L('あなた', 'YOU') : e.name) + (e.boss ? ' ★' : '')));
          d.appendChild(nm);
          d.appendChild(el('span', '', e.out ? L('脱落', 'OUT') : e.time !== null && e.time !== undefined ? fmt(e.time * 1000) : '—'));
          tb.appendChild(d);
        });
        p.appendChild(tb);
      }
      sum.lines.forEach(function (ln) { p.appendChild(el('div', 'rx-line', ln)); });
      if (opts.extra) { p.appendChild(el('div', 'rx-sec', L('選手権ポイント', 'Standings'))); opts.extra().forEach(function (ln) { p.appendChild(el('div', 'rx-line dim', ln)); }); }
      var btns = opts.buttons ? opts.buttons(sum, r) : [{ label: L('もう一度', 'Race again'), on: function () { run(opts); } }];
      if (!opts.buttons || !btns.some(function (b) { return b.menu; })) btns.push({ label: L('メニューへ', 'Menu'), menu: true, on: toMenu });
      p.appendChild(list(btns.map(function (b) { return item(b.label, '', b.on, { icon: b.menu ? 'back' : 'play' }); }), Math.min(3, btns.length)));
      over.appendChild(p);
      app.sel = 0; highlight();
    }
    function toMenu() {
      detach3D();
      if (app.sess) app.sess.stop();
      app.sess = null; app.mode = 'menu'; padBox.innerHTML = ''; app.paused = false;
      startDemo();
      show(app.stack[app.stack.length - 1]);
    }
    function pause() {
      if (app.mode !== 'race') return;
      app.paused = true; app.sess.paused = true; app.sess.releaseKeys();
      over.classList.remove('hidden'); over.innerHTML = '';
      var p = panel(L('一時停止', 'Paused'), '');
      var w = app.runOpts.world;
      var items = [
        item(L('つづける', 'Resume'), '', resume, { icon: 'play' }),
        !w ? item(L('やり直す', 'Restart'), '', function () { run(app.runOpts); }, { icon: 'redo' }) : null,
        item(L('管理者パネル', 'Admin panel'), L('数値の変更（o キー）', 'Tweak values (o key)'), adminOverlay, { icon: 'tool' }),
        app.runOpts.skip && R.admin && R.admin.on ? item(L('このバトルをスキップ', 'Skip this battle'), L('成功扱い', 'Counts as a win'), function () {
          var o = app.runOpts, r = o.skip(), sum = o.onResult(r);
          if (app.sess) { app.sess.stop(); app.sess = null; }
          detach3D(); startDemo(); padBox.innerHTML = ''; app.paused = false;
          results(sum, r, o);
        }, { icon: 'skip' }) : null,
        item(w ? L('ドライブを終える', 'End the drive') : L('やめる', 'Quit'), '', function () {
          if (w) worldEnd(w); else toMenu();
        }, { icon: '■' })
      ].filter(Boolean);
      p.appendChild(list(items));
      over.appendChild(p);
      app.sel = 0; highlight();
      app.keyHook = function (k) { if (k === 'p' || k === 'P' || k === 'Escape') { resume(); return true; } return false; };
    }
    function resume() { app.paused = false; if (app.sess) app.sess.paused = false; app.keyHook = null; over.innerHTML = ''; over.classList.add('hidden'); app.mode = 'race'; }
    function worldEnd(w) {
      detach3D();
      if (app.sess) app.sess.stop();
      app.sess = null; app.mode = 'menu'; app.paused = false; padBox.innerHTML = '';
      startDemo();
      over.classList.remove('hidden'); over.innerHTML = '';
      var p = panel(L('ドライブ終了', 'Drive over'), '');
      w.summary().forEach(function (ln) { p.appendChild(el('div', 'rx-line', ln)); });
      p.appendChild(list([item(L('メニューへ', 'Menu'), '', function () { show(app.stack[app.stack.length - 1]); }, { icon: 'back' })]));
      over.appendChild(p);
      app.sel = 0; highlight(); app.keyHook = null;
    }

    function cleanup() {
      if (R.Music) R.Music.stop(true);
      detach3D();
      app.closed = true;
      cancelAnimationFrame(raf);
      if (app.sess) app.sess.stop();
      TB.Term.release();
      TB.Term.focus();
    }
    function onResize() { if (app.closed) { window.removeEventListener('resize', onResize); return; } if (!app.sess) { sizeCanvas(); if (app.demo) { app.demo.W = cv.width; app.demo.H = cv.height; } } }
    window.addEventListener('resize', onResize);

    /* --- 外から来た行き先 --- */
    app.route = function (rt) {
      var parts = String(rt || 'title').split(/\s+/), a = parts[0];
      app.stack = [SCREENS.title()];
      show(app.stack[0]);
      var s = R.load();
      if (a === 'story') {
        var hit = parts[1] ? findEvent(parts[1]) : null, stp = parts[1] && !hit ? storyOf(parts[1]) : null;
        go(SCREENS.story(hit ? (hit.side ? 'side' : hit.st.id) : stp ? stp.id : null));
        if (hit && (hit.side ? sideOpen(s, hit.st, hit.ev) : hit.idx <= progOf(s, hit.st.id))) { if (hit.ev.talk) storyEvent(hit.st.id, hit.idx, true, hit.side); else go(SCREENS.brief(hit.st.id, hit.idx, hit.side)); }
      } else if (a === 'world') go(SCREENS.world(null));
      else if (a === 'job' || a === 'jobs') { go(SCREENS.jobs()); if (R.JOBS[parts[1]]) go(SCREENS.world(parts[1])); }
      else if (a === 'gp' || a === 'career') { go(SCREENS.gp()); var cup = R.CUPS.filter(function (c) { return c.id === parts[1]; })[0]; if (cup && R.cupUnlocked(s, cup)) go(SCREENS.cup(cup.id)); }
      else if (a === 'quick' || a === 'party') {
        var casual = a === 'party';
        if (casual) go(SCREENS.casual());
        if (parts[1] && R.TRACKS[parts[1]]) {
          quickOpt.track = parts[1];
          if (parts[2]) quickOpt.laps = clamp(parseInt(parts[2], 10) || 2, 1, 9);
          if (R.LEVELS[parts[3]]) quickOpt.level = parts[3];
          if (parts[4]) quickOpt.weather = parts[4];
          quickOpt.mirror = parts.indexOf('mirror') >= 0;
          go(SCREENS.quick(casual)); runQuick(casual);
        } else go(SCREENS.quick(casual));
      }
      else if (a === 'daily') { go(SCREENS.daily()); if (parts[1] === 'start') runDaily(); }
      else if (a === 'achievements' || a === 'ach' || a === 'trophy') go(SCREENS.achievements());
      else if (a === 'touge') { if (R.TRACKS[parts[1]] && R.TRACKS[parts[1]].touge) tougeOpt.track = parts[1]; go(SCREENS.touge()); }
      else if (a === 'time') { go(SCREENS.trackPick('time')); if (R.TRACKS[parts[1]]) runSingle('time', parts[1]); }
      else if (['elim', 'duel', 'arcade', 'chase', 'traffic'].indexOf(a) >= 0) { go(SCREENS.challenges()); go(SCREENS.trackPick(a)); if (R.TRACKS[parts[1]] && !isTouge(parts[1])) runSingle(a, parts[1], { boss: parts[2] && s.bosses[parts[2]] ? parts[2] : null }); }
      else if (a === 'challenge' || a === 'challenges') go(SCREENS.challenges());
      else if (a === 'mini' || a === 'minis') { go(SCREENS.minis()); if (R.MINIS[parts[1]]) runMini(parts[1]); }
      else if (a === 'coins') { go(SCREENS.casual()); runMini('coins'); }
      else if (a === 'casual') go(SCREENS.casual());
      else if (a === 'garage' || a === 'shop' || a === 'cars') go(SCREENS.garage());
      else if (a === 'stats' || a === 'records') go(SCREENS.records());
      else if (a === 'help' || a === 'settings') go(SCREENS.settings());
      else if (R.TRACKS[a]) { quickOpt.track = a; go(SCREENS.quick(false)); runQuick(false); }
    };
    return app;
  }

  R.openApp = openApp;
})();
