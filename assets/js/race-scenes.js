/*
 * race-scenes.js — 会話シーンの背景（SVG）。コース以外の場所を、絵ではなく図形で描く。
 *   台本では { bg: 'school' } のように名前で指定する。
 *   R.SCENES[名前] = { name: 日本語名, svg: 960x540 の SVG 文字列 }
 *   R.drawScene(canvas, 名前) … キャンバスに描く（非同期で読み込む）。
 */
(function () {
  'use strict';
  var R = window.TB.Race = window.TB.Race || {};
  var S = R.SCENES = {};

  function wrap(defs, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540"><defs>' + defs + '</defs>' + body + '</svg>';
  }
  function grad(id, stops, vertical) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (vertical === false ? 1 : 0) + '" y2="' + (vertical === false ? 0 : 1) + '">' +
      stops.map(function (s, i) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>'; }).join('') + '</linearGradient>';
  }
  function win(x, y, w, h, c) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (c || '#cfe3f2') + '" stroke="#5a6470" stroke-width="3"/>'; }

  /* 校舎と桜の坂道 */
  S.school = { name: '校舎の坂道', svg: wrap(
    grad('sk', [[0, '#8ec5f0'], [1, '#e9f4fb']]) + grad('rd', [[0, '#8b8f96'], [1, '#6b6f76']]),
    '<rect width="960" height="540" fill="url(#sk)"/>' +
    '<ellipse cx="200" cy="90" rx="110" ry="26" fill="#fff" opacity=".8"/><ellipse cx="720" cy="130" rx="140" ry="30" fill="#fff" opacity=".7"/>' +
    '<path d="M0 330 Q240 270 520 300 T960 270 V540 H0z" fill="#9fcf7a"/>' +
    '<rect x="330" y="150" width="500" height="190" fill="#f2efe6"/><rect x="330" y="140" width="500" height="16" fill="#c9433a"/>' +
    [0, 1, 2, 3, 4, 5].map(function (i) { return win(352 + i * 78, 180, 52, 44) + win(352 + i * 78, 252, 52, 44); }).join('') +
    '<rect x="540" y="60" width="80" height="84" fill="#f2efe6"/><circle cx="580" cy="100" r="22" fill="#fff" stroke="#5a6470" stroke-width="3"/><path d="M580 100V84M580 100l12 6" stroke="#333" stroke-width="3"/>' +
    '<path d="M0 540V420Q400 360 960 400V540z" fill="url(#rd)"/><path d="M0 470Q400 410 960 450" stroke="#e8e8e8" stroke-width="5" stroke-dasharray="40 30" fill="none"/>' +
    [60, 150, 260, 780, 860].map(function (x, i) { return '<rect x="' + (x - 7) + '" y="' + (250 - i % 2 * 20) + '" width="14" height="150" fill="#5a3a2a"/><circle cx="' + x + '" cy="' + (230 - i % 2 * 20) + '" r="' + (80 + i % 3 * 10) + '" fill="#f7bfd2"/><circle cx="' + (x - 40) + '" cy="' + (270 - i % 2 * 20) + '" r="54" fill="#f2a8c1"/><circle cx="' + (x + 44) + '" cy="' + (265 - i % 2 * 20) + '" r="50" fill="#f9cfdc"/>'; }).join('') +
    [[120, 480], [400, 500], [640, 490], [820, 510], [250, 520]].map(function (p) { return '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="8" ry="4" fill="#f9cfdc"/>'; }).join('')) };

  /* 教室 */
  S.classroom = { name: '教室', svg: wrap(
    grad('wl', [[0, '#efe6d2'], [1, '#d9cdb2']]) + grad('fl', [[0, '#b58b5c'], [1, '#8a6540']]) + grad('sun', [[0, '#fff6c8'], [1, '#ffe08a']]),
    '<rect width="960" height="540" fill="url(#wl)"/><rect y="400" width="960" height="140" fill="url(#fl)"/>' +
    '<rect x="150" y="70" width="440" height="220" fill="#2f5a45" stroke="#7a5a35" stroke-width="12"/><path d="M190 120h160M190 160h220M190 200h120" stroke="#e8efe9" stroke-width="5" opacity=".75"/><rect x="150" y="290" width="440" height="12" fill="#7a5a35"/>' +
    '<rect x="650" y="60" width="260" height="250" fill="url(#sun)" stroke="#8a8a90" stroke-width="6"/><path d="M780 60V310M650 185H910" stroke="#8a8a90" stroke-width="5"/><path d="M650 310 L740 400 H900 L910 310z" fill="#fff6c8" opacity=".35"/>' +
    [0, 1, 2, 3].map(function (r) { return [0, 1, 2, 3].map(function (c) { var x = 120 + c * 190 + r * 14, y = 410 + r * 28; return '<rect x="' + x + '" y="' + y + '" width="110" height="10" fill="#c9a574"/><rect x="' + (x + 8) + '" y="' + (y + 10) + '" width="6" height="40" fill="#555"/><rect x="' + (x + 96) + '" y="' + (y + 10) + '" width="6" height="40" fill="#555"/>'; }).join(''); }).join('') +
    '<circle cx="860" cy="360" r="28" fill="#fff" stroke="#555" stroke-width="3"/><path d="M860 360V342M860 360l10 5" stroke="#333" stroke-width="3"/>') };

  /* 峠の茶屋（囲炉裏） */
  S.teahouse = { name: '峠の茶屋', svg: wrap(
    grad('wd', [[0, '#5a3c26'], [1, '#2e1d12']]) + '<radialGradient id="fire" cx="50%" cy="60%" r="50%"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>',
    '<rect width="960" height="540" fill="url(#wd)"/>' +
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { return '<path d="M' + (i * 100) + ' 0V420" stroke="#3a2616" stroke-width="3"/>'; }).join('') +
    '<rect x="0" y="60" width="960" height="26" fill="#3a2616"/><rect x="0" y="420" width="960" height="120" fill="#24160d"/>' +
    '<rect x="90" y="120" width="200" height="190" fill="#e8d9b4" stroke="#6b4a2a" stroke-width="8"/><path d="M190 120V310M90 215H290" stroke="#6b4a2a" stroke-width="4"/>' +
    '<g opacity=".95"><rect x="640" y="130" width="100" height="130" fill="#f3e2b8" stroke="#6b4a2a" stroke-width="4"/><path d="M660 160h60M660 190h60M660 220h40" stroke="#6b4a2a" stroke-width="3"/><rect x="760" y="130" width="80" height="130" fill="#e6cf9c" stroke="#6b4a2a" stroke-width="4"/></g>' +
    '<ellipse cx="480" cy="440" rx="320" ry="60" fill="url(#fire)"/><ellipse cx="480" cy="450" rx="150" ry="30" fill="#3a2616" stroke="#6b4a2a" stroke-width="6"/><ellipse cx="480" cy="446" rx="120" ry="20" fill="#18100a"/>' +
    '<path d="M450 440q10-60 30-80 5 40 30 80z" fill="#ff9a2a"/><path d="M465 440q8-40 18-55 3 30 18 55z" fill="#ffe08a"/>' +
    '<path d="M480 86V250" stroke="#2a1a10" stroke-width="5"/><path d="M440 260h80l-12 40h-56z" fill="#444"/>') };

  /* 整備工場の中 */
  S.garage_in = { name: '整備工場', svg: wrap(
    grad('gw', [[0, '#8a949c'], [1, '#68727a']]) + grad('gf', [[0, '#575c60'], [1, '#3a3e41']]),
    '<rect width="960" height="540" fill="url(#gw)"/><rect y="380" width="960" height="160" fill="url(#gf)"/>' +
    [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<path d="M' + (i * 130) + ' 0V380" stroke="#78828a" stroke-width="2"/>'; }).join('') +
    '<rect x="60" y="90" width="260" height="170" fill="#4a5258" stroke="#2a2f33" stroke-width="6"/>' +
    [0, 1, 2, 3, 4, 5].map(function (i) { return '<rect x="' + (78 + i * 38) + '" y="' + (110 + i % 2 * 50) + '" width="14" height="' + (60 - i % 2 * 0) + '" fill="' + ['#d9a334', '#cfd4d8', '#c0392b'][i % 3] + '"/>'; }).join('') +
    '<rect x="620" y="70" width="260" height="130" fill="#cfe3f2" stroke="#2a2f33" stroke-width="8"/><path d="M750 70V200M620 135H880" stroke="#2a2f33" stroke-width="4"/>' +
    '<rect x="330" y="30" width="6" height="90" fill="#222"/><ellipse cx="333" cy="130" rx="60" ry="16" fill="#e8e0b0"/><ellipse cx="333" cy="150" rx="140" ry="30" fill="#fff6c8" opacity=".12"/>' +
    '<path d="M360 360h280l40 30H320z" fill="#7a2020"/><rect x="380" y="320" width="200" height="50" rx="14" fill="#ececec"/><circle cx="410" cy="392" r="26" fill="#1a1a1a"/><circle cx="550" cy="392" r="26" fill="#1a1a1a"/><circle cx="410" cy="392" r="12" fill="#b6bcc2"/><circle cx="550" cy="392" r="12" fill="#b6bcc2"/>' +
    '<rect x="700" y="300" width="160" height="90" fill="#b3402a" stroke="#6a2416" stroke-width="5"/><rect x="700" y="300" width="160" height="22" fill="#cf5a40"/>') };

  /* 駅のホーム（夕方） */
  S.station = { name: '駅のホーム', svg: wrap(
    grad('ss', [[0, '#f6a15a'], [0.55, '#f7d08a'], [1, '#bfd7ea']]) + grad('pf', [[0, '#9ea2a6'], [1, '#6a6e72']]),
    '<rect width="960" height="540" fill="url(#ss)"/><circle cx="700" cy="250" r="60" fill="#fff0c0" opacity=".9"/>' +
    '<path d="M0 300l80-40 60 30 90-60 120 70 100-50 140 60 120-40 120 50 130-30V380H0z" fill="#4a5a6a" opacity=".55"/>' +
    '<rect y="380" width="960" height="160" fill="url(#pf)"/><rect y="372" width="960" height="14" fill="#e8d34a"/><path d="M0 470h960M0 505h960" stroke="#555" stroke-width="3"/>' +
    '<path d="M0 120h960v18H0z" fill="#5a636b"/>' + [100, 360, 620, 880].map(function (x) { return '<rect x="' + x + '" y="138" width="14" height="236" fill="#5a636b"/>'; }).join('') +
    '<rect x="180" y="190" width="200" height="90" fill="#2f6f4a" stroke="#fff" stroke-width="5"/><path d="M200 225h160M200 252h100" stroke="#fff" stroke-width="6"/>' +
    '<rect x="520" y="400" width="240" height="14" fill="#7a5a35"/><rect x="540" y="414" width="10" height="34" fill="#444"/><rect x="730" y="414" width="10" height="34" fill="#444"/>') };

  /* 病院の廊下 */
  S.hospital = { name: '病院の廊下', svg: wrap(
    grad('hw', [[0, '#f4f6f5'], [1, '#dfe5e3']]) + grad('hf', [[0, '#c9d2cf'], [1, '#aeb9b5']]),
    '<rect width="960" height="540" fill="url(#hw)"/><path d="M0 540L330 330H630L960 540z" fill="url(#hf)"/><path d="M330 330V120H630V330" fill="#e8eeec"/><path d="M0 0L330 120V330L0 540z" fill="#eef2f0"/><path d="M960 0L630 120V330L960 540z" fill="#e6ebe9"/>' +
    '<path d="M0 0H960L630 120H330z" fill="#fbfcfb"/><path d="M470 0L490 120M600 0L560 120M360 0L420 120" stroke="#fff8c0" stroke-width="30" opacity=".9"/>' +
    '<rect x="420" y="190" width="120" height="140" fill="#cfe3f2" stroke="#7a8a94" stroke-width="4"/><path d="M480 190V330" stroke="#7a8a94" stroke-width="3"/>' +
    '<rect x="150" y="190" width="90" height="190" fill="#c9d6d0" stroke="#7a8a94" stroke-width="4" transform="skewY(-8)"/><rect x="770" y="190" width="90" height="190" fill="#c9d6d0" stroke="#7a8a94" stroke-width="4" transform="skewY(8)"/>' +
    '<rect x="454" y="120" width="52" height="30" fill="#2f8a5a"/><path d="M470 135h20M480 125v20" stroke="#fff" stroke-width="5"/>') };

  /* 屋上の夕焼け */
  S.rooftop = { name: '屋上', svg: wrap(
    grad('rs', [[0, '#5b4a8a'], [0.45, '#e9737a'], [0.8, '#ffc27a'], [1, '#ffe7b0']]),
    '<rect width="960" height="540" fill="url(#rs)"/><circle cx="480" cy="330" r="80" fill="#fff3c8" opacity=".9"/>' +
    '<path d="M0 360h60v-70h50v70h70v-110h60v110h90v-60h70v60h100v-90h60v90h90v-50h60v50h120v-120h70v120H960V420H0z" fill="#3a3550" opacity=".8"/>' +
    '<rect y="420" width="960" height="120" fill="#8a8a92"/><path d="M0 420H960" stroke="#5a5a62" stroke-width="6"/>' +
    '<path d="M0 360H960M0 395H960" stroke="#2a2a30" stroke-width="5"/>' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { return '<path d="M' + (i * 90) + ' 330V420" stroke="#2a2a30" stroke-width="4"/>'; }).join('') +
    '<path d="M150 90h90M600 70h130M780 130h110" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".5"/>') };

  /* 神社の参道 */
  S.shrine = { name: '神社の参道', svg: wrap(
    grad('hs', [[0, '#2d4a3a'], [1, '#6a8a62']]) + grad('pt', [[0, '#b5a58a'], [1, '#8c7e66']]),
    '<rect width="960" height="540" fill="url(#hs)"/>' +
    [40, 130, 230, 740, 840, 920].map(function (x, i) { return '<rect x="' + (x - 14) + '" y="40" width="28" height="460" fill="#2a1d14"/><path d="M' + (x - 90) + ' 220L' + x + ' ' + (60 - i % 2 * 20) + 'L' + (x + 90) + ' 220z" fill="#1d3a2a"/><path d="M' + (x - 110) + ' 330L' + x + ' 150L' + (x + 110) + ' 330z" fill="#244a34"/>'; }).join('') +
    '<path d="M330 540L450 300H510L630 540z" fill="url(#pt)"/><path d="M380 540L460 320M580 540L500 320" stroke="#6a5c46" stroke-width="3"/>' +
    '<rect x="340" y="140" width="280" height="22" fill="#c53a2a" rx="4"/><rect x="320" y="120" width="320" height="22" fill="#2a1d14" rx="6"/><rect x="370" y="180" width="220" height="12" fill="#c53a2a"/><rect x="380" y="160" width="26" height="170" fill="#c53a2a"/><rect x="554" y="160" width="26" height="170" fill="#c53a2a"/>' +
    '<g opacity=".9">' + [0, 1, 2, 3].map(function (i) { return '<path d="M' + (140 + i * 20) + ' 540l30-90h30l30 90z" fill="#8c8c8c"/>'; }).join('') + '</g>' +
    '<ellipse cx="480" cy="300" rx="220" ry="40" fill="#fff6c8" opacity=".12"/>') };

  /* 夜祭り */
  S.festival = { name: '夜祭り', svg: wrap(
    grad('fs', [[0, '#0b0d24'], [1, '#2a1a3a']]),
    '<rect width="960" height="540" fill="url(#fs)"/>' +
    [[120, 80], [310, 120], [520, 60], [760, 100], [880, 70]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="40" fill="' + (p[0] % 2 ? '#ff7a9a' : '#ffd24a') + '" opacity=".25"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="#fff"/>'; }).join('') +
    '<path d="M0 90Q480 170 960 70" stroke="#3a2a2a" stroke-width="4" fill="none"/>' +
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { var x = 40 + i * 80, y = 100 + Math.sin(i * 0.5) * 24 + (i * 4); var c = ['#e8423a', '#f5b53a', '#e8423a', '#fff2c0'][i % 4]; return '<path d="M' + x + ' ' + (y - 20) + 'V' + y + '" stroke="#333" stroke-width="3"/><ellipse cx="' + x + '" cy="' + (y + 28) + '" rx="22" ry="30" fill="' + c + '"/><path d="M' + (x - 16) + ' ' + (y + 18) + 'H' + (x + 16) + 'M' + (x - 20) + ' ' + (y + 30) + 'H' + (x + 20) + 'M' + (x - 16) + ' ' + (y + 42) + 'H' + (x + 16) + '" stroke="#7a2a1a" stroke-width="2"/>'; }).join('') +
    '<rect y="400" width="960" height="140" fill="#1a1520"/>' +
    [0, 1, 2].map(function (i) { var x = 60 + i * 300; return '<rect x="' + x + '" y="290" width="240" height="140" fill="#3a2a2a"/><path d="M' + (x - 10) + ' 290L' + (x + 120) + ' 240L' + (x + 250) + ' 290z" fill="' + ['#c0392b', '#2f6f9a', '#d49a2a'][i] + '"/><rect x="' + (x + 20) + '" y="320" width="200" height="40" fill="#fff0c0" opacity=".85"/><circle cx="' + (x + 60) + '" cy="380" r="14" fill="#f5b53a"/><circle cx="' + (x + 120) + '" cy="380" r="14" fill="#e8423a"/><circle cx="' + (x + 180) + '" cy="380" r="14" fill="#7ac27a"/>'; }).join('') +
    '<path d="M600 80 640 20M610 100 680 40" stroke="#ffd24a" stroke-width="4" opacity=".6"/>') };

  /* 夜の自室 */
  S.bedroom = { name: '自室の夜', svg: wrap(
    grad('bw', [[0, '#25304a'], [1, '#1a2036']]) + '<radialGradient id="lamp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>',
    '<rect width="960" height="540" fill="url(#bw)"/><rect y="400" width="960" height="140" fill="#3a2f2a"/>' +
    '<rect x="600" y="70" width="280" height="240" fill="#0f1a3a" stroke="#6a6a78" stroke-width="8"/><path d="M740 70V310M600 190H880" stroke="#6a6a78" stroke-width="5"/>' +
    [[640, 110], [700, 150], [800, 100], [840, 160], [770, 240], [660, 250]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="#fff"/>'; }).join('') + '<circle cx="830" cy="115" r="16" fill="#fff6d0"/>' +
    '<rect x="60" y="280" width="420" height="130" fill="#5a4a6a" rx="8"/><rect x="60" y="260" width="120" height="60" fill="#e8e0f0" rx="10"/><rect x="40" y="400" width="14" height="30" fill="#2a2a2a"/><rect x="486" y="400" width="14" height="30" fill="#2a2a2a"/>' +
    '<rect x="520" y="330" width="260" height="14" fill="#6a4a30"/><rect x="540" y="344" width="14" height="70" fill="#4a3220"/><rect x="750" y="344" width="14" height="70" fill="#4a3220"/>' +
    '<ellipse cx="640" cy="300" rx="130" ry="100" fill="url(#lamp)"/><path d="M640 330V280" stroke="#888" stroke-width="5"/><path d="M610 280h60l-12-30h-36z" fill="#d9a334"/>' +
    '<rect x="570" y="300" width="60" height="30" fill="#2a2a30" stroke="#555" stroke-width="3"/><rect x="40" y="90" width="140" height="190" fill="#2a2f48" stroke="#555" stroke-width="3"/><path d="M60 120h100M60 160h100M60 200h100M60 240h100" stroke="#44506a" stroke-width="4"/>') };

  /* 海辺の夕暮れ */
  S.seaside = { name: '海辺の夕暮れ', svg: wrap(
    grad('ds', [[0, '#3c5a9a'], [0.5, '#f08a6a'], [1, '#ffd38a']]) + grad('sea', [[0, '#e9a47a'], [1, '#2a4a7a']]),
    '<rect width="960" height="540" fill="url(#ds)"/><circle cx="480" cy="300" r="70" fill="#fff0c0"/>' +
    '<rect y="300" width="960" height="240" fill="url(#sea)"/>' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<path d="M' + (400 + i * 6) + ' ' + (320 + i * 28) + 'h' + (160 - i * 12) + '" stroke="#fff0c0" stroke-width="5" opacity="' + (0.8 - i * 0.1) + '"/>'; }).join('') +
    '<path d="M0 300l60-30 80 30 70-20 90 20z" fill="#2a3a5a"/><path d="M700 300l90-50 90 50 80-20v20z" fill="#2a3a5a"/>' +
    '<rect x="0" y="430" width="960" height="110" fill="#d8c294"/><path d="M0 430Q240 410 480 432T960 425" stroke="#fff" stroke-width="6" fill="none" opacity=".6"/>' +
    '<rect x="150" y="360" width="10" height="90" fill="#3a2a1a"/><path d="M155 360q-50-40-90-20M155 360q50-40 90-20M155 360q-10-60 20-80M155 360q20-50 70-60" stroke="#2a4a2a" stroke-width="9" fill="none" stroke-linecap="round"/>') };

  /* カート場のピット（赤い屋根） */
  S.paddock = { name: 'カート場のピット', svg: wrap(
    grad('ps', [[0, '#7ab8e8'], [1, '#e6f1f8']]) + grad('as', [[0, '#5a5e64'], [1, '#43474c']]),
    '<rect width="960" height="540" fill="url(#ps)"/><ellipse cx="780" cy="110" rx="120" ry="24" fill="#fff" opacity=".8"/>' +
    '<path d="M0 300Q300 250 600 285T960 260V540H0z" fill="#8cc06a"/>' +
    '<rect y="380" width="960" height="160" fill="url(#as)"/><path d="M0 380H960" stroke="#fff" stroke-width="8"/><path d="M0 395H960" stroke="#c9433a" stroke-width="6" stroke-dasharray="26 26"/>' +
    '<path d="M80 200L270 130L460 200z" fill="#c9433a"/><rect x="100" y="200" width="340" height="150" fill="#ece7dc"/><rect x="130" y="230" width="90" height="120" fill="#4a5258"/><rect x="250" y="235" width="160" height="60" fill="#cfe3f2" stroke="#5a6470" stroke-width="4"/>' +
    [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<circle cx="' + (560 + i * 46) + '" cy="' + (440) + '" r="20" fill="#222" stroke="' + (i % 2 ? '#e8d34a' : '#fff') + '" stroke-width="4"/>'; }).join('') +
    '<path d="M600 300h280v40H600z" fill="#3a5a8a"/><path d="M620 316h60M700 316h40M760 316h90" stroke="#fff" stroke-width="5"/>') };

  /* 夜の湾岸 */
  S.bayroad = { name: '夜の湾岸', svg: wrap(
    grad('bn', [[0, '#050818'], [1, '#1c2a4a']]) + grad('wt', [[0, '#1c2a4a'], [1, '#0a1020']]),
    '<rect width="960" height="540" fill="url(#bn)"/>' +
    [30, 90, 150, 360, 420, 500, 560, 800, 860, 920].map(function (x, i) { var h = 80 + (i * 37 % 120); return '<rect x="' + x + '" y="' + (300 - h) + '" width="46" height="' + h + '" fill="#111a30"/>' + [0, 1, 2, 3, 4].map(function (k) { return '<rect x="' + (x + 6 + (k % 2) * 20) + '" y="' + (300 - h + 14 + k * 22) + '" width="8" height="10" fill="#ffd76a" opacity=".8"/>'; }).join(''); }).join('') +
    '<rect y="300" width="960" height="240" fill="url(#wt)"/>' +
    '<path d="M0 360H960" stroke="#3a4a6a" stroke-width="6"/><path d="M0 330Q240 300 480 340T960 320" stroke="#ff9a5a" stroke-width="3" fill="none" opacity=".8"/>' +
    [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<rect x="' + (60 + i * 120) + '" y="296" width="6" height="64" fill="#556"/><circle cx="' + (63 + i * 120) + '" cy="294" r="9" fill="#ffe9a3"/><ellipse cx="' + (63 + i * 120) + '" cy="440" rx="12" ry="70" fill="#ffe9a3" opacity=".12"/>'; }).join('') +
    '<path d="M0 520Q480 400 960 520z" fill="#161c2c"/><path d="M0 500Q480 410 960 500" stroke="#e8e8e8" stroke-width="5" stroke-dasharray="40 40" fill="none"/>') };


  /* ---------- 仕上げ: 人影・影・光・ビネット・粒子で奥行きと質感を足す ---------- */
  function shadow(x, y, rx, ry, a) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + (ry || rx * 0.18) + '" fill="#000" opacity="' + (a || 0.22) + '" filter="url(#soft)"/>'; }
  function person(x, y, k, body, hair, skin) {   // 小さな人影（背中向き・正面どちらでも使える簡単な形）
    k = k || 1; skin = skin || '#f2d2b8';
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' + shadow(0, 2, 16, 3, 0.25) +
      '<path d="M-10 0 L-8 -34 Q0 -42 8 -34 L10 0z" fill="' + body + '"/><rect x="-9" y="-3" width="7" height="3" fill="#2a2a34"/><rect x="2" y="-3" width="7" height="3" fill="#2a2a34"/>' +
      '<circle cx="0" cy="-46" r="9" fill="' + skin + '"/><path d="M-9 -47 Q0 -62 9 -47 Q4 -53 -9 -47z" fill="' + hair + '"/></g>';
  }
  function rays(x, y, w, h, c, a) { return '<path d="M' + x + ' ' + y + ' L' + (x + w) + ' ' + (y + h) + ' L' + (x + w + 90) + ' ' + (y + h) + ' L' + (x + 70) + ' ' + y + 'z" fill="' + c + '" opacity="' + (a || 0.16) + '" filter="url(#soft)"/>'; }
  var EXTRA = {
    school: function () { return shadow(120, 505, 90) + shadow(560, 510, 120) + person(300, 470, 1.1, '#2c4a7a', '#2a1c14') + person(350, 478, 1.05, '#7a2c4a', '#5a3a28') + person(620, 462, 0.9, '#2c4a7a', '#1a1a24') +
      '<g opacity=".85"><rect x="40" y="440" width="120" height="6" fill="#555"/>' + [0, 1, 2, 3, 4].map(function (i) { return '<circle cx="' + (60 + i * 22) + '" cy="432" r="9" fill="none" stroke="#666" stroke-width="3"/>'; }).join('') + '</g>' +
      '<path d="M0 340 Q240 300 520 325 T960 300" stroke="#fff" stroke-width="2" opacity=".18" fill="none"/>'; },
    classroom: function () { return rays(650, 70, 190, 330, '#fff2b0', 0.22) + '<rect x="150" y="300" width="440" height="6" fill="#000" opacity=".12"/>' + person(430, 440, 1.2, '#355a8a', '#2a1c14') +
      [0, 1, 2].map(function (i) { return '<rect x="' + (170 + i * 120) + '" y="318" width="70" height="8" fill="#e8d9a8" opacity=".6"/>'; }).join(''); },
    teahouse: function () { return rays(120, 120, 120, 300, '#ffe9b0', 0.12) + person(300, 470, 1.2, '#5a3a2a', '#d0d0d0', '#e8c8a8') + '<ellipse cx="480" cy="300" rx="260" ry="150" fill="#ff9a2a" opacity=".07" filter="url(#soft)"/>' + shadow(480, 462, 190, 18, 0.3); },
    garage_in: function () { return shadow(480, 410, 180, 14, 0.35) + rays(300, 120, 120, 300, '#fff6c8', 0.1) + '<path d="M0 380H960" stroke="#fff" stroke-width="2" opacity=".1"/>' + person(800, 430, 1.25, '#2f5a8a', '#2a1c14'); },
    station: function () { return shadow(480, 440, 300, 16, 0.2) + person(300, 436, 1.1, '#2c3a5a', '#1a1a24') + person(340, 440, 1.0, '#8a3a4a', '#4a2a1a') + person(840, 436, 1.1, '#3a4a3a', '#2a1c14') + rays(560, 120, 160, 260, '#ffe0a0', 0.14); },
    hospital: function () { return shadow(480, 470, 260, 18, 0.18) + person(460, 440, 0.8, '#e8f0ee', '#2a1c14') + '<rect x="0" y="300" width="960" height="3" fill="#fff" opacity=".25"/>'; },
    rooftop: function () { return shadow(480, 462, 360, 20, 0.28) + person(300, 470, 1.35, '#2f4a7a', '#2a1c14') + person(350, 476, 1.3, '#7a3a5a', '#5a3a28') + rays(380, 250, 160, 230, '#ffe0a0', 0.1); },
    shrine: function () { return rays(440, 40, 130, 440, '#fff6c8', 0.16) + shadow(480, 530, 160, 14, 0.25) + person(480, 470, 1.15, '#7a2c2c', '#2a1c14') +
      [160, 760].map(function (x) { return '<rect x="' + (x - 8) + '" y="390" width="16" height="100" fill="#8c8c8c"/><path d="M' + (x - 22) + ' 392h44l-6-26h-32z" fill="#7a7a7a"/><circle cx="' + x + '" cy="372" r="6" fill="#ffd24a" opacity=".7"/>'; }).join(''); },
    festival: function () { return person(240, 470, 1.2, '#2f6f9a', '#2a1c14') + person(300, 478, 1.15, '#c0392b', '#5a3a28') + person(700, 470, 1.2, '#d49a2a', '#1a1a24') + person(760, 476, 1.1, '#7a3a8a', '#2a1c14') +
      '<ellipse cx="480" cy="300" rx="480" ry="120" fill="#ff9a5a" opacity=".06" filter="url(#soft)"/>' + [[160, 60], [420, 40], [700, 70]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="60" fill="#ffd24a" opacity=".07" filter="url(#soft)"/>'; }).join(''); },
    bedroom: function () { return rays(610, 80, 120, 330, '#9ab4ff', 0.08) + '<ellipse cx="640" cy="360" rx="150" ry="40" fill="#ffe9a8" opacity=".12" filter="url(#soft)"/>'; },
    seaside: function () { return shadow(160, 452, 70, 6, 0.3) + person(700, 470, 1.3, '#2f4a7a', '#2a1c14') + person(750, 476, 1.25, '#c0394a', '#5a3a28') + '<path d="M0 438Q240 428 480 440T960 432V440H0z" fill="#fff" opacity=".18"/>'; },
    paddock: function () { return shadow(270, 352, 180, 10, 0.25) + person(520, 400, 1.2, '#c9433a', '#2a1c14') + person(580, 404, 1.15, '#2f6a9a', '#5a3a28') + person(640, 398, 1.1, '#e8d34a', '#1a1a24') + '<path d="M0 380H960" stroke="#000" stroke-width="2" opacity=".12"/>'; },
    bayroad: function () { return '<ellipse cx="480" cy="380" rx="480" ry="60" fill="#ff9a5a" opacity=".08" filter="url(#soft)"/>' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<rect x="' + (50 + i * 140) + '" y="372" width="60" height="3" fill="#ffd76a" opacity=".35"/>'; }).join(''); }
  };
  var OVERLAY = '<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>' +
    '<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .22 0"/></filter>' +
    '<radialGradient id="vg" cx="50%" cy="50%" r="75%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>' +
    '<linearGradient id="tl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>';
  Object.keys(S).forEach(function (id) {
    var ex = EXTRA[id] ? EXTRA[id]() : '';
    S[id].svg = S[id].svg.replace('<defs>', '<defs>' + OVERLAY).replace('</svg>', ex + '<rect width="960" height="540" fill="url(#tl)"/><rect width="960" height="540" fill="url(#vg)"/><rect width="960" height="540" filter="url(#grain)" opacity=".5"/></svg>');
  });
  var cache = {};
  R.drawScene = function (cv, id) {
    var sc = S[id];
    if (!sc) return false;
    var g = cv.getContext('2d');
    function paint(img) { g.drawImage(img, 0, 0, cv.width, cv.height); }
    if (cache[id] && cache[id].complete) { paint(cache[id]); return true; }
    var img = new Image();
    img.onload = function () { cache[id] = img; paint(img); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sc.svg);
    cache[id] = img;
    return true;
  };
})();
