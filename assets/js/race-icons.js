/*
 * race-icons.js — 画面で使うアイコン（SVG）。絵文字は使わない。
 *   R.iconNode(キー, 大きさ) … <svg> 要素を返す。キーが無ければ文字をそのまま入れた <span> を返す。
 * 24x24 の線画。色は文字色（currentColor）に従う。
 */
(function () {
  'use strict';
  var R = window.TB.Race = window.TB.Race || {};
  var P = {
    book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    car: '<path d="M3 15v-3l2-5h14l2 5v3z"/><circle cx="7.5" cy="16" r="1.8"/><circle cx="16.5" cy="16" r="1.8"/><path d="M5.5 11h13"/>',
    taxi: '<path d="M3 15v-3l2-5h14l2 5v3z"/><circle cx="7.5" cy="16" r="1.8"/><circle cx="16.5" cy="16" r="1.8"/><path d="M10 4h4v3h-4z"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8"/>',
    flag: '<path d="M5 21V4"/><path d="M5 5h13l-2 4 2 4H5"/>',
    mountain: '<path d="M2 20 9 7l4 7 3-4 6 10z"/>',
    stopwatch: '<circle cx="12" cy="14" r="7"/><path d="M12 14V10M10 3h4M18 6l1.5-1.5"/>',
    flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    balloon: '<path d="M12 3c4 0 6 3 6 6s-3 6-6 8c-3-2-6-5-6-8s2-6 6-6z"/><path d="M12 17v4"/>',
    wrench: '<path d="M14 6a4 4 0 0 0 5 5l-9 9a2.5 2.5 0 0 1-4-4l9-9a4 4 0 0 1-1-1z"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M8 3l4 7 4-7M12 12v6"/>',
    chart: '<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="14" width="3" height="4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    tool: '<path d="M4 20l9-9M14 4l6 6-3 3-6-6zM3 21l2-2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7-2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    skip: '<path d="M5 5l9 7-9 7zM17 5v14"/>',
    back: '<path d="M9 6 3 12l6 6M3 12h12a6 6 0 0 1 6 6"/>',
    redo: '<path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    skull: '<path d="M5 11a7 7 0 0 1 14 0v4l-3 1v3H8v-3l-3-1z"/><circle cx="9.5" cy="11.5" r="1.4"/><circle cx="14.5" cy="11.5" r="1.4"/>',
    swords: '<path d="M4 4l10 10M20 4 10 14M4 20l3-3M20 20l-3-3M14 14l3 3M10 14l-3 3"/>',
    moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>',
    timer: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M9 3h6"/>',
    police: '<path d="M3 15v-3l2-5h14l2 5v3z"/><circle cx="7.5" cy="16" r="1.8"/><circle cx="16.5" cy="16" r="1.8"/><path d="M9 4h6v3H9z"/>',
    road: '<path d="M8 3 4 21M16 3l4 18M12 4v3M12 10v4M12 17v3"/>',
    diamond: '<path d="M12 3l8 9-8 9-8-9z"/>',
    signal: '<rect x="8" y="3" width="8" height="18" rx="3"/><circle cx="12" cy="8" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="16" r="1.4"/>',
    stop: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/>',
    party: '<path d="M4 20 8 8l8 8z"/><path d="M14 4v2M19 8h-2M18 3l-1 2M16 11l2 1"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    box: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
    bento: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M12 6v12M3 12h18"/>',
    crown: '<path d="M3 18 4 7l5 5 3-7 3 7 5-5 1 11z"/>',
    loop: '<path d="M4 12a6 6 0 0 1 10-4l3 2M20 12a6 6 0 0 1-10 4l-3-2M17 6v4h-4M7 18v-4h4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    ghost: '<path d="M5 20V11a7 7 0 0 1 14 0v9l-3-2-2 2-2-2-2 2-2-2z"/><circle cx="9.5" cy="11" r="1.2"/><circle cx="14.5" cy="11" r="1.2"/>',
    city: '<path d="M3 21V10h6v11M9 21V4h7v17M16 21v-8h5v8M3 21h18"/>',
    racecar: '<path d="M2 15h20l-2-4h-5l-2-3H9l-1 3H4z"/><circle cx="7" cy="16" r="1.8"/><circle cx="17" cy="16" r="1.8"/>',
    gem: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4l-1 5 4 11M15 4l1 5-4 11"/>',
    camera: '<rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>',
    radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8 17 3"/><circle cx="9" cy="14" r="2.5"/><path d="M15 12h3M15 16h3"/>',
    siren: '<path d="M6 19v-6a6 6 0 0 1 12 0v6zM4 19h16M12 3v2M4 7l1.5 1.5M20 7l-1.5 1.5"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    tea: '<path d="M4 9h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2M8 3c1 1 0 2 1 3M12 3c1 1 0 2 1 3"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2.5 1.5-2.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="11" r="1"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0"/>',
    brick: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v5M15 9v5M9 14v6"/>',
    snake: '<path d="M4 18c0-4 4-3 4-6s-4-2-4-5 4-3 8-3 8 0 8 4-4 3-4 5 4 2 4 5"/>',
    num: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h3v6M14 9h3l-3 6h3"/>',
    bomb: '<circle cx="11" cy="14" r="6"/><path d="M15 9l3-3M17 4l1 1M19 6l1 1"/>',
    dagger: '<path d="M5 19 15 9l3 3L8 22zM14 4l6 6"/>',
    hand: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V6a1.5 1.5 0 0 1 3 0v6l2-1a1.5 1.5 0 0 1 1 2l-3 6H9l-3-5a1.5 1.5 0 0 1 2-2l1 1"/>',
    letters: '<path d="M4 18 8 6l4 12M5.5 14h5M14 6v12h4a3 3 0 0 0 0-6h-4"/>',
    cards: '<rect x="5" y="4" width="11" height="15" rx="2"/><path d="M9 8h3M16 8l4 1-3 11-5-1"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h0"/>',
    circleo: '<circle cx="12" cy="12" r="8"/>'
  };
  function svg(key, size) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 22); s.setAttribute('height', size || 22);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'rx-svgic');
    s.innerHTML = P[key];
    return s;
  }
  R.ICONS = P;
  R.iconNode = function (key, size) {
    if (P[key]) return svg(key, size);
    var sp = document.createElement('span'); sp.textContent = key || ''; return sp;
  };
})();
