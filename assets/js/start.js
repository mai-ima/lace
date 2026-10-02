/*
 * start.js — 起動。読み込みが終わったらレースを自動で開く。
 * レースを閉じても、ランディング画面の「レースを始める」でいつでも開き直せる。
 */
(function () {
  'use strict';
  var TB = window.TB, R = TB.Race;

  function open() { R.openApp('title'); }

  /* WebGL の 3D は開発を一時停止中なので、有効にしたときだけ関連ファイルを読み込む（起動を軽くするため） */
  function load3D(cb) {
    var files = ['race-lowpoly', 'race-3d', 'race-city3d'], i = 0;
    (function next() {
      if (i >= files.length) { cb(); return; }
      var sc = document.createElement('script'); sc.src = 'assets/js/' + files[i++] + '.js'; sc.onload = next; sc.onerror = next; document.head.appendChild(sc);
    })();
  }

  function init() {
    document.documentElement.lang = TB.state.lang;
    document.getElementById('landing-start').addEventListener('click', open);
    document.getElementById('landing-logo').addEventListener('click', function () { if (TB.secretTap) TB.secretTap(); });
    if (R.ENABLE_3D) load3D(open); else open();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
