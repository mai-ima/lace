/*
 * start.js — 起動。読み込みが終わったらレースを自動で開く。
 * レースを閉じても、ランディング画面の「レースを始める」でいつでも開き直せる。
 */
(function () {
  'use strict';
  var TB = window.TB, R = TB.Race;

  function open() { R.openApp('title'); }

  function init() {
    document.documentElement.lang = TB.state.lang;
    document.getElementById('landing-start').addEventListener('click', open);
    document.getElementById('landing-logo').addEventListener('click', function () { if (TB.secretTap) TB.secretTap(); });
    open();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
