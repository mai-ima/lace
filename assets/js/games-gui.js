/*
 * games-gui.js — ボタンで遊ぶ小さなゲーム（かくし機能「ひみつの遊び場」の一部）。
 *
 *   guess 数当て / ttt 三目並べ / rps じゃんけん / hangman 言葉当て / blackjack / quiz レース・クイズ
 * どれもウィンドウの中で、ボタンとクリックだけで遊べる。記録は従来どおり best:<名前> に残る。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var G = TB.GuiGames = {};

  function L(j, e) { return TB.state.lang === 'ja' ? j : e; }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function sfx(n) { if (TB.Sfx) TB.Sfx.play(n); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function btn(label, cls, fn) {
    var b = el('button', cls || 'gbtn', label);
    b.type = 'button';
    b.addEventListener('click', function (ev) { ev.preventDefault(); fn(b); });
    return b;
  }
  function best(key, value, lower) {
    var cur = parseInt(TB.store.get('best:' + key, ''), 10);
    var better = isNaN(cur) || (lower ? value < cur : value > cur);
    if (better) TB.store.set('best:' + key, String(value));
    return { best: better ? value : cur, updated: better };
  }
  function frame(title, width) {
    var win = TB.Win.open({ title: title, width: width || 440, bodyClass: 'gg-body' });
    var body = win.body;
    var box = el('div', 'gg');
    body.appendChild(box);
    return { win: win, box: box };
  }
  function bar(parent, text) { var d = el('div', 'gg-msg', text); parent.appendChild(d); return d; }

  /* ---------- 数当て ---------- */
  G.guess = function () {
    var f = frame(L('数当て', 'Guess the number'), 420), box = f.box;
    var target, lo, hi, tries;
    function start() {
      target = 1 + rnd(100); lo = 1; hi = 100; tries = 0; render('');
    }
    function render(msg) {
      box.textContent = '';
      bar(box, L('1〜100 の数を当てよう。', 'Guess a number from 1 to 100.'));
      var range = el('div', 'gg-big', lo + ' – ' + hi);
      box.appendChild(range);
      if (msg) bar(box, msg).className = 'gg-msg accent';
      bar(box, L(tries + ' 回目', 'tries: ' + tries));
      var input = el('input', 'gg-input'); input.type = 'number'; input.min = 1; input.max = 100;
      var go = function () {
        var n = parseInt(input.value, 10);
        if (isNaN(n) || n < 1 || n > 100) { render(L('1〜100 の数を入れてください。', 'Enter 1–100.')); return; }
        tries++;
        if (n === target) {
          var r = best('guess', tries, true); sfx('win');
          box.textContent = '';
          bar(box, L('正解！ ' + target, 'Correct! ' + target)).className = 'gg-msg accent';
          bar(box, L(tries + ' 回で当てました。', 'Got it in ' + tries + '.'));
          bar(box, r.updated ? L('自己最高記録！', 'New personal best!') : L('自己最高: ' + r.best + ' 回', 'Best: ' + r.best));
          box.appendChild(btn(L('もう一度', 'Again'), 'gbtn accent', start));
          return;
        }
        if (n < target) lo = Math.max(lo, n + 1); else hi = Math.min(hi, n - 1);
        render(n < target ? L('もっと大きい ↑', 'higher ↑') : L('もっと小さい ↓', 'lower ↓'));
      };
      input.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') go(); });
      box.appendChild(input);
      box.appendChild(btn(L('決定', 'Go'), 'gbtn accent', go));
      setTimeout(function () { input.focus(); }, 30);
    }
    start();
  };

  /* ---------- 三目並べ ---------- */
  G.ttt = function () {
    var f = frame(L('三目並べ', 'Tic-tac-toe'), 360), box = f.box;
    var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    var rec = { w: 0, l: 0, d: 0 };
    try { rec = JSON.parse(TB.store.get('ttt', '') || '') || rec; } catch (e) { /* ignore */ }
    var level = 'normal', b, over;
    function winner(s) { for (var i = 0; i < 8; i++) { var l = LINES[i]; if (s[l[0]] && s[l[0]] === s[l[1]] && s[l[1]] === s[l[2]]) return s[l[0]]; } return s.indexOf('') < 0 ? 'd' : null; }
    function mm(s, turn) {
      var w = winner(s); if (w === 'O') return 1; if (w === 'X') return -1; if (w === 'd') return 0;
      var bestv = turn === 'O' ? -2 : 2;
      for (var i = 0; i < 9; i++) if (!s[i]) { s[i] = turn; var v = mm(s, turn === 'O' ? 'X' : 'O'); s[i] = ''; bestv = turn === 'O' ? Math.max(bestv, v) : Math.min(bestv, v); }
      return bestv;
    }
    function cpu() {
      var free = []; for (var i = 0; i < 9; i++) if (!b[i]) free.push(i);
      if (level === 'easy' || (level === 'normal' && Math.random() < 0.35)) return pick(free);
      var bi = free[0], bv = -2;
      free.forEach(function (i) { b[i] = 'O'; var v = mm(b, 'X'); b[i] = ''; if (v > bv) { bv = v; bi = i; } });
      return bi;
    }
    function fin(w) {
      over = true;
      if (w === 'X') { rec.w++; sfx('win'); } else if (w === 'O') { rec.l++; sfx('bad'); } else { rec.d++; sfx('lock'); }
      TB.store.set('ttt', JSON.stringify(rec));
    }
    function render() {
      box.textContent = '';
      var w = winner(b);
      bar(box, w ? (w === 'X' ? L('あなたの勝ち！', 'You win!') : w === 'O' ? L('CPU の勝ち', 'CPU wins') : L('引き分け', 'Draw')) : L('あなたは X。マスをクリック。', 'You are X. Click a cell.'));
      var grid = el('div', 'gg-grid3');
      b.forEach(function (c, i) {
        var cell = btn(c || '·', 'gg-cell' + (c === 'X' ? ' me' : c === 'O' ? ' cpu' : ''), function () {
          if (over || b[i]) return;
          b[i] = 'X'; sfx('click');
          var w2 = winner(b); if (w2) { fin(w2); render(); return; }
          b[cpu()] = 'O';
          w2 = winner(b); if (w2) fin(w2);
          render();
        });
        grid.appendChild(cell);
      });
      box.appendChild(grid);
      bar(box, L(rec.w + ' 勝 ' + rec.l + ' 敗 ' + rec.d + ' 分', rec.w + 'W ' + rec.l + 'L ' + rec.d + 'D'));
      var row = el('div', 'grow');
      [['easy', L('やさしい', 'easy')], ['normal', L('ふつう', 'normal')], ['hard', L('つよい', 'hard')]].forEach(function (p) {
        row.appendChild(btn(p[1], 'gbtn' + (level === p[0] ? ' on' : ''), function () { level = p[0]; reset(); }));
      });
      row.appendChild(btn(L('もう一局', 'New game'), 'gbtn accent', reset));
      box.appendChild(row);
    }
    function reset() { b = ['', '', '', '', '', '', '', '', '']; over = false; render(); }
    reset();
  };

  /* ---------- じゃんけん ---------- */
  G.rps = function () {
    var f = frame(L('じゃんけん', 'Rock paper scissors'), 380), box = f.box;
    var H = [{ k: 'r', a: '', ja: 'グー', en: 'rock', beats: 's' }, { k: 's', a: '', ja: 'チョキ', en: 'scissors', beats: 'p' }, { k: 'p', a: '', ja: 'パー', en: 'paper', beats: 'r' }];
    var t = { w: 0, l: 0, d: 0 }, msg = L('手を選んでね。', 'Pick a hand.');
    function render() {
      box.textContent = '';
      bar(box, msg).className = 'gg-msg accent';
      var row = el('div', 'grow');
      H.forEach(function (h) {
        row.appendChild(btn(L(h.ja, h.en), 'gbtn gg-hand', function () {
          var c = pick(H);
          var res;
          if (c.k === h.k) { t.d++; res = L('あいこ', 'Draw'); sfx('lock'); }
          else if (h.beats === c.k) { t.w++; res = L('あなたの勝ち！', 'You win!'); sfx('coin'); }
          else { t.l++; res = L('あなたの負け', 'You lose'); sfx('bad'); }
          msg = L('あなた ' + L(h.ja, h.en) + ' / CPU ' + L(c.ja, c.en) + '　→　' + res, 'you ' + h.en + ' / cpu ' + c.en + ' → ' + res);
          render();
        }));
      });
      box.appendChild(row);
      bar(box, L(t.w + ' 勝 ' + t.l + ' 敗 ' + t.d + ' 分', t.w + 'W ' + t.l + 'L ' + t.d + 'D'));
    }
    render();
  };

  /* ---------- 言葉当て ---------- */
  var WORDS = [
    ['circuit', 'コース。周回して走る'], ['gearbox', 'ギアを入れ替える箱'], ['nitro', 'ひと息のブースト'], ['drift', '横滑りで曲がる'],
    ['pitstop', 'レース中の整備と給油'], ['podium', '表彰台'], ['chicane', '小さなS字のコーナー'], ['slipstream', '前の車の後ろで風を避ける'],
    ['overtake', '前の車を抜く'], ['qualifying', '予選'], ['paddock', 'ピットの裏の広場'], ['throttle', 'アクセルのこと'],
    ['brake', 'ぶれーき'], ['tunnel', '山をくりぬいた道'], ['hairpin', 'ヘアピンカーブ'], ['rally', '道なき道を走る競技']
  ];
  G.hangman = function () {
    var f = frame(L('言葉当て', 'Hangman'), 460), box = f.box;
    var w, hit, bad, over;
    function start() { var p = pick(WORDS); w = p; hit = []; bad = []; over = null; render(); }
    function render() {
      box.textContent = '';
      var shown = w[0].split('').map(function (c) { return hit.indexOf(c) >= 0 || over ? c : '_'; }).join(' ');
      box.appendChild(el('div', 'gg-big', shown));
      bar(box, L('ヒント: ', 'Hint: ') + w[1]);
      bar(box, L('ミス: ', 'Misses: ') + bad.join(' ') + '　(' + bad.length + ' / 7)');
      if (over) {
        bar(box, over === 'win' ? L('正解！', 'You got it!') : L('残念…答えは ' + w[0], 'Out of tries: ' + w[0])).className = 'gg-msg accent';
        if (over === 'win') { var r = best('hangman', 7 - bad.length, false); bar(box, L('余り: ' + (7 - bad.length) + '（最高 ' + r.best + '）', 'spare: ' + (7 - bad.length) + ' (best ' + r.best + ')')); }
        box.appendChild(btn(L('もう一度', 'Again'), 'gbtn accent', start));
        return;
      }
      var keys = el('div', 'gg-keys');
      'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function (c) {
        var used = hit.indexOf(c) >= 0 || bad.indexOf(c) >= 0;
        var b = btn(c, 'gbtn gg-key' + (used ? ' dis' : ''), function () {
          if (used) return;
          if (w[0].indexOf(c) >= 0) { hit.push(c); sfx('click'); if (w[0].split('').every(function (x) { return hit.indexOf(x) >= 0; })) { over = 'win'; sfx('win'); } }
          else { bad.push(c); sfx('bad'); if (bad.length >= 7) over = 'lose'; }
          render();
        });
        keys.appendChild(b);
      });
      box.appendChild(keys);
    }
    start();
  };

  /* ---------- ブラックジャック ---------- */
  G.blackjack = function () {
    var f = frame(L('ブラックジャック', 'Blackjack'), 440), box = f.box;
    var tally = { w: 0, l: 0, d: 0 }, deck, P, D, done, msg;
    function newDeck() { var d = []; for (var s = 0; s < 4; s++) for (var r = 1; r <= 13; r++) d.push(r); for (var i = d.length - 1; i > 0; i--) { var j = rnd(i + 1), t = d[i]; d[i] = d[j]; d[j] = t; } return d; }
    function val(h) { var t = 0, a = 0; h.forEach(function (c) { if (c === 1) { a++; t += 11; } else t += Math.min(c, 10); }); while (t > 21 && a > 0) { t -= 10; a--; } return t; }
    function name(c) { return c === 1 ? 'A' : c === 11 ? 'J' : c === 12 ? 'Q' : c === 13 ? 'K' : String(c); }
    function draw() { if (deck.length < 6) deck = newDeck(); return deck.pop(); }
    function deal() { deck = deck && deck.length > 12 ? deck : newDeck(); P = [draw(), draw()]; D = [draw(), draw()]; done = false; msg = ''; if (val(P) === 21) stand(); else render(); }
    function finish(res, text) { done = true; tally[res]++; msg = text; sfx(res === 'w' ? 'win' : res === 'l' ? 'bad' : 'lock'); render(); }
    function stand() { while (val(D) < 17) D.push(draw()); var p = val(P), d = val(D);
      if (d > 21 || p > d) finish('w', L('あなたの勝ち！', 'You win!')); else if (p === d) finish('d', L('引き分け', 'Push')); else finish('l', L('あなたの負け', 'Dealer wins')); }
    function render() {
      box.textContent = '';
      bar(box, L('ディーラー: ', 'Dealer: ') + (done ? D.map(name).join(' ') + '  (' + val(D) + ')' : name(D[0]) + ' ?'));
      bar(box, L('あなた: ', 'You: ') + P.map(name).join(' ') + '  (' + val(P) + ')').className = 'gg-msg accent';
      if (msg) bar(box, msg).className = 'gg-msg accent';
      var row = el('div', 'grow');
      if (!done) {
        row.appendChild(btn(L('ヒット（もう1枚）', 'Hit'), 'gbtn', function () { P.push(draw()); if (val(P) > 21) finish('l', L('バスト！ 21 超え', 'Bust!')); else render(); }));
        row.appendChild(btn(L('スタンド', 'Stand'), 'gbtn accent', stand));
      } else row.appendChild(btn(L('次のゲーム', 'Next hand'), 'gbtn accent', deal));
      box.appendChild(row);
      bar(box, L(tally.w + ' 勝 ' + tally.l + ' 敗 ' + tally.d + ' 分', tally.w + 'W ' + tally.l + 'L ' + tally.d + 'D'));
    }
    deal();
  };

  /* ---------- レース・クイズ ---------- */
  var QUESTIONS = [
    { q: 'F1 で、コースを 1 周する速さを競う予選は？', a: ['タイムアタック', '耐久レース', 'ドラッグレース', 'ラリー'] },
    { q: 'タイヤが路面を捉える力を何という？', a: ['グリップ', 'ブースト', 'ドラフト', 'アンダー'] },
    { q: '前の車の後ろにつくと空気抵抗が減る現象は？', a: ['スリップストリーム', 'ドリフト', 'ヒール・トウ', 'ピットイン'] },
    { q: 'レース中にタイヤ交換や給油をする場所は？', a: ['ピット', 'パドック', 'グリッド', 'ヘアピン'] },
    { q: 'スタート前に並ぶ、決められた位置は？', a: ['グリッド', 'シケイン', 'ポディウム', 'ストレート'] },
    { q: 'フラッグの「チェッカー」は何の合図？', a: ['ゴール', 'スタート', '危険', '給油'] },
    { q: '小さな連続カーブ「S字」を、英語で何と呼ぶ？', a: ['シケイン', 'ヘアピン', 'ストレート', 'バンク'] },
    { q: '車の後輪を滑らせて曲がる運転を何という？', a: ['ドリフト', 'ブレーキング', 'ローリング', 'パーキング'] },
    { q: 'マニュアル車で、回転数を合わせながら速度を落とす技は？', a: ['ヒール・トウ', 'ウィリー', 'ジャックナイフ', 'ホイールスピン'] },
    { q: '日本で最初の国際レース場「鈴鹿サーキット」のコースの形は？', a: ['8 の字（立体交差）', '円', '四角', '直線'] },
    { q: 'ラリーで、運転手の隣に座って道を読む人は？', a: ['コ・ドライバー', 'メカニック', 'マーシャル', 'スポンサー'] },
    { q: '車がカーブで外へ膨らむ癖を何という？', a: ['アンダーステア', 'オーバーステア', 'ニュートラル', 'スピン'] }
  ];
  G.quiz = function () {
    var f = frame(L('レース・クイズ', 'Racing quiz'), 480), box = f.box;
    var list, i, score;
    function start() {
      var pool = QUESTIONS.slice(), n = 8; list = [];
      while (list.length < n && pool.length) {
        var it = pool.splice(rnd(pool.length), 1)[0], sh = it.a.slice();
        for (var k = sh.length - 1; k > 0; k--) { var j = rnd(k + 1), t = sh[k]; sh[k] = sh[j]; sh[j] = t; }
        list.push({ q: it.q, s: sh, c: it.a[0] });
      }
      i = 0; score = 0; ask();
    }
    function ask() {
      box.textContent = '';
      if (i >= list.length) {
        var r = best('quiz', score, false); sfx('win');
        bar(box, L(list.length + ' 問中 ' + score + ' 問正解！', score + ' / ' + list.length + ' correct!')).className = 'gg-msg accent';
        bar(box, r.updated ? L('自己最高記録！', 'New best!') : L('自己最高: ' + r.best, 'Best: ' + r.best));
        box.appendChild(btn(L('もう一度', 'Again'), 'gbtn accent', start));
        return;
      }
      var q = list[i];
      bar(box, L('第 ' + (i + 1) + ' 問 / ' + list.length, 'Q' + (i + 1) + ' / ' + list.length));
      bar(box, q.q).className = 'gg-msg accent';
      q.s.forEach(function (a) {
        box.appendChild(btn(a, 'gbtn gg-opt', function () {
          if (a === q.c) { score++; sfx('coin'); } else sfx('bad');
          bar(box, a === q.c ? L('正解！', 'Correct!') : L('残念。正解は「' + q.c + '」', 'Answer: ' + q.c)).className = 'gg-msg accent';
          i++;
          Array.prototype.forEach.call(box.querySelectorAll('.gg-opt'), function (b) { b.disabled = true; });
          box.appendChild(btn(L('次へ', 'Next'), 'gbtn accent', ask));
        }));
      });
    }
    start();
  };
})();
