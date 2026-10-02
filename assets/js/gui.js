/*
 * gui.js — 画面に重ねる GUI の部品と、GUI アプリ。
 *
 *   TB.Win  … ドラッグで動かせる小さなウィンドウ（閉じる・最大化つき）
 *   TB.Sfx  … 効果音（WebAudio で合成。音源ファイルは使わない）
 *
 * GUI アプリ（「ひみつの遊び場」から開く）:
 *   settings … 言語・音・文字の大きさ・記録の消去
 *   paint    … ドット絵（PNG 保存）
 *   gcalc    … ボタンで押す電卓
 *   sound / windows / closeall
 */
(function () {
  'use strict';

  var TB = window.TB;
  var def = TB.def;

  function ja() { return TB.state.lang === 'ja'; }
  function L(j, e) { return ja() ? j : e; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function button(label, cls, onClick) {
    var b = el('button', cls || 'gbtn', label);
    b.type = 'button';
    b.addEventListener('click', function (ev) { ev.preventDefault(); onClick(ev); });
    return b;
  }

  /* =====================================================================
     効果音
     ===================================================================== */

  var actx = null;
  function audio() {
    if (!actx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { actx = new C(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) { /* ignore */ } }
    return actx;
  }

  function enabled() { return TB.store.get('sound', '1') === '1'; }
  function volume() {
    var v = parseFloat(TB.store.get('vol', '0.05'));
    return isNaN(v) ? 0.05 : Math.max(0, Math.min(0.25, v));
  }

  /* [周波数, 長さ(秒), 波形] を順番に鳴らす */
  var SOUNDS = {
    move: [[520, 0.025]],
    rotate: [[760, 0.035]],
    drop: [[170, 0.07, 'triangle']],
    lock: [[240, 0.04, 'triangle']],
    clear: [[523, 0.06], [659, 0.06], [784, 0.1]],
    tetris: [[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.2]],
    eat: [[880, 0.04], [1320, 0.06]],
    gold: [[1047, 0.05], [1319, 0.05], [1568, 0.1]],
    die: [[330, 0.1, 'sawtooth'], [220, 0.12, 'sawtooth'], [110, 0.28, 'sawtooth']],
    win: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.28]],
    click: [[1200, 0.015]],
    coin: [[988, 0.05], [1319, 0.12]],
    hit: [[140, 0.06, 'square']],
    hurt: [[200, 0.08, 'sawtooth'], [140, 0.1, 'sawtooth']],
    crash: [[90, 0.16, 'sawtooth'], [60, 0.2, 'sawtooth']],
    boost: [[220, 0.04, 'sawtooth'], [330, 0.04, 'sawtooth'], [494, 0.08, 'sawtooth']],
    lap: [[784, 0.08], [988, 0.14]],
    count: [[440, 0.14]],
    go: [[880, 0.35]],
    flag: [[700, 0.035], [520, 0.035]],
    open: [[320, 0.025, 'triangle']],
    bad: [[200, 0.09], [150, 0.12]],
    merge: [[660, 0.03], [880, 0.05]],
    push: [[260, 0.04, 'triangle']],
    step: [[400, 0.015, 'triangle']]
  };

  function play(name) {
    if (!enabled()) return;
    var seq = SOUNDS[name], ac = audio();
    if (!seq || !ac) return;
    var t = ac.currentTime, vol = volume();
    if (vol <= 0) return;
    seq.forEach(function (n) {
      try {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = n[2] || 'square';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n[1]);
        o.connect(g); g.connect(ac.destination);
        o.start(t); o.stop(t + n[1] + 0.02);
      } catch (e) { /* ignore */ }
      t += n[1];
    });
  }

  /** 途切れず鳴り続ける音（レースのエンジン）。set(0..1) で回転数、stop() で止まる */
  function engine() {
    var none = { set: function () {}, stop: function () {} };
    if (!enabled() || volume() <= 0) return none;
    var ac = audio();
    if (!ac) return none;
    try {
      var o1 = ac.createOscillator(), o2 = ac.createOscillator();
      var f = ac.createBiquadFilter(), g = ac.createGain();
      o1.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 700;
      g.gain.value = volume() * 0.45;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(ac.destination);
      o1.frequency.value = 50; o2.frequency.value = 25;
      o1.start(); o2.start();
      var stopped = false;
      return {
        set: function (rpm) {
          if (stopped) return;
          var fr = 45 + rpm * 140;
          o1.frequency.setTargetAtTime(fr, ac.currentTime, 0.05);
          o2.frequency.setTargetAtTime(fr * 0.5, ac.currentTime, 0.05);
        },
        stop: function () {
          if (stopped) return;
          stopped = true;
          try {
            g.gain.setTargetAtTime(0, ac.currentTime, 0.05);
            o1.stop(ac.currentTime + 0.25); o2.stop(ac.currentTime + 0.25);
          } catch (e) { /* ignore */ }
        }
      };
    } catch (e) { return none; }
  }

  TB.Sfx = {
    play: play, engine: engine, enabled: enabled, volume: volume, ctx: audio,
    set: function (on) { TB.store.set('sound', on ? '1' : '0'); },
    setVolume: function (v) { TB.store.set('vol', String(Math.max(0, Math.min(0.25, v)))); }
  };

  /* =====================================================================
     ウィンドウ
     ===================================================================== */

  var wins = [];
  var zTop = 80;

  function narrow() { return window.innerWidth < 720; }

  function openWin(opts) {
    var w = el('div', 'win');
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-label', opts.title);
    var bar = el('div', 'win-bar');
    var title = el('span', 'win-title', opts.title);
    var btns = el('span', 'win-btns');
    var body = el('div', 'win-body' + (opts.bodyClass ? ' ' + opts.bodyClass : ''));
    var win = { el: w, body: body, bar: bar, closed: false };

    var bMax = button('□', 'win-btn', function () { toggleMax(); });
    bMax.title = L('最大化', 'maximize');
    var bClose = button('×', 'win-btn close', function () { win.close(); });
    bClose.title = L('閉じる (Esc)', 'close (Esc)');
    btns.appendChild(bMax);
    btns.appendChild(bClose);
    bar.appendChild(title);
    bar.appendChild(btns);
    w.appendChild(bar);
    w.appendChild(body);
    document.body.appendChild(w);

    var width = Math.min(opts.width || 420, window.innerWidth - 24);
    w.style.width = width + 'px';
    if (opts.height) w.style.height = Math.min(opts.height, window.innerHeight - 24) + 'px';
    var rect = w.getBoundingClientRect();
    var offset = (wins.length % 5) * 24;
    w.style.left = Math.max(8, (window.innerWidth - rect.width) / 2 + offset) + 'px';
    w.style.top = Math.max(8, (window.innerHeight - rect.height) / 2 - 20 + offset) + 'px';

    function focusWin() {
      zTop += 1;
      w.style.zIndex = zTop;
      wins.forEach(function (x) { x.el.classList.toggle('active', x === win); });
    }
    function toggleMax() {
      w.classList.toggle('max');
      if (opts.onResize) setTimeout(opts.onResize, 30);
    }

    /* ドラッグ（マウスでも指でも） */
    var drag = null;
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.win-btn')) return;
      focusWin();
      if (w.classList.contains('max')) return;
      var r = w.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    bar.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = Math.min(Math.max(e.clientX - drag.dx, -w.offsetWidth + 80), window.innerWidth - 80);
      var y = Math.min(Math.max(e.clientY - drag.dy, 0), window.innerHeight - 40);
      w.style.left = x + 'px';
      w.style.top = y + 'px';
    });
    function endDrag() { drag = null; }
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
    bar.addEventListener('dblclick', function (e) {
      if (e.target.closest('.win-btn')) return;
      toggleMax();
    });
    w.addEventListener('pointerdown', focusWin);

    win.close = function () {
      if (win.closed) return;
      win.closed = true;
      wins = wins.filter(function (x) { return x !== win; });
      w.remove();
      if (opts.onClose) opts.onClose();
      TB.Term.focus();
    };
    win.setTitle = function (t) { title.textContent = t; };
    win.maximize = function () { if (!w.classList.contains('max')) toggleMax(); };
    win.focus = focusWin;

    /* 中身が入ったあとで、画面からはみ出さないよう置き直す */
    win.fit = function () {
      if (win.closed || w.classList.contains('max')) return;
      var r = w.getBoundingClientRect();
      var top = Math.min(r.top, window.innerHeight - r.height - 8);
      var left = Math.min(r.left, window.innerWidth - r.width - 8);
      w.style.top = Math.max(8, top) + 'px';
      w.style.left = Math.max(8, left) + 'px';
    };
    requestAnimationFrame(function () { requestAnimationFrame(win.fit); });

    wins.push(win);
    if (opts.maximized || narrow()) w.classList.add('max');
    focusWin();
    play('click');
    return win;
  }

  window.addEventListener('resize', function () { wins.forEach(function (w) { w.fit(); }); });

  /* Esc で一番手前のウィンドウを閉じる（ゲームがキーを使っていないとき） */
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !wins.length) return;
    if (TB.Term.isCapturing && TB.Term.isCapturing()) return;
    var top = wins.slice().sort(function (a, b) {
      return (parseInt(b.el.style.zIndex, 10) || 0) - (parseInt(a.el.style.zIndex, 10) || 0);
    })[0];
    if (top) { e.preventDefault(); top.close(); }
  });

  TB.Win = {
    open: openWin,
    list: function () { return wins.slice(); },
    closeAll: function () { wins.slice().forEach(function (w) { w.close(); }); }
  };

  /* =====================================================================
     settings — 設定画面
     ===================================================================== */

  function applyFontSize() {
    var fs = TB.store.get('fs', '');
    document.documentElement.style.setProperty('--fs', fs ? fs + 'px' : '');
    if (!fs) document.documentElement.style.removeProperty('--fs');
  }
  applyFontSize();

  function section(parent, label) {
    var s = el('div', 'gsec');
    s.appendChild(el('div', 'glabel', label));
    var row = el('div', 'grow');
    s.appendChild(row);
    parent.appendChild(s);
    return row;
  }

  function eraseRecords() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^tui-base:(best:|top:|race:|ttt)/.test(k)) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
    return keys.length;
  }

  var FONT_SIZES = [['auto', 0], ['S', 12], ['M', 14], ['L', 16], ['XL', 18]];

  def('settings', {
    group: 'gui',
    usage: 'settings',
    desc: { ja: '設定画面を開く（表示方式・テーマ・言語・音・文字の大きさ）', en: 'open the settings (interface, theme, language, sound, text size)' },
    run: function (args) {
      var existing = wins.filter(function (w) { return w.kind === 'settings'; })[0];
      if (existing) { existing.focus(); return []; }

      var win = openWin({ title: L('設定', 'Settings'), width: 460 });
      win.kind = 'settings';
      var b = win.body;

      function render() {
        b.textContent = '';

        var rowL = section(b, L('言語', 'Language'));
        [['ja', '日本語'], ['en', 'English']].forEach(function (p) {
          rowL.appendChild(button(p[1], 'gbtn' + (TB.state.lang === p[0] ? ' on' : ''), function () {
            TB.setLang(p[0]); play('click'); win.setTitle(L('設定', 'Settings')); render();
          }));
        });

        var rowE = section(b, L('表示と音', 'Display & sound'));
        rowE.appendChild(button((enabled() ? '☑ ' : '☐ ') + L('効果音', 'Sound'), 'gbtn' + (enabled() ? ' on' : ''), function () {
          TB.Sfx.set(!enabled()); play('click'); render();
        }));

        var rowV = section(b, L('音量', 'Volume'));
        var vol = el('input', 'grange');
        vol.type = 'range'; vol.min = '0'; vol.max = '25'; vol.step = '1';
        vol.value = String(Math.round(volume() * 100));
        vol.addEventListener('input', function () { TB.Sfx.setVolume(parseInt(vol.value, 10) / 100); });
        vol.addEventListener('change', function () { play('coin'); });
        rowV.appendChild(vol);

        var rowF = section(b, L('文字の大きさ', 'Text size'));
        var cur = parseInt(TB.store.get('fs', ''), 10) || 0;
        FONT_SIZES.forEach(function (p) {
          rowF.appendChild(button(p[0], 'gbtn' + (cur === p[1] ? ' on' : ''), function () {
            TB.store.set('fs', p[1] ? String(p[1]) : '');
            applyFontSize(); play('click'); render();
          }));
        });

        var rowR = section(b, L('記録', 'Records'));
        rowR.appendChild(button(L('ゲームの記録を消す…', 'Erase game records…'), 'gbtn warn', function () {
          confirmBox(L('ゲームの記録（最高点・ランキング・レースの賞金と改造）をすべて消します。よろしいですか？',
                       'Erase every game record — high scores, rankings, race money and upgrades?'), function () {
            var n = eraseRecords();
            rowR.appendChild(el('span', 'ghint', L(n + ' 件消しました', n + ' erased')));
          });
        }));

        b.appendChild(el('div', 'ghint', L('Esc でも閉じられます。タイトルをドラッグすると動かせます。',
                                          'Esc closes it too. Drag the title bar to move it.')));
      }

      function confirmBox(msg, ok) {
        var box = el('div', 'gconfirm');
        box.appendChild(el('div', '', msg));
        var row = el('div', 'grow');
        row.appendChild(button(L('消す', 'Erase'), 'gbtn warn', function () { box.remove(); ok(); play('bad'); }));
        row.appendChild(button(L('やめる', 'Cancel'), 'gbtn', function () { box.remove(); }));
        box.appendChild(row);
        b.appendChild(box);
      }

      render();
      return [[{ t: L('設定画面を開きました。', 'Opened the settings window.'), c: 'dim' }]];
    }
  });

  /* =====================================================================
     paint — ドット絵
     ===================================================================== */

  var PALETTE = ['#0b1016', '#ffffff', '#9aa5b1', '#e06c75', '#ff9f43', '#ffd93d',
                 '#5ccfa0', '#4dd0e1', '#56a8f5', '#a78bfa', '#ff5fd2', '#8d6e63'];

  function pixToNode(W, H, pix) {
    // 1 マス = 全角 1 文字ぶん（█ を 2 つ）。色は近い CSS 色で付ける。
    var node = el('div');
    node.style.whiteSpace = 'pre';
    node.style.lineHeight = '1';
    for (var y = 0; y < H; y++) {
      var row = el('div');
      for (var x = 0; x < W; x++) {
        var c = pix[y * W + x];
        var sp = el('span', '', c >= 0 ? '██' : '  ');
        if (c >= 0) sp.style.color = PALETTE[c];
        row.appendChild(sp);
      }
      node.appendChild(row);
    }
    return node;
  }

  function floodFill(pix, W, H, x, y, to) {
    var target = pix[y * W + x];
    if (target === to) return;
    var stack = [[x, y]];
    while (stack.length) {
      var p = stack.pop(), px = p[0], py = p[1];
      if (px < 0 || py < 0 || px >= W || py >= H || pix[py * W + px] !== target) continue;
      pix[py * W + px] = to;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
  }

  def('paint', {
    group: 'gui',
    usage: 'paint [幅] [高さ]',
    desc: { ja: 'ドット絵を描く（PNG で保存できる）', en: 'pixel painter (save as PNG)' },
    run: function (args) {
      var W = Math.min(Math.max(parseInt(args[0], 10) || 32, 8), 64);
      var H = Math.min(Math.max(parseInt(args[1], 10) || 20, 6), 48);
      var pix = [];
      for (var i = 0; i < W * H; i++) pix.push(-1);
      var color = 6, tool = 'pen', undo = [];

      var win = openWin({ title: 'paint — ' + W + '×' + H, width: 560 });
      var b = win.body;
      b.classList.add('paint');

      var tools = el('div', 'grow');
      var pal = el('div', 'gpal');
      var wrap = el('div', 'pcanvas-wrap');
      var cv = el('canvas', 'pcanvas');
      cv.width = W * 12; cv.height = H * 12;
      cv.style.setProperty('--ar', String(W / H));
      wrap.appendChild(cv);
      var g = cv.getContext('2d');

      function draw() {
        g.fillStyle = '#10151c';
        g.fillRect(0, 0, cv.width, cv.height);
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var c = pix[y * W + x];
            if (c >= 0) { g.fillStyle = PALETTE[c]; g.fillRect(x * 12, y * 12, 12, 12); }
            else if ((x + y) % 2) { g.fillStyle = '#141b24'; g.fillRect(x * 12, y * 12, 12, 12); }
          }
        }
      }

      function snapshot() { undo.push(pix.slice()); if (undo.length > 40) undo.shift(); }

      function fill(x, y, target, to) {
        if (target === to) return;
        var stack = [[x, y]];
        while (stack.length) {
          var p = stack.pop(), px = p[0], py = p[1];
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          if (pix[py * W + px] !== target) continue;
          pix[py * W + px] = to;
          stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
        }
      }

      function cellAt(e) {
        var r = cv.getBoundingClientRect();
        var x = Math.floor((e.clientX - r.left) / r.width * W);
        var y = Math.floor((e.clientY - r.top) / r.height * H);
        if (x < 0 || y < 0 || x >= W || y >= H) return null;
        return [x, y];
      }

      var painting = false;
      function paintAt(e) {
        var c = cellAt(e);
        if (!c) return;
        var idx = c[1] * W + c[0];
        if (tool === 'fill') { fill(c[0], c[1], pix[idx], color); painting = false; }
        else if (tool === 'pick') { if (pix[idx] >= 0) { color = pix[idx]; renderPal(); } tool = 'pen'; renderTools(); }
        else pix[idx] = (tool === 'erase' || e.button === 2) ? -1 : color;
        draw();
      }
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      cv.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        snapshot();
        painting = true;
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        paintAt(e);
      });
      cv.addEventListener('pointermove', function (e) { if (painting) paintAt(e); });
      cv.addEventListener('pointerup', function () { painting = false; });
      cv.addEventListener('pointercancel', function () { painting = false; });

      function renderPal() {
        pal.textContent = '';
        PALETTE.forEach(function (c, i) {
          var sw = button('', 'gswatch' + (i === color ? ' on' : ''), function () {
            color = i; if (tool === 'erase') tool = 'pen'; renderPal(); renderTools();
          });
          sw.style.background = c;
          sw.title = c;
          pal.appendChild(sw);
        });
      }

      function toText() { return pixToNode(W, H, pix); }

      function renderTools() {
        tools.textContent = '';
        [['pen', L('ペン', 'Pen')], ['erase', L('消しゴム', 'Eraser')], ['fill', L('塗りつぶし', 'Fill')],
         ['pick', L('スポイト', 'Picker')]].forEach(function (t) {
          tools.appendChild(button(t[1], 'gbtn' + (tool === t[0] ? ' on' : ''), function () { tool = t[0]; renderTools(); }));
        });
        tools.appendChild(button(L('↶ 戻す', '↶ Undo'), 'gbtn', function () {
          if (undo.length) { pix = undo.pop(); draw(); }
        }));
        tools.appendChild(button(L('全部消す', 'Clear'), 'gbtn', function () {
          snapshot(); for (var i = 0; i < pix.length; i++) pix[i] = -1; draw();
        }));
        tools.appendChild(button(L('PNG で保存', 'Save PNG'), 'gbtn', function () {
          var out = document.createElement('canvas');
          out.width = W * 16; out.height = H * 16;
          var o = out.getContext('2d');
          for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
            var c = pix[y * W + x];
            if (c >= 0) { o.fillStyle = PALETTE[c]; o.fillRect(x * 16, y * 16, 16, 16); }
          }
          var a = document.createElement('a');
          a.href = out.toDataURL('image/png');
          a.download = 'tui-base-paint.png';
          document.body.appendChild(a); a.click(); a.remove();
        }));
      }

      b.appendChild(tools);
      b.appendChild(pal);
      b.appendChild(wrap);
      b.appendChild(el('div', 'ghint', L('左クリックで描く / 右クリックで消す / ドラッグで続けて描ける',
                                        'Left click draws, right click erases, drag to keep drawing')));
      renderTools(); renderPal(); draw();
      return [[{ t: L('お絵かきの窓を開きました。',
                      'Opened the painter.'), c: 'dim' }]];
    }
  });

  /* =====================================================================
     gcalc — ボタンで押す電卓
     ===================================================================== */

  var CALC_KEYS = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '←', '='];

  /** 式 s を計算して { ok, value } を返す */
  function calcEval(s) {
    try {
      var v = TB.calcExpr(s);
      if (!isFinite(v)) throw new Error('inf');
      return { ok: true, value: Math.round(v * 1e10) / 1e10 };
    } catch (e) { return { ok: false }; }
  }

  /** キーボードの文字を電卓のキーに直す（該当しなければ null） */
  function calcKey(key) {
    var map = { Enter: '=', Backspace: '←', Delete: 'C', '*': '×', '/': '÷', x: '×', c: 'C', C: 'C', '=': '=' };
    var k = key in map ? map[key] : key;
    return CALC_KEYS.indexOf(k) >= 0 ? k : null;
  }

  def('gcalc', {
    group: 'gui',
    usage: 'gcalc',
    desc: { ja: 'ボタンで押す電卓（キーボードでも打てます）', en: 'a button calculator, keyboard works too' },
    run: function (args) {
      var init = {};
      var win = openWin({ title: L('電卓', 'Calculator'), width: 300 });
      var b = win.body;
      b.classList.add('gcalc');
      var disp = el('div', 'gcalc-disp');
      var expr = el('div', 'gcalc-expr', '');
      var val = el('div', 'gcalc-val', init.val || '0');
      disp.appendChild(expr); disp.appendChild(val);
      b.appendChild(disp);
      var s = init.s || '';

      function show() { expr.textContent = s || ' '; }
      function evaluate() {
        if (!s) return;
        try {
          var v = TB.calcExpr(s);
          if (!isFinite(v)) throw new Error('inf');
          v = Math.round(v * 1e10) / 1e10;
          val.textContent = String(v);
          s = String(v);
          play('coin');
        } catch (e) {
          val.textContent = L('エラー', 'Error');
          play('bad');
        }
        show();
      }
      function press(k) {
        play('click');
        if (k === 'C') { s = ''; val.textContent = '0'; }
        else if (k === '←') s = s.slice(0, -1);
        else if (k === '=') { evaluate(); return; }
        else s += ({ '×': '*', '÷': '/' }[k] || k);
        show();
      }

      var grid = el('div', 'gcalc-grid');
      ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '←', '='].forEach(function (k) {
        grid.appendChild(button(k, 'gbtn key' + (k === '=' ? ' accent' : /[÷×\-+]/.test(k) ? ' op' : ''), function () { press(k); }));
      });
      b.appendChild(grid);

      // ウィンドウを触っている間はキーボードも使える
      win.el.tabIndex = -1;
      win.el.addEventListener('keydown', function (e) {
        var map = { Enter: '=', Backspace: '←', Escape: null, '*': '×', '/': '÷' };
        var k = e.key in map ? map[e.key] : e.key;
        if (k === null) return;
        if (/^[0-9.()+\-×÷=←C]$/.test(k) || k === '=' || k === '←') { e.preventDefault(); e.stopPropagation(); press(k); }
        else if (k === 'c') { e.preventDefault(); press('C'); }
      });
      setTimeout(function () { win.el.focus(); }, 30);
      show();
      return [[{ t: L('電卓を開きました。= を押すと答えがこちらにも出ます。',
                      'Opened the calculator. Results are echoed here too.'), c: 'dim' }]];
    }
  });

  /* =====================================================================
     sound / windows / closeall
     ===================================================================== */

  def('sound', {
    group: 'gui',
    usage: 'sound [on|off|0-25]',
    desc: { ja: 'ゲームの効果音を切り替える・音量を変える', en: 'toggle game sounds or set the volume' },
    run: function (args) {
      var a = (args[0] || '').toLowerCase();
      if (a === 'on' || a === 'off') { TB.Sfx.set(a === 'on'); if (a === 'on') play('coin'); }
      else if (/^\d+$/.test(a)) { TB.Sfx.setVolume(parseInt(a, 10) / 100); TB.Sfx.set(true); play('coin'); }
      else if (!a) { TB.Sfx.set(!enabled()); if (enabled()) play('coin'); }
      else return [[{ t: TB.ui('usage') + ': sound [on|off|0-25]', c: 'warn' }]];
      return [[{ t: L('効果音: ', 'sound: ') + (enabled() ? 'ON' : 'OFF') +
                   L('　音量: ', '  volume: ') + Math.round(volume() * 100), c: 'accent' }]];
    }
  });

  def('windows', {
    group: 'gui',
    desc: { ja: '開いているウィンドウの一覧', en: 'list the open windows' },
    run: function () {
      if (!wins.length) return [[{ t: L('開いているウィンドウはありません。', 'No windows are open.'), c: 'dim' }]];
      return wins.map(function (w, i) {
        return [{ t: '  ' + (i + 1) + '. ', c: 'dim' }, { t: w.el.querySelector('.win-title').textContent, c: 'accent' }];
      }).concat([[{ t: L('closeall で全部閉じます。', 'closeall closes them all.'), c: 'dim' }]]);
    }
  });

  def('closeall', {
    group: 'gui',
    desc: { ja: 'ウィンドウを全部閉じる', en: 'close every window' },
    run: function () {
      var n = wins.length;
      TB.Win.closeAll();
      return [[{ t: L(n + ' 個閉じました。', 'Closed ' + n + '.'), c: 'dim' }]];
    }
  });
})();
