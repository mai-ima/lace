/*
 * hub.js — かくし機能「ひみつの遊び場」。
 *
 *   開き方: ↑↑↓↓←→←→ B A ／ タイトルのロゴを 7 回タップ ／ URL の末尾に #hidden
 *   中身:   キーで遊ぶゲーム（テトリス・スネーク・2048・マインスイーパ・倉庫番・ローグライク）、
 *           ボタンで遊ぶゲーム（数当て・三目並べ・じゃんけん・言葉当て・ブラックジャック・クイズ）、
 *           ツール（ドット絵・電卓・設定）。
 * 文字だけの画面（ターミナル）は無く、すべてウィンドウとボタンで動く。
 */
(function () {
  'use strict';

  var TB = window.TB;
  function L(j, e) { return TB.state.lang === 'ja' ? j : e; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var KEY_GAMES = [
    ['tetris', 'テトリス', 'Tetris', 'brick'], ['snake', 'スネーク', 'Snake', 'snake'], ['2048', '2048', '2048', 'num'],
    ['mine', 'マインスイーパ', 'Minesweeper', 'bomb'], ['sokoban', '倉庫番', 'Sokoban', 'box'], ['rogue', 'ローグライク', 'Roguelike', 'dagger']
  ];
  var BTN_GAMES = [
    ['guess', '数当て', 'Guess', 'target'], ['ttt', '三目並べ', 'Tic-tac-toe', 'circleo'], ['rps', 'じゃんけん', 'RPS', 'hand'],
    ['hangman', '言葉当て', 'Hangman', 'letters'], ['blackjack', 'ブラックジャック', 'Blackjack', 'cards'], ['quiz', 'レース・クイズ', 'Racing quiz', 'question']
  ];
  var TOOLS = [
    ['paint', 'ドット絵', 'Pixel paint', 'palette'], ['gcalc', '電卓', 'Calculator', 'calc'], ['settings', '設定', 'Settings', 'gear']
  ];

  /** キー操作のゲームは、ウィンドウの中の文字盤に描かせる */
  function playKeyGame(id, label) {
    var cmd = TB.commands[id];
    if (!cmd) return;
    var holder = { win: null, active: false };
    var win = TB.Win.open({ title: label, width: 700, bodyClass: 'gh-body', onClose: function () {
      if (holder.active) { holder.active = false; TB.Term.press('Escape'); }
    } });
    holder.win = win;
    var screen = el('div', 'screen gh-screen');
    win.body.appendChild(screen);
    TB.Term.mount(screen);
    holder.active = true;
    var r;
    try { r = cmd.run([], {}); } catch (e) { screen.textContent = String(e && e.message || e); return; }
    function after(lines) {
      holder.active = false;
      if (lines && lines.length) TB.Term.printAll(lines);
      if (win.closed) return;
      var bar = el('div', 'gh-bar');
      var again = el('button', 'gbtn accent', L('もう一度', 'Play again')); again.type = 'button';
      again.addEventListener('click', function () { win.close(); playKeyGame(id, label); });
      var close = el('button', 'gbtn', L('閉じる', 'Close')); close.type = 'button';
      close.addEventListener('click', function () { win.close(); });
      bar.appendChild(again); bar.appendChild(close);
      win.body.appendChild(bar);
    }
    if (r && typeof r.then === 'function') r.then(after, function () { holder.active = false; });
    else after(r);
  }

  function launch(kind, id, label) {
    if (kind === 'key') playKeyGame(id, label);
    else if (kind === 'btn') TB.GuiGames[id]();
    else if (TB.commands[id]) TB.commands[id].run([], {});
  }

  var hubWin = null;
  function open() {
    if (hubWin && !hubWin.closed) { hubWin.focus(); return; }
    hubWin = TB.Win.open({ title: L('ひみつの遊び場', 'The Hidden Playground'), width: 520 });
    var b = hubWin.body;
    b.classList.add('hub-body');
    function section(title, list, kind) {
      var s = el('div', 'gsec');
      s.appendChild(el('div', 'glabel', title));
      var grid = el('div', 'hub-grid');
      list.forEach(function (g) {
        var bt = el('button', 'hub-tile'); bt.type = 'button';
        var hic = el('span', 'hub-ic'); hic.appendChild(TB.Race.iconNode(g[3], 34)); bt.appendChild(hic);
        bt.appendChild(el('span', 'hub-nm', L(g[1], g[2])));
        bt.addEventListener('click', function () { if (TB.Sfx) TB.Sfx.play('click'); launch(kind, g[0], L(g[1], g[2])); });
        grid.appendChild(bt);
      });
      s.appendChild(grid);
      b.appendChild(s);
    }
    section(L('キーで遊ぶ', 'Keyboard games'), KEY_GAMES, 'key');
    section(L('ボタンで遊ぶ', 'Click games'), BTN_GAMES, 'btn');
    section(L('ツール', 'Tools'), TOOLS, 'tool');
    b.appendChild(el('div', 'gg-msg hub-note', L('ここは、ひみつの場所です。', 'This place is a secret.')));
  }

  /* ---------- ひみつの開き方 ---------- */
  var KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'], pos = 0;
  window.addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === KONAMI[pos]) { pos++; if (pos === KONAMI.length) { pos = 0; open(); } }
    else pos = k === KONAMI[0] ? 1 : 0;
  }, true);
  function fromHash() { if (/^#\/?hidden$/i.test(location.hash)) open(); }
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('load', function () { setTimeout(fromHash, 300); });

  var taps = 0, tapT = 0;
  TB.secretTap = function () {
    var now = Date.now();
    taps = now - tapT < 1500 ? taps + 1 : 1; tapT = now;
    if (taps >= 7) { taps = 0; open(); }
  };

  TB.Hub = { open: open };
})();
