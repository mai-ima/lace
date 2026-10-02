/*
 * app.js — 起動、メニュー、ステータスバー、設定の保存。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var C = window.CONTENT;
  var THEMES = ['midnight', 'amber', 'matrix', 'synth', 'paper'];

  var THEME_COLOR = {
    midnight: '#0b1016', amber: '#14100a', matrix: '#030705',
    synth: '#0e0a18', paper: '#f4f1ea'
  };

  /* ---------- 設定 ------------------------------------------------------ */

  function setTheme(name) {
    if (THEMES.indexOf(name) === -1) return;
    document.documentElement.setAttribute('data-theme', name);
    TB.store.set('theme', name);
    var st = document.getElementById('st-theme');
    if (st) st.textContent = name;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && THEME_COLOR[name]) meta.setAttribute('content', THEME_COLOR[name]);
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'midnight';
  }

  function setCRT(on) {
    document.body.classList.toggle('crt-on', !!on);
    TB.store.set('crt', on ? '1' : '0');
  }

  function setLang(lang) {
    TB.state.lang = lang;
    TB.store.set('lang', lang);
    document.documentElement.lang = lang;
    TB.fs.rebuild();
    TB.Term.renderPrompt();
    renderNav();
    refreshStatus();
  }

  /* ---------- ステータスバー -------------------------------------------- */

  function refreshStatus() {
    var hint = document.getElementById('st-hint');
    if (hint) hint.textContent = TB.ui('hint');
    var path = document.getElementById('tb-path');
    if (path) path.textContent = TB.fs.display(TB.state.cwd);
    var mode = document.getElementById('st-mode');
    if (mode && !TB.Term.isBusy()) mode.textContent = TB.ui('ready');
  }

  function tickClock() {
    var el = document.getElementById('st-clock');
    if (!el) return;
    var d = new Date();
    el.textContent = String(d.getHours()).padStart(2, '0') + ':' +
                     String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------- メニュー -------------------------------------------------- */

  var NAV = [
    { cmd: 'about', key: '01' },
    { cmd: 'projects', key: '02' },
    { cmd: 'skills', key: '03' },
    { cmd: 'contact', key: '04' },
    { cmd: 'ls', key: '05' },
    { cmd: 'help', key: '06' },
    { cmd: 'manual', key: '07' }
  ];

  var NAV3 = [
    { cmd: 'race', key: 'G1' },
    { cmd: 'tetris', key: 'G2' },
    { cmd: 'rogue', key: 'G3' },
    { cmd: 'snake', key: 'G4' },
    { cmd: '2048', key: 'G5' },
    { cmd: 'mine', key: 'G6' },
    { cmd: 'games', key: 'G7' }
  ];

  var NAV2 = [
    { cmd: 'theme', key: 'T' },
    { cmd: 'lang', key: 'L', label: { ja: 'lang (en)', en: 'lang (ja)' } },
    { cmd: 'crt', key: 'C' },
    { cmd: 'settings', key: 'S' },
    { cmd: 'clear', key: 'X' }
  ];

  function navButton(item) {
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button';
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = item.key;
    var n = document.createElement('span');
    n.textContent = item.label ? TB.t(item.label) : item.cmd;
    b.appendChild(k);
    b.appendChild(n);
    b.addEventListener('click', function () {
      if (TB.Term.isCapturing()) return;               // ローグライク中は触らない
      if (TB.lineHandler) TB.setLineHandler(null);     // 行入力のゲームは中断する
      submit(item.cmd);
    });
    li.appendChild(b);
    return li;
  }

  function renderNav() {
    [['nav-list', NAV], ['nav-list-3', NAV3], ['nav-list-2', NAV2]].forEach(function (pair) {
      var ul = document.getElementById(pair[0]);
      if (!ul) return;
      ul.textContent = '';
      pair[1].forEach(function (item) { ul.appendChild(navButton(item)); });
    });
  }

  /* ---------- コマンド実行 ---------------------------------------------- */

  var queue = Promise.resolve();

  function submit(input) {
    queue = queue.then(function () {
      // ゲーム中など、入力を受け取る役がいればそちらへ回す
      if (TB.lineHandler) {
        TB.Term.echo(input.trim());
        return TB.lineHandler(input.trim());
      }
      if (input.trim()) TB.Term.echo(input.trim());
      return TB.run(input);
    }).then(function () {
      refreshStatus();
      TB.Term.scroll();
      TB.Term.focus();
    });
    return queue;
  }

  /* ---------- ハッシュ (#about など) ------------------------------------ */

  /** URL の #about / #projects をコマンドとして実行する。リンク共有用。 */
  function runHash() {
    var hash = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')).trim();
    if (!hash) return;
    var name = hash.split(/\s+/)[0].toLowerCase();
    if (TB.commands[name] && !TB.commands[name].hidden) submit(hash);
  }

  /* ---------- 起動 ------------------------------------------------------ */

  function bootSequence(lines, done) {
    var boot = document.getElementById('boot');
    var reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || TB.store.get('booted', '') === '1') {
      finish();
      return;
    }

    boot.hidden = false;
    var i = 0;
    var timer = setInterval(function () {
      if (i >= lines.length) { clearInterval(timer); setTimeout(finish, 220); return; }
      var el = document.createElement('div');
      el.className = 'boot-line';
      el.textContent = lines[i++];
      boot.appendChild(el);
    }, 85);

    var hint = document.createElement('div');
    hint.className = 'boot-hint';
    hint.textContent = TB.state.lang === 'ja' ? '(クリックで省略)' : '(click to skip)';
    boot.appendChild(hint);

    function skip() { clearInterval(timer); finish(); }
    boot.addEventListener('click', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });

    function finish() {
      if (boot.dataset.done) return;
      boot.dataset.done = '1';
      boot.hidden = true;
      TB.store.set('booted', '1');
      done();
    }
  }

  function start() {
    // 保存された設定を先に反映
    setTheme(TB.store.get('theme', C.meta.defaultTheme || 'midnight'));
    setCRT(TB.store.get('crt', '0') === '1');
    document.documentElement.lang = TB.state.lang;

    document.getElementById('tb-user').textContent = C.meta.user;
    document.getElementById('tb-host').textContent = C.meta.host;
    document.getElementById('tb-tag').textContent = C.meta.title + ' v' + C.meta.version;

    TB.Term.init(submit, function (action) {
      if (action === 'complete') TB.complete();
    });

    renderNav();
    refreshStatus();
    tickClock();
    setInterval(tickClock, 15000);
    window.addEventListener('hashchange', runHash);

    document.getElementById('tui').hidden = false;

    bootSequence(C.boot || [], function () {
      var intro = TB.bannerLines().concat(
        [''],
        TB.t(C.welcome).map(function (l) { return l; }),
        ['', { hr: true }, '']
      );
      TB.Term.typeAll(intro, 22).then(function () {
        TB.Term.focus();
        runHash();
      });
    });
  }

  /* ---------- 公開 ------------------------------------------------------ */

  TB.themes = THEMES;
  TB.setTheme = setTheme;
  TB.currentTheme = currentTheme;
  TB.setCRT = setCRT;
  TB.setLang = setLang;
  TB.refreshStatus = refreshStatus;
  TB.submit = submit;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
