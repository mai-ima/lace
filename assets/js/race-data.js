/*
 * race-data.js — TENRYU RACING のデータ（コース・車・ドライバー・物語・保存）。
 *
 *   race-data.js   … ここ。数字と文章だけ
 *   race-engine.js … 走る・描く（GUI の Canvas と TUI の文字の両方）
 *   race-front.js  … メニュー・物語・ガレージと ゲーム本体
 *
 * 3 つのファイルは window.TB.Race を共有する。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var R = TB.Race = TB.Race || {};

  /* ---------- 小道具 ---------------------------------------------------- */

  function ja() { return TB.state.lang === 'ja'; }
  function L(j, e) { return ja() ? j : e; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function sfx(n) { if (TB.Sfx) TB.Sfx.play(n); }
  function fmt(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) return '--:--.--';
    var m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000), c = Math.floor(ms % 1000 / 10);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function yen(n) { return L(n.toLocaleString() + ' 円', n.toLocaleString() + ' cr'); }

  R.util = { ja: ja, L: L, clamp: clamp, lerp: lerp, rnd: rnd, pick: pick, sfx: sfx, fmt: fmt, shuffle: shuffle, yen: yen };

  /* =====================================================================
     コース（12 本）
     build は区間を積み上げる手順。b.* は race-engine.js の builder。
     ===================================================================== */

  R.TRACKS = {
    coast: {
      name: { ja: '海岸線', en: 'Coastline' }, diff: 1, laps: 2,
      desc: { ja: '青い海と椰子の並木。ゆるいカーブが続く入門コース。', en: 'Blue sea and palms. Gentle sweepers — the starter track.' },
      pal: { sky: ['#2f8fd8', '#7cc4f0', '#d6f0ff'], sun: { x: 0.72, y: 0.16, r: 16, c: '#fff6c9' },
             far: '#6fa8c9', hill: '#2f8f5b', fog: '#cfeeff',
             grass: ['#3fae5a', '#37a052'], road: ['#6b6b72', '#65656c'], rumble: ['#e7e7e7', '#e14d4d'], lane: '#f2f2f2' },
      deco: ['palm', 'palm', 'sign', 'rock', 'palm', 'lighthouse', 'palm', 'barrier'], weather: 'clear',
      build: function (b) {
        b.straight(40); b.curve(50, 2, 0); b.hill(40, 20); b.curve(60, -3, -10);
        b.straight(30); b.sCurves(3); b.curve(70, 3, 30); b.straight(40);
        b.curve(50, -2, -20); b.bumps(); b.curve(60, 4, 0); b.straight(50); b.finish();
      }
    },
    forest: {
      name: { ja: '雨の森林道', en: 'Rainforest Road' }, diff: 2, laps: 2,
      desc: { ja: '雨で路面が濡れている。カーブの手前でしっかり減速。', en: 'Wet asphalt in the rain. Brake before the bends.' },
      pal: { sky: ['#4f5a66', '#76818d', '#a4adb6'], far: '#4e5d58', hill: '#2f4a36', fog: '#9aa6ae',
             grass: ['#2f6b3a', '#2a6034'], road: ['#4a4d52', '#46494e'], rumble: ['#dcdcdc', '#555'], lane: '#dcdcdc' },
      deco: ['pine', 'pine', 'bush', 'tree', 'rock', 'pine', 'sign'], weather: 'rain',
      build: function (b) {
        b.straight(30); b.curve(40, 3, 10); b.curve(40, -3, -10); b.sCurves(3); b.hill(40, 25);
        b.curve(60, -4, -25); b.straight(30); b.curve(30, 5, 0); b.curve(30, -5, 0); b.bumps();
        b.curve(50, 3, 15); b.straight(40); b.finish();
      }
    },
    desert: {
      name: { ja: '砂漠ハイウェイ', en: 'Desert Highway' }, diff: 2, laps: 2,
      desc: { ja: '長い直線と大きな起伏。砂嵐で遠くがかすむ。', en: 'Long straights and big crests. Sand haze on the horizon.' },
      pal: { sky: ['#3f8fd6', '#8fc9f0', '#f3dcae'], sun: { x: 0.5, y: 0.1, r: 20, c: '#fffbe0' },
             far: '#c98a5b', hill: '#d9a066', fog: '#f3dcae',
             grass: ['#e2b877', '#dbb070'], road: ['#77706a', '#716a64'], rumble: ['#f5f5f5', '#c0392b'], lane: '#fff1c1' },
      deco: ['cactus', 'rock', 'cactus', 'mesa', 'sign', 'cactus'], weather: 'sand',
      build: function (b) {
        b.straight(80); b.curve(80, 2, 10); b.straight(100); b.curve(60, -3, -10); b.hill(60, 30);
        b.hill(60, -30); b.straight(60); b.curve(70, 4, 0); b.straight(90); b.sCurves(2); b.finish();
      }
    },
    ridge: {
      name: { ja: '山岳路', en: 'Ridge Pass' }, diff: 3, laps: 2,
      desc: { ja: '夕暮れの峠道。登り下りと急なカーブ。', en: 'A mountain pass at sunset. Climbs, drops and hairpins.' },
      pal: { sky: ['#d9684a', '#f5a66b', '#ffe0b3'], sun: { x: 0.28, y: 0.4, r: 24, c: '#ffd27a' },
             far: '#8c6a8f', hill: '#5c7a3a', fog: '#ffe0b3',
             grass: ['#6f8f3a', '#678634'], road: ['#5c5c63', '#57575e'], rumble: ['#f5f5f5', '#333'], lane: '#e8e8e8' },
      deco: ['tree', 'tree', 'rock', 'sign', 'tree', 'torii', 'tree'], weather: 'clear',
      build: function (b) {
        b.straight(30); b.hill(40, 40); b.curve(50, 4, 20); b.curve(40, -5, -30);
        b.hill(30, -30); b.sCurves(5); b.curve(50, 6, 40); b.bumps(); b.curve(40, -6, -20);
        b.hill(50, 30); b.curve(60, -4, -40); b.straight(40); b.sCurves(4); b.finish();
      }
    },
    city: {
      name: { ja: '夜の都市', en: 'Night City' }, diff: 3, laps: 2,
      desc: { ja: 'ネオンと街灯の市街地。途中に地下トンネル。', en: 'Neon streets and a tunnel under the city.' },
      pal: { sky: ['#05081a', '#0b0f24', '#2a2150'], moon: { x: 0.8, y: 0.14, r: 10, c: '#f5f1d6' },
             far: '#1a1838', hill: '#141a2e', fog: '#1f1a3d', wall: '#34324a',
             grass: ['#1a1f2b', '#171b26'], road: ['#2c2c38', '#282833'], rumble: ['#ffd93d', '#222'], lane: '#ffd93d' },
      deco: ['lamp', 'building', 'lamp', 'building', 'billboard', 'building'], night: true, skyline: true, weather: 'clear',
      build: function (b) {
        b.straight(60); b.curve(40, 5, 0); b.straight(40);
        b.tunnel(function () { b.curve(40, -6, 10); b.straight(60); });
        b.sCurves(6); b.curve(50, 5, -10); b.straight(40);
        b.curve(30, -7, 0); b.curve(30, 7, 0); b.straight(60); b.curve(50, -4, 0); b.finish();
      }
    },
    harbor: {
      name: { ja: '霧の港湾', en: 'Foggy Harbor' }, diff: 3, laps: 2,
      desc: { ja: '濃い霧のコンテナふ頭。工事中のコーンに注意。', en: 'Container docks in thick fog. Watch the cones.' },
      pal: { sky: ['#66788c', '#95a4b4', '#c6ced6'], far: '#7d8a99', hill: '#5b6775', fog: '#c2cad3',
             grass: ['#5a6470', '#545e69'], road: ['#4d5058', '#494c54'], rumble: ['#f2c14e', '#333'], lane: '#f2f2f2' },
      deco: ['container', 'lamp', 'crane', 'container', 'barrier', 'container'], weather: 'fog', hazards: { cone: 26 },
      build: function (b) {
        b.straight(50); b.curve(30, 6, 0); b.straight(40); b.curve(30, -6, 0); b.straight(30);
        b.sCurves(4); b.curve(40, 5, 0); b.straight(60); b.curve(40, -6, 0); b.curve(20, 7, 0);
        b.straight(40); b.finish();
      }
    },
    snow: {
      name: { ja: '雪山', en: 'Snow Summit' }, diff: 4, laps: 2,
      desc: { ja: '雪が降りしきる山頂。とにかく滑る。', en: 'Snowfall at the summit. Everything slides.' },
      pal: { sky: ['#8fa9c7', '#bccde0', '#e8eef5'], far: '#9fb3cc', hill: '#dfe8f2', fog: '#e8eef5',
             grass: ['#f2f6fa', '#e4ebf3'], road: ['#6d7480', '#676e7a'], rumble: ['#ffffff', '#2d6cdf'], lane: '#ffffff' },
      deco: ['snowpine', 'snowpine', 'rock', 'snowpine', 'snowman', 'sign'], weather: 'snow',
      build: function (b) {
        b.straight(30); b.hill(40, 30); b.curve(40, 5, 20); b.curve(30, -6, 0); b.curve(30, 6, -20);
        b.sCurves(5); b.hill(40, -30); b.curve(50, -5, 10); b.bumps(); b.curve(40, 6, 0);
        b.straight(30); b.finish();
      }
    },
    highway: {
      name: { ja: '湾岸高速', en: 'Bayside Highway' }, diff: 3, laps: 2,
      desc: { ja: '真夜中の高速道路。一般車とトンネルが続く。', en: 'The midnight highway. Traffic and long tunnels.' },
      pal: { sky: ['#03040d', '#0a0e25', '#22305c'], moon: { x: 0.25, y: 0.16, r: 11, c: '#e8eefc' },
             far: '#141a36', hill: '#0e1328', fog: '#1b2446', wall: '#3a3f4f',
             grass: ['#20242e', '#1d212a'], road: ['#2e3038', '#2a2c34'], rumble: ['#dddddd', '#555'], lane: '#f0f0f0' },
      deco: ['lamp', 'barrier', 'billboard', 'lamp', 'sign', 'barrier'], night: true, skyline: true, weather: 'clear', traffic: 10,
      build: function (b) {
        b.straight(100);
        b.tunnel(function () { b.curve(60, 2, 0); b.straight(60); });
        b.curve(80, -2, 10); b.straight(120); b.curve(60, 3, -10);
        b.tunnel(function () { b.straight(80); b.curve(50, -3, 0); });
        b.straight(100); b.curve(80, 2, 0); b.finish();
      }
    },
    canyon: {
      name: { ja: '大峡谷', en: 'Grand Canyon' }, diff: 4, laps: 2,
      desc: { ja: '赤い岩の谷。ジャンプしそうな起伏の連続。', en: 'Red rock valleys with roller-coaster crests.' },
      pal: { sky: ['#b8452e', '#f28f3b', '#ffd6a5'], sun: { x: 0.18, y: 0.3, r: 26, c: '#ffe9b0' },
             far: '#a0522d', hill: '#b5651d', fog: '#ffd6a5',
             grass: ['#c47a45', '#bb723f'], road: ['#6a5a50', '#64554b'], rumble: ['#f5f5f5', '#8b3a1a'], lane: '#fff0d0' },
      deco: ['mesa', 'rock', 'cactus', 'rock', 'mesa'], weather: 'clear', hazards: { debris: 12 },
      build: function (b) {
        b.straight(40); b.hill(40, 50); b.curve(40, 4, -30); b.curve(40, -5, 20); b.hill(30, -40);
        b.bumps(); b.bumps(); b.curve(50, 6, 30); b.curve(40, -6, -30); b.hill(40, 40);
        b.curve(50, -4, -40); b.straight(30); b.finish();
      }
    },
    circuit: {
      name: { ja: 'TUI サーキット', en: 'TUI Circuit' }, diff: 4, laps: 3,
      desc: { ja: '観客席に囲まれた本格サーキット。ヘアピンが多い。', en: 'A real circuit with grandstands and hairpins.' },
      pal: { sky: ['#1e88e5', '#64b5f6', '#e3f2fd'], sun: { x: 0.62, y: 0.13, r: 16, c: '#ffffff' },
             far: '#78909c', hill: '#43a047', fog: '#e3f2fd',
             grass: ['#4caf50', '#45a449'], road: ['#5f6368', '#5a5e63'], rumble: ['#ffffff', '#e53935'], lane: '#ffffff' },
      deco: ['grandstand', 'billboard', 'tyrewall', 'grandstand', 'sign', 'tyrewall'], weather: 'clear', curbs: true,
      build: function (b) {
        b.straight(60); b.curve(20, 7, 0); b.straight(40); b.curve(25, -5, 0); b.curve(25, 6, 0);
        b.straight(70); b.curve(30, 8, 0); b.straight(30); b.sCurves(5); b.curve(30, -7, 0);
        b.straight(50); b.curve(20, 6, 0); b.finish();
      }
    },
    volcano: {
      name: { ja: '火山ルート', en: 'Volcano Route' }, diff: 5, laps: 2,
      desc: { ja: '溶岩が光る火山帯。灰が舞い、落石もある。', en: 'Glowing lava, falling ash and loose rocks.' },
      pal: { sky: ['#1a0505', '#4a0e0e', '#a02c14'], far: '#2b0b0b', hill: '#3d1010', fog: '#6e1c0c',
             grass: ['#2b1b18', '#261815'], road: ['#3a3434', '#363030'], rumble: ['#ff6f00', '#222'], lane: '#ffab40' },
      deco: ['lavarock', 'rock', 'lavarock', 'sign', 'lavarock'], weather: 'ash', lava: true, night: true, hazards: { debris: 16 },
      build: function (b) {
        b.straight(30); b.hill(50, 40); b.curve(40, 5, -20); b.curve(30, -7, 20); b.sCurves(6);
        b.hill(40, -40); b.curve(40, 7, 30); b.bumps(); b.curve(40, -7, -30); b.curve(30, 6, 0);
        b.straight(40); b.finish();
      }
    },
    neon: {
      name: { ja: 'ネオン回廊', en: 'Neon Corridor' }, diff: 5, laps: 3,
      desc: { ja: '光の柱が並ぶ電脳空間。加速パネルを踏め。', en: 'A cyber corridor of light. Hit the boost pads.' },
      pal: { sky: ['#0a0018', '#1d0038', '#4a0070'], far: '#1a0033', hill: '#12002a', fog: '#2a0050', wall: '#220044',
             grass: ['#0d0620', '#0b051b'], road: ['#1a1030', '#170d2b'], rumble: ['#00e5ff', '#ff00c8'], lane: '#00e5ff' },
      deco: ['neon', 'holo', 'neon', 'neon', 'holo'], night: true, neon: true, curbs: true, weather: 'clear',
      build: function (b) {
        b.straight(60); b.curve(40, 6, 0);
        b.tunnel(function () { b.straight(40); b.curve(30, -6, 0); });
        b.sCurves(6); b.hill(40, 30); b.curve(40, 7, -30); b.straight(60); b.curve(30, -7, 0);
        b.curve(30, 7, 0); b.bumps(); b.straight(40); b.finish();
      }
    }
  };

  /* ---------- ご当地コース（浜松・名古屋・東名） ---------- */
  var PAL = {
    hmcity: { sky: ['#3d8fd9', '#8cc8f2', '#e2f2ff'], sun: { x: 0.66, y: 0.14, r: 16, c: '#fff8d6' },
              far: '#8aa2b8', hill: '#6b8f5e', fog: '#dcecf7',
              grass: ['#8d96a0', '#858e98'], road: ['#626670', '#5d616a'], rumble: ['#f0f0f0', '#d84343'], lane: '#ffffff' },
    hmlake: { sky: ['#3a95dc', '#8fd0f5', '#e6f6ff'], sun: { x: 0.3, y: 0.15, r: 17, c: '#fffbe0' },
              far: '#6f9fbf', hill: '#3f8a5a', fog: '#d9effa', water: '#2f7fc1',
              grass: ['#47a35b', '#419a55'], road: ['#686b72', '#63666d'], rumble: ['#f2f2f2', '#2d6cdf'], lane: '#fdfdfd' },
    hmdune: { sky: ['#4b9be0', '#9dd3f5', '#f5e6c4'], sun: { x: 0.52, y: 0.12, r: 18, c: '#fffbe6' },
              far: '#86b5d6', hill: '#e0c48c', fog: '#f5e6c4', water: '#2f8fce',
              grass: ['#e6cf9a', '#dfc792'], road: ['#78726a', '#726c64'], rumble: ['#f5f5f5', '#c0392b'], lane: '#fff5d6' },
    hmmount: { sky: ['#5aa0d8', '#a3d2f0', '#e8f4fb'], far: '#5f8a6e', hill: '#2e6b3f', fog: '#d6e8e0',
               grass: ['#3f8f3c', '#3a8737'], road: ['#5d6067', '#585b62'], rumble: ['#f2f2f2', '#555'], lane: '#f0f0f0' },
    hwy: { sky: ['#4a94d6', '#96c9ee', '#e6f1f9'], sun: { x: 0.78, y: 0.12, r: 15, c: '#ffffff' },
           far: '#8fa7ba', hill: '#5f8753', fog: '#dde9f2', wall: '#8a8f99',
           grass: ['#6a8d56', '#648650'], road: ['#55585f', '#51545b'], rumble: ['#ffffff', '#9aa0a6'], lane: '#ffffff' },
    hwymount: { sky: ['#6c9ccc', '#a9cbe6', '#e1ecf4'], far: '#6d8aa0', hill: '#3b6b44', fog: '#d3e2ec', wall: '#7b808a',
                grass: ['#4b7f43', '#46783f'], road: ['#54575e', '#505359'], rumble: ['#ffffff', '#9aa0a6'], lane: '#ffffff' },
    ngcity: { sky: ['#101634', '#27306b', '#6b5aa8'], moon: { x: 0.2, y: 0.16, r: 10, c: '#f3efd6' },
              far: '#232a55', hill: '#1c2244', fog: '#3a3a70', wall: '#3a3d55',
              grass: ['#2a2e40', '#262a3a'], road: ['#32343f', '#2e303a'], rumble: ['#ffd93d', '#333'], lane: '#ffe082' },
    ngport: { sky: ['#e2733f', '#f7a868', '#ffe4c2'], sun: { x: 0.82, y: 0.34, r: 22, c: '#ffd89a' },
              far: '#5e6f86', hill: '#4c5b70', fog: '#f2d4b8', water: '#2b5d8a',
              grass: ['#6c7480', '#666e7a'], road: ['#51535b', '#4d4f57'], rumble: ['#f2c14e', '#333'], lane: '#f2f2f2' },
    ngpark: { sky: ['#4c98dc', '#9ccff2', '#eef7ff'], sun: { x: 0.4, y: 0.12, r: 16, c: '#ffffff' },
              far: '#8ba6bd', hill: '#4a8d4f', fog: '#e2f0f8',
              grass: ['#5aa55a', '#539d53'], road: ['#666a72', '#61656d'], rumble: ['#f5f5f5', '#c8a24a'], lane: '#ffffff' }
  };
  R.PAL = PAL;

  R.TRACKS.hamamatsu = {
    name: { ja: '浜松シティ', en: 'Hamamatsu City' }, diff: 2, laps: 2, pal: PAL.hmcity, weather: 'clear',
    desc: { ja: '駅前の高いタワーと浜松城。楽器とうなぎの街を一周。', en: 'Station tower, castle, music and eel — a lap of Hamamatsu.' },
    deco: ['building', 'lamp', 'building', 'unagi', 'building', 'piano', 'lamp'], landmarks: ['acttower', 'castle'],
    build: function (b) {
      b.straight(50); b.curve(25, 6, 0); b.straight(40); b.curve(25, -6, 0); b.straight(60);
      b.curve(30, 5, 10); b.straight(40); b.sCurves(4); b.curve(25, -6, -10); b.straight(50); b.curve(25, 6, 0); b.finish();
    }
  };
  R.TRACKS.hamanako = {
    name: { ja: '浜名湖ベイ', en: 'Lake Hamana Bay' }, diff: 2, laps: 2, pal: PAL.hmlake, weather: 'clear', water: 'left',
    desc: { ja: '湖を左に見ながら走る湖岸道路。観覧車の見える温泉街も。', en: 'Lakeside road with the lake on your left and a Ferris wheel.' },
    deco: ['pine', 'unagi', 'palm', 'pine', 'sign', 'bush'], landmarks: ['ferris', 'torii'],
    build: function (b) {
      b.straight(50); b.curve(60, 2, 0); b.curve(50, -3, 10); b.straight(40); b.curve(70, 3, -10);
      b.bumps(); b.curve(60, -2, 0); b.straight(60); b.sCurves(2); b.finish();
    }
  };
  R.TRACKS.tomei = {
    name: { ja: '東名ハイウェイ', en: 'Tomei Expressway' }, diff: 3, laps: 2, pal: PAL.hwy, weather: 'clear', traffic: 12,
    desc: { ja: '浜松と名古屋を結ぶ高速道路。防音壁と一般車の中を全開で。', en: 'The expressway linking Hamamatsu and Nagoya. Flat out through traffic.' },
    deco: ['soundwall', 'greensign', 'soundwall', 'lamp', 'soundwall'],
    build: function (b) {
      b.straight(120); b.curve(90, 2, 10); b.straight(100);
      b.tunnel(function () { b.curve(60, -2, 0); b.straight(50); });
      b.curve(90, -2, -10); b.straight(140); b.curve(80, 2, 0); b.finish();
    }
  };
  R.TRACKS.nagoya = {
    name: { ja: '名古屋ナイト', en: 'Nagoya Night' }, diff: 4, laps: 2, pal: PAL.ngcity, night: true, skyline: true, weather: 'clear',
    desc: { ja: '駅前の双子ビル、電波塔、金のしゃちほこ。夜の大都市を駆け抜ける。', en: 'Twin towers, the TV tower and golden shachi — Nagoya by night.' },
    deco: ['building', 'lamp', 'billboard', 'building', 'lamp'], landmarks: ['twintower', 'tvtower', 'castle'],
    build: function (b) {
      b.straight(60); b.curve(30, 6, 0); b.straight(50);
      b.tunnel(function () { b.curve(30, -5, 0); b.straight(40); });
      b.curve(30, -7, 0); b.straight(70); b.sCurves(5); b.curve(30, 6, 0); b.straight(50); b.finish();
    }
  };

  /* ---------- 峠（ダウンヒル）と本格サーキット ---------- */
  var TPAL = {
    night: { sky: ['#02030a', '#070b1c', '#1a2340'], moon: { x: 0.7, y: 0.15, r: 9, c: '#eef2ff' },
             far: '#0d1326', hill: '#0a0f1e', fog: '#141b30', wall: '#2a2f3a',
             grass: ['#10180f', '#0e150d'], road: ['#2c2e33', '#2a2c31'], rumble: ['#8a8c90', '#7c7e82'], lane: '#d8d8d8' },
    dusk: { sky: ['#40508a', '#c47a6a', '#f2c69a'], sun: { x: 0.2, y: 0.42, r: 20, c: '#ffd9a0' },
            far: '#5c5a7a', hill: '#3c4a3a', fog: '#d8b9a0',
            grass: ['#3d5a2e', '#39552b'], road: ['#4c4d52', '#48494e'], rumble: ['#a3a4a8', '#96979b'], lane: '#e6e6e6' },
    autumn: { sky: ['#5a8fc8', '#a8c8e6', '#e8eef2'], sun: { x: 0.64, y: 0.12, r: 15, c: '#ffffff' },
              far: '#7d8aa0', hill: '#8a5a2e', fog: '#dfe3e6',
              grass: ['#6e5a2a', '#685527'], road: ['#55565a', '#515256'], rumble: ['#a8a9ad', '#9d9ea2'], lane: '#f0f0f0' },
    hakone: { sky: ['#4f8fcf', '#9ac4e8', '#e9f1f7'], sun: { x: 0.35, y: 0.1, r: 15, c: '#ffffff' },
              far: '#6f8fa8', hill: '#3e6a45', fog: '#d8e6ee', water: '#3f79a8',
              grass: ['#4a7a3e', '#45733a'], road: ['#505257', '#4c4e53'], rumble: ['#b0b1b5', '#a4a5a9'], lane: '#ffffff' },
    fuji: { sky: ['#3d88d6', '#8ec2ee', '#e5f1fb'], sun: { x: 0.8, y: 0.12, r: 15, c: '#ffffff' },
            far: '#9fb4c8', hill: '#5b8a4a', fog: '#e3eef6',
            grass: ['#4f9a47', '#4a9243'], road: ['#595b60', '#55575c'], rumble: ['#ffffff', '#e53935'], lane: '#ffffff' }
  };
  function hairpins(b, n, dir) { for (var i = 0; i < n; i++) { b.road(8, 14, 8, (i % 2 ? -1 : 1) * dir * 7.5, -6); b.road(12, 12, 12, 0, -5); } }
  R.TRACKS.akimine = {
    reps: 3,
    name: { ja: '秋峰山ダウンヒル', en: 'Akimine Downhill' }, diff: 4, laps: 1, pal: TPAL.night, night: true, rails: true, touge: true, weather: 'clear',
    desc: { ja: '深夜の峠を下る。5 連ヘアピンが名物の、走り屋の聖地（峠マンガ風）。', en: 'A midnight downhill with a famous five-hairpin section.' },
    deco: ['pine', 'tree', 'pine', 'rock', 'pine'],
    build: function (b) {
      b.straight(20); b.curve(30, 3, -20); b.curve(25, -5, -20); b.road(20, 30, 20, 4, -30); b.straight(25);
      hairpins(b, 5, 1); b.curve(30, -4, -15); b.sCurves(5); b.curve(25, 6, -20); b.straight(40); b.curve(30, -5, -10); b.straight(60);
    }
  };
  R.TRACKS.usui = {
    reps: 3,
    name: { ja: '臼井峠', en: 'Usui Pass' }, diff: 5, laps: 1, pal: TPAL.dusk, rails: true, touge: true, weather: 'clear',
    desc: { ja: '夕暮れの旧道。途切れないタイトコーナーの連続。', en: 'An old road at dusk — tight corner after tight corner.' },
    deco: ['tree', 'pine', 'rock', 'tree', 'sign'],
    build: function (b) {
      b.straight(20);
      for (var i = 0; i < 9; i++) { b.road(10, 12, 10, (i % 2 ? -1 : 1) * (5 + (i % 3)), -4); b.road(6, 4, 6, 0, -2); }
      b.sCurves(6); hairpins(b, 3, -1); b.curve(25, 5, -10); b.straight(60);
    }
  };
  R.TRACKS.iroha = {
    reps: 3,
    name: { ja: '四十八曲り（紅葉）', en: '48 Bends (Autumn)' }, diff: 4, laps: 1, pal: TPAL.autumn, rails: true, touge: true, weather: 'clear',
    desc: { ja: '紅葉に染まる九十九折り。ヘアピンをリズムよく抜けろ。', en: 'Switchbacks in autumn colours. Find the rhythm.' },
    deco: ['maple', 'maple', 'rock', 'maple', 'pine'],
    build: function (b) { b.straight(20); hairpins(b, 8, 1); b.curve(30, -3, -10); b.straight(60); }
  };
  R.TRACKS.hakone = {
    reps: 2,
    name: { ja: '小田原パイクス（箱根）', en: 'Odawara Pikes (Hakone)' }, diff: 4, laps: 1, pal: TPAL.hakone, rails: true, touge: true, weather: 'clear',
    desc: { ja: '海を望む高速ワインディング。公道レースの聖地（公道レースマンガ風）。', en: 'Fast public-road sweepers above the sea.' },
    deco: ['pine', 'tree', 'greensign', 'pine', 'soundwall'],
    build: function (b) {
      b.straight(40); b.curve(50, 2.5, -20); b.straight(40); b.curve(40, -3.5, -25); b.curve(40, 3, -20);
      b.straight(60); b.curve(45, -4, -25); b.sCurves(3); b.curve(35, 5, -20); b.straight(70);
    }
  };
  R.TRACKS.ashinoko = {
    reps: 2,
    name: { ja: '芦ノ湖 GT', en: 'Lake Ashi GT' }, diff: 3, laps: 1, pal: TPAL.hakone, rails: true, touge: true, water: 'left', weather: 'clear',
    desc: { ja: '湖畔を抜けて峠を駆け上がる、公道 GT の名舞台。', en: 'Lakeside then up the pass — a public-road GT classic.' },
    deco: ['pine', 'tree', 'pine', 'bush'], landmarks: ['torii'],
    build: function (b) {
      b.straight(50); b.curve(50, 2, 5); b.curve(40, -3, 10); b.straight(40); b.curve(30, 5, 20); b.curve(30, -5, 20);
      b.sCurves(4); b.curve(30, 6, 15); b.straight(70);
    }
  };
  R.TRACKS.fujisp = {
    name: { ja: 'フジヤマ・スピードウェイ', en: 'Fujiyama Speedway' }, diff: 3, laps: 3, pal: TPAL.fuji, curbs: true, weather: 'clear',
    desc: { ja: '富士山を望む 1.5km の長いストレートが名物の国際サーキット（モチーフ）。', en: 'An international circuit with a huge main straight and a view of Mt. Fuji.' },
    deco: ['grandstand', 'billboard', 'tyrewall', 'grandstand', 'tyrewall'], landmarks: ['fuji'],
    build: function (b) {
      b.straight(130); b.curve(20, 8, 0); b.straight(30); b.curve(30, -4, 10); b.curve(30, 5, 0); b.straight(50);
      b.curve(25, -7, -10); b.curve(20, 7, 0); b.straight(40); b.curve(25, 6, 0); b.finish();
    }
  };
  R.TRACKS.isetec = {
    name: { ja: '伊勢テクニカルサーキット', en: 'Ise Technical Circuit' }, diff: 5, laps: 3, pal: PAL.ngpark, curbs: true, weather: 'clear',
    desc: { ja: 'S 字、ヘアピン、高速コーナー。ドライバーの腕が試される（鈴鹿モチーフ）。', en: 'Esses, hairpin, fast sweepers — a driver’s circuit.' },
    deco: ['grandstand', 'tyrewall', 'billboard', 'ferris', 'tyrewall'],
    build: function (b) {
      b.straight(70); b.curve(20, 5, 0); b.sCurves(5); b.curve(20, -7, 10); b.straight(30); b.curve(15, 9, 0);
      b.straight(40); b.curve(40, -3, -10); b.curve(20, 6, 0); b.straight(60); b.curve(15, -8, 0); b.curve(25, 4, 0); b.finish();
    }
  };

  R.ORDER = ['coast', 'forest', 'desert', 'ridge', 'hamamatsu', 'hamanako', 'city', 'harbor', 'snow', 'highway', 'tomei', 'nagoya',
             'canyon', 'circuit', 'fujisp', 'isetec', 'volcano', 'neon'];
  R.TOUGE = ['akimine', 'usui', 'iroha', 'hakone', 'ashinoko'];
  R.ALL_TRACKS = R.ORDER.concat(R.TOUGE);

  R.WEATHERS = {
    clear: { ja: '晴れ', en: 'Clear' }, rain: { ja: '雨', en: 'Rain' }, snow: { ja: '雪', en: 'Snow' },
    fog: { ja: '霧', en: 'Fog' }, sand: { ja: '砂嵐', en: 'Sand' }, ash: { ja: '降灰', en: 'Ash' }
  };

  /* =====================================================================
     車（自分で乗るもの 10 台）
     stats は 1〜10: spd 最高速 / acc 加速 / grp グリップ / arm 頑丈さ / nit ニトロ
     ===================================================================== */

  R.PAINTS = ['#5ccfa0', '#e06c75', '#56a8f5', '#ffd93d', '#f5f5f5', '#30343f', '#ff9f43', '#a78bfa', '#ff5fd2', '#4dd0e1'];

  R.CARS = [
    { id: 'pod', name: { ja: 'ポッド K1', en: 'Pod K1' }, cls: 'C', price: 0, body: 'kei', paint: 0,
      stats: { spd: 3, acc: 5, grp: 6, arm: 4, nit: 4 },
      desc: { ja: '倉庫で眠っていた軽自動車。小回りは得意。', en: 'A kei car found in a garage. Nimble, if slow.' } },
    { id: 'hatch', name: { ja: 'ホットハッチ R', en: 'Hot Hatch R' }, cls: 'C', price: 2500, body: 'hatch', paint: 1,
      stats: { spd: 4, acc: 7, grp: 7, arm: 4, nit: 5 },
      desc: { ja: '軽くて加速が鋭い。街中に強い。', en: 'Light and punchy. Loves tight streets.' } },
    { id: 'sedan', name: { ja: 'ストリート GT-S', en: 'Street GT-S' }, cls: 'B', price: 5000, body: 'sedan', paint: 2,
      stats: { spd: 6, acc: 5, grp: 6, arm: 6, nit: 5 },
      desc: { ja: 'くせのない 4 ドア。どのコースでも戦える。', en: 'A no-nonsense four-door. Good anywhere.' } },
    { id: 'rally', name: { ja: 'ラリー 4WD', en: 'Rally 4WD' }, cls: 'B', price: 6500, body: 'rally', paint: 4, offroad: true,
      stats: { spd: 5, acc: 7, grp: 8, arm: 7, nit: 5 },
      desc: { ja: '雨・雪・芝生に強い四輪駆動。', en: 'All-wheel drive. Shrugs off rain, snow and grass.' } },
    { id: 'muscle', name: { ja: 'V8 マッスル', en: 'V8 Muscle' }, cls: 'B', price: 7000, body: 'muscle', paint: 3,
      stats: { spd: 8, acc: 6, grp: 3, arm: 8, nit: 4 },
      desc: { ja: '直線番長。カーブは苦手だが当たりに強い。', en: 'King of the straights. Heavy, tough, hates corners.' } },
    { id: 'gt', name: { ja: 'GT クーペ', en: 'GT Coupe' }, cls: 'A', price: 12000, body: 'gt', paint: 5,
      stats: { spd: 7, acc: 7, grp: 7, arm: 5, nit: 6 },
      desc: { ja: '速さと曲がりのバランスが良い本格派。', en: 'A proper grand tourer — fast and balanced.' } },
    { id: 'ae86', name: { ja: 'AE86 パンダ', en: 'AE86 Panda' }, cls: 'C', price: 3500, body: 'ae86', paint: 4,
      stats: { spd: 4, acc: 5, grp: 8, arm: 4, nit: 3 },
      desc: { ja: '白黒ツートンの古い FR ハッチ。非力だが峠では化ける。', en: 'An old two-tone FR hatch. Weak on paper, a monster on the pass.' } },
    { id: 's13', name: { ja: 'S13', en: 'S13' }, cls: 'B', price: 6000, body: 's13', paint: 7,
      stats: { spd: 6, acc: 6, grp: 7, arm: 5, nit: 4 },
      desc: { ja: 'ドリフトの定番 FR クーペ。', en: 'The classic FR drift coupe.' } },
    { id: 'fc', name: { ja: 'FC3S ロータリー', en: 'FC3S Rotary' }, cls: 'B', price: 7500, body: 'fc', paint: 4,
      stats: { spd: 6, acc: 6, grp: 8, arm: 5, nit: 5 },
      desc: { ja: '白いロータリー。理論派の走りに応える。', en: 'A white rotary for the theorist driver.' } },
    { id: 'gc8', name: { ja: 'GC8 4WD', en: 'GC8 AWD' }, cls: 'B', price: 8000, body: 'gc8', paint: 2, offroad: true,
      stats: { spd: 6, acc: 7, grp: 8, arm: 6, nit: 5 },
      desc: { ja: 'ボクサーターボの 4WD セダン。雨の峠で速い。', en: 'Boxer-turbo AWD saloon. Quick on wet passes.' } },
    { id: 'zn8', name: { ja: 'ZN8 ハチロク', en: 'ZN8 86' }, cls: 'B', price: 9000, body: 'zn8', paint: 4,
      stats: { spd: 6, acc: 6, grp: 9, arm: 5, nit: 5 },
      desc: { ja: '現代の軽量 FR。公道レースでスーパーカーを追い回せ。', en: 'A modern light FR. Chase supercars on public roads.' } },
    { id: 'evo', name: { ja: 'CT9A 4WD ターボ', en: 'CT9A AWD Turbo' }, cls: 'A', price: 11000, body: 'evo', paint: 1, offroad: true,
      stats: { spd: 7, acc: 8, grp: 8, arm: 6, nit: 5 },
      desc: { ja: '大きなウイングのラリー由来セダン。', en: 'A rally-bred saloon with a huge wing.' } },
    { id: 'fd', name: { ja: 'FD3S ロータリー', en: 'FD3S Rotary' }, cls: 'A', price: 13000, body: 'fd', paint: 3,
      stats: { spd: 8, acc: 7, grp: 8, arm: 4, nit: 6 },
      desc: { ja: '黄色い流線形のロータリー。峠の最速候補。', en: 'A curvy yellow rotary. A contender for king of the pass.' } },
    { id: 'r32', name: { ja: 'BNR32 GT', en: 'BNR32 GT' }, cls: 'A', price: 15000, body: 'r32', paint: 5, offroad: true,
      stats: { spd: 8, acc: 8, grp: 7, arm: 7, nit: 5 },
      desc: { ja: '丸 4 灯テールの 4WD 怪物。', en: 'The quad-round-taillight AWD monster.' } },
    { id: 'police', name: { ja: 'インターセプター', en: 'Interceptor' }, cls: 'A', price: 0, unlock: 'police', body: 'police', paint: 5,
      stats: { spd: 8, acc: 7, grp: 6, arm: 9, nit: 6 },
      desc: { ja: 'ガンマ署長から預かった覆面パトカー。体当たりに強い。', en: "Chief GAMMA's interceptor. Built for ramming." } },
    { id: 'taxi', name: { ja: 'タクシー', en: 'Taxi' }, cls: 'B', price: 0, unlock: 'taxi', body: 'taxi', paint: 3,
      stats: { spd: 6, acc: 5, grp: 6, arm: 7, nit: 4 },
      desc: { ja: 'アルバイトで借りられる営業車。一度働くとガレージにも並ぶ。', en: 'The cab from the taxi job. Work once and it joins your garage.' } },
    { id: 'super', name: { ja: 'スーパーカー Z', en: 'Supercar Z' }, cls: 'A', price: 18000, body: 'super', paint: 1,
      stats: { spd: 9, acc: 8, grp: 6, arm: 4, nit: 6 },
      desc: { ja: '低くて広い怪物。最高速はトップクラス。', en: 'Low, wide and ferocious. Top-tier top speed.' } },
    { id: 'kart', name: { ja: 'ゴーカート', en: 'Go-Kart' }, cls: 'C', price: 1800, body: 'kart', paint: 1, fun: true,
      stats: { spd: 3, acc: 8, grp: 10, arm: 1, nit: 4 }, desc: { ja: '地をはうように曲がる。ぶつかると痛い。', en: 'Corners like it is on rails. Hurts in a crash.' } },
    { id: 'keitra', name: { ja: '軽トラ', en: 'Kei Truck' }, cls: 'C', price: 1200, body: 'keitra', paint: 4, fun: true, offroad: true,
      stats: { spd: 2, acc: 4, grp: 6, arm: 6, nit: 3 }, desc: { ja: '農道のヒーロー。荷台つき。', en: 'Hero of the farm roads, with a flatbed.' } },
    { id: 'trike', name: { ja: 'オート三輪', en: 'Three-Wheeler' }, cls: 'C', price: 1500, body: 'trike', paint: 2, fun: true,
      stats: { spd: 2, acc: 4, grp: 3, arm: 4, nit: 3 }, desc: { ja: '昭和の街角から。カーブでふらつく。', en: 'A Showa-era three-wheeler. Wobbly in bends.' } },
    { id: 'tractor', name: { ja: 'トラクター', en: 'Tractor' }, cls: 'C', price: 1000, body: 'tractor', paint: 1, fun: true, offroad: true,
      stats: { spd: 1, acc: 3, grp: 6, arm: 10, nit: 2 }, desc: { ja: '遅い。とても遅い。でも絶対に壊れない。', en: 'Slow. Very slow. Practically indestructible.' } },
    { id: 'minivan', name: { ja: 'ミニバン', en: 'Minivan' }, cls: 'C', price: 2500, body: 'minivan', paint: 4,
      stats: { spd: 4, acc: 4, grp: 4, arm: 7, nit: 3 }, desc: { ja: '家族みんなで乗れる。背が高い。', en: 'Room for the whole family. Tall.' } },
    { id: 'camper', name: { ja: 'キャンピングカー', en: 'Camper' }, cls: 'C', price: 4500, body: 'camper', paint: 4, fun: true,
      stats: { spd: 3, acc: 3, grp: 3, arm: 9, nit: 3 }, desc: { ja: '走る別荘。急がない旅に。', en: 'A holiday home on wheels.' } },
    { id: 'buggy', name: { ja: 'バギー', en: 'Buggy' }, cls: 'B', price: 4000, body: 'buggy', paint: 3, fun: true, offroad: true,
      stats: { spd: 5, acc: 8, grp: 7, arm: 3, nit: 5 }, desc: { ja: '砂丘も芝生もお構いなし。', en: 'Dunes and grass? No problem.' } },
    { id: 'suv', name: { ja: 'SUV', en: 'SUV' }, cls: 'B', price: 5500, body: 'suv', paint: 5, offroad: true,
      stats: { spd: 5, acc: 5, grp: 5, arm: 8, nit: 4 }, desc: { ja: '背負ったスペアタイヤが目印。', en: 'Look for the spare wheel on the back.' } },
    { id: 'pickup', name: { ja: 'ピックアップ', en: 'Pickup' }, cls: 'B', price: 5000, body: 'pickup', paint: 1, offroad: true,
      stats: { spd: 5, acc: 6, grp: 5, arm: 8, nit: 4 }, desc: { ja: '大きな荷台のアメリカン。', en: 'A big American-style bed.' } },
    { id: 'ev', name: { ja: 'EV ハッチ', en: 'EV Hatch' }, cls: 'B', price: 6500, body: 'ev', paint: 9,
      stats: { spd: 5, acc: 10, grp: 6, arm: 5, nit: 5 }, desc: { ja: '静かで出だし最強の電気自動車。', en: 'Silent, with killer launch.' } },
    { id: 'limo', name: { ja: 'リムジン', en: 'Limousine' }, cls: 'B', price: 8000, body: 'limo', paint: 5, fun: true,
      stats: { spd: 6, acc: 4, grp: 3, arm: 8, nit: 4 }, desc: { ja: 'とにかく長い。VIP 気分で。', en: 'Very long. Very VIP.' } },
    { id: 'ambulance', name: { ja: '救急車', en: 'Ambulance' }, cls: 'B', price: 6000, body: 'ambulance', paint: 4, fun: true,
      stats: { spd: 5, acc: 5, grp: 4, arm: 8, nit: 5 }, desc: { ja: '赤色灯つき。道をあけてもらえ…ない。', en: 'Lights flashing. Nobody moves over, though.' } },
    { id: 'fire', name: { ja: '消防車', en: 'Fire Engine' }, cls: 'B', price: 7000, body: 'fire', paint: 1, fun: true,
      stats: { spd: 5, acc: 4, grp: 3, arm: 10, nit: 4 }, desc: { ja: 'はしご付きの赤い巨体。', en: 'A big red engine with a ladder.' } },
    { id: 'monster', name: { ja: 'モンスタートラック', en: 'Monster Truck' }, cls: 'A', price: 12000, body: 'monster', paint: 3, fun: true, offroad: true,
      stats: { spd: 6, acc: 7, grp: 4, arm: 10, nit: 5 }, desc: { ja: '巨大タイヤで何でも乗り越える。', en: 'Huge tyres. Drives over anything.' } },
    { id: 'classic', name: { ja: '2000GT 風クラシック', en: 'Classic 2000GT-style' }, cls: 'A', price: 14000, body: 'classic', paint: 4,
      stats: { spd: 7, acc: 6, grp: 7, arm: 5, nit: 5 }, desc: { ja: '伝説の国産 GT を思わせる美しいクラシック。', en: 'A beautiful classic evoking a legendary Japanese GT.' } },
    { id: 'rr', name: { ja: 'RR 911 風', en: 'RR 911-style' }, cls: 'S', price: 26000, body: 'rr', paint: 4,
      stats: { spd: 9, acc: 9, grp: 8, arm: 5, nit: 6 },
      desc: { ja: 'リアエンジンのドイツ製スポーツカー風。', en: 'A rear-engined German-style sports car.' } },
    { id: 'wedge', name: { ja: 'V12 ウェッジ', en: 'V12 Wedge' }, cls: 'S', price: 32000, body: 'wedge', paint: 3,
      stats: { spd: 10, acc: 9, grp: 7, arm: 4, nit: 6 },
      desc: { ja: '角ばったイタリアの V12 スーパーカー風。', en: 'An angular Italian V12 supercar style.' } },
    { id: 'formula', name: { ja: 'フォーミュラ TX', en: 'Formula TX' }, cls: 'S', price: 30000, body: 'formula', paint: 1,
      stats: { spd: 9, acc: 9, grp: 9, arm: 2, nit: 7 },
      desc: { ja: '剥き出しのタイヤの競技車。ぶつかると脆い。', en: 'An open-wheel racer. Fragile in contact.' } },
    { id: 'proto', name: { ja: 'プロトタイプ ZERO', en: 'Prototype ZERO' }, cls: 'S', price: 0, unlock: 'proto', body: 'proto', paint: 4,
      stats: { spd: 10, acc: 9, grp: 8, arm: 6, nit: 9 },
      desc: { ja: 'ZERO から託された究極の車。物語を終えると手に入る。', en: "ZERO's ultimate machine. Earned by finishing the story." } }
  ];
  R.car = function (id) { return R.CARS.filter(function (c) { return c.id === id; })[0] || R.CARS[0]; };

  R.UPGRADES = [
    { id: 'engine', name: { ja: 'エンジン', en: 'Engine' }, what: { ja: '最高速と加速', en: 'top speed & acceleration' } },
    { id: 'tyres', name: { ja: 'タイヤ', en: 'Tyres' }, what: { ja: 'グリップ', en: 'grip' } },
    { id: 'nitro', name: { ja: 'ニトロ', en: 'Nitro' }, what: { ja: '量・回復・加速', en: 'capacity, refill and punch' } },
    { id: 'body', name: { ja: '車体', en: 'Body' }, what: { ja: 'ぶつかったときの傷みを減らす', en: 'less damage in contact' } }
  ];
  var CLASS_COST = { C: 400, B: 800, A: 1400, S: 2400 };
  R.upgCost = function (car, lv) { return Math.round(CLASS_COST[car.cls] * [1, 2, 3.5][lv]); };

  /** 改造を足した実際の性能（1〜12 くらい） */
  R.effStats = function (car, upg) {
    upg = upg || {};
    var s = car.stats;
    return {
      spd: s.spd + (upg.engine || 0) * 0.45, acc: s.acc + (upg.engine || 0) * 0.45,
      grp: s.grp + (upg.tyres || 0) * 0.6, arm: s.arm + (upg.body || 0) * 0.8, nit: s.nit + (upg.nitro || 0) * 0.7
    };
  };

  /* =====================================================================
     ドライバー（敵）
     ai: balanced / aggressive（体当たり）/ blocker（進路をふさぐ）/ speedster（直線が速い）
         technician（カーブが速い）/ nitro（ニトロ多用）
     ability（ボスだけ）: oil（オイルをまく）/ ram / burst（長いニトロ）/ block / all
     ===================================================================== */

  R.DRIVERS = [
    { name: 'ASTRA', color: '#e06c75', body: 'sedan', ai: 'balanced' },
    { name: 'BOLT', color: '#ffd93d', body: 'hatch', ai: 'nitro' },
    { name: 'CIRRUS', color: '#56a8f5', body: 'gt', ai: 'technician' },
    { name: 'DYNA', color: '#a78bfa', body: 'muscle', ai: 'speedster' },
    { name: 'EDGE', color: '#ff9f43', body: 'rally', ai: 'aggressive' },
    { name: 'FLUX', color: '#4dd0e1', body: 'super', ai: 'blocker' },
    { name: 'GALE', color: '#ff5fd2', body: 'kei', ai: 'balanced' },
    { name: 'HEX', color: '#9ccc65', body: 'sedan', ai: 'technician' },
    { name: 'ION', color: '#f06292', body: 'gt', ai: 'nitro' },
    { name: 'JOLT', color: '#ffb300', body: 'muscle', ai: 'aggressive' },
    { name: 'KILO', color: '#90a4ae', body: 'hatch', ai: 'blocker' },
    { name: 'LYNX', color: '#26c6da', body: 'super', ai: 'speedster' },
    { name: 'MONO', color: '#eeeeee', body: 'formula', ai: 'technician' },
    { name: 'NOVA', color: '#ff7043', body: 'proto', ai: 'nitro' }
  ];
  // 峠の走り屋（峠マンガ風のモチーフ）
  R.TOUGE_DRIVERS = [
    { name: 'KAZE', color: '#f5f5f5', body: 'fc', ai: 'technician' },
    { name: 'HAYATE', color: '#ffd200', body: 'fd', ai: 'speedster' },
    { name: 'GUNJI', color: '#3a3f47', body: 'r32', ai: 'aggressive' },
    { name: 'SHIMA', color: '#8e7cc3', body: 's13', ai: 'blocker' },
    { name: 'IROHA', color: '#c62828', body: 'evo', ai: 'nitro' },
    { name: 'MORI', color: '#1e56a0', body: 'gc8', ai: 'technician' }
  ];
  // 公道レースのスーパーカー軍団（公道レースマンガ風のモチーフ）
  R.SUPERCARS = [
    { name: 'PORTER', color: '#e0e0e0', body: 'rr', ai: 'technician' },
    { name: 'LAMBDA', color: '#9ccc65', body: 'wedge', ai: 'speedster' },
    { name: 'MCL', color: '#ff8f00', body: 'super', ai: 'nitro' },
    { name: 'ROSSO', color: '#d50000', body: 'super', ai: 'aggressive' },
    { name: 'GT-R', color: '#546e7a', body: 'r32', ai: 'balanced' },
    { name: 'VETTA', color: '#1565c0', body: 'rr', ai: 'blocker' }
  ];
  // 港のギャング（SUDO の手下）
  R.GANG = [
    { name: 'CHMOD', color: '#b71c1c', body: 'muscle', ai: 'aggressive' },
    { name: 'CHOWN', color: '#c62828', body: 'sedan', ai: 'blocker' },
    { name: 'KILL-9', color: '#d32f2f', body: 'rally', ai: 'aggressive' },
    { name: 'FORK', color: '#e53935', body: 'hatch', ai: 'nitro' },
    { name: 'GREP', color: '#8e2424', body: 'muscle', ai: 'aggressive' }
  ];
  R.BOSSES = {
    ray: { name: 'RAY', color: '#4f8ff7', body: 'gt', ai: 'technician', skill: 0.95, boss: true, ability: 'block' },
    daemon: { name: 'DAEMON', color: '#7e57c2', body: 'rally', ai: 'blocker', skill: 1, boss: true, ability: 'block' },
    phantom: { name: 'PHANTOM', color: '#37474f', body: 'super', ai: 'speedster', skill: 0.9, boss: true, ability: 'burst', target: true },
    sudo: { name: 'SUDO', color: '#ef5350', body: 'muscle', ai: 'aggressive', skill: 0.9, boss: true, ability: 'ram' },
    root: { name: 'ROOT', color: '#ffca28', body: 'super', ai: 'speedster', skill: 1, boss: true, ability: 'burst' },
    kernel: { name: 'KERNEL', color: '#8d6e63', body: 'proto', ai: 'technician', skill: 1, boss: true, ability: 'oil' },
    zero: { name: 'ZERO', color: '#f5f5f5', body: 'proto', ai: 'balanced', skill: 1, boss: true, ability: 'all' },
    kaze: { name: 'KAZE', color: '#f5f5f5', body: 'fc', ai: 'technician', skill: 1, boss: true, ability: 'block' },
    hayate: { name: 'HAYATE', color: '#ffd200', body: 'fd', ai: 'speedster', skill: 1, boss: true, ability: 'burst' },
    gen: { name: 'GEN', color: '#f2f2f2', body: 'ae86', ai: 'technician', skill: 1, boss: true, ability: 'block' }
  };
  R.TRAFFIC = [
    { body: 'sedan', color: '#9e9e9e' }, { body: 'kei', color: '#c5e1a5' }, { body: 'van', color: '#eceff1' },
    { body: 'truck', color: '#8d6e63' }, { body: 'bus', color: '#ffb74d' }, { body: 'sedan', color: '#90caf9' },
    { body: 'van', color: '#b0bec5' }, { body: 'keitra', color: '#f5f5f5' }, { body: 'minivan', color: '#cfd8dc' },
    { body: 'suv', color: '#5d6d7e' }, { body: 'pickup', color: '#8d6e63' }, { body: 'hatch', color: '#ef9a9a' }, { body: 'truck', color: '#4db6ac' }
  ];

  /** 走る相手を n 人選ぶ（pace は 最高速の倍率） */
  R.makeField = function (n, pace, pool) {
    return shuffle(pool || R.DRIVERS).slice(0, n).map(function (d, i) {
      return { name: d.name, color: d.color, body: d.body, ai: d.ai, skill: 0.55 + Math.random() * 0.4,
               pace: pace * (0.94 + (i / Math.max(1, n)) * 0.08) };
    });
  };
  R.boss = function (id, pace) {
    var b = R.BOSSES[id], o = {};
    for (var k in b) o[k] = b[k];
    o.pace = pace; o.id = id;
    return o;
  };

  /** 車の最高速の倍率（ライバルの速さをこれに合わせるときに使う） */
  R.topOf = function (stats) { return 0.7 + stats.spd * 0.035; };

  R.LEVELS = { easy: 0.93, normal: 1, hard: 1.06 };
  R.LEVEL_NAMES = { easy: { ja: 'かんたん', en: 'Easy' }, normal: { ja: 'ふつう', en: 'Normal' }, hard: { ja: 'むずかしい', en: 'Hard' } };

  /* =====================================================================
     グランプリ（カップ戦）
     ===================================================================== */

  R.CUPS = [
    { id: 'rookie', name: { ja: 'ルーキーカップ', en: 'Rookie Cup' }, tracks: ['coast', 'forest', 'desert', 'ridge'], pace: 0.84, laps: 2,
      bonus: [1500, 900, 500], color: '#cd7f32' },
    { id: 'pro', name: { ja: 'プロカップ', en: 'Pro Cup' }, tracks: ['city', 'harbor', 'snow', 'highway'], pace: 0.92, laps: 2,
      bonus: [3000, 1800, 1000], need: 'rookie', color: '#c0c0c0' },
    { id: 'legend', name: { ja: 'レジェンドカップ', en: 'Legend Cup' }, tracks: ['canyon', 'circuit', 'volcano', 'neon'], pace: 1.0, laps: 2,
      bonus: [6000, 3500, 2000], need: 'pro', color: '#ffd700' },
    { id: 'tokai', name: { ja: '東海カップ', en: 'Tokai Cup' }, tracks: ['hamamatsu', 'hamanako', 'tomei', 'nagoya'], pace: 0.9, laps: 2,
      bonus: [4000, 2400, 1300], need: 'rookie', color: '#4dd0e1' },
    { id: 'touge', name: { ja: '峠キング決定戦', en: 'King of the Pass' }, tracks: ['iroha', 'akimine', 'usui', 'ashinoko'], pace: 0.93, laps: 1,
      bonus: [5000, 3000, 1600], need: 'rookie', color: '#ff7043', pool: 'touge' },
    { id: 'mfr', name: { ja: '公道 GP 箱根シリーズ', en: 'Public Road GP Hakone' }, tracks: ['ashinoko', 'hakone', 'akimine', 'hakone'], pace: 0.98, laps: 1,
      bonus: [9000, 5000, 2800], need: 'touge', color: '#90caf9', pool: 'super' },
    { id: 'gt', name: { ja: 'GT サーキットシリーズ', en: 'GT Circuit Series' }, tracks: ['fujisp', 'isetec', 'circuit', 'fujisp'], pace: 1.0, laps: 3,
      bonus: [8000, 4500, 2500], need: 'pro', color: '#e53935' },
    { id: 'masters', name: { ja: 'マスターズ', en: 'Masters' }, tracks: ['ridge', 'snow', 'city', 'canyon', 'volcano', 'neon'], pace: 1.05, laps: 2,
      bonus: [12000, 7000, 4000], need: 'legend', color: '#b388ff' }
  ];
  R.POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
  R.PRIZE = [1000, 700, 500, 350, 250, 180, 120, 80];

  /* =====================================================================
     ゲームモード
     ===================================================================== */

  R.MODES = {
    race: { name: { ja: 'レース', en: 'Race' } },
    touge: { name: { ja: '峠バトル', en: 'Touge Battle' },
             desc: { ja: '峠の 1 対 1。後追いで始まり、先にゴールするか 150m 引き離せば勝ち。ガードレールに注意。', en: 'One-on-one on a mountain pass. Start behind; finish first or pull 150m clear to win.' } },
    time: { name: { ja: 'タイムアタック', en: 'Time Attack' },
            desc: { ja: 'ひとりで走り、自己ベストの「ゴースト」と競う。', en: 'Race alone against the ghost of your best lap.' } },
    elim: { name: { ja: 'エリミネーション', en: 'Elimination' },
            desc: { ja: '周回ごとに最下位が脱落。最後の 1 台になれ。', en: 'Last place is knocked out every lap. Be the last one standing.' } },
    duel: { name: { ja: 'デュエル', en: 'Duel' },
            desc: { ja: 'ボスと 1 対 1。倒したボスと何度でも走れる。', en: 'One-on-one against a boss you have beaten.' } },
    arcade: { name: { ja: 'アーケード', en: 'Arcade' },
              desc: { ja: '制限時間内に 3 周。チェックポイントで時間が延びる。一般車あり。', en: 'Three laps before time runs out. Checkpoints add time. Traffic on the road.' } },
    chase: { name: { ja: 'ポリスチェイス', en: 'Police Chase' },
             desc: { ja: '覆面パトカーで逃走車を追い、体当たりで止める。', en: 'Drive the interceptor and ram the getaway car to a stop.' } },
    traffic: { name: { ja: 'ハイウェイ・サバイバル', en: 'Highway Survival' },
               desc: { ja: '一般車の間をすり抜けて点数を稼ぐ。壊れたら終わり。', en: 'Weave through traffic for points. It ends when your car is wrecked.' } }
  };

  /* =====================================================================
     登場人物（顔は race-engine.js の drawPortrait が描く）
     ===================================================================== */

  R.CHARS = {
    mina: { name: { ja: 'ミナ', en: 'MINA' }, color: '#ff9f43',
            face: { skin: '#f3c9a8', hair: '#ff8a3d', style: 'bob', eyes: '#3b2a20', acc: 'goggles', shirt: '#3d5a80', bg: '#2b3a55' } },
    bit: { name: { ja: 'DJ ビット', en: 'DJ BIT' }, color: '#b388ff',
           face: { skin: '#d9a47e', hair: '#9c27b0', style: 'spiky', eyes: '#1b1b1b', acc: 'headset', shirt: '#222', bg: '#3a1f4d' } },
    ray: { name: { ja: 'レイ', en: 'RAY' }, color: '#4f8ff7',
           face: { skin: '#f1d0b5', hair: '#2f5fbf', style: 'swept', eyes: '#16325c', acc: 'visor', shirt: '#1d2b44', bg: '#18263d' } },
    daemon: { name: { ja: 'デーモン', en: 'DAEMON' }, color: '#9575cd',
              face: { skin: '#c89b7b', hair: '#1a1a1a', style: 'long', eyes: '#5b1a1a', acc: 'scar', shirt: '#3b2b52', bg: '#221833' } },
    gamma: { name: { ja: 'ガンマ署長', en: 'Chief GAMMA' }, color: '#64b5f6',
             face: { skin: '#e0b48f', hair: '#9e9e9e', style: 'cap', eyes: '#222', acc: 'mustache', shirt: '#1a2f5a', bg: '#132340' } },
    phantom: { name: { ja: 'ファントム', en: 'PHANTOM' }, color: '#90a4ae',
               face: { skin: '#cfcfcf', hair: '#263238', style: 'hood', eyes: '#ff5252', acc: 'mask', shirt: '#263238', bg: '#101820' } },
    sudo: { name: { ja: 'スドー', en: 'SUDO' }, color: '#ef5350',
            face: { skin: '#e5b999', hair: '#d32f2f', style: 'spiky', eyes: '#222', acc: 'glasses', shirt: '#4a1414', bg: '#3a0f0f' } },
    root: { name: { ja: 'ルート', en: 'ROOT' }, color: '#ffca28',
            face: { skin: '#f0c8a0', hair: '#ffcc33', style: 'swept', eyes: '#222', acc: 'shades', shirt: '#5a4400', bg: '#3d2f00' } },
    kernel: { name: { ja: 'カーネル', en: 'KERNEL' }, color: '#bcaaa4',
              face: { skin: '#dcb593', hair: '#dcb593', style: 'bald', eyes: '#4e342e', acc: 'monocle', shirt: '#3e2723', bg: '#2a1c18' } },
    gen: { name: { ja: 'ゲンさん', en: 'GEN' }, color: '#e0e0e0',
           face: { skin: '#d9a57e', hair: '#bdbdbd', style: 'short', eyes: '#222', acc: 'cig', shirt: '#6d4c41', bg: '#1f1a14' } },
    zero: { name: { ja: 'ゼロ', en: 'ZERO' }, color: '#eceff1',
            face: { skin: '#f5e1d0', hair: '#f5f5f5', style: 'long', eyes: '#00e5ff', acc: 'none', shirt: '#eceff1', bg: '#0d0d1a' } }
  };

  /* =====================================================================
     ストーリー（15 戦）
     scene: 始まる前の会話 / post: 勝ったあとの会話
     goal: place（n 位以内）/ win / lap（1 周の目標タイム。factor は基準速度の割合）
           survive（エリミネーション）/ arcade / catch / score
     ===================================================================== */

  function line(who, j, e) { return { who: who, text: { ja: j, en: e } }; }

  R.CHAPTERS = [
    { id: 'p', name: { ja: '序章　起動', en: 'Prologue: Boot' } },
    { id: '1', name: { ja: '第 1 章　海岸線の噂', en: 'Chapter 1: Coastal Rumors' } },
    { id: '2', name: { ja: '第 2 章　峠の主', en: 'Chapter 2: Master of the Pass' } },
    { id: '3', name: { ja: '第 3 章　夜の街とサイレン', en: 'Chapter 3: Sirens in the Night' } },
    { id: '4', name: { ja: '第 4 章　白と赤の試練', en: 'Chapter 4: Trials of Snow and Fire' } },
    { id: '5', name: { ja: '最終章　ZERO', en: 'Final Chapter: ZERO' } },
    { id: 'x', name: { ja: '番外編　峠の走り屋たち', en: 'Extra: Legends of the Pass' } }
  ];

  R.STORY = [
    { id: 'p1', ch: 'p', title: { ja: '予選ヒート', en: 'Qualifying Heat' },
      track: 'coast', mode: 'race', laps: 2, rivals: 5, pace: 0.77, goal: { type: 'place', n: 3 }, reward: 800,
      scene: [
        line('mina', '起きた？ 倉庫で眠ってたポッド、なんとか走るようにしといたよ。', "Awake? I got that old Pod from the garage running again."),
        line('mina', '今夜、海岸線で TUI リーグの予選がある。3 位までに入れば本戦に出られる。', 'The TUI League qualifiers are on the coast tonight. Top three gets you in.'),
        line('bit', 'さあ始まるぞ、TUI リーグ予選！ 実況はおなじみ DJ ビットだ！', "It's qualifier night in the TUI League! DJ BIT on the mic!"),
        line('mina', '↑ でアクセル、←→ でハンドル、スペースでニトロ。前の車の真後ろにつくと速くなるよ。', '↑ to accelerate, ←→ to steer, space for nitro. Tuck in behind a car to draft.'),
        line('mina', '無理しないで。まずはゴールまで。…でも、できれば表彰台ね。', "Don't push too hard. Just finish. ...Well, a podium would be nice.")
      ],
      post: [line('bit', '新顔が予選突破！ 名前は…まだ誰も知らない！', 'A new face makes it through! Nobody knows the name... yet!')] },

    { id: '1a', ch: '1', title: { ja: '雨の本戦デビュー', en: 'Debut in the Rain' },
      track: 'forest', mode: 'race', laps: 2, rivals: 7, pace: 0.84, goal: { type: 'place', n: 3 }, reward: 1200,
      scene: [
        line('mina', '本戦の初戦は雨の森林道。路面が滑るから、カーブの手前でしっかり減速して。', "First round is the rainy forest road. It's slick — brake before the corners."),
        line('ray', '予選を抜けたっていうのはお前か。ポッドで？ 冗談だろ。', "You're the one who got through qualifying? In a Pod? You're joking."),
        line('ray', '俺はレイ。上に行きたいなら、俺のテールランプを見慣れておくんだな。', "Name's RAY. If you want to climb, get used to my tail lights.")
      ] },

    { id: '1b', ch: '1', title: { ja: 'レイとの一騎打ち', en: 'Duel with RAY' }, boss: 'ray',
      track: 'coast', mode: 'duel', laps: 3, pace: 0.86, goal: { type: 'win' }, reward: 2000,
      scene: [
        line('bit', 'なんとレイが新人に一騎打ちを申し込んだ！ 海岸線、3 周勝負だ！', 'RAY has challenged the rookie to a duel! Three laps on the coast!'),
        line('ray', 'スリップストリームは使わせない。…ついてこられればの話だが。', "I won't let you draft me. If you can even keep up."),
        line('mina', 'レイの真後ろにつけて、直線でニトロ。それが一番。', 'Stick right behind him, then nitro on the straight. That is the play.')
      ],
      post: [
        line('ray', '…やるな。次は負けない。', '...Not bad. Next time, you won\'t be so lucky.'),
        line('mina', 'レイに勝った！ 賞金で車を強くしよう。ガレージを見てみて。', 'You beat RAY! Let\'s spend the prize money in the garage.')
      ] },

    { id: '2a', ch: '2', title: { ja: '峠の基準タイム', en: 'The Qualifying Time' },
      track: 'ridge', mode: 'time', laps: 3, goal: { type: 'lap', factor: 0.66 }, reward: 1200,
      scene: [
        line('mina', '次は山岳路。あそこには「峠の主」デーモンがいる。', "Next is Ridge Pass. That's DAEMON's territory — the Master of the Pass."),
        line('mina', '基準タイムを切らないと、相手にもしてもらえないんだって。', "He won't even look at you unless you beat the qualifying time."),
        line('mina', '3 周のうち、どれか 1 周でいい。自分の幽霊（ゴースト）とも競えるよ。', 'Any one of three laps will do. Your own ghost will race you, too.')
      ] },

    { id: '2b', ch: '2', title: { ja: '砂漠のサバイバル', en: 'Desert Survival' },
      track: 'desert', mode: 'elim', rivals: 5, pace: 0.88, goal: { type: 'survive' }, reward: 1600,
      scene: [
        line('bit', '砂漠ハイウェイでサバイバル戦！ 各周回の最下位は即脱落だ！', 'Survival on the Desert Highway! Last place each lap is out!'),
        line('mina', '周回の終わりにビリだったらおしまい。最後まで気を抜かないで。', "If you're last when a lap ends, you're out. Stay sharp to the end.")
      ] },

    { id: '2c', ch: '2', title: { ja: 'ボス: 峠の主デーモン', en: 'BOSS: DAEMON' }, boss: 'daemon',
      track: 'ridge', mode: 'duel', laps: 3, pace: 0.9, goal: { type: 'win' }, reward: 3000,
      scene: [
        line('daemon', '……峠は、速さだけでは抜けん。', "...Speed alone won't get you through the pass."),
        line('daemon', 'わしの前に出られたら、主の名はくれてやろう。', 'Get in front of me, and the title is yours.'),
        line('mina', '気をつけて。あの人、抜かせないように道をふさいでくる！', 'Careful. He blocks every line you try!')
      ],
      post: [line('daemon', '……見事。若いの、夜の街へ行け。お前を待つ者がいる。', '...Well driven. Go to the city, youngster. Someone is waiting for you.')] },

    { id: '3a', ch: '3', title: { ja: '署長の腕試し', en: "The Chief's Test" },
      track: 'city', mode: 'arcade', laps: 3, traffic: 16, goal: { type: 'arcade' }, reward: 1500,
      scene: [
        line('gamma', '君が噂の新人か。私はガンマ署長。力を貸してほしい。', "So you're the rookie everyone talks about. I'm Chief GAMMA. I need your help."),
        line('gamma', 'まずは腕試しだ。制限時間内に夜の都市を 3 周。チェックポイントで時間が延びる。', 'A test first: three laps of Night City before time runs out. Checkpoints add time.'),
        line('mina', '一般車も走ってる。ぶつかると大きく減速するから気をつけて。', 'There is traffic too. Hitting it costs a lot of speed.')
      ] },

    { id: '3b', ch: '3', title: { ja: '追跡: ファントム', en: 'Pursuit: PHANTOM' }, boss: 'phantom',
      track: 'highway', mode: 'chase', pace: 0.88, traffic: 9, car: 'police', goal: { type: 'catch' }, reward: 2500, unlock: 'police',
      scene: [
        line('gamma', '密輸車「ファントム」が湾岸高速を逃走中だ。この覆面パトカーを使え。', 'The smuggler PHANTOM is running on the Bayside Highway. Take this interceptor.'),
        line('gamma', '体当たりで止めろ。一般車に気をつけてな！', 'Ram him until he stops. Mind the civilians!'),
        line('phantom', 'サツの犬か。追いつけるもんならな！', 'A police dog, huh? Catch me if you can!')
      ],
      post: [
        line('gamma', '見事だ！ その車は君に預けよう。ガレージで選べるぞ。', 'Outstanding! Keep the car — you can pick it in the garage.'),
        line('phantom', 'くっ…俺はただの運び屋だ。荷の送り主は…「ZERO-DAY」…', "Ugh... I'm just a courier. The one who sent the cargo is... ZERO-DAY...")
      ] },

    { id: '3c', ch: '3', title: { ja: 'ボス: 港のスドー', en: 'BOSS: SUDO of the Docks' }, boss: 'sudo',
      track: 'harbor', mode: 'race', laps: 2, rivals: 4, pool: 'gang', pace: 0.92, goal: { type: 'win' }, reward: 3000,
      scene: [
        line('sudo', 'ファントムを捕まえたのはお前か。港は俺たち ZERO-DAY の縄張りだ。', 'So you caught PHANTOM. The harbor is ZERO-DAY turf.'),
        line('sudo', '霧の中で潰してやる。遠慮なくぶつけさせてもらうぜ！', "I'll crush you in the fog. And I don't mind trading paint!"),
        line('mina', '赤い車は全部スドーの手下。囲まれないように！', "Every red car is one of SUDO's gang. Don't get boxed in!")
      ],
      post: [line('sudo', 'ちっ…カーネルの旦那に報告しねえと。', "Tch... I'd better report to KERNEL.")] },

    { id: '4a', ch: '4', title: { ja: '雪山の解析', en: 'Analysis on the Summit' },
      track: 'snow', mode: 'race', laps: 2, rivals: 7, pace: 0.93, goal: { type: 'place', n: 3 }, reward: 2200,
      scene: [
        line('kernel', '初めまして。ZERO-DAY の参謀、カーネルです。', 'A pleasure. I am KERNEL, strategist of ZERO-DAY.'),
        line('kernel', 'あなたの走行データは解析済み。雪山で限界を見せていただきましょう。', "I've analysed your driving data. Show me your limits on the summit."),
        line('mina', '雪はとにかく滑る。アクセルを抜く勇気もテクニックだよ。', 'Snow is slippery. Knowing when to lift is a skill too.')
      ] },

    { id: '4b', ch: '4', title: { ja: '真夜中のすり抜け', en: 'Midnight Weave' },
      track: 'highway', mode: 'traffic', traffic: 22, goal: { type: 'score', n: 9000 }, reward: 2000,
      scene: [
        line('bit', '特別企画！ 真夜中の湾岸高速で、一般車の間をすり抜けろ！', 'Special event! Weave through midnight traffic on the Bayside Highway!'),
        line('mina', '一般車のすぐ横を抜けるとニアミス点。続けるほど倍率が上がる。', 'Pass close for near-miss points. Chain them for a multiplier.'),
        line('mina', 'ぶつかりすぎると車が壊れておしまい。9000 点が目標！', 'Crash too often and the car is done. Aim for 9,000 points!')
      ] },

    { id: '4c', ch: '4', title: { ja: 'ボス: 最速の男ルート', en: 'BOSS: ROOT' }, boss: 'root',
      track: 'canyon', mode: 'duel', laps: 3, pace: 0.96, goal: { type: 'win' }, reward: 3500,
      scene: [
        line('root', '俺はルート。この国で一番速い男だ。', "I'm ROOT. The fastest man in the country."),
        line('root', '直線で俺の前にいられた奴はいない。本物の加速ってやつを見せてやるよ。', "Nobody stays ahead of me on a straight. I'll show you real acceleration."),
        line('mina', 'ルートは直線で長いニトロを使う。カーブで差をつけて！', 'ROOT fires a long nitro on straights. Win it in the corners!')
      ],
      post: [line('root', '…速さの意味が、少しわかった気がするぜ。', '...Guess I learned what speed really means.')] },

    { id: '4d', ch: '4', title: { ja: 'ボス: 参謀カーネル', en: 'BOSS: KERNEL' }, boss: 'kernel',
      track: 'volcano', mode: 'race', laps: 2, rivals: 4, pace: 0.97, goal: { type: 'win' }, reward: 4000,
      scene: [
        line('kernel', '計算外です。ですが、火山ルートでは私の計算が上回る。', 'An anomaly. But on the Volcano Route, my calculations prevail.'),
        line('mina', 'あいつ、後ろにオイルをまいてくる！ 黒いしみはよけて！', 'He drops oil behind him! Dodge the black slicks!')
      ],
      post: [line('kernel', '…ZERO 様。予測を超える者が現れました。', '...Lord ZERO. Someone has exceeded the prediction.')] },

    { id: '5a', ch: '5', title: { ja: '最終戦 TUI サーキット', en: 'Finale at the TUI Circuit' }, boss: 'ray',
      track: 'circuit', mode: 'race', laps: 3, rivals: 6, pace: 0.99, goal: { type: 'win' }, reward: 5000,
      scene: [
        line('bit', 'ついに TUI リーグ最終戦！ TUI サーキットで頂点が決まるぞ！', 'The TUI League finale! The title is decided at the TUI Circuit!'),
        line('ray', 'ここまで来たか。…最後に俺と走れ。手加減はしない。', 'So you made it. Race me one last time. No holding back.'),
        line('mina', 'みんな本気だよ。スタートで前に出て、そのまま逃げ切ろう！', 'Everyone is flat out. Get ahead at the start and stay there!')
      ],
      post: [
        line('ray', '完敗だ。…行けよ、ZERO が待ってる。', 'I lost fair and square. Go — ZERO is waiting.')
      ] },

    { id: '5b', ch: '5', title: { ja: '最終決戦: ZERO', en: 'FINAL: ZERO' }, boss: 'zero',
      track: 'neon', mode: 'duel', laps: 3, pace: 1.02, goal: { type: 'win' }, reward: 10000, unlock: 'proto',
      scene: [
        line('zero', 'よく来た。私は ZERO。このリーグを最初に起動した者だ。', 'Welcome. I am ZERO — the one who booted this league.'),
        line('zero', '速さとは、止まらないプロセスだ。君はそれを証明できるか。', 'Speed is a process that never halts. Can you prove you are one?'),
        line('mina', 'ここまで一緒に来たんだ。最後まで全開で！', 'We came this far together. Full throttle, all the way!')
      ],
      post: [
        line('zero', '……見事だ。新しいプロセスの起動を、確かに見届けた。', '...Magnificent. I have witnessed a new process boot.'),
        line('zero', 'この車を持っていけ。頂点に立つ者の車だ。', 'Take my car. It belongs to the one at the top.'),
        line('bit', '新チャンピオン誕生！！ TUI リーグの新しい時代の始まりだ！', 'A new champion is born! A new era of the TUI League begins!'),
        line('mina', 'おつかれさま。…次は、どこを走る？', 'Good work. ...So, where do we drive next?')
      ] }
  ];
  R.STORY.push(
    { id: 'x1', ch: 'x', title: { ja: '白いロータリー', en: 'The White Rotary' }, boss: 'kaze',
      track: 'akimine', mode: 'touge', pace: 0.94, goal: { type: 'win' }, reward: 4000,
      scene: [
        line('gen', '…ほう、ZERO に勝った若いのか。峠は、サーキットとは別物だぞ。', "...So you're the kid who beat ZERO. A mountain pass is a different animal."),
        line('gen', 'わしはゲン。昔ここを走っとった。ガードレールの向こうは崖だ。忘れるな。', "I'm GEN. I used to run this road. Past the guardrail is a cliff. Don't forget it."),
        line('mina', '峠バトルは後追いスタート。先にゴールするか、150m 引き離せば勝ちだよ。', 'Touge battles start from behind. Finish first or pull 150m clear to win.'),
        line('mina', '相手は白い FC の KAZE。コーナーの理論が完璧なんだって。', 'Your rival is KAZE in the white FC. They say his cornering is textbook.')
      ],
      post: [line('gen', '悪くない。…次は夕方の臼井に行け。黄色いのが待っとる。', 'Not bad. Next, head to Usui at dusk. The yellow one is waiting.')] },
    { id: 'x2', ch: 'x', title: { ja: '夕暮れの黄色い閃光', en: 'Yellow Flash at Dusk' }, boss: 'hayate',
      track: 'usui', mode: 'touge', pace: 0.97, goal: { type: 'win' }, reward: 5000,
      scene: [
        line('mina', 'HAYATE の FD は立ち上がりが速い。コーナーの出口で離されないで！', "HAYATE's FD is brutal on corner exit. Don't let him break away!"),
        line('gen', '臼井はコーナーの数で勝負が決まる。一つ一つ、丁寧にな。', 'Usui is won corner by corner. Take each one carefully.')
      ],
      post: [line('gen', 'さて…最後は箱根だ。公道でスーパーカーどもと走ってこい。', 'Now... last is Hakone. Go race the supercars on public roads.')] },
    { id: 'x3', ch: 'x', title: { ja: '公道のスーパーカー', en: 'Supercars on Public Roads' },
      track: 'hakone', mode: 'race', laps: 1, rivals: 5, pool: 'super', pace: 0.97, goal: { type: 'place', n: 3 }, reward: 6000,
      scene: [
        line('bit', '箱根の公道レース！ 並み居るスーパーカーに、小さな FR が挑む！', 'Public-road racing in Hakone! A little FR takes on the supercars!'),
        line('mina', '直線では勝てない。下りのコーナーで詰めて！ おすすめは ZN8 か AE86。', "You can't win on the straights. Close in on the downhill corners! Try the ZN8 or AE86.")
      ],
      post: [line('gen', '…ふっ。わしの若い頃そっくりだ。これで番外編もおしまいだな。', "...Heh. Just like me when I was young. That's the end of the extras.")] }
  );
  R.storyEvent = function (id) { return R.STORY.filter(function (e) { return e.id === id; })[0]; };

  /* =====================================================================
     オープンワールド（浜松市〜東名・新東名〜名古屋市）
     地点（node）を道（road）でつなぐ。道の終わりの分岐で、車線の位置で行き先を選ぶ。
     ===================================================================== */

  /*
   * 地点。x・y はおおよその km（東が +x、南が +y、浜松駅が原点）。
   * 実際の位置関係に合わせているが、道の長さはゲーム用に縮めている。
   * kind: signal（信号のある交差点）/ ic（インターチェンジ）/ jct / town（信号のない分岐）
   */
  R.NODES = {
    hm_eki: { name: { ja: '浜松駅', en: 'Hamamatsu Sta.' }, x: 0, y: 0, kind: 'signal', mark: 'acttower', area: 'hm' },
    hm_kaji: { name: { ja: '鍛冶町（中心街）', en: 'Kajimachi' }, x: -0.3, y: -0.9, kind: 'signal', mark: 'piano', area: 'hm' },
    hm_castle: { name: { ja: '浜松城', en: 'Hamamatsu Castle' }, x: -1.2, y: -1.4, kind: 'signal', mark: 'castle', area: 'hm' },
    hm_takatsuka: { name: { ja: '高塚', en: 'Takatsuka' }, x: -5, y: 1.5, kind: 'signal', mark: 'factory', area: 'hm' },
    hm_sanaru: { name: { ja: '佐鳴湖', en: 'Lake Sanaru' }, x: -4.5, y: -1.2, kind: 'signal', mark: 'bush', area: 'hm' },
    hm_dune: { name: { ja: '中田島砂丘', en: 'Nakatajima Dunes' }, x: 0.5, y: 4.5, kind: 'town', mark: 'kite', area: 'hm' },
    hm_shinohara: { name: { ja: '篠原（国道 1 号）', en: 'Shinohara (Rt.1)' }, x: -8, y: 3, kind: 'signal', mark: 'gyoza', area: 'hm' },
    hm_maisaka: { name: { ja: '舞阪', en: 'Maisaka' }, x: -12.5, y: 2, kind: 'signal', mark: 'pine', area: 'hm' },
    hm_benten: { name: { ja: '弁天島', en: 'Bentenjima' }, x: -14.5, y: 2, kind: 'town', mark: 'bigtorii', area: 'hm' },
    hm_arai: { name: { ja: '新居（湖西）', en: 'Arai' }, x: -18.5, y: 2.5, kind: 'signal', mark: 'sign', area: 'hm' },
    hm_yuto: { name: { ja: '雄踏', en: 'Yuto' }, x: -10.5, y: -0.5, kind: 'signal', mark: 'house', area: 'hm' },
    hm_nishi_ic: { name: { ja: '浜松西 IC', en: 'Hamamatsu-nishi IC' }, x: -8, y: -3.5, kind: 'ic', mark: 'tollgate', area: 'hm' },
    hm_kanzanji: { name: { ja: '舘山寺温泉', en: 'Kanzanji Onsen' }, x: -13, y: -7, kind: 'town', mark: 'ferris', area: 'hm' },
    hm_mikatahara: { name: { ja: '三方原', en: 'Mikatahara' }, x: -2.5, y: -9, kind: 'signal', mark: 'tea', area: 'hm' },
    hm_kiga: { name: { ja: '気賀（細江）', en: 'Kiga' }, x: -12, y: -14, kind: 'signal', mark: 'station', area: 'hm' },
    hm_mikkabi: { name: { ja: '三ヶ日', en: 'Mikkabi' }, x: -21, y: -16, kind: 'signal', mark: 'mikan', area: 'hm' },
    hm_mikkabi_ic: { name: { ja: '三ヶ日 IC・浜名湖 SA', en: 'Mikkabi IC / Hamanako SA' }, x: -18, y: -11, kind: 'ic', mark: 'tollgate', area: 'hm' },
    hm_hamakita: { name: { ja: '浜北', en: 'Hamakita' }, x: 4, y: -13, kind: 'signal', mark: 'station', area: 'hm' },
    hm_kasai: { name: { ja: '笠井', en: 'Kasai' }, x: 7.5, y: -7, kind: 'signal', mark: 'factory', area: 'hm' },
    hm_ic: { name: { ja: '浜松 IC', en: 'Hamamatsu IC' }, x: 6, y: -2.5, kind: 'ic', mark: 'tollgate', area: 'hm' },
    hm_hamakita_ic: { name: { ja: '浜松浜北 IC', en: 'Hamamatsu-hamakita IC' }, x: 3, y: -17.5, kind: 'ic', mark: 'tollgate', area: 'hm' },
    hm_inasa: { name: { ja: '浜松いなさ JCT', en: 'Inasa JCT' }, x: -9, y: -20, kind: 'jct', mark: 'greensign', area: 'hm' },
    hm_futamata: { name: { ja: '天竜二俣', en: 'Futamata' }, x: 6.5, y: -20, kind: 'signal', mark: 'station', area: 'hm' },
    hm_haruno: { name: { ja: '春野', en: 'Haruno' }, x: 9, y: -32, kind: 'town', mark: 'cedar', area: 'hm' },
    hm_misakubo: { name: { ja: '水窪', en: 'Misakubo' }, x: 16, y: -48, kind: 'town', mark: 'cedar', area: 'hm' },
    toyokawa_ic: { name: { ja: '豊川 IC', en: 'Toyokawa IC' }, x: 30, y: -6, kind: 'ic', mark: 'tollgate', area: 'mid' },
    shinshiro_ic: { name: { ja: '新城 IC', en: 'Shinshiro IC' }, x: 28, y: -22, kind: 'ic', mark: 'tollgate', area: 'mid' },
    okazaki_ic: { name: { ja: '岡崎 IC', en: 'Okazaki IC' }, x: 46, y: -12, kind: 'ic', mark: 'tollgate', area: 'mid' },
    toyota_jct: { name: { ja: '豊田東 JCT', en: 'Toyota-higashi JCT' }, x: 52, y: -20, kind: 'jct', mark: 'greensign', area: 'mid' },
    kariya: { name: { ja: '刈谷（伊勢湾岸）', en: 'Kariya' }, x: 56, y: -4, kind: 'ic', mark: 'greensign', area: 'mid' },
    hm_airpark: { name: { ja: '航空自衛隊浜松広報館', en: 'JASDF Air Park' }, kind: 'signal', mark: 'factory', area: 'hm', x: 0, y: 0 },
    hm_zoo: { name: { ja: '浜松市動物園・フラワーパーク', en: 'Hamamatsu Zoo' }, kind: 'signal', mark: 'bush', area: 'hm', x: 0, y: 0 },
    hm_ryugashi: { name: { ja: '竜ヶ岩洞', en: 'Ryugashi Cave' }, kind: 'town', mark: 'rock', area: 'hm', x: 0, y: 0 },
    hm_iinoya: { name: { ja: '井伊谷（龍潭寺）', en: 'Iinoya' }, kind: 'town', mark: 'torii', area: 'hm', x: 0, y: 0 },
    hm_sakuma: { name: { ja: '佐久間（中部天竜）', en: 'Sakuma' }, kind: 'town', mark: 'cedar', area: 'hm', x: 0, y: 0 },
    hm_tenryu: { name: { ja: '天竜川橋（国道1号）', en: 'Tenryu Bridge' }, kind: 'signal', mark: 'house', area: 'hm', x: 0, y: 0 },
    hm_shizudai: { name: { ja: '静岡大学（城北）', en: 'Shizuoka Univ.' }, kind: 'signal', mark: 'house', area: 'hm', x: 0, y: 0 },
    hm_tatsuyama: { name: { ja: '龍山（秋葉ダム）', en: 'Tatsuyama' }, kind: 'town', mark: 'cedar', area: 'hm', x: 0, y: 0 },
    hm_hosoe: { name: { ja: '細江（姫街道）', en: 'Hosoe' }, kind: 'signal', mark: 'house', area: 'hm', x: 0, y: 0 },
    hm_nakajima: { name: { ja: '中島（上島・国道152号）', en: 'Nakajima' }, kind: 'signal', mark: 'house', area: 'hm', x: 0, y: 0 },
    hm_minami: { name: { ja: '浜松市南区役所付近', en: 'Minami Ward' }, kind: 'signal', mark: 'house', area: 'hm', x: 0, y: 0 },
    hm_aritama: { name: { ja: '有玉', en: 'Aritama' }, kind: 'signal', mark: 'house', area: 'hm', x: 0, y: 0 },
    hm_sanarudai: { name: { ja: '佐鳴台', en: 'Sanarudai' }, kind: 'signal', mark: 'house', area: 'hm', x: 0, y: 0 },
    hm_akiha: { name: { ja: '秋葉山本宮 秋葉神社', en: 'Akiha Shrine' }, kind: 'town', mark: 'torii', area: 'hm', x: 0, y: 0 },
    hm_hamakita_forest: { name: { ja: '浜北森林公園', en: 'Hamakita Forest Park' }, kind: 'town', mark: 'cedar', area: 'hm', x: 0, y: 0 },
    ng_ic: { name: { ja: '名古屋 IC', en: 'Nagoya IC' }, x: 64, y: -14, kind: 'ic', mark: 'tollgate', area: 'ng' },
    ng_meieki: { name: { ja: '名古屋駅', en: 'Nagoya Sta.' }, x: 68, y: -11, kind: 'signal', mark: 'twintower', area: 'ng' },
    ng_sakae: { name: { ja: '栄', en: 'Sakae' }, x: 70.5, y: -11, kind: 'signal', mark: 'tvtower', area: 'ng' },
    ng_osu: { name: { ja: '大須', en: 'Osu' }, x: 69.5, y: -9.5, kind: 'signal', mark: 'billboard', area: 'ng' },
    ng_castle: { name: { ja: '名古屋城', en: 'Nagoya Castle' }, x: 69.5, y: -13.5, kind: 'signal', mark: 'castle', area: 'ng' },
    ng_atsuta: { name: { ja: '熱田神宮', en: 'Atsuta Shrine' }, x: 69, y: -6, kind: 'signal', mark: 'torii', area: 'ng' },
    ng_port: { name: { ja: '名古屋港', en: 'Nagoya Port' }, x: 68, y: -1, kind: 'signal', mark: 'ferris', area: 'ng' }
  };
  // 地図（0〜1）に直した座標を付けておく
  (function () {
    var ks = Object.keys(R.NODES), minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    // 地図では、浜松と名古屋のあいだ（高速道路の区間）を縮めて描く
    function warp(x) { return x <= 20 ? x : x < 60 ? 20 + (x - 20) * 0.25 : 30 + (x - 60) * 1.2; }
    ks.forEach(function (k) { var n = R.NODES[k]; n.kx = n.x; n.x = warp(n.x); });
    ks.forEach(function (k) { var n = R.NODES[k]; minx = Math.min(minx, n.x); maxx = Math.max(maxx, n.x); miny = Math.min(miny, n.y); maxy = Math.max(maxy, n.y); });
    ks.forEach(function (k) { var n = R.NODES[k]; n.ky = n.y; n.x = (n.x - minx) / (maxx - minx); n.y = (n.ky - miny) / (maxy - miny); });
  })();

  /*
   * 道。kind は景色と制限速度を決める。line は並走する鉄道（遠州鉄道＝赤い電車、天浜線）。
   */
  R.ROADS = [
    { a: 'hm_eki', b: 'hm_kaji', name: { ja: '鍛冶町通り', en: 'Kajimachi-dori' }, kind: 'city', km: 1 },
    { a: 'hm_kaji', b: 'hm_castle', name: { ja: '市役所前の通り', en: 'City Hall Ave.' }, kind: 'city', km: 1.2 },
    { a: 'hm_eki', b: 'hm_takatsuka', name: { ja: '国道 257 号（南へ）', en: 'Route 257 South' }, kind: 'suburb', km: 5 },
    { a: 'hm_castle', b: 'hm_sanaru', name: { ja: '佐鳴台への坂', en: 'Road to Sanarudai' }, kind: 'suburb', km: 3.5 },
    { a: 'hm_eki', b: 'hm_dune', name: { ja: '国道 257 号・凧場通り', en: 'Kite Festival Road' }, kind: 'coast', km: 4.5 },
    { a: 'hm_takatsuka', b: 'hm_shinohara', name: { ja: '国道 1 号（西へ）', en: 'Route 1 West' }, kind: 'suburb', km: 3.5, traffic: 7 },
    { a: 'hm_dune', b: 'hm_shinohara', name: { ja: '遠州灘の海沿い', en: 'Enshunada Coast Rd' }, kind: 'coast', km: 9 },
    { a: 'hm_shinohara', b: 'hm_maisaka', name: { ja: '浜名バイパス', en: 'Hamana Bypass' }, kind: 'coast', km: 4.5, traffic: 6, limit: 80 },
    { a: 'hm_maisaka', b: 'hm_benten', name: { ja: '浜名湖の橋', en: 'Lake Hamana Bridge' }, kind: 'bridge', km: 2 },
    { a: 'hm_benten', b: 'hm_arai', name: { ja: '中浜名橋・新居へ', en: 'To Arai' }, kind: 'bridge', km: 3.5 },
    { a: 'hm_sanaru', b: 'hm_yuto', name: { ja: '雄踏街道', en: 'Yuto Kaido' }, kind: 'suburb', km: 6 },
    { a: 'hm_yuto', b: 'hm_maisaka', name: { ja: '舞阪への道', en: 'To Maisaka' }, kind: 'suburb', km: 3 },
    { a: 'hm_sanaru', b: 'hm_nishi_ic', name: { ja: '入野の坂道', en: 'Irino Hill' }, kind: 'suburb', km: 4 },
    { a: 'hm_nishi_ic', b: 'hm_kanzanji', name: { ja: '舘山寺街道', en: 'Kanzanji Kaido' }, kind: 'lake', km: 6.5 },
    { a: 'hm_kanzanji', b: 'hm_kiga', name: { ja: '奥浜名湖の湖岸', en: 'Oku-Hamanako Shore' }, kind: 'lake', km: 9 },
    { a: 'hm_kiga', b: 'hm_mikkabi', name: { ja: '国道 362 号・みかん街道', en: 'Mikan Road (Rt.362)' }, kind: 'mikan', km: 10, line: 'tenhama' },
    { a: 'hm_mikkabi', b: 'hm_mikkabi_ic', name: { ja: '三ヶ日 IC 線', en: 'Mikkabi IC Road' }, kind: 'mikan', km: 4 },
    { a: 'hm_castle', b: 'hm_mikatahara', name: { ja: '国道 257 号（姫街道）', en: 'Hime-kaido (Rt.257)' }, kind: 'plateau', km: 8, traffic: 5 },
    { a: 'hm_mikatahara', b: 'hm_kiga', name: { ja: '三方原台地の一本道', en: 'Mikatahara Plateau Rd' }, kind: 'plateau', km: 10 },
    { a: 'hm_kaji', b: 'hm_hamakita', name: { ja: '国道 152 号（遠州鉄道沿い）', en: 'Rt.152 by the Enshu Railway' }, kind: 'suburb', km: 12, line: 'entetsu', traffic: 6 },
    { a: 'hm_mikatahara', b: 'hm_hamakita', name: { ja: '台地を東へ', en: 'Across the Plateau' }, kind: 'plateau', km: 7 },
    { a: 'hm_hamakita', b: 'hm_futamata', name: { ja: '国道 152 号（天竜へ）', en: 'Rt.152 to Tenryu' }, kind: 'river', km: 8, line: 'entetsu' },
    { a: 'hm_futamata', b: 'hm_haruno', name: { ja: '天竜川沿いの山道', en: 'Tenryu Riverside Pass' }, kind: 'mount', km: 12 },
    { a: 'hm_haruno', b: 'hm_misakubo', name: { ja: '国道 152 号（水窪へ・酷道）', en: 'Rt.152 to Misakubo' }, kind: 'mount', km: 18 },
    { a: 'hm_eki', b: 'hm_kasai', name: { ja: '笠井街道', en: 'Kasai Kaido' }, kind: 'suburb', km: 8 },
    { a: 'hm_kasai', b: 'hm_hamakita', name: { ja: '天竜川の堤防道', en: 'Tenryu Levee Rd' }, kind: 'river', km: 7 },
    { a: 'hm_eki', b: 'hm_ic', name: { ja: '国道 152 号（浜松 IC へ）', en: 'Rt.152 to Hamamatsu IC' }, kind: 'suburb', km: 6, traffic: 7 },
    { a: 'hm_kasai', b: 'hm_ic', name: { ja: '有玉の道', en: 'Aritama Rd' }, kind: 'suburb', km: 5 },
    { a: 'hm_hamakita', b: 'hm_hamakita_ic', name: { ja: '新東名への取付道路', en: 'Shin-Tomei Access' }, kind: 'plateau', km: 5 },
    // 高速道路
    { a: 'hm_nishi_ic', b: 'hm_mikkabi_ic', name: { ja: '東名高速（浜名湖越え）', en: 'Tomei over Lake Hamana' }, kind: 'hwy', km: 14, traffic: 10, limit: 100 },
    { a: 'hm_nishi_ic', b: 'hm_ic', name: { ja: '東名高速（浜松市内）', en: 'Tomei through Hamamatsu' }, kind: 'hwy', km: 14, traffic: 10, limit: 100 },
    { a: 'hm_mikkabi_ic', b: 'toyokawa_ic', name: { ja: '東名高速（豊川へ）', en: 'Tomei to Toyokawa' }, kind: 'hwy', km: 30, traffic: 10, limit: 100 },
    { a: 'toyokawa_ic', b: 'okazaki_ic', name: { ja: '東名高速（岡崎へ）', en: 'Tomei to Okazaki' }, kind: 'hwy', km: 22, traffic: 10, limit: 100 },
    { a: 'okazaki_ic', b: 'ng_ic', name: { ja: '東名高速（名古屋へ）', en: 'Tomei to Nagoya' }, kind: 'hwy', km: 25, traffic: 12, limit: 100 },
    { a: 'hm_inasa', b: 'hm_hamakita_ic', name: { ja: '新東名高速（浜松 SA）', en: 'Shin-Tomei (Hamamatsu SA)' }, kind: 'hwymount', km: 12, traffic: 7, limit: 120 },
    { a: 'hm_inasa', b: 'hm_mikkabi_ic', name: { ja: '三遠南信道・連絡路', en: 'Inasa Link' }, kind: 'hwymount', km: 8, traffic: 4, limit: 80 },
    { a: 'hm_inasa', b: 'shinshiro_ic', name: { ja: '新東名高速（新城へ）', en: 'Shin-Tomei to Shinshiro' }, kind: 'hwymount', km: 20, traffic: 6, limit: 120 },
    { a: 'shinshiro_ic', b: 'toyota_jct', name: { ja: '新東名高速（豊田へ）', en: 'Shin-Tomei to Toyota' }, kind: 'hwymount', km: 30, traffic: 7, limit: 120 },
    { a: 'toyota_jct', b: 'ng_ic', name: { ja: '東海環状・名古屋へ', en: 'To Nagoya IC' }, kind: 'hwy', km: 14, traffic: 9, limit: 100 },
    { a: 'toyota_jct', b: 'kariya', name: { ja: '伊勢湾岸道（豊田から）', en: 'Isewangan from Toyota' }, kind: 'hwy', km: 16, traffic: 9, limit: 100 },
    { a: 'kariya', b: 'ng_port', name: { ja: '伊勢湾岸道（名港トリトン）', en: 'Isewangan (Meiko Triton)' }, kind: 'bridge', km: 14, traffic: 8, limit: 100 },
    // 名古屋
    { a: 'ng_ic', b: 'ng_meieki', name: { ja: '名古屋高速', en: 'Nagoya Expressway' }, kind: 'ngcity', km: 7, traffic: 8, limit: 60 },
    { a: 'ng_ic', b: 'ng_castle', name: { ja: '出来町通', en: 'Dekimachi-dori' }, kind: 'ngcity', km: 7, traffic: 6 },
    { a: 'ng_meieki', b: 'ng_sakae', name: { ja: '広小路通', en: 'Hirokoji-dori' }, kind: 'ngcity', km: 2.5, traffic: 6 },
    { a: 'ng_meieki', b: 'ng_castle', name: { ja: '堀川沿い', en: 'Along the Horikawa' }, kind: 'park', km: 3 },
    { a: 'ng_sakae', b: 'ng_castle', name: { ja: '大津通（北へ）', en: 'Otsu-dori North' }, kind: 'park', km: 2.5 },
    { a: 'ng_sakae', b: 'ng_osu', name: { ja: '大津通（南へ）', en: 'Otsu-dori South' }, kind: 'ngcity', km: 1.5, traffic: 6 },
    { a: 'ng_meieki', b: 'ng_osu', name: { ja: '伏見通', en: 'Fushimi-dori' }, kind: 'ngcity', km: 2.5, traffic: 6 },
    { a: 'ng_osu', b: 'ng_atsuta', name: { ja: '国道 19 号・熱田へ', en: 'To Atsuta' }, kind: 'ngcity', km: 3.5, traffic: 6 },
    { a: 'ng_atsuta', b: 'ng_port', name: { ja: '江川線・港へ', en: 'To the Port' }, kind: 'port', km: 6, traffic: 5 },
    { a: 'ng_atsuta', b: 'kariya', name: { ja: '国道 1 号（東へ）', en: 'Route 1 East' }, kind: 'suburb', km: 12, traffic: 8 }
  ];
  R.ROADS.forEach(function (r) {
    var hw = r.kind === 'hwy' || r.kind === 'hwymount' || (r.kind === 'bridge' && r.limit >= 100);
    r.len = Math.round(Math.max(480, Math.min(hw ? 4200 : 2800, r.km * (hw ? 150 : 260))));
  });

  R.ROAD_KINDS = {
    city: { pal: PAL.hmcity, deco: ['building', 'lamp', 'building', 'unagi', 'gyoza', 'building', 'piano', 'house'], traffic: 6, limit: 50, police: 1, signals: true },
    suburb: { pal: PAL.hmcity, deco: ['house', 'lamp', 'factory', 'house', 'gyoza', 'unagi', 'house', 'bush'], traffic: 5, limit: 60, police: 1 },
    plateau: { pal: PAL.hmmount, deco: ['tea', 'tea', 'house', 'tree', 'tea', 'factory'], traffic: 3, limit: 60, police: 1 },
    coast: { pal: PAL.hmdune, deco: ['pine', 'dune', 'pine', 'kite', 'bush'], water: 'right', traffic: 3, limit: 60 },
    lake: { pal: PAL.hmlake, deco: ['pine', 'unagi', 'house', 'pine', 'palm', 'bush'], water: 'left', traffic: 3, limit: 50, police: 1 },
    bridge: { pal: PAL.hmlake, deco: ['lamp', 'barrier', 'lamp'], water: 'both', traffic: 4, limit: 60 },
    mikan: { pal: PAL.hmmount, deco: ['mikan', 'mikan', 'house', 'mikan', 'tree'], water: 'left', traffic: 2, limit: 50 },
    river: { pal: PAL.hmmount, deco: ['tree', 'house', 'pine', 'tree'], water: 'right', traffic: 3, limit: 60, police: 1 },
    mount: { pal: PAL.hmmount, deco: ['cedar', 'cedar', 'rock', 'cedar', 'sign'], water: 'right', traffic: 1, limit: 40, rails: true },
    hwy: { pal: PAL.hwy, deco: ['soundwall', 'greensign', 'soundwall', 'lamp'], highway: true, traffic: 9, limit: 100, police: 1 },
    hwymount: { pal: PAL.hwymount, deco: ['cedar', 'soundwall', 'greensign', 'cedar'], highway: true, tunnels: true, traffic: 6, limit: 120, rails: true, police: 1 },
    ngcity: { pal: PAL.ngcity, deco: ['building', 'lamp', 'billboard', 'building', 'building'], night: true, skyline: true, traffic: 6, limit: 50, police: 2, signals: true },
    port: { pal: PAL.ngport, deco: ['container', 'crane', 'lamp', 'container'], water: 'right', traffic: 4, limit: 50, police: 1 },
    park: { pal: PAL.ngpark, deco: ['tree', 'bush', 'lamp', 'tree', 'building'], traffic: 4, limit: 50, police: 1 }
  };

  R.neighbors = function (node) {
    return R.ROADS.filter(function (r) { return r.a === node || r.b === node; })
      .map(function (r) { return { road: r, to: r.a === node ? r.b : r.a }; });
  };
  /** いちばん近い道順（道の長さの合計が最小）。[node, node, …] */
  R.route = function (from, to) {
    var dist = {}, prev = {}, left = Object.keys(R.NODES);
    left.forEach(function (n) { dist[n] = Infinity; });
    dist[from] = 0;
    while (left.length) {
      left.sort(function (a, b) { return dist[a] - dist[b]; });
      var u = left.shift();
      if (u === to || dist[u] === Infinity) break;
      R.neighbors(u).forEach(function (e) {
        var d = dist[u] + e.road.len;
        if (d < dist[e.to]) { dist[e.to] = d; prev[e.to] = u; }
      });
    }
    var path = [to];
    while (path[0] !== from && prev[path[0]]) path.unshift(prev[path[0]]);
    return { path: path[0] === from ? path : [from], len: dist[to] };
  };

  /* =====================================================================
     アルバイト（オープンワールドで働く）
     ===================================================================== */

  R.JOBS = {
    taxi: { name: { ja: 'タクシー', en: 'Taxi' }, icon: '🚕', car: 'taxi',
            desc: { ja: 'お客さんを目的地まで運ぶ。早いほどチップが増え、ぶつけると減る。', en: 'Drive fares to their destination. Faster means bigger tips; crashes cut them.' } },
    delivery: { name: { ja: '宅配便', en: 'Parcel Delivery' }, icon: '📦',
                desc: { ja: '荷物を届ける。「こわれもの」は車の傷みに応じて報酬が減る。', en: 'Deliver parcels. Fragile items pay less the more damage you take.' } },
    food: { name: { ja: 'うなぎ弁当の出前', en: 'Eel Lunch Delivery' }, icon: '🍱',
            desc: { ja: '出来たての弁当を短い時間で届ける。時間との勝負。', en: 'Rush a fresh eel lunch box across town. It is all about time.' } }
  };
  R.PASSENGERS = [
    { ja: '会社員', en: 'office worker' }, { ja: '観光客', en: 'tourist' }, { ja: 'ピアノの先生', en: 'piano teacher' },
    { ja: '大学生', en: 'student' }, { ja: 'おばあちゃん', en: 'grandma' }, { ja: '野球ファン', en: 'baseball fan' },
    { ja: '寝坊した新郎', en: 'late groom' }, { ja: '謎の紳士', en: 'mysterious gentleman' }
  ];
  R.PARCELS = [
    { ja: '楽器（こわれもの）', en: 'instrument (fragile)', fragile: true }, { ja: 'お茶の箱', en: 'box of tea' },
    { ja: '餃子の冷凍便', en: 'frozen gyoza' }, { ja: '手羽先セット', en: 'chicken wings set' },
    { ja: '陶器（こわれもの）', en: 'pottery (fragile)', fragile: true }, { ja: 'きしめん', en: 'kishimen noodles' }
  ];

  /* =====================================================================
     ミニゲーム
     ===================================================================== */

  // 本格志向ではない「カジュアル」枠（ここだけコインと加速パネルが出る）
  R.CASUAL = {
    party: { name: { ja: 'パーティレース', en: 'Party Race' },
             desc: { ja: '道にコインと加速パネルが並ぶお祭りレース。拾ったコインはそのまま賞金に。', en: 'A festival race with coins and boost pads on the road. Coins become prize money.' } },
    coins: { name: { ja: 'コインラッシュ', en: 'Coin Rush' },
             desc: { ja: '60 秒でコインを集められるだけ集める。', en: 'Grab as many coins as you can in 60 seconds.' } }
  };

  R.MINIS = {
    drag: { name: { ja: 'ゼロヨン', en: 'Drag 400m' },
            desc: { ja: '400m の直線で 1 対 1。針が緑の間にスペースでシフトアップ。', en: '400m one-on-one. Shift up with space while the needle is in the green.' } },
    gymkhana: { name: { ja: 'ジムカーナ', en: 'Gymkhana' },
                desc: { ja: 'パイロンの門を順に抜けるタイム競技。門の外 +5 秒、パイロン接触 +2 秒。', en: 'Thread the cone gates against the clock. Missed gate +5s, cone hit +2s.' } },
    brake: { name: { ja: 'ピタッと停止', en: 'Brake Test' },
             desc: { ja: '全開で走り、赤い枠の中でぴったり止まる。', en: 'Go flat out, then stop dead inside the red box.' } }
  };

  /* =====================================================================
     保存（1 つの JSON にまとめる）
     ===================================================================== */

  var SAVE = 'race:save';
  function fresh() {
    return { v: 2, money: 1000, owned: ['pod'], car: 'pod', paint: {}, upg: {}, story: 0, cups: {}, laps: {},
             bosses: {}, level: 'normal', stats: { races: 0, wins: 0, podiums: 0, titles: 0, km: 0, near: 0, best: {}, jobs: 0, earned: 0, fares: 0 }, mini: {}, visited: {}, ach: {}, daily: { last: 0, streak: 0, best: 0, total: 0 } };
  }
  R.load = function () {
    var s = null;
    try { s = JSON.parse(TB.store.get(SAVE, 'null')); } catch (e) { s = null; }
    if (!s || !s.v) {
      s = fresh();
      // 以前の版の記録を引き継ぐ
      var old = parseInt(TB.store.get('race:money', '0'), 10) || 0;
      s.money += old;
      try { var u = JSON.parse(TB.store.get('race:upg', '{}')); if (u) s.upg.pod = u; } catch (e) { /* ignore */ }
      ['coast', 'ridge', 'city'].forEach(function (id) {
        var v = parseInt(TB.store.get('race:lap:' + id, ''), 10);
        if (!isNaN(v)) s.laps[id] = v;
      });
      ['races', 'wins', 'podiums', 'titles'].forEach(function (k) { s.stats[k] = parseInt(TB.store.get('race:' + k, '0'), 10) || 0; });
    }
    var d = fresh();
    for (var k in d) if (s[k] === undefined) s[k] = d[k];
    for (var k2 in d.stats) if (s.stats[k2] === undefined) s.stats[k2] = d.stats[k2];
    return s;
  };
  R.save = function (s) { TB.store.set(SAVE, JSON.stringify(s)); };
  R.edit = function (fn) { var s = R.load(); var r = fn(s); R.save(s); return r; };

  R.carColor = function (s, car) { var i = s.paint[car.id]; return R.PAINTS[i === undefined ? car.paint : i]; };
  R.ownedCar = function (s, id) { return s.owned.indexOf(id) >= 0; };

  /** 手に入る条件を満たしていない（物語で開放する）車か */
  R.carLocked = function (s, car) { return car.unlock && !R.ownedCar(s, car.id); };

  R.cupUnlocked = function (s, cup) { return !cup.need || !!s.cups[cup.need]; };
  R.MEDALS = { 1: { ja: '金', en: 'Gold' }, 2: { ja: '銀', en: 'Silver' }, 3: { ja: '銅', en: 'Bronze' } };

  R.ghostKey = function (track, mirror) { return 'race:ghost:' + track + (mirror ? ':m' : ''); };
  R.loadGhost = function (track, mirror) {
    try { return JSON.parse(TB.store.get(R.ghostKey(track, mirror), 'null')); } catch (e) { return null; }
  };
  R.saveGhost = function (track, mirror, g) { TB.store.set(R.ghostKey(track, mirror), JSON.stringify(g)); };
  R.lapKey = function (track, mirror) { return track + (mirror ? ':m' : ''); };

  /* =====================================================================
     実績（トロフィー）— 条件を満たすと賞金つきで解除される
     test(s) は保存データ s を見て真偽を返す
     ===================================================================== */

  function nAch(s) { return Object.keys(s.ach || {}).length; }
  function cupGolds(s) { var n = 0; for (var k in s.cups) if (s.cups[k] === 1) n++; return n; }
  function bestsCount(s) { return Object.keys(s.laps || {}).length; }
  function storyDone(s, id) {
    var st = (R.STORIES || []).filter(function (x) { return x.id === id; })[0];
    return !!st && ((s.stories || {})[id] || 0) >= st.events.length;
  }
  R.ACHIEVEMENTS = [
    { id: 'first', icon: '🏁', reward: 300, name: { ja: 'はじめの一歩', en: 'First Steps' }, desc: { ja: 'レースを 1 回走る', en: 'Run your first race' }, test: function (s) { return s.stats.races >= 1; } },
    { id: 'win1', icon: '🥇', reward: 500, name: { ja: '初優勝', en: 'First Victory' }, desc: { ja: 'レースで 1 位になる', en: 'Win a race' }, test: function (s) { return s.stats.wins >= 1; } },
    { id: 'win10', icon: '🏆', reward: 2000, name: { ja: '常勝', en: 'Winning Streak' }, desc: { ja: '通算 10 勝', en: '10 career wins' }, test: function (s) { return s.stats.wins >= 10; } },
    { id: 'win50', icon: '👑', reward: 8000, name: { ja: '王者', en: 'Champion' }, desc: { ja: '通算 50 勝', en: '50 career wins' }, test: function (s) { return s.stats.wins >= 50; } },
    { id: 'pod20', icon: '🥉', reward: 1500, name: { ja: '表彰台の常連', en: 'Podium Regular' }, desc: { ja: '表彰台 20 回', en: '20 podium finishes' }, test: function (s) { return s.stats.podiums >= 20; } },
    { id: 'race100', icon: '🔁', reward: 3000, name: { ja: '走り込み', en: 'Seasoned' }, desc: { ja: '通算 100 レース', en: '100 races' }, test: function (s) { return s.stats.races >= 100; } },
    { id: 'km100', icon: '🛣', reward: 1500, name: { ja: '100 km ドライバー', en: '100 km Club' }, desc: { ja: '通算 100 km 走る', en: 'Drive 100 km in total' }, test: function (s) { return s.stats.km >= 100; } },
    { id: 'km1000', icon: '🌏', reward: 6000, name: { ja: '1000 km ドライバー', en: '1000 km Club' }, desc: { ja: '通算 1000 km 走る', en: 'Drive 1000 km in total' }, test: function (s) { return s.stats.km >= 1000; } },
    { id: 'near100', icon: '😮', reward: 1200, name: { ja: 'ギリギリの男', en: 'Close Shave' }, desc: { ja: 'ニアミス通算 100 回', en: '100 near misses' }, test: function (s) { return s.stats.near >= 100; } },
    { id: 'touge5', icon: '⛰', reward: 2000, name: { ja: '峠の走り屋', en: 'Pass Runner' }, desc: { ja: '峠バトルに 5 回勝つ', en: 'Win 5 touge battles' }, test: function (s) { return (s.stats.touge || 0) >= 5; } },
    { id: 'cup1', icon: '🏅', reward: 2500, name: { ja: 'カップ制覇', en: 'Cup Winner' }, desc: { ja: 'いずれかのカップで金メダル', en: 'Take gold in any cup' }, test: function (s) { return cupGolds(s) >= 1; } },
    { id: 'cupall', icon: '🌟', reward: 12000, name: { ja: '全カップ制覇', en: 'Grand Slam' }, desc: { ja: 'すべてのカップで金メダル', en: 'Take gold in every cup' }, test: function (s) { return cupGolds(s) >= R.CUPS.length; } },
    { id: 'story3', icon: '📖', reward: 1000, name: { ja: '物語のはじまり', en: 'Story Begins' }, desc: { ja: 'ストーリーを 3 話クリア', en: 'Clear 3 story events' }, test: function (s) { return s.story >= 3; } },
    { id: 'story24', icon: '👻', reward: 10000, name: { ja: '白い亡霊の最期', en: 'End of the Ghost' }, desc: { ja: '本編「天竜の白い亡霊」を完結', en: 'Finish the main story' }, test: function (s) { var f = R.STORY.map(function (e) { return e.id; }).indexOf('f2'); return s.story >= (f < 0 ? R.STORY.length : f + 1); } },
    { id: 's2clear', icon: '🌃', reward: 6000, name: { ja: '湾岸の夜明け', en: 'Wangan Dawn' }, desc: { ja: 'ストーリー2「湾岸 1989」を完結', en: 'Finish Story 2' }, test: function (s) { return storyDone(s, 's2'); } },
    { id: 's3clear', icon: '🏔', reward: 6000, name: { ja: '七人目の星', en: 'The Seventh Star' }, desc: { ja: 'ストーリー3「六連星」を完結', en: 'Finish Story 3' }, test: function (s) { return storyDone(s, 's3'); } },
    { id: 's4clear', icon: '⭐', reward: 6000, name: { ja: '星の井戸へ', en: 'To the Star Well' }, desc: { ja: 'ストーリー4「星の砂漠 1983」を完結', en: 'Finish Story 4' }, test: function (s) { return storyDone(s, 's4'); } },
    { id: 's5clear', icon: '🏁', reward: 6000, name: { ja: 'グリッドの向こうへ', en: 'Beyond the Grid' }, desc: { ja: 'ストーリー5「グリッドの向こうの夏」を完結', en: 'Finish Story 5' }, test: function (s) { return storyDone(s, 's5'); } },
    { id: 'cars5', icon: '🚗', reward: 1500, name: { ja: 'ガレージ持ち', en: 'Car Collector' }, desc: { ja: '車を 5 台持つ', en: 'Own 5 cars' }, test: function (s) { return s.owned.length >= 5; } },
    { id: 'cars15', icon: '🏎', reward: 6000, name: { ja: 'コレクター', en: 'Garage Full' }, desc: { ja: '車を 15 台持つ', en: 'Own 15 cars' }, test: function (s) { return s.owned.length >= 15; } },
    { id: 'rich', icon: '💰', reward: 0, name: { ja: '大金持ち', en: 'Big Spender' }, desc: { ja: '所持金 100,000 以上', en: 'Hold 100,000 credits' }, test: function (s) { return s.money >= 100000; } },
    { id: 'jobs10', icon: '🚕', reward: 1500, name: { ja: '働き者', en: 'Hard Worker' }, desc: { ja: 'アルバイトを 10 件こなす', en: 'Finish 10 jobs' }, test: function (s) { return (s.stats.jobs || 0) >= 10; } },
    { id: 'bests10', icon: '⏱', reward: 2500, name: { ja: 'タイム職人', en: 'Time Smith' }, desc: { ja: '10 コースで自己ベストを記録', en: 'Set personal bests on 10 tracks' }, test: function (s) { return bestsCount(s) >= 10; } },
    { id: 'bests30', icon: '🗺', reward: 8000, name: { ja: '全国走破', en: 'Track Master' }, desc: { ja: '30 コースで自己ベストを記録', en: 'Set personal bests on 30 tracks' }, test: function (s) { return bestsCount(s) >= 30; } },
    { id: 'daily1', icon: '📅', reward: 600, name: { ja: '今日のレース', en: 'Daily Driver' }, desc: { ja: 'デイリーレースで表彰台', en: 'Podium in a daily race' }, test: function (s) { return ((s.daily && s.daily.total) || 0) >= 1; } },
    { id: 'daily7', icon: '🔥', reward: 5000, name: { ja: '一週間連続', en: 'Week Streak' }, desc: { ja: 'デイリーレースを 7 日連続で達成', en: 'Daily race streak of 7 days' }, test: function (s) { return ((s.daily && s.daily.best) || 0) >= 7; } },
    { id: 'all', icon: '💎', reward: 20000, name: { ja: 'コンプリート', en: 'Completionist' }, desc: { ja: '他のすべての実績を解除', en: 'Unlock every other achievement' }, test: function (s) { return nAch(s) >= R.ACHIEVEMENTS.length - 1; } }
  ];

  /** 条件を満たした実績を解除し、新しく解除したものの一覧を返す（賞金は s.money に足す） */
  R.checkAch = function (s) {
    s.ach = s.ach || {};
    var got = [], again = true;
    while (again) {   // 賞金で別の実績の条件が満たされることもあるので、増えなくなるまで見る
      again = false;
      R.ACHIEVEMENTS.forEach(function (a) {
        if (!s.ach[a.id] && a.test(s)) { s.ach[a.id] = 1; s.money += a.reward; got.push(a); again = true; }
      });
    }
    return got;
  };

  /* =====================================================================
     デイリーレース — 日付から毎日同じ（全員共通の）コース・天気・周回が決まる
     ===================================================================== */

  function dateKey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  R.today = function () { return dateKey(new Date()); };
  R.yesterday = function () { var d = new Date(); d.setDate(d.getDate() - 1); return dateKey(d); };

  /** 日付 key から決まるレース内容 { track, laps, weather, level, rivals, mirror } */
  R.dailySpec = function (key) {
    var x = (key * 2654435761) >>> 0;
    function rnd2() { x = (x + 0x6D2B79F5) >>> 0; var t2 = x; t2 = Math.imul(t2 ^ (t2 >>> 15), t2 | 1); t2 ^= t2 + Math.imul(t2 ^ (t2 >>> 7), t2 | 61); return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296; }
    var loops = R.ALL_TRACKS.filter(function (id) { return !R.TRACKS[id].touge; });
    var ws = Object.keys(R.WEATHERS);
    return {
      track: loops[Math.floor(rnd2() * loops.length)],
      laps: 2 + Math.floor(rnd2() * 3),
      weather: rnd2() < 0.45 ? 'auto' : ws[Math.floor(rnd2() * ws.length)],
      level: ['normal', 'hard', 'hard'][Math.floor(rnd2() * 3)],
      rivals: 5 + Math.floor(rnd2() * 3),
      mirror: rnd2() < 0.2
    };
  };

  /** デイリー結果を記録する。表彰台なら日ごとに 1 回だけ連続日数を進め、その回のボーナス額を返す */
  R.dailyDone = function (s, place) {
    var d = s.daily = s.daily || { last: 0, streak: 0, best: 0, total: 0 };
    var today = R.today();
    if (place > 3 || d.last === today) return 0;
    d.streak = d.last === R.yesterday() ? d.streak + 1 : 1;
    d.last = today; d.total++;
    d.best = Math.max(d.best, d.streak);
    return 1500 + Math.min(d.streak, 10) * 300;
  };

  /** games 一覧の記録欄用 */
  TB.raceBest = function () {
    var s = R.load();
    return R.ORDER.filter(function (id) { return s.laps[id]; }).map(function (id) { return [id, fmt(s.laps[id])]; });
  };
})();
