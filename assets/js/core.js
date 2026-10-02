/*
 * core.js — 共通の土台。言語・保存・ゲーム部品の受け口・キー入力の横取り。
 * 画面そのものはレース（GUI）が持つ。ここには文字入力の画面はない。
 * window.TB に生やす。
 */
(function () {
  'use strict';

  /* ---------- 保存（file:// でも落ちないように包む。キーは従来のまま） ---- */
  var store = {
    get: function (k, fallback) {
      try {
        var v = localStorage.getItem('tui-base:' + k);
        return v === null ? fallback : v;
      } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem('tui-base:' + k, v); } catch (e) { /* ignore */ }
    }
  };

  var state = { lang: store.get('lang', 'ja') };

  /** {ja,en} 形式・文字列・配列のいずれでも受け取り、現在の言語で返す */
  function t(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(t);
    if (typeof v === 'object') {
      if (state.lang in v) return t(v[state.lang]);
      if ('ja' in v || 'en' in v) return t(v.ja || v.en);
    }
    return v;
  }

  function ui(k) { return { usage: state.lang === 'ja' ? '使い方' : 'usage' }[k] || k; }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ---------- ゲームの登録 ------------------------------------------------- */
  var registry = {};
  function def(name, opts) { registry[name] = opts; }

  function setLang(lang) {
    state.lang = lang;
    store.set('lang', lang);
    document.documentElement.lang = lang;
  }

  /* ---------- ゲーム画面（ウィンドウの中に文字盤を描く） ------------------- */
  var screenEl = null;
  var CLASSES = /^(accent|accent-2|dim|warn|err|bold|inv)$/;

  var TB = window.TB = window.TB || {};
  TB.state = state; TB.store = store; TB.t = t; TB.ui = ui; TB.slug = slug;
  TB.def = def; TB.commands = registry; TB.alias = {}; TB.setLang = setLang;
  TB.head = function (title) { return [[{ t: '── ' + title + ' ', c: 'accent bold' }], '']; };
  TB.setLineHandler = function () { /* 行入力は使わない */ };
  TB.lineHandler = null;

  function linkify(text, frag) {
    var re = /(https?:\/\/[^\s<>"'`]+|mailto:[^\s<>"'`]+)/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement('a');
      a.href = m[0];
      a.textContent = m[0].replace(/^mailto:/, '');
      if (m[0].indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      frag.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  }

  /** "{accent:foo} bar" → DocumentFragment */
  function parse(text) {
    var frag = document.createDocumentFragment();
    var re = /\{([a-z0-9-]+):([^}]*)\}/gi;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (!CLASSES.test(m[1])) continue;
      if (m.index > last) linkify(text.slice(last, m.index), frag);
      var span = document.createElement('span');
      span.className = m[1];
      linkify(m[2], span);
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) linkify(text.slice(last), frag);
    return frag;
  }

  function segments(arr, target) {
    arr.forEach(function (seg) {
      if (typeof seg === 'string') { target.appendChild(parse(seg)); return; }
      var span = document.createElement('span');
      if (seg.c) span.className = seg.c;
      if (seg.cmd !== undefined) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cmdlink' + (seg.c ? ' ' + seg.c : '');
        btn.textContent = seg.t;
        btn.title = String(seg.cmd);
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          if (TB.Term.isCapturing()) return;
          if (typeof TB.submit === 'function') TB.submit(String(seg.cmd));
        });
        target.appendChild(btn);
        return;
      }
      if (seg.link) {
        var a = document.createElement('a');
        a.href = seg.link;
        a.textContent = seg.t;
        if (seg.link.indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        span.appendChild(a);
      } else {
        span.appendChild(parse(String(seg.t)));
      }
      target.appendChild(span);
    });
  }

  /** 1 行ぶんの要素を作る */
  function build(line) {
    var el = document.createElement('div');
    el.className = 'line';

    if (line === '' || line === null || line === undefined) {
      el.className = 'line spacer';
      return el;
    }
    if (typeof line === 'string') { el.appendChild(parse(line)); return el; }
    if (Array.isArray(line)) { segments(line, el); return el; }

    if (line.hr) { el.className = 'line hr'; return el; }

    if (line.row) {
      el.className = 'line row' + (line.sub ? ' sub' : '');
      var k = document.createElement('span'); k.className = 'k';
      var v = document.createElement('span'); v.className = 'v';
      segments(Array.isArray(line.row[0]) ? line.row[0] : [line.row[0]], k);
      segments(Array.isArray(line.row[1]) ? line.row[1] : [line.row[1]], v);
      el.appendChild(k); el.appendChild(v);
      return el;
    }

    if (line.block) {
      el.className = 'line ' + (line.block.cls || '');
      (line.block.lines || []).forEach(function (l) { el.appendChild(build(l)); });
      return el;
    }

    if (line.node) { el.appendChild(line.node); return el; }

    // { t: '…', c: '…' } を 1 行として渡された場合も受け取る
    if (line.t !== undefined) { segments([line], el); return el; }

    el.appendChild(parse(String(line)));
    return el;
  }

  /* ---------- 出力 ------------------------------------------------------ */


  function atBottom() { return !screenEl || screenEl.scrollHeight - screenEl.scrollTop - screenEl.clientHeight < 40; }
  function scroll() { if (screenEl) screenEl.scrollTop = screenEl.scrollHeight; }
  function print(line) {
    if (!screenEl) return;
    var stick = atBottom();
    screenEl.appendChild(build(line));
    if (stick) scroll();
  }
  function printAll(lines) { (Array.isArray(lines) ? lines : [lines]).forEach(print); }

  /* ---------- キー入力の横取り（ゲームとレース用） ------------------------- */
  var captureFn = null, captureUpFn = null, capStack = [];

  function typingElsewhere(e) {
    var el = e.target;
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }
  window.addEventListener('keydown', function (e) {
    if (!captureFn) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typingElsewhere(e)) return;
    e.preventDefault();
    e.stopPropagation();
    captureFn(e.key);
  }, true);
  window.addEventListener('keyup', function (e) {
    if (!captureUpFn) return;
    if (typingElsewhere(e)) return;
    e.preventDefault();
    e.stopPropagation();
    captureUpFn(e.key);
  }, true);

  TB.Term = {
    mount: function (el) { screenEl = el; },
    el: function () { return screenEl; },
    print: print,
    printAll: printAll,
    typeAll: function (lines) { printAll(lines); return Promise.resolve(); },
    clear: function () { if (screenEl) while (screenEl.firstChild) screenEl.removeChild(screenEl.firstChild); },
    scroll: scroll,
    focus: function () { /* 入力欄はない */ },
    setBusy: function () { /* なし */ },
    // 重ねて使える。ゲームを閉じると、下にあったもの（レースなど）にキーが戻る。
    capture: function (handler, upHandler) { capStack.push([captureFn, captureUpFn]); captureFn = handler; captureUpFn = upHandler || null; },
    release: function () { var p = capStack.pop() || [null, null]; captureFn = p[0]; captureUpFn = p[1]; },
    press: function (k) { if (captureFn) captureFn(k); },
    isCapturing: function () { return !!captureFn; }
  };

  /* ---------- 電卓の式（eval は使わず自前で解く） ------------------------- */
  function calc(expr) {
    var s = expr.replace(/\s+/g, ''), i = 0;

    function primary() {
      if (s[i] === '(') {
        i++;
        var v = addSub();
        if (s[i] !== ')') throw new Error('paren');
        i++;
        return v;
      }
      if (s[i] === '-') { i++; return -primary(); }
      if (s[i] === '+') { i++; return primary(); }
      var m = /^[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?/.exec(s.slice(i));
      if (!m) throw new Error('number');
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function power() {
      var v = primary();
      while (s[i] === '^') { i++; v = Math.pow(v, primary()); }
      return v;
    }
    function mulDiv() {
      var v = power();
      while (i < s.length && '*/%'.indexOf(s[i]) !== -1) {
        var op = s[i++], r = power();
        v = op === '*' ? v * r : op === '/' ? v / r : v % r;
      }
      return v;
    }
    function addSub() {
      var v = mulDiv();
      while (i < s.length && (s[i] === '+' || s[i] === '-')) {
        var op = s[i++], r = mulDiv();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    var val = addSub();
    if (i < s.length) throw new Error('trailing');
    return val;
  }

  TB.calcExpr = calc;
})();
