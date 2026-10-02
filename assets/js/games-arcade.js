/*
 * games-arcade.js — 画面を直接操作するゲーム。
 *   tetris  … テトリス（7種バッグ・ホールド・ゴースト・ハードドロップ）
 *   snake   … スネーク
 *   2048    … 2048
 *   mine    … マインスイーパ
 *   sokoban … 倉庫番（8 面）
 */
(function () {
  'use strict';

  var TB = window.TB;
  var K = TB.Kit;
  var L = K.L, rnd = K.rnd, clamp = K.clamp;

  /* =====================================================================
     tetris
     ===================================================================== */

  var PIECES = {
    I: { c: 'p-i', m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
    O: { c: 'p-o', m: [[1, 1], [1, 1]] },
    T: { c: 'p-t', m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
    S: { c: 'p-s', m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
    Z: { c: 'p-z', m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
    J: { c: 'p-j', m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
    L: { c: 'p-l', m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] }
  };
  var NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  var SPEEDS = [800, 700, 610, 530, 450, 380, 310, 250, 190, 150, 120, 100, 85, 75, 65];
  var CLEAR_SCORE = [0, 100, 300, 500, 800];
  var W = 10, H = 20;

  function rotate(m) {
    var n = m.length, out = [];
    for (var i = 0; i < m[0].length; i++) {
      out.push([]);
      for (var j = 0; j < n; j++) out[i].push(m[n - 1 - j][i]);
    }
    return out;
  }

  var SPRINT_LINES = 40, ULTRA_MS = 120000;

  function fmtTime(ms) {
    var m = Math.floor(ms / 60000), sec = Math.floor(ms % 60000 / 1000), c = Math.floor(ms % 1000 / 10);
    return m + ':' + (sec < 10 ? '0' : '') + sec + '.' + (c < 10 ? '0' : '') + c;
  }

  function tetris(args) {
    var mode = ((args && args[0]) || 'marathon').toLowerCase();
    if (mode === 'm') mode = 'marathon';
    if (['marathon', 'sprint', 'ultra'].indexOf(mode) === -1) mode = 'marathon';
    var recKey = mode === 'marathon' ? 'tetris' : 'tetris-' + mode;

    var board = [];
    for (var y = 0; y < H; y++) { board.push([]); for (var x = 0; x < W; x++) board[y].push(null); }

    var bag = [], queue = [], cur = null, hold = null, canHold = true;
    var score = 0, lines = 0, level = 0, paused = false, over = false;
    var combo = -1, b2b = false, busy = false, flash = null, tetrises = 0, maxCombo = 0;
    var started = Date.now(), pausedAt = 0, pausedTotal = 0;

    function elapsed() { return (paused ? pausedAt : Date.now()) - started - pausedTotal; }

    function refill() {
      var b = NAMES.slice();
      while (b.length) bag.push(b.splice(rnd(b.length), 1)[0]);
    }
    function nextName() {
      if (bag.length < 2) refill();
      return bag.shift();
    }
    while (queue.length < 3) queue.push(nextName());

    function newPiece(name) {
      var p = PIECES[name];
      return { k: name, c: p.c, m: p.m.map(function (r) { return r.slice(); }), x: Math.floor((W - p.m[0].length) / 2), y: -1 };
    }

    function spawn() {
      var name = queue.shift();
      queue.push(nextName());
      cur = newPiece(name);
      canHold = true;
      if (collide(cur.m, cur.x, cur.y)) { gameOver(); return false; }
      return true;
    }

    function collide(m, px, py) {
      for (var i = 0; i < m.length; i++) {
        for (var j = 0; j < m[i].length; j++) {
          if (!m[i][j]) continue;
          var bx = px + j, by = py + i;
          if (bx < 0 || bx >= W || by >= H) return true;
          if (by >= 0 && board[by][bx]) return true;
        }
      }
      return false;
    }

    function lock() {
      var dead = false;
      cur.m.forEach(function (row, i) {
        row.forEach(function (v, j) {
          if (!v) return;
          var by = cur.y + i, bx = cur.x + j;
          if (by < 0) { dead = true; return; }
          board[by][bx] = cur.c;
        });
      });
      if (dead) { gameOver(); return; }

      var full = [];
      for (var y2 = 0; y2 < H; y2++) {
        if (board[y2].every(function (c) { return c; })) full.push(y2);
      }
      if (!full.length) {
        combo = -1;
        K.sfx('lock');
        spawn();
        return;
      }
      // 消える列を一瞬光らせてから消す
      busy = true;
      flash = full;
      cur = null;
      draw();
      setTimeout(function () {
        if (over) return;
        clearRows(full);
        flash = null;
        busy = false;
        if (!checkEnd()) { spawn(); draw(); }
      }, 120);
    }

    function clearRows(full) {
      full.forEach(function (y3) { board.splice(y3, 1); board.unshift(new Array(W).fill(null)); });
      var n = full.length;
      lines += n;
      var gain = CLEAR_SCORE[n] * (level + 1);
      var notes = [];
      if (n === 4) {
        tetrises++;
        if (b2b) { gain = Math.floor(gain * 1.5); notes.push(L('連続テトリス ×1.5', 'Back-to-back ×1.5')); }
        b2b = true;
      } else b2b = false;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      if (combo > 0) { gain += 50 * combo * (level + 1); notes.push(combo + ' REN'); }
      score += gain;
      K.sfx(n === 4 ? 'tetris' : 'clear');

      if (mode !== 'sprint') {
        var nextLevel = Math.floor(lines / 10);
        if (nextLevel !== level) {
          level = nextLevel;
          timer.setSpeed(SPEEDS[Math.min(level, SPEEDS.length - 1)]);
          s.msg(L('レベル ' + (level + 1) + '！ 速くなります。', 'Level ' + (level + 1) + '! Faster now.'), 'accent bold');
        }
      }
      var head = n === 4 ? L('テトリス！', 'Tetris!') : L(n + ' 列消えた', n + ' line' + (n > 1 ? 's' : ''));
      s.msg(head + '  +' + gain + (notes.length ? '  (' + notes.join(', ') + ')' : ''), n === 4 || combo > 0 ? 'accent bold' : 'accent');
    }

    function checkEnd() {
      if (mode === 'sprint' && lines >= SPRINT_LINES) {
        over = true;
        var ms = elapsed();
        draw();
        s.end(K.scoreLines(L('40 ライン達成！', '40 lines cleared!'), [
          [L('タイム', 'time'), fmtTime(ms)],
          [L('テトリス回数', 'tetrises'), tetrises],
          [L('最大 REN', 'best combo'), Math.max(0, maxCombo)]
        ], recKey, ms, true, fmtTime).concat(['', [{ t: L('もう一度: ', 'again: '), c: 'dim' }, { t: 'tetris sprint', cmd: 'tetris sprint', c: 'accent' }]]));
        return true;
      }
      if (mode === 'ultra' && elapsed() >= ULTRA_MS) {
        over = true;
        draw();
        s.end(K.scoreLines(L('2 分終了！', 'Time up!'), [
          [L('得点', 'score'), score], [L('ライン', 'lines'), lines], [L('テトリス回数', 'tetrises'), tetrises]
        ], recKey, score).concat(['', [{ t: L('もう一度: ', 'again: '), c: 'dim' }, { t: 'tetris ultra', cmd: 'tetris ultra', c: 'accent' }]]));
        return true;
      }
      return false;
    }

    function ghostY() {
      var gy = cur.y;
      while (!collide(cur.m, cur.x, gy + 1)) gy++;
      return gy;
    }

    function move(dx) { if (!collide(cur.m, cur.x + dx, cur.y)) { cur.x += dx; K.sfx('move'); draw(); } }

    function softDrop() {
      if (!collide(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 1; draw(); }
      else lock();
    }

    function hardDrop() {
      var d = 0;
      while (!collide(cur.m, cur.x, cur.y + 1)) { cur.y++; d++; }
      score += d * 2;
      K.sfx('drop');
      lock();
      draw();
    }

    function spin(times) {
      var m = cur.m;
      for (var i = 0; i < times; i++) m = rotate(m);
      var kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];
      for (var k = 0; k < kicks.length; k++) {
        if (!collide(m, cur.x + kicks[k][0], cur.y + kicks[k][1])) {
          cur.m = m; cur.x += kicks[k][0]; cur.y += kicks[k][1]; K.sfx('rotate'); draw(); return;
        }
      }
    }

    function doHold() {
      if (!canHold) return;
      var keep = cur.k;
      if (hold) {
        cur = newPiece(hold);
      } else {
        queue.push(nextName());
        if (!spawn()) return;
      }
      hold = keep;
      canHold = false;
      K.sfx('rotate');
      draw();
    }

    /* --- 描画 --- */
    var boardEl = document.createElement('div');
    boardEl.className = 't-board';
    var sideEl = document.createElement('div');
    sideEl.className = 't-side';

    function mini(name, label) {
      var rows = [[[label, 'dim']]];
      if (!name) { rows.push([['   ─', 'dim']], [['', '']]); return rows; }
      var m = PIECES[name].m, c = canHold ? PIECES[name].c : 'dim';
      m.forEach(function (row) {
        if (!row.some(function (v) { return v; })) return;
        var cells = [['  ', '']];
        row.forEach(function (v) { cells.push([v ? '██' : '  ', v ? c : '']); });
        rows.push(cells);
      });
      rows.push([['', '']]);
      return rows;
    }

    function draw() {
      var gy = (over || !cur) ? -99 : ghostY();
      var rows = [];
      for (var y = 0; y < H; y++) {
        var cells = [];
        var lit = flash && flash.indexOf(y) !== -1;
        for (var x = 0; x < W; x++) {
          var ch = null, cls = 'p-empty', glyph = '· ';
          if (lit) { cells.push(['██', 'p-flash']); continue; }
          if (!over && cur) {
            var i = y - cur.y, j = x - cur.x;
            if (i >= 0 && i < cur.m.length && j >= 0 && j < cur.m[i].length && cur.m[i][j]) { ch = cur.c; }
            if (!ch) {
              var gi = y - gy;
              if (gi >= 0 && gi < cur.m.length && j >= 0 && j < cur.m[gi].length && cur.m[gi][j] && !board[y][x]) {
                cls = 'p-ghost'; glyph = '[]';
              }
            }
          }
          if (!ch && board[y][x]) ch = board[y][x];
          if (ch) { cls = ch; glyph = '██'; }
          cells.push([glyph, cls]);
        }
        rows.push(cells);
      }
      K.renderGrid(boardEl, rows);

      var side = [];
      side = side.concat(mini(hold, L('ホールド (c)', 'HOLD (c)')));
      side.push([[L('つぎ', 'NEXT'), 'dim']]);
      queue.slice(0, 3).forEach(function (n) {
        var m = PIECES[n].m, c = PIECES[n].c;
        m.forEach(function (row) {
          if (!row.some(function (v) { return v; })) return;
          var cells = [['  ', '']];
          row.forEach(function (v) { cells.push([v ? '██' : '  ', v ? c : '']); });
          side.push(cells);
        });
        side.push([['', '']]);
      });
      if (mode === 'sprint') {
        side.push([[L('残り ', 'LEFT ') , 'dim'], [String(Math.max(0, SPRINT_LINES - lines)), 'accent bold']]);
        side.push([[fmtTime(elapsed()), '']]);
      } else if (mode === 'ultra') {
        side.push([[L('残り時間', 'TIME'), 'dim']]);
        side.push([[fmtTime(Math.max(0, ULTRA_MS - elapsed())), elapsed() > ULTRA_MS - 15000 ? 'err bold' : 'accent bold']]);
      }
      if (combo > 0) side.push([[combo + ' REN', 'warn bold']]);
      if (b2b) side.push([['B2B', 'accent-2 bold']]);
      K.renderGrid(sideEl, side);

      var bestNow = K.readBest(recKey);
      K.renderParts(s.status, [
        [mode.toUpperCase() + '  ', 'accent-2 bold'],
        [L('得点 ', 'SCORE '), 'dim'], [String(score) + '  ', 'accent bold'],
        [L('レベル ', 'LEVEL '), 'dim'], [String(level + 1) + '  ', ''],
        [L('ライン ', 'LINES '), 'dim'], [String(lines) + '  ', ''],
        [L('最高 ', 'BEST '), 'dim'], [bestNow === null ? '-' : (mode === 'sprint' ? fmtTime(bestNow) : String(bestNow)), 'accent-2'],
        [paused ? L('   一時停止中', '   PAUSED') : '', 'warn bold']
      ]);
    }

    function gameOver() {
      if (over) return;
      over = true;
      K.sfx('die');
      draw();
      var lines2 = mode === 'sprint'
        ? [[{ t: L('積み上がってしまいました（スプリントは 40 ライン消すまでが勝負です）',
                   'Topped out — sprint counts only when you reach 40 lines.'), c: 'err' }],
           { row: [L('消したライン', 'lines'), lines + ' / ' + SPRINT_LINES] }]
        : K.scoreLines(L('ゲームオーバー', 'Game over'), [
            [L('得点', 'score'), score], [L('消したライン', 'lines'), lines],
            [L('レベル', 'level'), level + 1], [L('テトリス回数', 'tetrises'), tetrises]
          ], recKey, score);
      s.end(lines2.concat(['', [{ t: L('もう一度: ', 'again: '), c: 'dim' }, { t: 'tetris ' + mode, cmd: 'tetris ' + mode, c: 'accent' }]]));
    }

    var TITLE = { marathon: 'TETRIS', sprint: 'TETRIS — SPRINT 40', ultra: 'TETRIS — ULTRA 2:00' };
    var s = K.open({
      title: TITLE[mode],
      subtitle: mode === 'sprint' ? L('40 ラインをできるだけ速く消してください。', 'Clear 40 lines as fast as you can.')
        : mode === 'ultra' ? L('2 分間でどれだけ点を取れるか。', 'Score as much as you can in two minutes.')
        : L('← → 移動 / ↑ 回転 / ↓ 落とす / スペース 一気に落とす / c ホールド / p 一時停止 / q やめる',
            'arrows to move, up to rotate, space to hard drop, c to hold, p to pause, q to quit'),
      hint: L('← → 移動   ↑/x 右回転   z 左回転   ↓ ソフトドロップ   スペース ハードドロップ   c ホールド   p 一時停止   q やめる',
              'move ← →   rotate ↑/x (z = left)   soft ↓   hard space   hold c   pause p   quit q'),
      padCols: 3,
      pad: [['←', 'ArrowLeft'], ['回転', 'ArrowUp'], ['→', 'ArrowRight'],
            ['↓', 'ArrowDown'], ['落', ' '], ['H', 'c'],
            ['やめる', 'q', 'wide']],
      onQuit: function () {
        return mode === 'sprint'
          ? [[{ t: L('やめました（' + lines + ' / ' + SPRINT_LINES + ' ライン）', 'Stopped (' + lines + ' / ' + SPRINT_LINES + ' lines)'), c: 'dim' }]]
          : K.scoreLines(L('中断しました', 'Stopped'), [
              [L('得点', 'score'), score], [L('消したライン', 'lines'), lines]
            ], recKey, score);
      },
      onKey: function (key) {
        if (over) return;
        if (key === 'p') {
          paused = !paused;
          if (paused) { pausedAt = Date.now(); timer.stop(); }
          else { pausedTotal += Date.now() - pausedAt; timer.resume(); }
          draw();
          return;
        }
        if (paused || busy || !cur) return;
        if (key === 'ArrowLeft' || key === 'h') move(-1);
        else if (key === 'ArrowRight' || key === 'l') move(1);
        else if (key === 'ArrowDown' || key === 'j') softDrop();
        else if (key === 'ArrowUp' || key === 'x' || key === 'k') spin(1);
        else if (key === 'z') spin(3);
        else if (key === ' ') hardDrop();
        else if (key === 'c') doHold();
      }
    });

    s.body.appendChild(boardEl);
    s.body.appendChild(sideEl);
    s.body.className = 'g-body t-body';

    var timer = s.tick(function () {
      if (paused || over || busy || !cur) return;
      if (!collide(cur.m, cur.x, cur.y + 1)) { cur.y++; draw(); }
      else lock();
    }, SPEEDS[0]);

    // 時計（スプリントとウルトラ）
    if (mode !== 'marathon') {
      s.tick(function () {
        if (paused || over) return;
        if (!busy && checkEnd()) return;
        draw();
      }, 250);
    }

    spawn();
    s.msg(L('はじめ！', 'Go!'), 'accent');
    draw();
    return s.promise;
  }

  TB.def('tetris', {
    group: 'game',
    usage: 'tetris [marathon|sprint|ultra]',
    desc: { ja: 'テトリス。通常・40 ライン・2 分の 3 モード', en: 'Tetris: marathon, 40-line sprint and 2-minute ultra' },
    run: tetris
  });

  /* =====================================================================
     snake
     ===================================================================== */

  function snake(args) {
    var wrap = ((args && args[0]) || '').toLowerCase() === 'wrap';
    var recKey = wrap ? 'snake-wrap' : 'snake';
    var cols = 26, rows = 14;
    var body = [{ x: 12, y: 7 }, { x: 11, y: 7 }, { x: 10, y: 7 }];
    var dir = { x: 1, y: 0 }, pending = [];
    var food = null, gold = null, goldT = 0, score = 0, eaten = 0, alive = true, paused = false, speed = 150;

    function free() {
      for (var i = 0; i < 600; i++) {
        var p = { x: rnd(cols), y: rnd(rows) };
        if (body.some(function (b) { return b.x === p.x && b.y === p.y; })) continue;
        if (food && food.x === p.x && food.y === p.y) continue;
        return p;
      }
      return null;
    }
    food = free();

    var gridEl = document.createElement('div');
    gridEl.className = 'g-map';

    function draw() {
      var map = [];
      for (var y = 0; y < rows; y++) {
        var line = [];
        for (var x = 0; x < cols; x++) line.push(['· ', wrap ? 'p-empty' : 'p-empty']);
        map.push(line);
      }
      if (food) map[food.y][food.x] = ['◆◆', 'warn'];
      if (gold) map[gold.y][gold.x] = [goldT > 1.5 || Math.floor(goldT * 6) % 2 ? '★★' : '  ', 'n2048'];
      body.forEach(function (b, i) {
        map[b.y][b.x] = ['██', i === 0 ? 'accent bold' : (i % 2 ? 'accent' : 'accent-2')];
      });
      K.renderGrid(gridEl, map);
      K.renderParts(s.status, [
        [wrap ? L('壁抜け  ', 'WRAP  ') : '', 'accent-2 bold'],
        [L('得点 ', 'SCORE '), 'dim'], [String(score) + '  ', 'accent bold'],
        [L('長さ ', 'LENGTH '), 'dim'], [String(body.length) + '  ', ''],
        [L('速さ ', 'SPEED '), 'dim'], [String(Math.round((150 - speed) / 9) + 1) + '  ', ''],
        [L('最高 ', 'BEST '), 'dim'], [String(K.readBest(recKey) === null ? '-' : K.readBest(recKey)), 'accent-2'],
        [paused ? L('   一時停止中', '   PAUSED') : '', 'warn bold']
      ]);
    }

    function die() {
      alive = false;
      K.sfx('die');
      draw();
      s.end(K.scoreLines(L('ぶつかった！', 'You crashed!'), [
        [L('得点', 'score'), score], [L('長さ', 'length'), body.length], [L('食べた数', 'eaten'), eaten]
      ], recKey, score).concat(['', [{ t: L('もう一度: ', 'again: '), c: 'dim' },
        { t: 'snake', cmd: 'snake', c: 'accent' }, { t: '   ' }, { t: 'snake wrap', cmd: 'snake wrap', c: 'accent' }]]));
    }

    function step() {
      if (!alive || paused) return;
      if (pending.length) dir = pending.shift();
      var head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      if (wrap) {
        head.x = (head.x + cols) % cols;
        head.y = (head.y + rows) % rows;
      } else if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) { die(); return; }
      if (body.some(function (b, i) { return i < body.length - 1 && b.x === head.x && b.y === head.y; })) { die(); return; }

      body.unshift(head);
      var grew = false;
      if (food && head.x === food.x && head.y === food.y) {
        score += 10; eaten++; grew = true;
        K.sfx('eat');
        food = free();
        if (eaten % 5 === 0) {
          speed = Math.max(60, speed - 12);
          timer.setSpeed(speed);
          s.msg(L('速くなった！', 'Faster!'), 'warn');
        }
        if (!gold && Math.random() < 0.3) { gold = free(); goldT = 5; }
      }
      if (gold && head.x === gold.x && head.y === gold.y) {
        var bonus = 30 + Math.round(goldT * 10);
        score += bonus; grew = true;
        K.sfx('gold');
        s.msg(L('★ 黄金の実！ +' + bonus, '★ Golden fruit! +' + bonus), 'accent bold');
        gold = null;
      }
      if (!grew) body.pop();
      if (gold) {
        goldT -= speed / 1000;
        if (goldT <= 0) { gold = null; s.msg(L('黄金の実は消えてしまった。', 'The golden fruit vanished.'), 'dim'); }
      }
      draw();
    }

    function turn(x, y) {
      var last = pending.length ? pending[pending.length - 1] : dir;
      if (last.x === -x && last.y === -y) return;   // 逆走はしない
      if (last.x === x && last.y === y) return;
      if (pending.length < 2) pending.push({ x: x, y: y });
    }

    var s = K.open({
      title: wrap ? 'SNAKE — WRAP' : 'SNAKE',
      subtitle: wrap ? L('壁を抜けて反対側に出られます。ぶつかるのは自分の体だけ。', 'Walls wrap around. Only your own tail can stop you.')
                     : L('矢印キーで曲がる。壁と自分にぶつかると終わり。★ は時間内に取ると大きな得点。',
                         'Steer with the arrows. Walls and your tail are fatal. Grab ★ before it fades.'),
      hint: L('矢印 / hjkl / スワイプで移動   p 一時停止   q やめる', 'arrows / hjkl / swipe to steer   p pause   q quit'),
      swipe: true,
      padCols: 3,
      pad: [[' ', ''], ['↑', 'ArrowUp'], [' ', ''],
            ['←', 'ArrowLeft'], ['停止', 'p'], ['→', 'ArrowRight'],
            [' ', ''], ['↓', 'ArrowDown'], [' ', ''],
            ['やめる', 'q', 'wide']],
      onQuit: function () {
        return K.scoreLines(L('中断しました', 'Stopped'), [[L('得点', 'score'), score]], recKey, score);
      },
      onKey: function (key) {
        if (key === 'p') { paused = !paused; draw(); return; }
        if (key === 'ArrowUp' || key === 'k' || key === 'w') turn(0, -1);
        else if (key === 'ArrowDown' || key === 'j' || key === 's') turn(0, 1);
        else if (key === 'ArrowLeft' || key === 'h' || key === 'a') turn(-1, 0);
        else if (key === 'ArrowRight' || key === 'l' || key === 'd') turn(1, 0);
      }
    });

    s.body.appendChild(gridEl);
    var timer = s.tick(step, speed);
    s.msg(L('◆ を食べて伸ばそう。', 'Eat the ◆ to grow.'), 'accent');
    draw();
    return s.promise;
  }

  TB.def('snake', {
    group: 'game',
    usage: 'snake [wrap]',
    desc: { ja: 'スネーク。★ の黄金の実と、壁抜けモードつき', en: 'Snake, with golden fruit and a wrap-around mode' },
    run: snake
  });

  /* =====================================================================
     2048
     ===================================================================== */

  function game2048() {
    var grid = [];
    for (var i = 0; i < 4; i++) grid.push([0, 0, 0, 0]);
    var score = 0, won = false, over = false, undos = 3, history = [], best = 0;

    function empties() {
      var out = [];
      for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) if (!grid[y][x]) out.push([x, y]);
      return out;
    }
    function addTile() {
      var e = empties();
      if (!e.length) return;
      var p = e[rnd(e.length)];
      grid[p[1]][p[0]] = Math.random() < 0.9 ? 2 : 4;
    }
    addTile(); addTile();

    function slide(row) {
      var vals = row.filter(function (v) { return v; });
      var out = [], gained = 0;
      for (var i = 0; i < vals.length; i++) {
        if (vals[i] === vals[i + 1]) {
          out.push(vals[i] * 2);
          gained += vals[i] * 2;
          if (vals[i] * 2 === 2048) won = true;
          i++;
        } else out.push(vals[i]);
      }
      while (out.length < 4) out.push(0);
      return { row: out, gained: gained };
    }

    function move(dir) {
      var before = JSON.stringify(grid), gained = 0;
      var lines = [];
      for (var i = 0; i < 4; i++) {
        var line = [];
        for (var j = 0; j < 4; j++) {
          if (dir === 'left') line.push(grid[i][j]);
          else if (dir === 'right') line.push(grid[i][3 - j]);
          else if (dir === 'up') line.push(grid[j][i]);
          else line.push(grid[3 - j][i]);
        }
        lines.push(line);
      }
      lines = lines.map(function (line) {
        var r = slide(line);
        gained += r.gained;
        return r.row;
      });
      for (i = 0; i < 4; i++) {
        for (var j2 = 0; j2 < 4; j2++) {
          var v = lines[i][j2];
          if (dir === 'left') grid[i][j2] = v;
          else if (dir === 'right') grid[i][3 - j2] = v;
          else if (dir === 'up') grid[j2][i] = v;
          else grid[3 - j2][i] = v;
        }
      }
      if (JSON.stringify(grid) === before) return false;
      score += gained;
      K.sfx(gained ? 'merge' : 'move');
      addTile();
      var top = Math.max.apply(null, grid.map(function (r) { return Math.max.apply(null, r); }));
      if (top > best && top >= 128) s.msg(L(top + ' ができました！', 'You made ' + top + '!'), 'accent bold');
      best = Math.max(best, top);
      return true;
    }

    function canMove() {
      if (empties().length) return true;
      for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
        if (x < 3 && grid[y][x] === grid[y][x + 1]) return true;
        if (y < 3 && grid[y][x] === grid[y + 1][x]) return true;
      }
      return false;
    }

    var gridEl = document.createElement('div');
    gridEl.className = 'g-map n-grid';

    function pad(v) {
      var s2 = v ? String(v) : '·';
      var total = 6 - s2.length;
      var left = Math.floor(total / 2);
      return ' '.repeat(left) + s2 + ' '.repeat(total - left);
    }

    function draw() {
      var rows = [];
      rows.push([['┌──────┬──────┬──────┬──────┐', 'dim']]);
      for (var y = 0; y < 4; y++) {
        var cells = [['│', 'dim']];
        for (var x = 0; x < 4; x++) {
          var v = grid[y][x];
          cells.push([pad(v), v ? 'n' + v : 'p-empty']);
          cells.push(['│', 'dim']);
        }
        rows.push(cells);
        rows.push([[y < 3 ? '├──────┼──────┼──────┼──────┤' : '└──────┴──────┴──────┴──────┘', 'dim']]);
      }
      K.renderGrid(gridEl, rows);
      K.renderParts(s.status, [
        [L('得点 ', 'SCORE '), 'dim'], [String(score) + '  ', 'accent bold'],
        [L('戻せる ', 'UNDO '), 'dim'], [String(undos) + '  ', undos ? '' : 'dim'],
        [L('最高 ', 'BEST '), 'dim'], [String(K.readBest('2048') === null ? '-' : K.readBest('2048')), 'accent-2']
      ]);
    }

    var s = K.open({
      title: '2048',
      subtitle: L('矢印キーで寄せる。同じ数どうしが合わさる。2048 を目指そう。',
                  'Slide with the arrows. Equal tiles merge. Reach 2048.'),
      hint: L('矢印 / hjkl / スワイプで寄せる   u 一手戻す（3 回まで）   q やめる', 'arrows / hjkl / swipe to slide   u undo (3 left)   q quit'),
      swipe: true,
      padCols: 3,
      pad: [['u', 'u'], ['↑', 'ArrowUp'], [' ', ''],
            ['←', 'ArrowLeft'], [' ', ''], ['→', 'ArrowRight'],
            [' ', ''], ['↓', 'ArrowDown'], [' ', ''],
            ['やめる', 'q', 'wide']],
      onQuit: function () {
        return K.scoreLines(L('中断しました', 'Stopped'), [[L('得点', 'score'), score]], '2048', score);
      },
      onKey: function (key) {
        if (over) return;
        if (key === 'u') {
          if (!history.length || !undos) { K.sfx('bad'); s.msg(undos ? L('戻せる手がありません。', 'Nothing to undo.') : L('もう戻せません。', 'No undos left.'), 'dim'); return; }
          var h = history.pop();
          grid = h.grid; score = h.score; undos--;
          K.sfx('rotate');
          s.msg(L('一手戻しました（残り ' + undos + ' 回）', 'Undone (' + undos + ' left)'), 'accent-2');
          draw();
          return;
        }
        var dir = (key === 'ArrowLeft' || key === 'h') ? 'left'
          : (key === 'ArrowRight' || key === 'l') ? 'right'
          : (key === 'ArrowUp' || key === 'k') ? 'up'
          : (key === 'ArrowDown' || key === 'j') ? 'down' : null;
        if (!dir) return;
        var snap = { grid: grid.map(function (r) { return r.slice(); }), score: score };
        var moved = move(dir);
        if (moved) { history.push(snap); if (history.length > 10) history.shift(); }
        draw();
        if (won) {
          won = false;
          s.msg(L('2048 を作りました！ このまま続けられます。', 'You made 2048! Keep going if you like.'), 'accent bold');
        }
        if (!moved) return;
        if (!canMove()) {
          over = true;
          s.end(K.scoreLines(L('動かせる手がなくなりました', 'No moves left'), [
            [L('得点', 'score'), score],
            [L('最大のタイル', 'largest tile'), Math.max.apply(null, grid.map(function (r) { return Math.max.apply(null, r); }))]
          ], '2048', score).concat(['', [{ t: L('もう一度: 2048', 'play again: 2048'), c: 'dim' }]]));
        }
      }
    });

    s.body.appendChild(gridEl);
    s.msg(L('同じ数を合わせて大きくしよう。', 'Merge equal tiles to grow them.'), 'accent');
    draw();
    return s.promise;
  }

  TB.def('2048', {
    group: 'game',
    desc: { ja: '2048。同じ数を合わせて大きくする', en: '2048. Merge tiles to reach 2048' },
    run: game2048
  });

  /* =====================================================================
     mine — マインスイーパ
     ===================================================================== */

  var LEVELS = {
    easy: { w: 9, h: 9, n: 10 },
    normal: { w: 16, h: 12, n: 30 },
    hard: { w: 22, h: 14, n: 65 }
  };

  function mine(args) {
    var levelName = (args[0] || 'normal').toLowerCase();
    if (!LEVELS[levelName]) levelName = 'normal';
    var cfg = LEVELS[levelName];
    var w = cfg.w, h = cfg.h, total = cfg.n;
    var recKey = 'mine-' + levelName;

    var mines = [], open = [], flag = [], started = false, dead = false, cleared = false;
    for (var y = 0; y < h; y++) {
      mines.push([]); open.push([]); flag.push([]);
      for (var x = 0; x < w; x++) { mines[y].push(false); open[y].push(false); flag[y].push(false); }
    }
    var cx = Math.floor(w / 2), cy = Math.floor(h / 2), startedAt = 0, boom = null;

    function place(sx, sy) {
      var put = 0;
      while (put < total) {
        var x = rnd(w), y = rnd(h);
        if (mines[y][x]) continue;
        if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue;  // 最初の一手の周りは安全
        mines[y][x] = true;
        put++;
      }
      started = true;
      startedAt = Date.now();
    }

    function each(x, y, fn) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || (!dx && !dy)) continue;
        fn(nx, ny);
      }
    }

    function around(x, y) {
      var n = 0;
      each(x, y, function (nx, ny) { if (mines[ny][nx]) n++; });
      return n;
    }

    function reveal(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h || open[y][x] || flag[y][x]) return;
      open[y][x] = true;
      if (around(x, y) === 0 && !mines[y][x]) each(x, y, reveal);
    }

    function remaining() {
      var f = 0;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (flag[y][x]) f++;
      return total - f;
    }

    function checkWin() {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        if (!mines[y][x] && !open[y][x]) return false;
      }
      return true;
    }

    function lose(x, y) {
      dead = true;
      boom = [x, y];
      K.sfx('die');
      draw();
      s.end([[{ t: L('地雷を踏んでしまいました…', 'You hit a mine…'), c: 'err bold' }],
             [{ t: L('もう一度: ', 'again: '), c: 'dim' }, { t: 'mine ' + levelName, cmd: 'mine ' + levelName, c: 'accent' }]]);
    }

    function afterOpen() {
      if (checkWin()) {
        cleared = true;
        var secs = Math.floor((Date.now() - startedAt) / 1000);
        draw();
        s.end(K.scoreLines(L('全部開けました！', 'Cleared!'), [
          [L('時間', 'time'), secs + L(' 秒', 's')],
          [L('難度', 'level'), levelName]
        ], recKey, secs, true, function (v) { return v + L(' 秒', 's'); }));
        return;
      }
      draw();
    }

    function openCell(x, y) {
      if (dead || cleared) return;
      if (flag[y][x]) { s.msg(L('旗が立っています。f / 右クリックで外せます。', 'Flagged. f or right-click to unflag.'), 'dim'); return; }
      if (open[y][x]) { chord(x, y); return; }
      if (!started) place(x, y);
      if (mines[y][x]) { lose(x, y); return; }
      reveal(x, y);
      K.sfx('open');
      afterOpen();
    }

    /* 開いた数字の周りに、数字と同じだけ旗が立っていれば残りを一気に開く */
    function chord(x, y) {
      var n = around(x, y);
      if (!n) return;
      var f = 0;
      each(x, y, function (nx, ny) { if (flag[ny][nx]) f++; });
      if (f !== n) { K.sfx('bad'); return; }
      var hit = null;
      each(x, y, function (nx, ny) {
        if (flag[ny][nx] || open[ny][nx]) return;
        if (mines[ny][nx]) hit = hit || [nx, ny];
        else reveal(nx, ny);
      });
      if (hit) { lose(hit[0], hit[1]); return; }
      K.sfx('open');
      afterOpen();
    }

    function toggleFlag(x, y) {
      if (dead || cleared || open[y][x]) return;
      flag[y][x] = !flag[y][x];
      K.sfx('flag');
      draw();
    }

    var gridEl = document.createElement('div');
    gridEl.className = 'g-map m-grid';

    var NUMCLS = ['', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];

    function draw() {
      var frag = document.createDocumentFragment();
      for (var y = 0; y < h; y++) {
        var row = document.createElement('div');
        row.className = 'g-row';
        for (var x = 0; x < w; x++) {
          var glyph = '·', cls = 'p-empty';
          if (flag[y][x] && !open[y][x]) {
            glyph = 'F'; cls = dead && !mines[y][x] ? 'err' : 'warn bold';
          } else if (!open[y][x]) {
            if (dead && mines[y][x]) { glyph = '*'; cls = boom && boom[0] === x && boom[1] === y ? 'inv err' : 'err'; }
          } else if (mines[y][x]) {
            glyph = '*'; cls = 'err bold';
          } else {
            var n = around(x, y);
            glyph = n ? String(n) : ' ';
            cls = n ? NUMCLS[n] : 'm0';
          }
          var span = document.createElement('span');
          span.className = 'mc ' + cls + (x === cx && y === cy ? ' cur' : '') + (open[y][x] ? ' opened' : '');
          span.textContent = glyph + ' ';
          span.dataset.x = x;
          span.dataset.y = y;
          row.appendChild(span);
        }
        frag.appendChild(row);
      }
      gridEl.textContent = '';
      gridEl.appendChild(frag);
      var secs = started ? Math.floor(((cleared || dead) ? lastT : Date.now()) - startedAt) / 1000 : 0;
      K.renderParts(s.status, [
        [L('残り ', 'MINES '), 'dim'], [String(remaining()) + '  ', 'accent bold'],
        [L('時間 ', 'TIME '), 'dim'], [Math.floor(secs) + L(' 秒  ', 's  '), ''],
        [L('難度 ', 'LEVEL '), 'dim'], [levelName + '  ', 'accent-2'],
        [L('最短 ', 'BEST '), 'dim'],
        [String(K.readBest(recKey) === null ? '-' : K.readBest(recKey) + L(' 秒', 's')), 'accent-2']
      ]);
      if (!cleared && !dead) lastT = Date.now();
    }
    var lastT = Date.now();

    /* マウスと指 */
    var pressTimer = null, pressedFlag = false;
    function cellOf(e) {
      var t = e.target.closest && e.target.closest('.mc');
      if (!t) return null;
      return [parseInt(t.dataset.x, 10), parseInt(t.dataset.y, 10)];
    }
    gridEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    gridEl.addEventListener('pointerdown', function (e) {
      var c = cellOf(e);
      if (!c || dead || cleared) return;
      e.preventDefault();
      cx = c[0]; cy = c[1];
      if (e.button === 2) { toggleFlag(c[0], c[1]); return; }
      pressedFlag = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(function () { pressedFlag = true; toggleFlag(c[0], c[1]); if (navigator.vibrate) navigator.vibrate(20); }, 420);
    });
    gridEl.addEventListener('pointerup', function (e) {
      var c = cellOf(e);
      if (e.button === 2) return;
      clearTimeout(pressTimer);
      if (pressedFlag || !c) return;
      openCell(c[0], c[1]);
    });
    gridEl.addEventListener('pointerleave', function () { clearTimeout(pressTimer); });

    var s = K.open({
      title: 'MINESWEEPER (' + levelName + ')',
      subtitle: L('クリックで開く・右クリック（長押し）で旗。キーなら矢印とスペース、f で旗。',
                  'Click to open, right-click (long-press) to flag. Keys: arrows, space, f.'),
      hint: L('矢印 / hjkl 移動   スペース 開く   f 旗   開いた数字を開く＝周りを一括で開く   q やめる',
              'arrows / hjkl move   space open   f flag   open a number to chord   q quit'),
      padCols: 3,
      pad: [[' ', ''], ['↑', 'ArrowUp'], [' ', ''],
            ['←', 'ArrowLeft'], ['開', ' '], ['→', 'ArrowRight'],
            [' ', ''], ['↓', 'ArrowDown'], ['旗', 'f'],
            ['やめる', 'q', 'wide']],
      onQuit: function () {
        return [[{ t: L('やめました。', 'Stopped.'), c: 'dim' }]];
      },
      onKey: function (key) {
        if (dead || cleared) return;
        if (key === 'ArrowUp' || key === 'k') cy = clamp(cy - 1, 0, h - 1);
        else if (key === 'ArrowDown' || key === 'j') cy = clamp(cy + 1, 0, h - 1);
        else if (key === 'ArrowLeft' || key === 'h') cx = clamp(cx - 1, 0, w - 1);
        else if (key === 'ArrowRight' || key === 'l') cx = clamp(cx + 1, 0, w - 1);
        else if (key === 'f') { toggleFlag(cx, cy); return; }
        else if (key === ' ' || key === 'o' || key === 'Enter') { openCell(cx, cy); return; }
        else return;
        draw();
      }
    });

    s.body.appendChild(gridEl);
    s.msg(L('数字はまわり 8 マスの地雷の数です。', 'Numbers count the mines in the 8 neighbouring cells.'), 'accent');
    draw();
    s.tick(function () { if (started && !dead && !cleared) draw(); }, 1000);
    return s.promise;
  }

  TB.def('mine', {
    group: 'game',
    usage: 'mine [easy|normal|hard]',
    desc: { ja: 'マインスイーパ。マウスで開く・右クリックで旗', en: 'Minesweeper, playable with the mouse' },
    run: mine
  });

  /* =====================================================================
     sokoban — 倉庫番
     ===================================================================== */

  var SOKO = [
    ['  #####', '###   #', '#.@$  #', '### $.#', '#.##$ #', '# # . ##', '#$ *$$.#', '#   .  #', '########'],
    ['####  ', '# .#  ', '#  ###', '#*@  #', '#  $ #', '#  ###', '####  '],
    ['  ####', '###  ####', '#     $ #', '# #  #$ #', '# . .#@ #', '#########'],
    ['########', '#      #', '# .$@$.#', '#      #', '########'],
    ['  #####  ', '  #   #  ', '  #$  #  ', '###  $###', '#. $  . #', '### @ ###', '  #  ..#  ', '  ######  '],
    ['#######', '#     #', '# .$. #', '# $@$ #', '# .$. #', '#     #', '#######'],
    ['#########', '#  .#   #', '#  $$   #', '#  .# @ #', '#########'],
    ['######  ', '#    ###', '# $$@  #', '# ...  #', '#      #', '########']
  ];

  function sokoban(args) {
    var index = clamp(parseInt(args[0], 10) || 1, 1, SOKO.length) - 1;
    var map = [], goals = [], boxes = [], px = 0, py = 0;
    var moves = 0, pushes = 0, undo = [];

    function load(i) {
      index = i;
      map = []; goals = []; boxes = []; moves = 0; pushes = 0; undo = [];
      SOKO[index].forEach(function (row, y) {
        var line = [];
        row.split('').forEach(function (ch, x) {
          if (ch === '#') line.push('#');
          else line.push(' ');
          if (ch === '.' || ch === '*' || ch === '+') goals.push(x + ',' + y);
          if (ch === '$' || ch === '*') boxes.push({ x: x, y: y });
          if (ch === '@' || ch === '+') { px = x; py = y; }
        });
        map.push(line);
      });
    }
    load(index);

    function wall(x, y) { return !map[y] || map[y][x] === undefined || map[y][x] === '#'; }
    function boxAt(x, y) {
      for (var i = 0; i < boxes.length; i++) if (boxes[i].x === x && boxes[i].y === y) return boxes[i];
      return null;
    }
    function solved() {
      return boxes.every(function (b) { return goals.indexOf(b.x + ',' + b.y) !== -1; });
    }

    var gridEl = document.createElement('div');
    gridEl.className = 'g-map';

    function draw() {
      var rows = [];
      for (var y = 0; y < map.length; y++) {
        var cells = [];
        for (var x = 0; x < map[y].length; x++) {
          var goal = goals.indexOf(x + ',' + y) !== -1;
          var b = boxAt(x, y);
          if (wall(x, y)) cells.push(['##', 'dim']);
          else if (px === x && py === y) cells.push(['@ ', 'accent bold']);
          else if (b) cells.push([goal ? '$$' : '$ ', goal ? 'accent' : 'warn']);
          else if (goal) cells.push(['. ', 'accent-2']);
          else cells.push(['  ', '']);
        }
        rows.push(cells);
      }
      K.renderGrid(gridEl, rows);
      var done = boxes.filter(function (b) { return goals.indexOf(b.x + ',' + b.y) !== -1; }).length;
      K.renderParts(s.status, [
        [L('面 ', 'LEVEL '), 'dim'], [(index + 1) + '/' + SOKO.length + '  ', 'accent bold'],
        [L('置けた ', 'PLACED '), 'dim'], [done + '/' + boxes.length + '  ', ''],
        [L('手数 ', 'MOVES '), 'dim'], [moves + '  ', ''],
        [L('押した ', 'PUSHES '), 'dim'], [String(pushes) + '  ', ''],
        [L('最短 ', 'BEST '), 'dim'], [String(K.readBest('soko-' + (index + 1)) === null ? '-' : K.readBest('soko-' + (index + 1))), 'accent-2']
      ]);
    }

    function step(dx, dy) {
      var nx = px + dx, ny = py + dy;
      if (wall(nx, ny)) return;
      var b = boxAt(nx, ny);
      if (b) {
        var bx = nx + dx, by = ny + dy;
        if (wall(bx, by) || boxAt(bx, by)) return;
        undo.push({ px: px, py: py, box: b, bx: b.x, by: b.y });
        b.x = bx; b.y = by;
        pushes++;
        K.sfx(goals.indexOf(bx + ',' + by) !== -1 ? 'coin' : 'push');
      } else {
        undo.push({ px: px, py: py, box: null });
        K.sfx('step');
      }
      px = nx; py = ny;
      moves++;
      draw();

      if (solved()) {
        K.sfx('win');
        var rec = K.record('soko-' + (index + 1), moves, true);
        var bestMsg = rec.rank === 1 ? L('（この面の最短記録！）', ' (best for this level!)') : L('（最短 ' + rec.list[0].v + ' 手）', ' (best: ' + rec.list[0].v + ')');
        if (index + 1 < SOKO.length) {
          s.msg(L('クリア！ ' + moves + ' 手', 'Solved in ' + moves + ' moves') + bestMsg + L(' 次の面へ。', ' Next level.'), 'accent bold');
          setTimeout(function () { load(index + 1); draw(); }, 500);
        } else {
          s.end([[{ t: L('全 ' + SOKO.length + ' 面クリア！おみごと。', 'All ' + SOKO.length + ' levels solved. Nicely done.'), c: 'accent bold' }],
                 { row: [L('手数', 'moves'), String(moves)] }]);
        }
      }
    }

    var s = K.open({
      title: 'SOKOBAN',
      subtitle: L('$ を . の上にすべて押し込めばクリア。引くことはできません。',
                  'Push every $ onto a . — you can only push, never pull.'),
      hint: L('矢印 / hjkl / スワイプ 移動   u 一手戻す   r やり直し   n 次の面   q やめる',
              'arrows / hjkl / swipe move   u undo   r reset   n next level   q quit'),
      swipe: true,
      padCols: 3,
      pad: [['u', 'u'], ['↑', 'ArrowUp'], ['r', 'r'],
            ['←', 'ArrowLeft'], [' ', ''], ['→', 'ArrowRight'],
            [' ', ''], ['↓', 'ArrowDown'], [' ', ''],
            ['やめる', 'q', 'wide']],
      onQuit: function () {
        return [[{ t: L('やめました。', 'Stopped.'), c: 'dim' }]];
      },
      onKey: function (key) {
        if (key === 'ArrowUp' || key === 'k') step(0, -1);
        else if (key === 'ArrowDown' || key === 'j') step(0, 1);
        else if (key === 'ArrowLeft' || key === 'h') step(-1, 0);
        else if (key === 'ArrowRight' || key === 'l') step(1, 0);
        else if (key === 'r') { load(index); s.msg(L('やり直しました。', 'Level reset.'), 'dim'); draw(); }
        else if (key === 'n') { load(Math.min(index + 1, SOKO.length - 1)); draw(); }
        else if (key === 'u') {
          var u = undo.pop();
          if (!u) return;
          px = u.px; py = u.py;
          if (u.box) { u.box.x = u.bx; u.box.y = u.by; pushes--; }
          moves--;
          draw();
        }
      }
    });

    s.body.appendChild(gridEl);
    s.msg(L('箱を押して目印に載せましょう。', 'Push the boxes onto the marks.'), 'accent');
    draw();
    return s.promise;
  }

  TB.def('sokoban', {
    group: 'game',
    usage: 'sokoban [1-8]',
    desc: { ja: '倉庫番。箱を押して目印に載せる（全 8 面）', en: 'Sokoban. Push boxes onto the marks (8 levels)' },
    run: sokoban
  });
})();
