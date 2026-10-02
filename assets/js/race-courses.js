/*
 * race-courses.js — 実在の形のコース。
 *
 *   ・サーキット 7（OpenStreetMap の raceway から周回路を取り出し、全長も実物どおり）
 *   ・峠 7（実在の山道の、いちばんカーブが続く 6〜8km）
 *   ・浜松の公道 6（race-map-data.js の実際の道をつないだもの。地図を読み込んでから使う）
 * どれも「周回＝円」ではなく実際の線形。高さは国土地理院の標高。
 */
(function () {
  'use strict';
  var TB = window.TB, R = TB.Race;
  var D = TB.RaceCourseData || {};

  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', IDX = {};
  for (var i = 0; i < 64; i++) IDX[ALPHA.charCodeAt(i)] = i;
  function dec(s) {
    var out = [], z = 0, sh = 0;
    for (var i = 0; i < s.length; i++) { var c = IDX[s.charCodeAt(i)]; z += (c & 31) * Math.pow(2, sh); sh += 5; if (c < 32) { out.push(z % 2 ? -(z - 1) / 2 - 1 : z / 2); z = 0; sh = 0; } }
    return out;
  }
  var polyCache = {};
  function poly(key) {
    if (polyCache[key]) return polyCache[key];
    var c = D[key], xs = dec(c.x), zs = dec(c.z), ys = dec(c.y), n = xs.length, p = new Float32Array((n + (c.loop ? 1 : 0)) * 3);
    var x = 0, z = 0, y = 0;
    for (var i = 0; i < n; i++) { x += xs[i]; z += zs[i]; y += ys[i]; p[i * 3] = x / 10; p[i * 3 + 1] = z / 10; p[i * 3 + 2] = y / 10 + c.y0; }
    if (c.loop) { p[n * 3] = p[0]; p[n * 3 + 1] = p[1]; p[n * 3 + 2] = p[2]; }
    polyCache[key] = p;
    return p;
  }

  /**
   * 周回路が自分の道と交わる所（鈴鹿の 8 の字）は、あとから通る側を高架にする。
   * 標高データは地面の高さなので、そのままだと同じ高さで交わって車どうしが重なってしまう。
   */
  function overpass(p, hw) {
    var n = p.length / 3, cum = new Float64Array(n), i, j;
    for (i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]);
    var total = cum[n - 1], out = new Float32Array(p), spots = [];
    for (i = 0; i < n; i += 2) for (j = i + 1; j < n; j += 2) {
      var dc = Math.min(cum[j] - cum[i], total - (cum[j] - cum[i]));
      if (dc < 300) continue;
      if (Math.hypot(p[i * 3] - p[j * 3], p[i * 3 + 1] - p[j * 3 + 1]) < hw * 1.8 && Math.abs(p[i * 3 + 2] - p[j * 3 + 2]) < 4) { spots.push(cum[j]); break; }
    }
    if (!spots.length) return p;
    // 近い点どうしは 1 か所にまとめる
    var centers = [];
    spots.sort(function (a, b) { return a - b; });
    spots.forEach(function (c) { if (!centers.length || c - centers[centers.length - 1].hi > 80) centers.push({ lo: c, hi: c }); else centers[centers.length - 1].hi = c; });
    centers.forEach(function (c) {
      var mid = (c.lo + c.hi) / 2, half = Math.max(110, (c.hi - c.lo) / 2 + 90);
      for (var k = 0; k < n; k++) {
        var d = Math.abs(cum[k] - mid);
        if (d < half) { var f = 0.5 + 0.5 * Math.cos(Math.PI * d / half); out[k * 3 + 2] += 8 * f * f * (3 - 2 * f); }
      }
    });
    return out;
  }

  function hash(i, k) { var h = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return h - Math.floor(h); }

  /** サーキット・峠の沿道 */
  function decorateCourse(segs, env, hw) {
    var n = segs.length, GR = { grass: '#5f9a45', gravel: '#c7b287', forest: '#3a5a33', dark: '#46663b' };
    for (var i = 0; i < n; i++) {
      var s = segs[i], ph = s.phys || 0, h1 = hash(i, 1), h2 = hash(i, 2);
      if (env === 'circuit') {
        var corner = Math.abs(ph) > 4.5;
        // コーナーの外側はグラベル（砂利）
        var outside = ph > 0 ? 'L' : 'R';
        s.cGrassL = corner && outside === 'L' ? GR.gravel : null; s.cGrassR = corner && outside === 'R' ? GR.gravel : null;
        if (s.cGrassL || s.cGrassR) { s.cGrassL = s.cGrassL || GR.grass; s.cGrassR = s.cGrassR || GR.grass; }
        s.rumW = corner ? 1.2 / hw : 0.35 / hw;
        if (i < 70 && i % 10 === 0) s.sprites.push({ kind: 'grandstand', offset: -(1 + 12 / hw), seed: i });
        if (i < 70 && i % 14 === 0) s.sprites.push({ kind: 'bldg', offset: 1 + 9 / hw, off2: 1 + 24 / hw, len: 14, hm: 9, c: '#dfe3e6', win: 'grid', roof: 'flat', seed: i, city: true });
        if (corner && i % 6 === 0) s.sprites.push({ kind: 'tyrewall', offset: (ph > 0 ? -1 : 1) * (1 + 16 / hw), seed: i });
        if (!corner && i % 90 === 45) s.sprites.push({ kind: 'billboard', offset: (h1 < 0.5 ? -1 : 1) * (1 + 10 / hw), seed: i, real: true });
        if (i % 25 === 0) s.sprites.push({ kind: h2 < 0.5 ? 'tree' : 'broadleaf', offset: (h1 < 0.5 ? -1 : 1) * (1 + (30 + h2 * 40) / hw), seed: i, city: true });
        if (i % 160 === 80) s.sprites.push({ kind: 'bldg', offset: (h1 < 0.5 ? -1 : 1) * (1 + 14 / hw), off2: (h1 < 0.5 ? -1 : 1) * (1 + 17 / hw), len: 2, hm: 4, c: '#f2f2f2', win: 'house', roof: 'flat', seed: i, city: true });   // ポスト
      } else {
        // 峠: 杉と広葉樹の森、谷側にガードレール、急カーブに矢印板
        s.cGrassL = shadeG(GR.forest, i); s.cGrassR = shadeG(GR.dark, i);
        s.rumW = 0.6 / hw;
        if (i % 4 === 0) s.sprites.push({ kind: h1 < 0.6 ? 'cedar' : 'broadleaf', offset: -(1 + (2 + h2 * 16) / hw), seed: i, city: true });
        if (i % 4 === 2) s.sprites.push({ kind: h2 < 0.6 ? 'cedar' : 'broadleaf', offset: 1 + (2 + h1 * 16) / hw, seed: i + 7, city: true });
        if (i % 9 === 5) s.sprites.push({ kind: 'cedar', offset: (h1 < 0.5 ? -1 : 1) * (1 + (18 + h2 * 20) / hw), seed: i, city: true });
        if (Math.abs(ph) > 3.5) s.rails = true;
        if (Math.abs(ph) > 6.5 && i % 12 === 0) s.sprites.push({ kind: 'chevron', offset: (s.curve > 0 ? -1 : 1) * (1 + 1.5 / hw), dir: s.curve > 0 ? 1 : -1, city: true });
        if (i % 25 === 0) s.sprites.push({ kind: 'pole', offset: -(1 + 1.2 / hw), city: true, id: i });
        if (i === 40) s.sprites.push({ kind: 'limitsign', offset: -(1 + 1.2 / hw), n: 40, city: true });
      }
    }
  }
  function shadeG(c, i) { return Math.floor(i / 6) % 2 ? c : R.util && R.util.shade ? R.util.shade(c, 0.96) : c; }

  var PAL_CIRCUIT = { sky: ['#3f86d0', '#8fbfe8', '#e4eef5'], sun: { x: 0.64, y: 0.12, r: 14, c: '#ffffff' }, far: '#7b93ab', hill: '#4f7a4a', fog: '#dde8ef',
                      grass: ['#5f9a45', '#5a9441'], road: ['#55595e', '#52565b'], rumble: ['#f2f2f2', '#d32f2f'], lane: '#f2f2f2', water: '#3b6f98' };
  var PAL_TOUGE = { sky: ['#4f86bd', '#9cc0e0', '#dce7ee'], sun: { x: 0.3, y: 0.1, r: 12, c: '#fff8e1' }, far: '#5f7788', hill: '#3b5738', fog: '#cfd9d6',
                    grass: ['#3a5a33', '#36552f'], road: ['#595d62', '#55595e'], rumble: ['#77806f', '#727a6a'], lane: '#f2f2f2', water: '#3b6f98' };

  function courseSpec(key, o) {
    return {
      name: o.name, desc: o.desc, diff: o.diff || 3, laps: o.laps || (D[key] && D[key].loop ? 3 : 1), weather: o.weather || 'clear',
      pal: D[key] && D[key].loop ? PAL_CIRCUIT : PAL_TOUGE, deco: [], custom: true, real: true, loop: !!(D[key] && D[key].loop),
      curbs: !!(D[key] && D[key].loop), noLanes: !!(D[key] && D[key].loop), touge: !(D[key] && D[key].loop) && o.touge !== false, p2p: !(D[key] && D[key].loop),
      night: !!o.night, geom: null, region: o.region,
      build: function (b) {
        var hw = o.hw || (D[key].loop ? 8.5 : 5.2);
        var ps = R.Map.polySpec(D[key].loop ? overpass(poly(key), hw) : poly(key), { hw: hw, lanes: D[key].loop ? 3 : 2, loop: !!D[key].loop });
        this.geom = ps.geom; b.geom = ps.geom;
        ps.build(b);
      },
      after: function (segs) { decorateCourse(segs, D[key].loop ? 'circuit' : 'touge', this.geom ? this.geom.hw : 4); }
    };
  }

  var NEW = {
    r_suzuka: ['suzuka', { name: { ja: '鈴鹿（国際レーシングコース）', en: 'Suzuka (International Course)' }, desc: { ja: '世界でも珍しい立体交差の 8 の字。S 字・デグナー・ヘアピン・スプーン・130R・シケイン。全長 5.8km。', en: 'The rare figure-8 with a crossover. Esses, Degner, Hairpin, Spoon, 130R. 5.8 km.' }, diff: 5, region: '三重' }],
    r_fuji: ['fuji', { name: { ja: '富士（スピードウェイ）', en: 'Fuji Speedway' }, desc: { ja: '1.5km のホームストレートと、テクニカルな最終セクター。富士山のふもと。', en: '1.5 km main straight and a technical last sector under Mt. Fuji.' }, diff: 4, region: '静岡' }],
    r_motegi: ['motegi', { name: { ja: 'もてぎ（ロードコース）', en: 'Motegi Road Course' }, desc: { ja: 'ストップ＆ゴーの多いブレーキングの戦い。', en: 'A stop-and-go braking battle.' }, diff: 4, region: '栃木' }],
    r_sugo: ['sugo', { name: { ja: 'SUGO（国際レーシングコース）', en: 'SUGO' }, desc: { ja: '高低差 70m。最終コーナーからの急な上り坂が名物。', en: '70 m of elevation and a famous uphill final corner.' }, diff: 4, region: '宮城' }],
    r_okayama: ['okayama', { name: { ja: '岡山（国際サーキット）', en: 'Okayama International' }, desc: { ja: '中低速コーナーが続く、抜きにくいコース。', en: 'Tight, twisty and hard to pass.' }, diff: 3, region: '岡山' }],
    r_tsukuba: ['tsukuba', { name: { ja: '筑波（サーキット 2000）', en: 'Tsukuba 2000' }, desc: { ja: 'タイムアタックの聖地。全長 2km の短い周回。', en: 'The home of time attack. A short 2 km lap.' }, diff: 2, region: '茨城' }],
    r_autopolis: ['autopolis', { name: { ja: 'オートポリス', en: 'Autopolis' }, desc: { ja: '阿蘇の山の上。下りと上りが激しい。', en: 'Up on the Aso mountains with big climbs and drops.' }, diff: 4, region: '大分' }],
    r_haruna: ['haruna', { name: { ja: '榛名山（伊香保〜榛名湖）', en: 'Mt. Haruna' }, desc: { ja: '伊香保温泉から榛名湖へ、連続するヘアピン。峠の聖地のモデル。', en: 'Hairpin after hairpin from Ikaho to Lake Haruna.' }, diff: 5, region: '群馬' }],
    r_usui: ['usui', { name: { ja: '碓氷峠（旧国道18号）', en: 'Usui Pass (old Rt.18)' }, desc: { ja: '184 のカーブが続く旧道。狭い道幅に要注意。', en: 'The old road with 184 curves. Narrow.' }, diff: 5, region: '群馬・長野' }],
    r_iroha: ['iroha', { name: { ja: '日光いろは坂', en: 'Nikko Irohazaka' }, desc: { ja: '48 のヘアピンで中禅寺湖へ上る。', en: '48 hairpins climbing to Lake Chuzenji.' }, diff: 4, region: '栃木' }],
    r_turnpike: ['turnpike', { name: { ja: '箱根ターンパイク', en: 'Hakone Turnpike' }, desc: { ja: '海から大観山まで一気に上る高速ワインディング。', en: 'A fast winding climb from the sea to Taikanzan.' }, diff: 4, region: '神奈川' }],
    r_tsubaki: ['tsubaki', { name: { ja: '椿ライン（湯河原〜大観山）', en: 'Tsubaki Line' }, desc: { ja: '湯河原から箱根へ。中低速コーナーの連続。', en: 'From Yugawara up to Hakone. Endless mid-speed corners.' }, diff: 5, region: '神奈川' }],
    r_akagi: ['akagi', { name: { ja: '赤城山（県道4号）', en: 'Mt. Akagi (Pref. Rt.4)' }, desc: { ja: '長い上りとヘアピン。夜の峠バトルの舞台。', en: 'A long climb with hairpins, a night-battle classic.' }, diff: 4, region: '群馬', night: false }],
    r_myogi: ['myogi', { name: { ja: '妙義山（県道196号）', en: 'Mt. Myogi' }, desc: { ja: '奇岩の山すそを縫う、細かいカーブ。', en: 'Tight curves around the rocky peaks.' }, diff: 4, region: '群馬' }]
  };
  Object.keys(NEW).forEach(function (id) { if (D[NEW[id][0]]) R.TRACKS[id] = courseSpec(NEW[id][0], NEW[id][1]); });

  /* ---------- 浜松の実在の公道コース（地図データを使う） ---------- */
  var HM = {
    hm_city: { name: { ja: '浜松市街地（駅前〜鍛冶町〜浜松城）', en: 'Hamamatsu City Streets' }, desc: { ja: '実際の街の通りを閉鎖して走る市街地コース。ビルの谷間を抜ける。', en: 'Closed-off real downtown streets between the buildings.' }, via: ['hm_eki', 'hm_kaji', 'hm_castle', 'hm_shizudai', 'hm_eki'], loop: true, diff: 3, hw: 7 },
    hm_bypass: { name: { ja: '浜名バイパス（国道1号 篠原→弁天島）', en: 'Hamana Bypass (Rt.1)' }, desc: { ja: '遠州灘沿いの高規格道路。浜名湖の橋まで全開。', en: 'A fast coastal bypass to the Lake Hamana bridges.' }, via: ['hm_shinohara', 'hm_benten'], diff: 2 },
    hm_oku: { name: { ja: '奥浜名湖 湖岸（舘山寺→気賀）', en: 'Oku-Hamanako Shore' }, desc: { ja: '浜名湖の奥を湖岸ぞいに。うなぎ屋と温泉街。', en: 'Along the inner lake shore past eel shops and onsen.' }, via: ['hm_kanzanji', 'hm_hosoe', 'hm_kiga'], diff: 3 },
    hm_tenryu: { name: { ja: '国道152号 天竜（二俣→春野）', en: 'Rt.152 Tenryu Gorge' }, desc: { ja: '天竜川の谷を上っていく山道。浜松の峠。', en: 'Up the Tenryu river gorge — Hamamatsu\'s own mountain pass.' }, via: ['hm_futamata', 'hm_haruno'], diff: 4, touge: true },
    hm_mikata: { name: { ja: '姫街道（浜松城→三方原→細江）', en: 'Hime-kaido' }, desc: { ja: '台地の上の古い街道。茶畑の中を走る。', en: 'The old highway across the tea-field plateau.' }, via: ['hm_castle', 'hm_mikatahara', 'hm_hosoe'], diff: 2 },
    hm_tomei: { name: { ja: '東名高速（浜松IC→浜松西IC）', en: 'Tomei Expressway (Hamamatsu)' }, desc: { ja: '実際の東名高速。追い越し車線で一気に。', en: 'The real Tomei — floor it in the passing lane.' }, via: ['hm_ic', 'hm_nishi_ic'], diff: 2, hwy: true }
  };
  function hmPolyline(o) {
    var M = R.Map, PL = R.worldPlaces(), pts = [], sts = [];
    for (var k = 0; k + 1 < o.via.length; k++) {
      var a = PL[o.via[k]], b = PL[o.via[k + 1]];
      if (!a || !b) continue;
      var rt = M.route(a.node, b.node, !o.hwy);
      if (!rt) continue;
      rt.hs.forEach(function (h) {
        var p = M.pts(h), e = M.edgeOf(h);
        for (var i = pts.length ? 1 : 0; i < p.length / 3; i++) {
          // 来た道をそのまま引き返す点（U ターン）は、戻る分を取り除く
          var m = pts.length;
          if (m >= 6 && Math.hypot(p[i * 3] - pts[m - 6], p[i * 3 + 1] - pts[m - 5]) < 1) { pts.length = m - 3; sts.length = Math.max(0, sts.length - 1); continue; }
          pts.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); if (pts.length > 3) sts.push(e.st[Math.min(e.st.length - 1, h & 1 ? e.st.length - i : i - 1)] || 0);
        }
      });
    }
    if (o.loop) {   // 一周の継ぎ目の U ターンも取り除く
      while (pts.length > 12 && Math.hypot(pts[3] - pts[pts.length - 6], pts[4] - pts[pts.length - 5]) < 1) { pts.splice(0, 3); pts.length -= 3; sts.shift(); sts.pop(); }
    }
    // 長すぎる公道は途中まで（ゲームとして 6〜9km）
    var maxLen = o.maxLen || 8500, L = 0, cut = pts.length / 3;
    for (var q = 1; q < pts.length / 3; q++) { L += Math.hypot(pts[q * 3] - pts[q * 3 - 3], pts[q * 3 + 1] - pts[q * 3 - 2]); if (L > maxLen && !o.loop) { cut = q + 1; break; } }
    return { p: new Float32Array(pts.slice(0, cut * 3)), st: new Uint8Array(sts.slice(0, cut - 1)) };
  }
  Object.keys(HM).forEach(function (id) {
    var o = HM[id];
    R.TRACKS[id] = {
      name: o.name, desc: o.desc, diff: o.diff, laps: o.loop ? 3 : 1, weather: 'clear', deco: [], custom: true, real: true, needsMap: true,
      loop: !!o.loop, p2p: !o.loop, touge: !!o.touge, region: '浜松', hwy: !!o.hwy,
      pal: (R.Map.PALS || {})[o.hwy ? 'hwy' : o.touge ? 'mount' : 'city'] || PAL_TOUGE,
      build: function (b) {
        var M = R.Map;
        if (!M.ready) {   // 地図がまだ: 仮の道（メニューの見本用）
          b.straight(80); this.geom = null; return;
        }
        var hp = hmPolyline(o), hw = o.hw || (o.hwy ? 7.5 : 6.2);
        var line = M.lineOf(hp.p, hp.st, 0, !!o.loop);
        var y0 = line.y[0];
        this.geom = { rw: Math.max(2000, Math.round(hw * M.UNITS * 2)), cw: 0.9 / hw, lanes: o.hwy ? 2 : 2, hw: hw };
        M.pushSegs(b, line, y0);
      },
      after: function (segs) { if (R.Map.ready && segs[0] && segs[0].wp) R.Map.decorate(segs, this.geom ? this.geom.hw : 4, { cls: this.hwy ? 0 : 2, hwy: this.hwy }); }
    };
  });

  // 一覧に加える（実在コースは別の区分）
  R.REAL_CIRCUITS = ['r_suzuka', 'r_fuji', 'r_motegi', 'r_sugo', 'r_okayama', 'r_tsukuba', 'r_autopolis'].filter(function (id) { return R.TRACKS[id]; });
  R.REAL_TOUGE = ['r_haruna', 'r_usui', 'r_iroha', 'r_turnpike', 'r_tsubaki', 'r_akagi', 'r_myogi'].filter(function (id) { return R.TRACKS[id]; });
  R.REAL_ROADS = Object.keys(HM);
  R.ORDER = R.ORDER.concat(R.REAL_CIRCUITS, R.REAL_ROADS);
  R.TOUGE = R.TOUGE.concat(R.REAL_TOUGE);
  R.ALL_TRACKS = R.ORDER.concat(R.TOUGE);
  R.needsMap = function (id) { var t = typeof id === 'string' ? R.TRACKS[id] : id; return !!(t && t.needsMap); };
})();
