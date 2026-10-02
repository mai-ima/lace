/*
 * games.js — ローグライク（ウィンドウの中で遊ぶ）。
 *
 *   rogue … ローグライク（キーを直接受け取る本格版）。ゲームウィンドウの中で動く。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var def = TB.def;

  function ja() { return TB.state.lang === 'ja'; }
  function L(j, e) { return ja() ? j : e; }
  function sfx(n) { if (TB.Sfx) TB.Sfx.play(n); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function best(key, value, lower) {
    var cur = parseInt(TB.store.get('best:' + key, ''), 10);
    var better = isNaN(cur) || (lower ? value < cur : value > cur);
    if (better) TB.store.set('best:' + key, String(value));
    return { best: better ? value : cur, updated: better };
  }

  /* =====================================================================
     3. rogue — ローグライク
     ===================================================================== */

  var WALL = 0, FLOOR = 1, STAIR = 2;
  var MAX_DEPTH = 8;

  var MONSTERS = [
    { ch: 'r', hp: 5,  atk: 2,  def: 0, xp: 2,  min: 1, cls: 'g-m1', name: { ja: 'ネズミ', en: 'rat' } },
    { ch: 'k', hp: 8,  atk: 3,  def: 1, xp: 5,  min: 1, cls: 'g-m1', name: { ja: 'コボルト', en: 'kobold' } },
    { ch: 'g', hp: 11, atk: 4,  def: 1, xp: 9,  min: 2, cls: 'g-m2', name: { ja: 'ゴブリン', en: 'goblin' } },
    { ch: 'o', hp: 17, atk: 5,  def: 2, xp: 18, min: 3, cls: 'g-m2', name: { ja: 'オーク', en: 'orc' } },
    { ch: 'w', hp: 14, atk: 6,  def: 1, xp: 22, min: 4, cls: 'g-m3', name: { ja: 'ダイアウルフ', en: 'dire wolf' } },
    { ch: 'T', hp: 28, atk: 8,  def: 3, xp: 45, min: 5, cls: 'g-m3', name: { ja: 'トロル', en: 'troll' } },
    { ch: 'D', hp: 44, atk: 11, def: 5, xp: 95, min: 7, cls: 'g-m4', name: { ja: 'ドラゴン', en: 'dragon' } }
  ];

  var G = null;

  /* --- 地図生成 ------------------------------------------------------- */

  function makeMap(w, h) {
    var m = [];
    for (var y = 0; y < h; y++) {
      m.push([]);
      for (var x = 0; x < w; x++) m[y].push(WALL);
    }
    return m;
  }

  function carveRoom(map, r) {
    for (var y = r.y; y < r.y + r.h; y++) {
      for (var x = r.x; x < r.x + r.w; x++) map[y][x] = FLOOR;
    }
  }

  function carveCorridor(map, a, b) {
    var x = a.cx, y = a.cy;
    var order = Math.random() < 0.5;
    var stepX = function () { while (x !== b.cx) { x += x < b.cx ? 1 : -1; map[y][x] = FLOOR; } };
    var stepY = function () { while (y !== b.cy) { y += y < b.cy ? 1 : -1; map[y][x] = FLOOR; } };
    if (order) { stepX(); stepY(); } else { stepY(); stepX(); }
  }

  function generate(w, h, depth) {
    var map = makeMap(w, h);
    var rooms = [];
    var attempts = 120;

    while (attempts-- > 0 && rooms.length < 9) {
      var rw = 4 + rnd(7), rh = 3 + rnd(4);
      var rx = 1 + rnd(Math.max(1, w - rw - 2));
      var ry = 1 + rnd(Math.max(1, h - rh - 2));
      var r = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) };
      var clash = rooms.some(function (o) {
        return r.x <= o.x + o.w + 1 && r.x + r.w + 1 >= o.x &&
               r.y <= o.y + o.h + 1 && r.y + r.h + 1 >= o.y;
      });
      if (clash) continue;
      carveRoom(map, r);
      if (rooms.length) carveCorridor(map, rooms[rooms.length - 1], r);
      rooms.push(r);
    }
    return { map: map, rooms: rooms };
  }

  function freeSpot(rooms, taken) {
    for (var i = 0; i < 200; i++) {
      var r = pick(rooms);
      var x = r.x + rnd(r.w), y = r.y + rnd(r.h);
      if (!taken.some(function (t) { return t.x === x && t.y === y; })) return { x: x, y: y };
    }
    return { x: rooms[0].cx, y: rooms[0].cy };
  }

  /* --- 視界（シャドウキャスティング） --------------------------------- */

  var MULT = [
    [1, 0, 0, -1, -1, 0, 0, 1],
    [0, 1, -1, 0, 0, -1, 1, 0],
    [0, 1, 1, 0, 0, -1, -1, 0],
    [1, 0, 0, 1, -1, 0, 0, -1]
  ];

  function blocked(x, y) {
    return x < 0 || y < 0 || x >= G.w || y >= G.h || G.map[y][x] === WALL;
  }

  function light(x, y) {
    if (x < 0 || y < 0 || x >= G.w || y >= G.h) return;
    G.vis[y][x] = true;
    G.seen[y][x] = true;
  }

  function castLight(cx, cy, row, start, end, radius, xx, xy, yx, yy) {
    if (start < end) return;
    var newStart = 0;
    for (var i = row; i <= radius; i++) {
      var dx = -i - 1, dy = -i, done = false;
      while (dx <= 0) {
        dx++;
        var X = cx + dx * xx + dy * xy;
        var Y = cy + dx * yx + dy * yy;
        var lSlope = (dx - 0.5) / (dy + 0.5);
        var rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        if (dx * dx + dy * dy <= radius * radius) light(X, Y);
        if (done) {
          if (blocked(X, Y)) { newStart = rSlope; continue; }
          done = false;
          start = newStart;
        } else if (blocked(X, Y) && i < radius) {
          done = true;
          castLight(cx, cy, i + 1, start, lSlope, radius, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (done) break;
    }
  }

  function computeFov() {
    for (var y = 0; y < G.h; y++) for (var x = 0; x < G.w; x++) G.vis[y][x] = false;
    light(G.px, G.py);
    for (var o = 0; o < 8; o++) {
      castLight(G.px, G.py, 1, 1.0, 0.0, G.radius, MULT[0][o], MULT[1][o], MULT[2][o], MULT[3][o]);
    }
  }

  /* --- 階層の用意 ------------------------------------------------------ */

  function enterLevel(depth) {
    var gen = generate(G.w, G.h, depth);
    G.map = gen.map;
    G.rooms = gen.rooms;
    G.depth = depth;
    G.monsters = [];
    G.items = [];
    G.vis = []; G.seen = [];
    for (var y = 0; y < G.h; y++) {
      G.vis.push([]); G.seen.push([]);
      for (var x = 0; x < G.w; x++) { G.vis[y].push(false); G.seen[y].push(false); }
    }

    var start = gen.rooms[0];
    G.px = start.cx; G.py = start.cy;
    var taken = [{ x: G.px, y: G.py }];

    // 階段（最深部には代わりに護符を置く）
    if (depth < MAX_DEPTH) {
      var st = freeSpot(gen.rooms.slice(1).length ? gen.rooms.slice(1) : gen.rooms, taken);
      G.map[st.y][st.x] = STAIR;
      taken.push(st);
    } else {
      var am = freeSpot(gen.rooms.slice(1).length ? gen.rooms.slice(1) : gen.rooms, taken);
      G.items.push({ x: am.x, y: am.y, kind: 'amulet', ch: '*', cls: 'g-amulet' });
      taken.push(am);
    }

    // モンスター（最初の部屋には置かない。降りた直後に囲まれないように）
    var pool = MONSTERS.filter(function (m) { return m.min <= depth; });
    var spawnRooms = gen.rooms.length > 1 ? gen.rooms.slice(1) : gen.rooms;
    var count = 2 + depth + rnd(3);
    for (var i = 0; i < count; i++) {
      var proto = pick(pool.slice(-4));
      var p = freeSpot(spawnRooms, taken);
      taken.push(p);
      G.monsters.push({
        x: p.x, y: p.y, ch: proto.ch, cls: proto.cls, name: proto.name,
        hp: proto.hp + rnd(depth), maxhp: proto.hp + rnd(depth),
        atk: proto.atk, def: proto.def, xp: proto.xp
      });
    }

    // アイテム
    var drops = 2 + rnd(3);
    for (var d = 0; d < drops; d++) {
      var q = freeSpot(gen.rooms, taken);
      taken.push(q);
      var roll = Math.random();
      if (roll < 0.5) G.items.push({ x: q.x, y: q.y, kind: 'potion', ch: '!', cls: 'g-potion', amount: 10 + rnd(8) });
      else if (roll < 0.82) G.items.push({ x: q.x, y: q.y, kind: 'gold', ch: '$', cls: 'g-gold', amount: 5 + rnd(10 * depth) });
      else if (roll < 0.9) G.items.push({ x: q.x, y: q.y, kind: 'weapon', ch: ')', cls: 'g-gear', amount: 1 });
      else G.items.push({ x: q.x, y: q.y, kind: 'armor', ch: '[', cls: 'g-gear', amount: 1 });
    }

    computeFov();
  }

  /* --- 画面 ------------------------------------------------------------ */

  function tileGlyph(x, y) {
    var t = G.map[y][x];
    if (t === STAIR) return ['>', 'g-stair'];
    if (t === FLOOR) return ['·', 'g-floor'];
    return ['#', 'g-wall'];
  }

  function glyphAt(x, y) {
    if (!G.seen[y][x]) return [' ', 'g-void'];
    if (!G.vis[y][x]) {
      var g = tileGlyph(x, y);
      return [g[0], g[1] + ' g-dark'];
    }
    if (G.px === x && G.py === y) return ['@', 'g-you'];
    for (var i = 0; i < G.monsters.length; i++) {
      if (G.monsters[i].x === x && G.monsters[i].y === y) return [G.monsters[i].ch, G.monsters[i].cls];
    }
    for (var k = 0; k < G.items.length; k++) {
      if (G.items[k].x === x && G.items[k].y === y) return [G.items[k].ch, G.items[k].cls];
    }
    return tileGlyph(x, y);
  }

  function renderMap() {
    var frag = document.createDocumentFragment();
    for (var y = 0; y < G.h; y++) {
      var row = document.createElement('div');
      row.className = 'g-row';
      var runCls = null, runTxt = '';
      for (var x = 0; x < G.w; x++) {
        var g = glyphAt(x, y);
        if (g[1] === runCls) { runTxt += g[0]; continue; }
        if (runCls !== null) {
          var s = document.createElement('span');
          s.className = runCls; s.textContent = runTxt;
          row.appendChild(s);
        }
        runCls = g[1]; runTxt = g[0];
      }
      if (runCls !== null) {
        var last = document.createElement('span');
        last.className = runCls; last.textContent = runTxt;
        row.appendChild(last);
      }
      frag.appendChild(row);
    }
    G.el.map.textContent = '';
    G.el.map.appendChild(frag);
  }

  function bar(cur, max, width) {
    var n = clamp(Math.round(cur / max * width), 0, width);
    return '█'.repeat(n) + '░'.repeat(width - n);
  }

  function renderStatus() {
    var st = G.el.status;
    st.textContent = '';
    var hpCls = G.hp / G.maxhp > 0.5 ? 'accent' : (G.hp / G.maxhp > 0.25 ? 'warn' : 'err');
    var parts = [
      ['HP ', 'dim'], [bar(G.hp, G.maxhp, 10), hpCls], [' ' + G.hp + '/' + G.maxhp + '  ', hpCls],
      ['Lv ', 'dim'], [G.lv + '  ', ''],
      ['XP ', 'dim'], [G.xp + '/' + G.next + '  ', ''],
      [L('攻 ', 'atk '), 'dim'], [G.atk + '  ', ''],
      [L('防 ', 'def '), 'dim'], [G.def + '  ', ''],
      ['! ', 'dim'], [G.potions + '  ', 'g-potion'],
      ['$ ', 'dim'], [G.gold + '  ', 'g-gold'],
      [L('深さ ', 'depth '), 'dim'], [G.depth + '/' + MAX_DEPTH, 'accent-2']
    ];
    parts.forEach(function (p) {
      var s = document.createElement('span');
      s.className = p[1]; s.textContent = p[0];
      st.appendChild(s);
    });
  }

  function renderLog() {
    var box = G.el.log;
    box.textContent = '';
    var recent = G.log.slice(-3);
    recent.forEach(function (m, i) {
      var d = document.createElement('div');
      d.className = 'line' + (i < recent.length - 1 ? ' dim' : '');
      var s = document.createElement('span');
      s.className = m[1] || '';
      s.textContent = m[0];
      d.appendChild(s);
      box.appendChild(d);
    });
  }

  function draw() {
    computeFov();
    renderMap();
    renderStatus();
    renderLog();
  }

  function msg(text, cls) {
    G.log.push([text, cls || '']);
    if (G.log.length > 40) G.log.shift();
  }

  /* --- 戦闘・行動 ------------------------------------------------------ */

  function damage(atk, def) {
    return Math.max(1, atk + rnd(3) - def);
  }

  function monsterName(m) { return TB.t(m.name); }

  /* 次のレベルに必要な累計 XP: 15, 55, 115, 195 … と離れていく */
  function levelUp() {
    while (G.xp >= G.next) {
      G.lv++;
      G.next += 20 * G.lv;
      G.maxhp += 6;
      G.hp = Math.min(G.maxhp, G.hp + 6);
      G.atk += 1;
      if (G.lv % 2 === 0) G.def += 1;
      msg(L('レベル ' + G.lv + ' に上がった！', 'Welcome to level ' + G.lv + '!'), 'accent bold');
      sfx('win');
    }
  }

  function attack(m) {
    var dmg = damage(G.atk, m.def);
    m.hp -= dmg;
    sfx('hit');
    if (m.hp > 0) {
      msg(L(monsterName(m) + ' に ' + dmg + ' のダメージ。', 'You hit the ' + monsterName(m) + ' for ' + dmg + '.'), '');
      return;
    }
    G.monsters = G.monsters.filter(function (o) { return o !== m; });
    G.xp += m.xp;
    msg(L(monsterName(m) + ' を倒した！ (+' + m.xp + ' XP)', 'The ' + monsterName(m) + ' dies! (+' + m.xp + ' XP)'), 'accent');
    levelUp();
  }

  function pickUp() {
    var here = G.items.filter(function (i) { return i.x === G.px && i.y === G.py; });
    here.forEach(function (i) {
      G.items = G.items.filter(function (o) { return o !== i; });
      if (i.kind === 'gold') {
        sfx('coin');
        G.gold += i.amount;
        msg(L(i.amount + ' ゴールドを拾った。', 'You pick up ' + i.amount + ' gold.'), 'g-gold');
      } else if (i.kind === 'potion') {
        sfx('eat');
        G.potions++;
        msg(L('薬を拾った（p で飲む）。持ち物: ' + G.potions, 'You pick up a potion (p to drink). You carry ' + G.potions + '.'), 'accent');
      } else if (i.kind === 'weapon') {
        G.atk += 2;
        msg(L('鋭い武器を手に入れた。攻撃 +2', 'You find a sharper weapon. atk +2'), 'accent-2');
      } else if (i.kind === 'armor') {
        G.def += 1;
        msg(L('丈夫な防具を手に入れた。防御 +1', 'You find sturdier armour. def +1'), 'accent-2');
      } else if (i.kind === 'amulet') {
        G.won = true;
      }
    });
  }

  function monstersTurn() {
    G.monsters.forEach(function (m) {
      if (G.dead || G.won) return;
      var dist = Math.max(Math.abs(m.x - G.px), Math.abs(m.y - G.py));
      if (dist === 1) {
        var dmg = damage(m.atk, G.def);
        G.hp -= dmg;
        sfx('hurt');
        msg(L(monsterName(m) + ' の攻撃！ ' + dmg + ' のダメージ。', 'The ' + monsterName(m) + ' hits you for ' + dmg + '.'), 'err');
        if (G.hp <= 0) { G.dead = true; }
        return;
      }
      if (!G.vis[m.y][m.x] || dist > G.radius + 2) {
        if (Math.random() < 0.4) tryMove(m, rnd(3) - 1, rnd(3) - 1);
        return;
      }
      var dx = G.px === m.x ? 0 : (G.px > m.x ? 1 : -1);
      var dy = G.py === m.y ? 0 : (G.py > m.y ? 1 : -1);
      if (!tryMove(m, dx, dy)) {
        if (!tryMove(m, dx, 0)) tryMove(m, 0, dy);
      }
    });
  }

  function occupied(x, y, self) {
    if (G.px === x && G.py === y) return true;
    return G.monsters.some(function (o) { return o !== self && o.x === x && o.y === y; });
  }

  function tryMove(m, dx, dy) {
    if (!dx && !dy) return false;
    var nx = m.x + dx, ny = m.y + dy;
    if (blocked(nx, ny) || occupied(nx, ny, m)) return false;
    m.x = nx; m.y = ny;
    return true;
  }

  function descend() {
    if (G.depth >= MAX_DEPTH) return;
    enterLevel(G.depth + 1);
    sfx('lap');
    msg(L('階段を降りた。地下 ' + G.depth + ' 階。', 'You descend to depth ' + G.depth + '.'), 'accent-2');
  }

  function playerMove(dx, dy) {
    var nx = G.px + dx, ny = G.py + dy;
    if (blocked(nx, ny)) { msg(L('壁だ。', 'A wall blocks the way.'), 'dim'); return; }
    var target = null;
    G.monsters.forEach(function (m) { if (m.x === nx && m.y === ny) target = m; });
    if (target) { attack(target); return; }
    G.px = nx; G.py = ny;
    pickUp();
    if (!G.won && G.map[ny][nx] === STAIR) descend();
  }

  /* --- 終了処理 -------------------------------------------------------- */

  function score() {
    return G.gold + G.xp * 2 + G.depth * 100 + (G.won ? 5000 : 0);
  }

  function finish(reason) {
    TB.Term.release();
    if (G.el.pad) G.el.pad.remove();
    G.el.hint.textContent = '';

    var sc = score();
    var r = best('rogue', sc, false);
    var out = [''];
    if (reason === 'won') {
      out.push([{ t: L('★ 護符を手に入れた！ あなたの勝ちです。', '★ You seize the amulet. You win!'), c: 'accent bold' }]);
    } else if (reason === 'dead') {
      out.push([{ t: L('あなたは倒れた…', 'You have died…'), c: 'err bold' }]);
    } else {
      out.push([{ t: L('迷宮から引き返した。', 'You climb back out of the dungeon.'), c: 'dim' }]);
    }
    out.push({ row: [L('スコア', 'score'), String(sc)] });
    out.push({ row: [L('到達', 'depth'), L('地下 ' + G.depth + ' 階', 'floor ' + G.depth)] });
    out.push({ row: [L('レベル', 'level'), String(G.lv)] });
    out.push({ row: [L('所持金', 'gold'), String(G.gold)] });
    out.push({ row: [L('最高記録', 'best'), String(r.best) + (r.updated ? L('（更新！）', ' (new!)') : '')] });
    out.push('', [{ t: L('もう一度: rogue', 'play again: rogue'), c: 'dim' }], '');

    var resolve = G.resolve;
    G = null;
    TB.Term.printAll(out);
    TB.Term.scroll();
    if (resolve) resolve();
  }

  /* --- 入力 ------------------------------------------------------------ */

  var KEYS = {
    ArrowUp: [0, -1], k: [0, -1], w: [0, -1],
    ArrowDown: [0, 1], j: [0, 1], s: [0, 1],
    ArrowLeft: [-1, 0], h: [-1, 0], a: [-1, 0],
    ArrowRight: [1, 0], l: [1, 0], d: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1]
  };

  function onKey(key) {
    if (!G) return;
    if (key === 'q' || key === 'Escape') { finish('quit'); return; }

    var mv = KEYS[key];
    if (mv) playerMove(mv[0], mv[1]);
    else if (key === 'p') {
      if (!G.potions) { msg(L('薬を持っていない。', 'You have no potions.'), 'dim'); draw(); return; }
      G.potions--;
      var heal = Math.min(10 + rnd(8), G.maxhp - G.hp);
      G.hp += heal;
      msg(L('薬を飲んだ。HP が ' + heal + ' 回復。', 'You quaff a potion and recover ' + heal + ' HP.'), 'accent');
    }
    else if (key === '.' || key === ' ' || key === '5') msg(L('ひと息ついた。', 'You wait.'), 'dim');
    else return;

    if (G.won) { draw(); sfx('win'); finish('won'); return; }
    monstersTurn();
    if (G.dead) { draw(); sfx('die'); finish('dead'); return; }
    G.turn++;
    if (G.turn % 8 === 0 && G.hp < G.maxhp) G.hp++;   // ゆっくり回復
    draw();
  }

  /* --- 画面の組み立て -------------------------------------------------- */

  function charWidth(container) {
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
    probe.textContent = new Array(51).join('0');
    container.appendChild(probe);
    var w = probe.getBoundingClientRect().width / 50;
    container.removeChild(probe);
    return w || 8;
  }

  function buildPad(box) {
    if (!window.matchMedia || !window.matchMedia('(hover: none)').matches) return null;
    var pad = document.createElement('div');
    pad.className = 'g-pad';
    [['↖', 'y'], ['↑', 'ArrowUp'], ['↗', 'u'],
     ['←', 'ArrowLeft'], ['·', '.'], ['→', 'ArrowRight'],
     ['↙', 'b'], ['↓', 'ArrowDown'], ['↘', 'n'],
     ['quit', 'q']].forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = p[0];
      if (p[1] === 'q') b.className = 'wide';
      b.addEventListener('click', function (e) { e.preventDefault(); onKey(p[1]); });
      pad.appendChild(b);
    });
    box.appendChild(pad);
    return pad;
  }

  def('rogue', {
    group: 'game',
    desc: { ja: 'ローグライク：地下 8 階の護符を目指す', en: 'roguelike: reach the amulet on floor 8' },
    run: function () {
      var screen = TB.Term.el();
      var pane = screen.parentNode || screen;
      var cw = charWidth(screen) * 1.05;  // .g-map の字間ぶん
      var fs = parseFloat(window.getComputedStyle(screen).fontSize) || 14;
      // 高さは画面全体（pane）から測る。screen は内容ぶんしか高さを持たないため。
      var cols = clamp(Math.floor((screen.clientWidth - 48) / cw), 32, 68);
      var maxRows = window.innerWidth < 720 ? 16 : 22;   // 縦長の画面で空白が増えすぎないように
      var rows = clamp(Math.floor(pane.clientHeight * 0.58 / (fs * 1.2)), 12, maxRows);

      var box = document.createElement('div');
      box.className = 'game';
      var mapEl = document.createElement('div'); mapEl.className = 'g-map';
      var statusEl = document.createElement('div'); statusEl.className = 'g-status';
      var logEl = document.createElement('div'); logEl.className = 'g-log';
      var hintEl = document.createElement('div'); hintEl.className = 'g-hint';
      hintEl.textContent = L('移動: 矢印 / hjkl · 斜め: yubn · 待つ: . · 薬: p · やめる: q',
                             'move: arrows / hjkl · diagonal: yubn · wait: . · potion: p · quit: q');
      box.appendChild(statusEl);
      box.appendChild(mapEl);
      box.appendChild(logEl);
      box.appendChild(hintEl);

      G = {
        w: cols, h: rows, radius: 8,
        hp: 30, maxhp: 30, atk: 4, def: 1, lv: 1, xp: 0, next: 15, gold: 0, potions: 0,
        turn: 0, dead: false, won: false, log: [],
        el: { box: box, map: mapEl, status: statusEl, log: logEl, hint: hintEl }
      };

      TB.Term.printAll([
        '',
        [{ t: L('── 迷宮へ ', '── into the dungeon '), c: 'accent bold' }, { t: '─'.repeat(18), c: 'dim' }],
        [{ t: L('地下 8 階に眠る護符を持ち帰れ。', 'Bring back the amulet from floor 8.'), c: 'dim' }],
        { node: box }
      ]);

      G.el.pad = buildPad(box);
      enterLevel(1);
      msg(L('迷宮に入った。地下 1 階。', 'You enter the dungeon. Depth 1.'), 'accent-2');
      draw();
      TB.Term.scroll();
      TB.Term.capture(onKey);

      return new Promise(function (resolve) { G.resolve = resolve; });
    }
  });

  /* --- ゲーム一覧 ------------------------------------------------------ */

  /* 記録の読み方: [保存キー, 表示名, 単位] */
  function fmtMs(v) {
    v = parseInt(v, 10);
    var m = Math.floor(v / 60000), s = Math.floor(v % 60000 / 1000), c = Math.floor(v % 1000 / 10);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }
})();
