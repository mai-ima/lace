/*
 * race-engine.js — TENRYU RACING の心臓部。走らせる・描く。
 *
 *   R.Session(cfg)    … 1 回のレース（物理・敵の頭脳・各モードの決まり）
 *     .update(dt) / .render(g) … GUI（Canvas）で描く
 *   R.drawCar / R.drawPortrait / R.drawPreview … メニューでも使う絵
 *
 * 描き方は昔ながらの「道路を区間に切り、奥から手前へ台形を投影する」方式。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var R = TB.Race;
  var U = R.util;
  var L = U.L, clamp = U.clamp, lerp = U.lerp, sfx = U.sfx, fmt = U.fmt;

  function easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); }
  function easeInOut(a, b, p) { return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); }

  /* ---------- 定数 ------------------------------------------------------ */

  var SEG = 200;             // 1 区間の長さ
  var RUMBLE = 3;            // 縁石の縞の長さ（区間数）
  var ROAD_W = 2000;         // 道幅の半分
  var LANES = 3;
  var CAM_H = 1000;
  var DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);   // 視野角 100 度
  var DRAW = 220;            // 何区間先まで描くか
  var MAX = SEG * 60;        // 基準の最高速（1 秒に 60 区間）
  var CENTRIFUGAL = 0.3;
  var PLAYER_Z = CAM_H * DEPTH;   // カメラから自車までの距離
  var CAR_W = 0.13;          // 車幅の半分（道幅の半分に対する比）
  var OVERLAP = CAR_W * 2 * 0.9;
  var TUNNEL_H = 2600;
  var MPS = 280 / 3.6 / 60;
  var UNITS_M = SEG / 1.296;  // 1 m（エンジンの単位）
  var BRAKE = MAX * 0.6, COAST = MAX / 8;   // ブレーキ・エンジンブレーキの減速  // 1 区間は約 1.3 m（最高速 280km/h で 1 秒 60 区間）
  var W = 640, H = 360;      // 今描いている画面の大きさ（描く前に設定する）

  R.SEG = SEG; R.MAX = MAX;

  /* =====================================================================
     コースを組み立てる
     ===================================================================== */

  function builder() {
    var segs = [];
    function lastY() { return segs.length ? segs[segs.length - 1].p2.world.y : 0; }
    function add(curve, y) {
      var n = segs.length;
      segs.push({
        index: n, curve: curve, sprites: [], objs: [],
        p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} },
        p2: { world: { y: y, z: (n + 1) * SEG }, camera: {}, screen: {} }
      });
    }
    function road(enter, hold, leave, curve, hill) {
      var startY = lastY(), endY = startY + (hill || 0) * SEG, total = enter + hold + leave, i;
      for (i = 0; i < enter; i++) add(easeIn(0, curve, i / enter), easeInOut(startY, endY, i / total));
      for (i = 0; i < hold; i++) add(curve, easeInOut(startY, endY, (enter + i) / total));
      for (i = 0; i < leave; i++) add(easeInOut(curve, 0, i / leave), easeInOut(startY, endY, (enter + hold + i) / total));
    }
    var b = {
      segs: segs,
      add: add,
      road: road,
      straight: function (n) { road(n, n, n, 0, 0); },
      curve: function (n, c, h) { road(n, n, n, c, h || 0); },
      hill: function (n, h) { road(n, n, n, 0, h); },
      bumps: function () {
        road(10, 10, 10, 0, 5); road(10, 10, 10, 0, -2); road(10, 10, 10, 0, -5);
        road(10, 10, 10, 0, 8); road(10, 10, 10, 0, 5); road(10, 10, 10, 0, -7);
      },
      sCurves: function (c) {
        road(30, 30, 30, -c, 0); road(30, 30, 30, c, 10); road(30, 30, 30, c, 0);
        road(30, 30, 30, -c, 0); road(30, 30, 30, -c, -10);
      },
      tunnel: function (fn) {
        var from = segs.length;
        fn();
        for (var i = from; i < segs.length; i++) segs[i].tunnel = true;
      },
      finish: function () { road(60, 40, 60, 0, -lastY() / SEG); }
    };
    return b;
  }

  // 同じコースでは毎回同じ場所に飾りが並ぶよう、決まった乱数を使う
  function seeded(seed) {
    var s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
  }

  function shade(hex, f) {
    if (hex.charAt(0) !== '#') return hex;
    var n = parseInt(hex.length === 4 ? hex.replace(/#(.)(.)(.)/, '$1$1$2$2$3$3') : hex.slice(1), 16);
    var r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
    var gg = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
    var b = clamp(Math.round((n & 255) * f), 0, 255);
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }
  function mix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var r = Math.round(((x >> 16) & 255) * (1 - t) + ((y >> 16) & 255) * t), gg = Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t), bb = Math.round((x & 255) * (1 - t) + (y & 255) * t);
    return '#' + ((1 << 24) + (r << 16) + (gg << 8) + bb).toString(16).slice(1);
  }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /**
   * コースの中心線（上から見た形, m）。3D 表示とミニマップで同じものを使う。
   *   実在のコース: 地図の座標そのもの（wp）
   *   それ以外: カーブを積み上げ、一周コースは一周で閉じるよう補正
   * 向き h: 前 = (sin h, cos h)、右カーブで h が減る。
   */
  R.trackPath = function (segs, spec, mirror) {
    var n = segs.length, M_SEG = 1.3, Y_SCALE = 0.35;
    var hx = new Float64Array(n + 1), px = new Float64Array(n + 1), pz = new Float64Array(n + 1), py = new Float64Array(n + 1);
    var loop = !(spec.touge || spec.p2p || spec.noFinish || spec.stopZone || spec.finishAt) || !!spec.loop;
    if (segs[0] && segs[0].wp) {
      for (var q = 0; q < n; q++) { var w = segs[q].wp; hx[q] = w.h; px[q] = w.x; pz[q] = w.z; py[q] = w.y; }
      var wl = segs[n - 1].wp;
      if (spec.loop) { hx[n] = hx[0] + Math.round((hx[n - 1] - hx[0]) / (2 * Math.PI)) * 2 * Math.PI; px[n] = px[0]; pz[n] = pz[0]; py[n] = py[0]; }
      else { hx[n] = wl.h; px[n] = wl.x + Math.sin(wl.h) * M_SEG; pz[n] = wl.z + Math.cos(wl.h) * M_SEG; py[n] = wl.y; }
      return { n: n, loop: !!spec.loop, h: hx, x: px, z: pz, y: py, real: true };
    }
    // カーブの値をそのまま向きの変化にして積み上げる（実在コースの CURVE_K と同じ換算）。
    // 一周コースは fitLoop が先にカーブを補正して閉じているので、ここでは何も足さない。
    for (var i0 = 0; i0 <= n; i0++) py[i0] = (i0 < n ? segs[i0].p1.world.y : segs[n - 1].p2.world.y) / 200 * M_SEG * Y_SCALE;
    var h = 0, x = 0, z = 0;
    for (var i = 0; i <= n; i++) {
      hx[i] = h; px[i] = x; pz[i] = z;
      if (i < n) { h -= segs[i].curve * CURVE_TURN; x += Math.sin(h) * M_SEG; z += Math.cos(h) * M_SEG; }
    }
    if (loop) py[n] = py[0];
    return { n: n, loop: loop, h: hx, x: px, z: pz, y: py };
  };

  /**
   * 一周コースのカーブを、「一周でぴったり元の場所・向きに戻る」ように少しだけ補正する。
   * 道のカーブ（見た目・物理）と、ミニマップ・3D の形が同じ計算から出るので、形も角度も一致する。
   * 補正は、まっすぐな所ほど多く、きついカーブの所はほとんど触らない。
   * 位置・向きの 3 つの条件を、ゆるやかな波（0〜H 次）の最小の変更で満たす。
   */
  var CURVE_TURN = 1 / 232;   // カーブ 1 あたりの向きの変化（ラジアン/区間）
  function fitLoop(segs, spec) {
    var n = segs.length, K = CURVE_TURN, MS = 1.3, c0 = new Float64Array(n), tot = 0, i;
    for (i = 0; i < n; i++) { c0[i] = segs[i].curve; tot += c0[i]; }
    if (!spec.fitCache || spec.fitCache.n !== n) {
      var hw = spec.geom && spec.geom.hw ? spec.geom.hw : (spec.touge || spec.narrow ? 1350 : 2000) / 154;
      var s0 = tot < 0 ? -1 : 1, best = null;
      var tries = [[1.5, 1, s0], [1.5, 2, s0], [0.7, 2, s0], [1.5, 3, s0], [3, 3, s0], [1.5, 1, -s0], [1.5, 2, -s0], [0.7, 3, -s0], [1.5, 4, s0], [3, 4, s0], [0.7, 4, -s0], [0, 6, s0]];
      // 条件を満たす補正の中で、道に足す「うねり」がいちばん少ないものを選ぶ（なめらかな道を保つ）
      for (var ti = 0; ti < tries.length; ti++) {
        var r = solve(tries[ti][0], tries[ti][1], tries[ti][2]);
        if (!r || r.err > 0.5) continue;
        r.clear = clearance(r.x, r.z, hw);
        var ww = weights(r.wexp), rough = 0, pv = 0;
        for (i = 0; i < n; i++) { var dv = ww[i] * (corrected(r.th, r.H, ww, i) - c0[i]) / (ww[i] || 1); var cc = corrected(r.th, r.H, ww, i) - c0[i]; rough += Math.abs(cc - pv); pv = cc; }
        r.rough = rough;
        var ok = r.clear >= hw * 5;
        if (!best || (ok && !best.ok) || (ok === best.ok && (ok ? r.rough < best.rough : r.clear > best.clear))) { best = r; best.ok = ok; }
      }
      spec.fitCache = { n: n, th: best ? best.th : null, wexp: best ? best.wexp : 1.5, H: best ? best.H : 4 };
    }
    var fc = spec.fitCache;
    if (!fc.th) return;
    var w = weights(fc.wexp);
    for (i = 0; i < n; i++) segs[i].curve = corrected(fc.th, fc.H, w, i);

    function weights(wexp) { var a = new Float64Array(n); for (var k = 0; k < n; k++) a[k] = 1 / (1 + Math.abs(c0[k]) * wexp); return a; }
    function corrected(th, H, w, k) {
      var ph = 2 * Math.PI * k / n, v = th[0];
      for (var h = 1; h <= H; h++) v += th[2 * h - 1] * Math.cos(h * ph) + th[2 * h] * Math.sin(h * ph);
      return c0[k] + w[k] * v;
    }
    function integ(th, H, w) {
      var x = new Float64Array(n + 1), z = new Float64Array(n + 1), hd = 0;
      for (var k = 0; k < n; k++) { hd -= corrected(th, H, w, k) * K; x[k + 1] = x[k] + Math.sin(hd) * MS; z[k + 1] = z[k] + Math.cos(hd) * MS; }
      return { x: x, z: z, h: hd };
    }
    function solve(wexp, H, sgn) {
      var w = weights(wexp), m = 2 * H + 1, th = new Float64Array(m), sw = 0, k;
      for (k = 0; k < n; k++) sw += w[k];
      th[0] = (2 * Math.PI * sgn / K - tot) / sw;
      var hTarget = -2 * Math.PI * sgn, err = 1e9, res;
      for (var it = 0; it < 60; it++) {
        res = integ(th, H, w);
        var e = [res.x[n], res.z[n], (res.h - hTarget) * 60];
        err = Math.hypot(e[0], e[1]);
        if (err < 0.05 && Math.abs(res.h - hTarget) < 0.002) break;
        var J = [[], [], []];
        for (k = 0; k < m; k++) {
          var t2 = Float64Array.from(th); t2[k] += 0.01; var r2 = integ(t2, H, w);
          J[0].push((r2.x[n] - res.x[n]) / 0.01); J[1].push((r2.z[n] - res.z[n]) / 0.01); J[2].push(((r2.h - hTarget) * 60 - e[2]) / 0.01);
        }
        // 最小ノルム解 dθ = -Jᵀ (J Jᵀ)⁻¹ e
        var A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], a, b2, c;
        for (a = 0; a < 3; a++) for (b2 = 0; b2 < 3; b2++) { var sum = 0; for (c = 0; c < m; c++) sum += J[a][c] * J[b2][c]; A[a][b2] = sum + (a === b2 ? 1e-6 : 0); }
        var y = solve3(A, e);
        if (!y) break;
        var d = new Float64Array(m), dn = 0;
        for (c = 0; c < m; c++) { d[c] = -(J[0][c] * y[0] + J[1][c] * y[1] + J[2][c] * y[2]); dn = Math.max(dn, Math.abs(d[c])); }
        var damp = dn > 1.5 ? 1.5 / dn : 1;
        for (c = 0; c < m; c++) th[c] += damp * d[c];
      }
      res = integ(th, H, w);
      return { th: th, wexp: wexp, H: H, x: res.x, z: res.z, err: Math.hypot(res.x[n], res.z[n]) + Math.abs(res.h - hTarget) * 30 };
    }
    function solve3(A, e) {
      var M = [A[0].concat(e[0]), A[1].concat(e[1]), A[2].concat(e[2])], r, c, k;
      for (c = 0; c < 3; c++) {
        var piv = c; for (r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        if (Math.abs(M[piv][c]) < 1e-12) return null;
        var t = M[c]; M[c] = M[piv]; M[piv] = t;
        for (r = 0; r < 3; r++) if (r !== c) { var f = M[r][c] / M[c][c]; for (k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
      }
      return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
    }
    function clearance(x, z, hw) {   // 離れた区間どうしの最短距離（m）
      var m = 1e9, st = 4;
      for (var a = 0; a < n; a += st) for (var b3 = a + 1; b3 < n; b3 += st) {
        var di = Math.min(b3 - a, n - (b3 - a)); if (di < 90) continue;
        var dx = x[a] - x[b3], dz = z[a] - z[b3]; if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
        var dd = Math.hypot(dx, dz); if (dd < m) m = dd;
      }
      return m;
    }
  }

  // 実在の峠・サーキットは曲がりが急で、自動運転ではライバルより遅くなりすぎる。ライバルの上限速度をコースごとにそろえる（測定値）
  var AI_TRACK_SCALE = {"r_suzuka": 0.87, "r_fuji": 0.84, "r_motegi": 0.84, "r_sugo": 0.84, "r_okayama": 0.81, "r_tsukuba": 0.72, "r_autopolis": 0.84, "r_haruna": 0.77, "r_usui": 0.58, "r_iroha": 0.62, "r_turnpike": 0.88, "r_tsubaki": 0.59, "r_akagi": 0.62, "r_myogi": 0.6, "hm_city": 0.88, "hm_bypass": 0.88, "hm_oku": 0.88, "hm_tenryu": 0.88, "hm_mikata": 0.88, "hm_tomei": 0.88};
  function buildTrack(id, mirror, weather) {
    var spec = typeof id === 'string' ? R.TRACKS[id] : id;
    id = spec.id || (typeof id === 'string' ? id : 'custom');
    var b = builder();
    for (var rp = 0; rp < (spec.reps || 1); rp++) spec.build(b);
    var segs = b.segs, pal = spec.pal, wet = weather === 'rain' || weather === 'snow';
    var rand = seeded(id.length * 7919 + id.charCodeAt(0) * 131 + id.charCodeAt(1));

    if (spec.custom && spec.after) spec.after(segs);
    if (!spec.custom && !(segs[0] && segs[0].wp) && (!(spec.touge || spec.p2p || spec.noFinish || spec.stopZone || spec.finishAt) || spec.loop)) fitLoop(segs, spec);
    var GR = R.Map && R.Map.GROUND;
    segs.forEach(function (s, i) {
      if (mirror) { s.curve = -s.curve; if (s.phys !== undefined) s.phys = -s.phys; if (s.wp) { s.wp = { x: -s.wp.x, z: s.wp.z, y: s.wp.y, h: -s.wp.h }; } }
      // 上り坂は明るく、下り坂は暗く
      var slope = (s.p2.world.y - s.p1.world.y) / SEG;
      var f = clamp(1 + slope * (spec.custom ? 2.2 : 0.9), 0.8, 1.16);
      var alt = Math.floor(i / RUMBLE) % 2;
      s.alt = alt;
      s.cGrass = s.tunnel ? shade(pal.wall || '#333', alt ? 0.9 : 0.8) : shade(pal.grass[alt], f);
      s.cRoad = shade(pal.road[alt], f * (s.tunnel ? 0.8 : 1) * (wet ? 0.84 : 1));
      s.cRumble = spec.curbs ? shade(pal.rumble[alt], f) : shade(pal.road[0], f * (alt ? 1.18 : 1.14));
      if (!spec.custom) s.rails = !!spec.rails;
      else if (!s.tunnel && !spec.curbs) {
        // 実在の道: 両側の地面の色・歩道
        var fa = f * (Math.floor(i / 6) % 2 ? 1 : 0.965);
        if (GR && s.luL !== undefined) { s.cGrassL = shade(GR[s.luL] || pal.grass[0], fa); s.cGrassR = shade(GR[s.luR] || pal.grass[0], fa); }
        if (s.urban && !spec.hwy) { s.cRumble = shade(alt ? '#a8a59d' : '#a19e96', f); s.rumW = 2.6 / ((spec.geom && spec.geom.hw) || 4); s.curb = true; }
        else { s.cRumble = shade(alt ? '#8f9086' : '#88897f', f); if (s.rumW === undefined) s.rumW = 1.0 / ((spec.geom && spec.geom.hw) || 4); }
      }
    });

    // 路肩の飾り。カーブの外側には矢印看板
    for (var i = 20; i < (spec.custom ? 0 : segs.length - 5); i++) {
      var seg = segs[i];
      if (seg.tunnel) { if (i % 6 === 0) seg.sprites.push({ kind: 'tlight', offset: 0 }); continue; }
      if (Math.abs(seg.curve) > 2.5 && i % 12 === 0) {
        var out = seg.curve > 0 ? -1 : 1;
        seg.sprites.push({ kind: 'chevron', offset: out * 1.35, dir: seg.curve > 0 ? 1 : -1 });
      } else if (i % 9 === 0 || i % 14 === 0) {
        var kind = spec.deco[(i * 7) % spec.deco.length];
        var side = (i % 2 ? 1 : -1);
        if (spec.water) side = spec.water === 'left' ? 1 : -1;
        var big = kind === 'building' || kind === 'mesa' || kind === 'grandstand' || kind === 'crane';
        var off = side * (big ? 2.4 + (i % 3) * 0.5 : 1.35 + (i % 5) * 0.28);
        seg.sprites.push({ kind: kind, offset: off, seed: i });
      }
      // 奥の列にも木や建物を置いて、沿道がさびしく見えないようにする
      if (i % 7 === 3 && !seg.sprites.length) {
        var kind2 = spec.deco[(i * 13 + 5) % spec.deco.length], big2 = kind2 === 'building' || kind2 === 'mesa' || kind2 === 'grandstand' || kind2 === 'crane';
        var side3 = spec.water ? (spec.water === 'left' ? 1 : -1) : (i % 2 ? -1 : 1);
        seg.sprites.push({ kind: kind2, offset: side3 * (big2 ? 3.6 + (i % 4) * 0.6 : 2.2 + (i % 4) * 0.5), seed: i + 3 });
      }
      if (spec.neon && i % 30 === 0) seg.sprites.push({ kind: 'arch', offset: 0 });
    }

    // 道の上の障害物・加速パネル
    var hz = spec.hazards || {};
    function place(kind, n) {
      var span = Math.max(20, segs.length - 140);
      for (var k = 0; k < n; k++) {
        var at = 70 + Math.floor(span * (k + rand() * 0.6) / n);
        var sg = segs[at];
        if (!sg || sg.tunnel) continue;
        if (kind === 'cone') {
          var o = (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.4);
          for (var c = 0; c < 3; c++) segs[at + c * 2].objs.push({ kind: 'cone', offset: o + c * 0.08 * (o > 0 ? -1 : 1) });
        } else if (kind === 'coin') {
          var lane = [-0.6, 0, 0.6][Math.floor(rand() * 3)];
          for (var c2 = 0; c2 < 5; c2++) if (segs[at + c2 * 3]) segs[at + c2 * 3].objs.push({ kind: 'coin', offset: lane });
        } else if (kind === 'pad') {
          sg.objs.push({ kind: 'pad', offset: [-0.55, 0, 0.55][Math.floor(rand() * 3)] });
        } else {
          sg.objs.push({ kind: kind, offset: (rand() - 0.5) * 1.4 });
        }
      }
    }
    Object.keys(hz).forEach(function (k) { place(k, hz[k]); });

    // 名所（ランドマーク）
    (spec.landmarks || []).forEach(function (m, j, arr) {
      var at = Math.floor(segs.length * (j + 0.6) / (arr.length + 0.5));
      var side2 = spec.water === 'left' ? 1 : spec.water === 'right' ? -1 : (j % 2 ? 1 : -1);
      if (segs[at] && !segs[at].tunnel) segs[at].sprites.push({ kind: m, offset: side2 * (m === 'torii' ? 1.5 : 3.2), seed: j + 3 });
    });
    if (spec.endMark && segs.length > 260) segs[segs.length - 230].sprites.push({ kind: spec.endMark, offset: spec.water === 'left' ? 3.2 : -3.2, seed: 7 });
    if (spec.startMark && segs[10]) segs[10].sprites.push({ kind: spec.startMark, offset: spec.water === 'left' ? 3 : -3, seed: 5 });
    if (spec.banner && segs[5]) segs[5].sprites.push({ kind: 'banner', offset: 0, text: spec.banner });
    var nS = segs.length;
    if (spec.fork && !spec.custom) segs[Math.max(0, nS - 70)].sprites.push({ kind: 'fork', offset: 0, texts: spec.fork });
    if (spec.fork) segs[Math.max(0, nS - (spec.custom ? Math.min(90, Math.floor(nS * 0.55)) : 140))].sprites.push({ kind: 'fork', offset: 0, texts: spec.fork, blue: !!spec.custom });
    if (spec.junction) {
      var jl = nS;
      if (spec.custom) {
        // 実在の交差点: 区間の終わり = 交差点の中心
        var jw = Math.max(6, Math.round((spec.junction.w || 12) / 1.3));
        var stp = Math.max(2, jl - jw - 3);
        segs[stp].crosswalk = segs[stp + 1].crosswalk = true; segs[stp - 1].stopLine = true;
        for (var jc = stp + 2; jc < jl; jc++) segs[jc].cross = true;
        if (spec.junction.signal) segs[stp - 1].sprites.push({ kind: 'signal', offset: 1.18, city: true });
        spec.stopSeg = stp - 1; spec.crossSeg = Math.min(jl - 2, stp + 2 + Math.floor(jw / 2));
      } else {
        segs[jl - 41].crosswalk = segs[jl - 40].crosswalk = true;
        segs[jl - 40].stopLine = true;
        for (var jc2 = jl - 38; jc2 < jl - 30; jc2++) segs[jc2].cross = true;
        if (spec.junction.signal) segs[jl - 40].sprites.push({ kind: 'signal', offset: 1.25 });
        spec.stopSeg = jl - 40; spec.crossSeg = jl - 34;
      }
    }
    if (spec.limit && segs[25] && !spec.custom) { segs[25].sprites.push({ kind: 'limitsign', offset: -1.3, n: spec.limit }); if (segs.length > 900) segs[Math.floor(segs.length / 2)].sprites.push({ kind: 'limitsign', offset: -1.3, n: spec.limit }); }
    if (spec.orbis && segs.length > 600 && !(spec.custom && spec.hwy === false)) { segs[Math.floor(segs.length * 0.55)].sprites.push({ kind: 'orbis', offset: 0 }); spec.orbisSeg = Math.floor(segs.length * 0.55); }
    if (spec.stopZone) for (var z = spec.stopZone[0]; z <= spec.stopZone[1]; z++) segs[z].stopZone = true;
    if ((spec.touge || spec.p2p) && !spec.finishAt) spec.finishAt = segs.length - 150;
    if (spec.finishAt) { segs[spec.finishAt].finishLine = true; segs[spec.finishAt].sprites.push({ kind: 'gantry', offset: 0 }); }
    if (!spec.noFinish && !spec.touge && !spec.p2p) {
      segs[2].sprites.push({ kind: 'gantry', offset: 0 });
      for (var k = 0; k < 3; k++) segs[k].finishLine = true;
    }

    // ミニマップ用の道筋（実在の道は本当の形。それ以外は一周でちょうど 360 度回るよう補正）
    if (segs[0] && segs[0].wp) {
      var mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      segs.forEach(function (s) { mnx = Math.min(mnx, s.wp.x); mxx = Math.max(mxx, s.wp.x); mnz = Math.min(mnz, s.wp.z); mxz = Math.max(mxz, s.wp.z); });
      var sc0 = 1 / Math.max(1, mxx - mnx, mxz - mnz), ox0 = (1 - (mxx - mnx) * sc0) / 2, oz0 = (1 - (mxz - mnz) * sc0) / 2;
      var map0 = segs.map(function (s) { return [(s.wp.x - mnx) * sc0 + ox0, (s.wp.z - mnz) * sc0 + oz0]; });
      if (!spec.custom) segs.forEach(function (s) { s.waterSide = spec.water || null; });
      return { id: id, spec: spec, pal: pal, segs: segs, length: segs.length * SEG, map: map0, path: R.trackPath(segs, spec, mirror) };
    }
    // コースの形（3D と同じ計算）。一周のコースは一周で元の場所に戻るよう、ずれを少しずつ配る
    var path = R.trackPath(segs, spec, mirror);
    var mnx2 = Infinity, mxx2 = -Infinity, mnz2 = Infinity, mxz2 = -Infinity;
    for (var q = 0; q <= path.n; q++) { mnx2 = Math.min(mnx2, path.x[q]); mxx2 = Math.max(mxx2, path.x[q]); mnz2 = Math.min(mnz2, path.z[q]); mxz2 = Math.max(mxz2, path.z[q]); }
    var sc2 = 1 / Math.max(1, mxx2 - mnx2, mxz2 - mnz2), ox2 = (1 - (mxx2 - mnx2) * sc2) / 2, oz2 = (1 - (mxz2 - mnz2) * sc2) / 2;
    var map = [];
    for (q = 0; q < path.n; q++) map.push([(path.x[q] - mnx2) * sc2 + ox2, (path.z[q] - mnz2) * sc2 + oz2]);
    segs.forEach(function (s) { s.waterSide = spec.water || null; });
    return { id: id, spec: spec, pal: pal, segs: segs, length: segs.length * SEG, map: map, path: path };
  }
  R.buildTrack = buildTrack;

  /* 管理者モード: 保存されない一時的な設定（ページを閉じる・初期値に戻す、で消える） */
  R.adminDefaults = function () {
    return { speed: 1, accel: 1, grip: 1, rival: 1, traffic: 1, time: 1, nitro: false, god: false, auto: false, laps: 0, weather: 'default', unlockAll: false };
  };
  R.admin = R.admin || { on: false, v: R.adminDefaults() };
  /** 初期値から変えてある項目の短い説明（ゲーム中の表示用） */
  R.adminSummary = function () {
    var a = R.admin, d = R.adminDefaults(), out = [];
    if (!a || !a.on) return out;
    [['speed', '最高速 ×'], ['accel', '加速 ×'], ['grip', '操作性 ×'], ['rival', 'ライバル ×'], ['traffic', '一般車 ×'], ['time', '制限時間 ×']].forEach(function (k) { if (a.v[k[0]] !== d[k[0]]) out.push(k[1] + a.v[k[0]]); });
    if (a.v.nitro) out.push('ニトロ無限');
    if (a.v.god) out.push('無敵');
    if (a.v.auto) out.push('自動運転');
    if (a.v.laps) out.push('周回 ' + a.v.laps);
    if (a.v.weather !== 'default') out.push('天気 ' + a.v.weather);
    return out;
  };

  /* =====================================================================
     描画の部品（GUI）
     ===================================================================== */

  function project(p, camX, camY, camZ) {
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camZ;
    p.screen.scale = DEPTH / p.camera.z;
    p.screen.x = Math.round((W / 2) + (p.screen.scale * p.camera.x * W / 2));
    p.screen.y = Math.round((H / 2) - (p.screen.scale * p.camera.y * H / 2));
    p.screen.w = Math.round(p.screen.scale * ROAD_W * W / 2);
  }

  function poly(g, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4);
    g.closePath();
    g.fill();
  }
  function circle(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); g.fill(); }

  /* ---------- 車（後ろから見た姿） ---------- */

  var BODIES = {
    kei: { h: 0.7, body: 0.52, cab: [0.4, 0.34], top: 0.96, round: 1 },
    hatch: { h: 0.64, body: 0.58, cab: [0.4, 0.3], top: 0.97 },
    sedan: { h: 0.56, body: 0.64, cab: [0.34, 0.26], top: 0.98 },
    rally: { h: 0.66, body: 0.6, cab: [0.38, 0.3], top: 0.94, rack: 1, flaps: 1, wing: 0.06 },
    muscle: { h: 0.52, body: 0.62, cab: [0.32, 0.24], top: 0.98, stripes: 1, wide: 1.04 },
    gt: { h: 0.5, body: 0.62, cab: [0.32, 0.22], top: 0.96, wing: 0.12 },
    ae86: { h: 0.62, body: 0.58, cab: [0.4, 0.33], top: 0.95, panda: 1 },
    s13: { h: 0.52, body: 0.62, cab: [0.33, 0.24], top: 0.96 },
    fc: { h: 0.5, body: 0.6, cab: [0.34, 0.22], top: 0.95, lamps: 'bar', wing: 0.05 },
    fd: { h: 0.47, body: 0.6, cab: [0.3, 0.18], top: 0.96, lamps: 'round2', wing: 0.06 },
    r32: { h: 0.52, body: 0.62, cab: [0.33, 0.25], top: 0.97, lamps: 'quad', wing: 0.05 },
    gc8: { h: 0.56, body: 0.64, cab: [0.34, 0.26], top: 0.98, wing: 0.12 },
    evo: { h: 0.56, body: 0.64, cab: [0.34, 0.26], top: 0.98, wing: 0.2 },
    zn8: { h: 0.5, body: 0.62, cab: [0.32, 0.2], top: 0.96, wing: 0.04 },
    rr: { h: 0.46, body: 0.6, cab: [0.3, 0.16], top: 0.98, strip: 1, wing: 0.08, wide: 1.04 },
    wedge: { h: 0.38, body: 0.62, cab: [0.26, 0.14], top: 0.98, strip: 1, wing: 0.1, wide: 1.08 },
    classic: { h: 0.5, body: 0.6, cab: [0.3, 0.2], top: 0.96, lamps: 'round2', chrome: 1 },
    suv: { h: 0.72, body: 0.56, cab: [0.44, 0.4], top: 0.96, spare: 1 },
    minivan: { h: 0.78, body: 0.5, cab: [0.46, 0.42], top: 0.97 },
    ev: { h: 0.6, body: 0.6, cab: [0.38, 0.3], top: 0.96, strip: 1 },
    pickup: { h: 0.7, body: 0.62, cab: [0.36, 0.3], top: 0.97, bed: 1 },
    keitra: { h: 0.7, body: 0.5, cab: [0.36, 0.32], top: 0.94, bed: 1, round: 1 },
    kart: { h: 0.5, kart: 1 },
    buggy: { h: 0.62, buggy: 1 },
    tractor: { h: 0.8, tractor: 1 },
    monster: { h: 1.0, monster: 1, wm: 1.15 },
    trike: { h: 0.7, body: 0.55, cab: [0.3, 0.26], top: 0.95, round: 1 },
    limo: { h: 0.52, body: 0.64, cab: [0.34, 0.26], top: 0.97, chrome: 1 },
    train: { h: 1.0, box: 1, wm: 1.12, windows: 1, train: 1 },
    ambulance: { h: 0.8, box: 1, wm: 1.0, cross: 1, bar: 1 },
    fire: { h: 0.85, box: 1, wm: 1.05, ladder: 1, bar: 1 },
    camper: { h: 0.85, box: 1, wm: 1.05, windows: 1, spare: 1 },
    taxi: { h: 0.58, body: 0.62, cab: [0.34, 0.26], top: 0.94, taxi: 1 },
    police: { h: 0.58, body: 0.62, cab: [0.34, 0.26], top: 0.94, bar: 1 },
    super: { h: 0.42, body: 0.62, cab: [0.3, 0.18], top: 0.98, wing: 0.16, wide: 1.06, strip: 1 },
    formula: { h: 0.46, open: 1, wide: 1.02 },
    proto: { h: 0.46, body: 0.62, cab: [0.26, 0.16], top: 0.98, wing: 0.2, fin: 1, strip: 1, wide: 1.05 },
    van: { h: 0.8, box: 1, wm: 1.0 },
    truck: { h: 0.9, box: 1, wm: 1.05, ribs: 1 },
    bus: { h: 0.95, box: 1, wm: 1.1, windows: 1 }
  };
  R.BODIES = BODIES;
  function bodyWm(body) { var B = BODIES[body] || BODIES.sedan; return (B.wm || 1) * (B.wide || 1); }

  function drawCar(g, x, y, w, color, body, opt) {
    opt = opt || {};
    var B = BODIES[body] || BODIES.sedan;
    w *= (B.wide || 1) * (B.wm || 1);
    var h = w * B.h, lean = (opt.lean || 0) * w * 0.05;
    var dark = shade(color, 0.55);
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(x, y - 1, w * 0.64, Math.max(1, h * 0.12), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(x, y - 1, w * 0.52, Math.max(1, h * 0.06), 0, 0, Math.PI * 2); g.fill();

    if (B.open) { drawFormula(g, x, y, w, h, color, opt); return; }
    if (B.kart || B.buggy || B.tractor || B.monster) { drawFun(g, x, y, w, h, color, B, opt); return; }
    if (opt.front && !B.train) { drawFront(g, x, y, w, h, color, B, opt, body); return; }

    // タイヤ
    var tw = w * 0.17, th = h * (B.box ? 0.22 : 0.32);
    g.fillStyle = '#111';
    g.fillRect(x - w * 0.5, y - th, tw, th);
    g.fillRect(x + w * 0.5 - tw, y - th, tw, th);
    if (w > 30) {
      g.fillStyle = '#333';
      g.fillRect(x - w * 0.5 + tw * 0.25, y - th * 0.8, tw * 0.5, th * 0.5);
      g.fillRect(x + w * 0.5 - tw * 0.75, y - th * 0.8, tw * 0.5, th * 0.5);
    }

    if (B.box) {
      // 箱型（バン・トラック・バス）
      var grad = g.createLinearGradient(0, y - h, 0, y - h * 0.15);
      grad.addColorStop(0, shade(color, 1.12)); grad.addColorStop(1, shade(color, 0.72));
      g.fillStyle = grad;
      g.fillRect(x - w * 0.49, y - h * 0.98, w * 0.98, h * 0.8);
      if (B.ribs && w > 16) {
        g.fillStyle = 'rgba(0,0,0,.18)';
        for (var r = 1; r < 6; r++) g.fillRect(x - w * 0.49 + w * 0.98 * r / 6, y - h * 0.96, Math.max(1, w * 0.012), h * 0.74);
      } else if (B.windows) {
        g.fillStyle = '#1c2433';
        g.fillRect(x - w * 0.4, y - h * 0.9, w * 0.8, h * 0.28);
      } else {
        g.fillStyle = '#1c2433';
        g.fillRect(x - w * 0.36, y - h * 0.9, w * 0.3, h * 0.24);
        g.fillRect(x + w * 0.06, y - h * 0.9, w * 0.3, h * 0.24);
        g.fillStyle = 'rgba(0,0,0,.3)';
        g.fillRect(x - w * 0.005, y - h * 0.95, Math.max(1, w * 0.01), h * 0.72);
      }
      if (B.cross && w > 12) { g.fillStyle = '#e53935'; g.fillRect(x - w * 0.04, y - h * 0.62, w * 0.08, h * 0.2); g.fillRect(x - w * 0.1, y - h * 0.55, w * 0.2, h * 0.06); }
      if (B.ladder) { g.fillStyle = '#cfd8dc'; for (var lr = 0; lr < 5; lr++) g.fillRect(x - w * 0.3, y - h * (0.96 + lr * 0.0), w * 0.6, Math.max(1, h * 0.02)); g.fillRect(x - w * 0.3, y - h * 1.02, w * 0.6, h * 0.04); }
      if (B.bar) { var on2 = Math.floor((opt.t || 0) * 6) % 2; g.fillStyle = on2 ? '#ff2d2d' : '#5a1010'; g.fillRect(x - w * 0.3, y - h * 1.04, w * 0.25, h * 0.06); g.fillStyle = on2 ? '#1a2a6a' : '#2d6bff'; g.fillRect(x + w * 0.05, y - h * 1.04, w * 0.25, h * 0.06); }
      g.fillStyle = opt.front ? '#fff4c8' : opt.brake ? '#ff3b3b' : '#9e1f1f';
      if (B.train) { g.fillStyle = '#fff4c8'; g.fillRect(x - w * 0.3, y - h * 0.3, w * 0.1, h * 0.06); g.fillRect(x + w * 0.2, y - h * 0.3, w * 0.1, h * 0.06); }
      g.fillRect(x - w * 0.47, y - h * 0.36, w * 0.1, h * 0.1);
      g.fillRect(x + w * 0.37, y - h * 0.36, w * 0.1, h * 0.1);
      g.fillStyle = dark;
      g.fillRect(x - w * 0.49, y - h * 0.22, w * 0.98, h * 0.06);
      labelCar(g, x, y, w, h, opt);
      return;
    }

    // 下半分の車体
    var gr = g.createLinearGradient(0, y - h * B.body, 0, y - h * 0.2);
    gr.addColorStop(0, shade(color, 1.16)); gr.addColorStop(0.5, color); gr.addColorStop(1, shade(color, 0.68));
    g.fillStyle = gr;
    g.fillRect(x - w * 0.48, y - h * B.body, w * 0.96, h * (B.body - 0.2));
    if (B.panda) { g.fillStyle = '#15171a'; g.fillRect(x - w * 0.48, y - h * 0.4, w * 0.96, h * 0.2); }
    if (B.chrome) { g.fillStyle = '#d7dce2'; g.fillRect(x - w * 0.48, y - h * 0.3, w * 0.96, h * 0.05); }
    if (B.bed) { g.fillStyle = shade(color, 0.6); g.fillRect(x - w * 0.44, y - h * B.body - h * 0.02, w * 0.88, h * 0.05); }
    if (B.spare && w > 14) circle(g, x, y - h * (B.body - 0.12), h * 0.14, '#1a1a1a');
    if (w > 20) { g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x - w * 0.46, y - h * B.body, w * 0.92, Math.max(1, h * 0.025)); }
    if (B.flaps) { g.fillStyle = '#222'; g.fillRect(x - w * 0.5, y - h * 0.24, tw, h * 0.1); g.fillRect(x + w * 0.5 - tw, y - h * 0.24, tw, h * 0.1); }

    // 屋根と後ろの窓
    var cab = B.cab, bt = y - h * B.body, tp = y - h * B.top;
    var cabColor = body === 'police' ? '#f2f2f2' : shade(color, 0.8);
    poly(g, x - w * cab[0] + lean, bt, x + w * cab[0] + lean, bt, x + w * cab[1] + lean, tp, x - w * cab[1] + lean, tp, cabColor);
    var ib = bt - h * 0.04, it = tp + h * 0.05;
    var wg = g.createLinearGradient(0, it, 0, ib);
    wg.addColorStop(0, '#46546a'); wg.addColorStop(0.45, '#1c2433'); wg.addColorStop(1, '#0e131c');
    poly(g, x - w * (cab[0] - 0.06) + lean, ib, x + w * (cab[0] - 0.06) + lean, ib, x + w * (cab[1] - 0.05) + lean, it, x - w * (cab[1] - 0.05) + lean, it, wg);
    if (w > 24) {
      g.fillStyle = 'rgba(255,255,255,.14)';
      poly(g, x - w * (cab[0] - 0.08) + lean, ib, x - w * (cab[0] - 0.16) + lean, ib, x - w * (cab[1] - 0.12) + lean, it, x - w * (cab[1] - 0.07) + lean, it, 'rgba(255,255,255,.14)');
    }
    if (B.stripes) {
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(x - w * 0.1, bt, w * 0.07, h * (B.body - 0.22));
      g.fillRect(x + w * 0.03, bt, w * 0.07, h * (B.body - 0.22));
    }
    if (B.rack) { g.fillStyle = '#222'; g.fillRect(x - w * 0.24 + lean, tp - h * 0.05, w * 0.48, h * 0.04); }
    if (B.fin) { g.fillStyle = shade(color, 0.6); g.fillRect(x - w * 0.015 + lean, tp - h * 0.22, Math.max(1, w * 0.03), h * 0.26); }
    if (B.taxi) {
      g.fillStyle = '#fafafa'; g.fillRect(x - w * 0.14 + lean, tp - h * 0.12, w * 0.28, h * 0.12);
      if (w > 30) { g.fillStyle = '#222'; g.font = 'bold ' + Math.max(6, Math.round(w * 0.07)) + 'px monospace'; g.textAlign = 'center'; g.fillText('TAXI', x + lean, tp - h * 0.03); }
    }
    if (B.bar) {
      var on = Math.floor((opt.t || 0) * 6) % 2;
      g.fillStyle = on ? '#ff2d2d' : '#5a1010'; g.fillRect(x - w * 0.2 + lean, tp - h * 0.1, w * 0.2, h * 0.1);
      g.fillStyle = on ? '#1a2a6a' : '#2d6bff'; g.fillRect(x + lean, tp - h * 0.1, w * 0.2, h * 0.1);
      if (opt.siren && w > 20) {
        g.fillStyle = on ? 'rgba(255,45,45,.25)' : 'rgba(45,107,255,.25)';
        g.beginPath(); g.arc(x + lean + (on ? -w * 0.1 : w * 0.1), tp - h * 0.05, w * 0.35, 0, Math.PI * 2); g.fill();
      }
    }

    // テールランプ
    var ly = y - h * (B.body - 0.07), lh = h * 0.1;
    g.fillStyle = opt.brake ? '#ff3b3b' : '#9e1f1f';
    var lc = opt.front ? '#fff4c8' : opt.brake ? '#ff3b3b' : '#9e1f1f';
    if (opt.front) g.fillStyle = lc;
    if (B.lamps === 'round2') {
      circle(g, x - w * 0.34, ly + lh * 0.5, lh * 0.62, lc); circle(g, x + w * 0.34, ly + lh * 0.5, lh * 0.62, lc);
    } else if (B.lamps === 'quad') {
      [-0.4, -0.27, 0.27, 0.4].forEach(function (fx) { circle(g, x + w * fx, ly + lh * 0.5, lh * 0.5, lc); });
    } else if (B.lamps === 'bar') {
      g.fillRect(x - w * 0.46, ly - lh * 0.1, w * 0.92, lh * 0.9);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - w * 0.1, ly - lh * 0.1, w * 0.2, lh * 0.9);
    } else if (B.strip) {
      g.fillRect(x - w * 0.46, ly, w * 0.92, lh * 0.55);
    } else if (B.round) {
      circle(g, x - w * 0.36, ly + lh * 0.5, lh * 0.6, g.fillStyle); circle(g, x + w * 0.36, ly + lh * 0.5, lh * 0.6, opt.brake ? '#ff3b3b' : '#9e1f1f');
    } else {
      g.fillRect(x - w * 0.45, ly, w * 0.18, lh);
      g.fillRect(x + w * 0.27, ly, w * 0.18, lh);
    }
    if (opt.brake && w > 24) {
      g.fillStyle = 'rgba(255,60,60,.22)';
      g.fillRect(x - w * 0.52, ly - lh * 0.6, w * 1.04, lh * 2.2);
    }
    g.fillStyle = dark;
    g.fillRect(x - w * 0.48, y - h * 0.28, w * 0.96, h * 0.07);
    if (w > 26) { g.fillStyle = '#e8e8e8'; g.fillRect(x - w * 0.09, y - h * 0.42, w * 0.18, h * 0.09); }

    // ウイング（車体より手前）
    if (B.wing) {
      var wy = bt - h * (0.1 + B.wing);
      g.fillStyle = '#1a1a1a';
      g.fillRect(x - w * 0.3, wy, Math.max(1, w * 0.03), bt - wy);
      g.fillRect(x + w * 0.27, wy, Math.max(1, w * 0.03), bt - wy);
      g.fillStyle = shade(color, 0.5);
      g.fillRect(x - w * 0.47, wy - h * 0.06, w * 0.94, h * 0.07);
    }
    exhaust(g, x, y, w, h, opt, [-0.2, 0.2]);
    labelCar(g, x, y, w, h, opt);
  }

  /** 対向車（前から見た姿）: フロントガラス・グリル・ヘッドライト */
  function drawFront(g, x, y, w, h, color, B, opt, body) {
    var tw = w * 0.16, th = h * (B.box ? 0.2 : 0.28);
    g.fillStyle = '#111'; g.fillRect(x - w * 0.49, y - th, tw, th); g.fillRect(x + w * 0.49 - tw, y - th, tw, th);
    var night = opt.night;
    if (B.box) {
      // キャブの正面（トラック・バス・バン）
      var cabC = B.ribs ? '#e9ecef' : color;
      var gr = g.createLinearGradient(0, y - h, 0, y - h * 0.15);
      gr.addColorStop(0, shade(cabC, 1.1)); gr.addColorStop(1, shade(cabC, 0.75));
      g.fillStyle = gr; g.fillRect(x - w * 0.48, y - h * 0.98, w * 0.96, h * 0.82);
      if (B.ribs) { g.fillStyle = shade(color, 0.9); g.fillRect(x - w * 0.5, y - h * 1.06, w * 1.0, h * 0.1); }   // 後ろの荷台の頭
      var wg = g.createLinearGradient(0, y - h * 0.94, 0, y - h * 0.55);
      wg.addColorStop(0, '#6b7c92'); wg.addColorStop(0.5, '#27324a'); wg.addColorStop(1, '#141a26');
      g.fillStyle = wg; g.fillRect(x - w * 0.43, y - h * 0.92, w * 0.86, h * (B.windows ? 0.34 : 0.36));
      if (w > 18) { g.fillStyle = '#111'; g.fillRect(x - w * 0.3, y - h * 0.58, w * 0.22, Math.max(1, h * 0.012)); g.fillRect(x + w * 0.08, y - h * 0.58, w * 0.22, Math.max(1, h * 0.012)); }
      g.fillStyle = '#2a2d33'; g.fillRect(x - w * 0.36, y - h * 0.45, w * 0.72, h * 0.12);
      if (w > 20) { g.fillStyle = 'rgba(255,255,255,.15)'; for (var gl = 0; gl < 4; gl++) g.fillRect(x - w * 0.36, y - h * (0.44 - gl * 0.03), w * 0.72, Math.max(1, h * 0.008)); }
      g.fillStyle = '#fff6d8'; g.fillRect(x - w * 0.46, y - h * 0.36, w * 0.14, h * 0.07); g.fillRect(x + w * 0.32, y - h * 0.36, w * 0.14, h * 0.07);
      g.fillStyle = '#ffb300'; g.fillRect(x - w * 0.46, y - h * 0.29, w * 0.06, h * 0.035); g.fillRect(x + w * 0.4, y - h * 0.29, w * 0.06, h * 0.035);
      g.fillStyle = '#3a3d42'; g.fillRect(x - w * 0.5, y - h * 0.22, w * 1.0, h * 0.07);
      if (w > 24) { g.fillStyle = '#f2f2f2'; g.fillRect(x - w * 0.08, y - h * 0.2, w * 0.16, h * 0.05); }
      if (B.bar) { var on2 = Math.floor((opt.t || 0) * 6) % 2; g.fillStyle = on2 ? '#ff2d2d' : '#5a1010'; g.fillRect(x - w * 0.3, y - h * 1.04, w * 0.25, h * 0.06); g.fillStyle = on2 ? '#1a2a6a' : '#2d6bff'; g.fillRect(x + w * 0.05, y - h * 1.04, w * 0.25, h * 0.06); }
    } else {
      var gr2 = g.createLinearGradient(0, y - h * B.body, 0, y - h * 0.2);
      gr2.addColorStop(0, shade(color, 1.16)); gr2.addColorStop(0.5, color); gr2.addColorStop(1, shade(color, 0.68));
      g.fillStyle = gr2; g.fillRect(x - w * 0.48, y - h * B.body, w * 0.96, h * (B.body - 0.2));
      var cab = B.cab, bt = y - h * B.body, tp = y - h * B.top;
      poly(g, x - w * cab[0], bt, x + w * cab[0], bt, x + w * cab[1], tp, x - w * cab[1], tp, body === 'police' ? '#f2f2f2' : shade(color, 0.85));
      var ib = bt - h * 0.02, it = tp + h * 0.04;
      var wg2 = g.createLinearGradient(0, it, 0, ib);
      wg2.addColorStop(0, '#8fa3bb'); wg2.addColorStop(0.35, '#3b4a63'); wg2.addColorStop(1, '#121822');
      poly(g, x - w * (cab[0] - 0.03), ib, x + w * (cab[0] - 0.03), ib, x + w * (cab[1] - 0.03), it, x - w * (cab[1] - 0.03), it, wg2);
      // ボンネットの線・グリル・ライト
      if (w > 20) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x - w * 0.46, bt + h * 0.02, w * 0.92, Math.max(1, h * 0.02)); }
      var gy = y - h * (B.body * 0.55);
      g.fillStyle = '#1b1d22'; g.fillRect(x - w * 0.2, gy, w * 0.4, h * 0.1);
      if (w > 22) { g.fillStyle = 'rgba(200,200,210,.35)'; g.fillRect(x - w * 0.2, gy + h * 0.045, w * 0.4, Math.max(1, h * 0.012)); }
      g.fillStyle = '#fff6d8';
      poly(g, x - w * 0.46, gy, x - w * 0.24, gy, x - w * 0.24, gy + h * 0.08, x - w * 0.45, gy + h * 0.06, '#fff6d8');
      poly(g, x + w * 0.46, gy, x + w * 0.24, gy, x + w * 0.24, gy + h * 0.08, x + w * 0.45, gy + h * 0.06, '#fff6d8');
      g.fillStyle = shade(color, 0.55); g.fillRect(x - w * 0.49, y - h * 0.26, w * 0.98, h * 0.08);
      if (w > 24) { g.fillStyle = '#f2f2f2'; g.fillRect(x - w * 0.08, y - h * 0.25, w * 0.16, h * 0.06); }
      if (B.taxi) { g.fillStyle = '#fafafa'; g.fillRect(x - w * 0.14, tp - h * 0.12, w * 0.28, h * 0.12); }
      if (B.bar) { var on = Math.floor((opt.t || 0) * 6) % 2; g.fillStyle = on ? '#ff2d2d' : '#5a1010'; g.fillRect(x - w * 0.2, tp - h * 0.1, w * 0.2, h * 0.1); g.fillStyle = on ? '#1a2a6a' : '#2d6bff'; g.fillRect(x, tp - h * 0.1, w * 0.2, h * 0.1); }
    }
    if (night && w > 8) {   // 夜のヘッドライトのまぶしさ
      g.fillStyle = 'rgba(255,245,210,.28)';
      g.beginPath(); g.arc(x - w * 0.36, y - h * 0.32, w * 0.3, 0, Math.PI * 2); g.arc(x + w * 0.36, y - h * 0.32, w * 0.3, 0, Math.PI * 2); g.fill();
    }
  }

  function drawFormula(g, x, y, w, h, color, opt) {
    var tw = w * 0.24, th = h * 0.55;
    g.fillStyle = '#111';
    g.fillRect(x - w * 0.5, y - th, tw, th);
    g.fillRect(x + w * 0.5 - tw, y - th, tw, th);
    g.fillStyle = '#2a2a2a';
    g.fillRect(x - w * 0.5, y - th * 0.55, tw, th * 0.08);
    g.fillRect(x + w * 0.5 - tw, y - th * 0.55, tw, th * 0.08);
    g.fillStyle = shade(color, 0.7);
    g.fillRect(x - w * 0.26, y - h * 0.42, w * 0.52, h * 0.16);
    poly(g, x - w * 0.16, y - h * 0.3, x + w * 0.16, y - h * 0.3, x + w * 0.06, y - h * 0.82, x - w * 0.06, y - h * 0.82, color);
    circle(g, x, y - h * 0.74, w * 0.07, '#ffd93d');
    g.fillStyle = '#1c2433'; g.fillRect(x - w * 0.05, y - h * 0.76, w * 0.1, h * 0.04);
    g.fillStyle = '#1a1a1a';
    g.fillRect(x - w * 0.03, y - h * 1.0, w * 0.06, h * 0.4);
    g.fillStyle = shade(color, 0.55);
    g.fillRect(x - w * 0.44, y - h * 1.06, w * 0.88, h * 0.12);
    g.fillStyle = '#111';
    g.fillRect(x - w * 0.46, y - h * 1.12, w * 0.04, h * 0.3);
    g.fillRect(x + w * 0.42, y - h * 1.12, w * 0.04, h * 0.3);
    g.fillStyle = opt.brake ? '#ff3b3b' : '#9e1f1f';
    g.fillRect(x - w * 0.04, y - h * 0.36, w * 0.08, h * 0.08);
    exhaust(g, x, y, w, h, opt, [0]);
    labelCar(g, x, y, w, h * 1.1, opt);
  }

  // お遊び車両（ゴーカート・バギー・トラクター・モンスタートラック）
  function drawFun(g, x, y, w, h, color, B, opt) {
    if (B.kart) {
      g.fillStyle = '#111'; g.fillRect(x - w * 0.5, y - h * 0.5, w * 0.22, h * 0.5); g.fillRect(x + w * 0.28, y - h * 0.5, w * 0.22, h * 0.5);
      g.fillStyle = color; g.fillRect(x - w * 0.3, y - h * 0.45, w * 0.6, h * 0.25);
      g.fillStyle = '#333'; g.fillRect(x - w * 0.2, y - h * 0.8, w * 0.4, h * 0.36);
      circle(g, x, y - h * 1.0, w * 0.12, '#e53935'); g.fillStyle = '#1c2433'; g.fillRect(x - w * 0.08, y - h * 1.02, w * 0.16, h * 0.06);
    } else if (B.buggy) {
      g.fillStyle = '#111'; g.fillRect(x - w * 0.52, y - h * 0.55, w * 0.24, h * 0.55); g.fillRect(x + w * 0.28, y - h * 0.55, w * 0.24, h * 0.55);
      g.strokeStyle = '#333'; g.lineWidth = Math.max(1, w * 0.03);
      g.strokeRect(x - w * 0.28, y - h * 1.0, w * 0.56, h * 0.6); g.lineWidth = 1;
      g.fillStyle = color; g.fillRect(x - w * 0.3, y - h * 0.5, w * 0.6, h * 0.18);
      circle(g, x, y - h * 0.75, w * 0.09, '#fdd835');
    } else if (B.tractor) {
      g.fillStyle = '#111'; g.fillRect(x - w * 0.56, y - h * 0.8, w * 0.3, h * 0.8); g.fillRect(x + w * 0.26, y - h * 0.8, w * 0.3, h * 0.8);
      g.fillStyle = color; g.fillRect(x - w * 0.24, y - h * 0.62, w * 0.48, h * 0.42);
      g.fillStyle = '#222'; g.fillRect(x - w * 0.2, y - h * 1.0, w * 0.4, h * 0.05); g.fillRect(x - w * 0.18, y - h * 1.0, w * 0.03, h * 0.4); g.fillRect(x + w * 0.15, y - h * 1.0, w * 0.03, h * 0.4);
      g.fillStyle = '#555'; g.fillRect(x + w * 0.1, y - h * 1.1, w * 0.05, h * 0.5);
    } else if (B.monster) {
      g.fillStyle = '#111'; g.fillRect(x - w * 0.52, y - h * 0.5, w * 0.3, h * 0.5); g.fillRect(x + w * 0.22, y - h * 0.5, w * 0.3, h * 0.5);
      g.fillStyle = '#777'; g.fillRect(x - w * 0.2, y - h * 0.46, w * 0.4, h * 0.06);
      var gr = g.createLinearGradient(0, y - h, 0, y - h * 0.45); gr.addColorStop(0, shade(color, 1.2)); gr.addColorStop(1, shade(color, 0.7));
      g.fillStyle = gr; g.fillRect(x - w * 0.42, y - h * 0.78, w * 0.84, h * 0.3);
      poly(g, x - w * 0.3, y - h * 0.78, x + w * 0.3, y - h * 0.78, x + w * 0.22, y - h, x - w * 0.22, y - h, shade(color, 0.8));
      g.fillStyle = '#1c2433'; g.fillRect(x - w * 0.18, y - h * 0.95, w * 0.36, h * 0.12);
      g.fillStyle = opt.brake ? '#ff3b3b' : '#9e1f1f'; g.fillRect(x - w * 0.4, y - h * 0.72, w * 0.12, h * 0.06); g.fillRect(x + w * 0.28, y - h * 0.72, w * 0.12, h * 0.06);
    }
    labelCar(g, x, y, w, h, opt);
  }

  /** 横から見た車（交差点を横切る車） */
  function drawSide(g, x, y, len, color, right) {
    var h = len * 0.32, d = right ? 1 : -1;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - len / 2, y - h * 0.08, len, h * 0.12);
    var gr = g.createLinearGradient(0, y - h, 0, y); gr.addColorStop(0, shade(color, 1.15)); gr.addColorStop(1, shade(color, 0.7));
    g.fillStyle = gr; g.fillRect(x - len / 2, y - h * 0.62, len, h * 0.42);
    poly(g, x - len * 0.28 * d, y - h * 0.62, x + len * 0.22 * d, y - h * 0.62, x + len * 0.1 * d, y - h, x - len * 0.18 * d, y - h, shade(color, 0.85));
    g.fillStyle = '#1c2433'; g.fillRect(x - len * 0.14, y - h * 0.93, len * 0.26, h * 0.26);
    circle(g, x - len * 0.3, y - h * 0.18, h * 0.2, '#111'); circle(g, x + len * 0.3, y - h * 0.18, h * 0.2, '#111');
    g.fillStyle = '#fff4c8'; g.fillRect(x + d * len * 0.47 - 1, y - h * 0.5, 2, h * 0.1);
  }

  function exhaust(g, x, y, w, h, opt, xs) {
    if (!opt.boost) return;
    xs.forEach(function (fx) {
      var ex = x + w * fx, ey = y - h * 0.2;
      var len = h * (0.35 + Math.random() * 0.35);
      poly(g, ex - w * 0.05, ey, ex + w * 0.05, ey, ex + w * 0.02, ey + len, ex - w * 0.02, ey + len, 'rgba(90,170,255,.85)');
      poly(g, ex - w * 0.025, ey, ex + w * 0.025, ey, ex + w * 0.01, ey + len * 0.6, ex - w * 0.01, ey + len * 0.6, 'rgba(255,255,255,.9)');
    });
  }

  function labelCar(g, x, y, w, h, opt) {
    if (!opt.label || w < 18) return;
    var size = clamp(Math.round(w * 0.14), 8, 13);
    g.font = 'bold ' + size + 'px ui-monospace, monospace';
    g.textAlign = 'center';
    var ty = y - h * 1.12 - (opt.boss ? size : 0);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(opt.label, x + 1, ty + 1);
    g.fillStyle = opt.boss ? '#ffd93d' : '#fff'; g.fillText(opt.label, x, ty);
    if (opt.boss) { g.fillStyle = '#ff5252'; g.fillText('BOSS', x, ty + size); }
  }
  R.drawCar = drawCar;

  /* ---------- 路肩の飾り ---------- */

  function drawSprite(g, sp, x, y, s, night, t) {
    var u = s * 0.12, i, k;
    // 実在の道の飾りは実寸（1u ≒ 1.1m）で描く
    if (sp.city) u = s * UNITS_M * H / (ROAD_W * W) * 1.1;
    var dir = sp.offset > 0 ? -1 : 1;   // 道の中央へ向かう向き
    switch (sp.kind) {
      case 'pole':   // 電柱（コンクリート柱・腕金・変圧器）
        if (u < 0.08) break;
        g.fillStyle = night ? '#4a4d52' : '#9ea1a0'; g.fillRect(x - u * 0.17, y - u * 9.6, u * 0.34, u * 9.6);
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + u * 0.05, y - u * 9.6, u * 0.12, u * 9.6);
        g.fillStyle = night ? '#2e3136' : '#6b6e70';
        g.fillRect(x - u * 0.9, y - u * 9.3, u * 1.8, u * 0.12); g.fillRect(x - u * 0.7, y - u * 8.5, u * 1.4, u * 0.1);
        if ((sp.id || 0) % 3 === 0) { g.fillStyle = night ? '#3b4046' : '#8d9499'; g.fillRect(x + dir * u * 0.25 - u * 0.3, y - u * 7.6, u * 0.6, u * 0.9); }
        if (u > 1.2) { g.fillStyle = '#f5d000'; g.fillRect(x - u * 0.17, y - u * 2.4, u * 0.34, u * 0.5); g.fillStyle = '#222'; g.fillRect(x - u * 0.17, y - u * 2.2, u * 0.34, u * 0.08); }
        break;
      case 'streetlamp':   // 幹線道路の街灯（道の上へ腕がのびる）
        g.fillStyle = '#6c7278'; g.fillRect(x - u * 0.12, y - u * 8.2, u * 0.24, u * 8.2);
        g.fillRect(Math.min(x, x + dir * u * 2.6), y - u * 8.3, u * 2.6, u * 0.16);
        g.fillStyle = night ? '#fff1b8' : '#d7dbe0'; g.fillRect(x + dir * u * 2.6 - u * 0.5, y - u * 8.3, u, u * 0.3);
        if (night) circle(g, x + dir * u * 2.6, y - u * 7.9, u * 2.4, 'rgba(255,230,160,.12)');
        break;
      case 'hwlamp':
        g.fillStyle = '#7b8288'; g.fillRect(x - u * 0.14, y - u * 10.5, u * 0.28, u * 10.5);
        g.fillRect(Math.min(x, x + dir * u * 2), y - u * 10.6, u * 2, u * 0.18);
        g.fillStyle = night ? '#ffd48a' : '#cfd4d8'; g.fillRect(x + dir * u * 2 - u * 0.5, y - u * 10.6, u, u * 0.28);
        if (night) circle(g, x + dir * u * 2, y - u * 10.2, u * 2.6, 'rgba(255,200,120,.13)');
        break;
      case 'broadleaf':   // 広葉樹
        g.fillStyle = '#4e3b2c'; g.fillRect(x - u * 0.25, y - u * 3, u * 0.5, u * 3);
        var lc = night ? '#1f3322' : ['#3f6b3a', '#4b7a3f', '#355f33', '#56813f'][sp.seed % 4];
        circle(g, x - u * 1.3, y - u * 4, u * 1.9, shade(lc, 0.85)); circle(g, x + u * 1.3, y - u * 4.2, u * 1.9, lc); circle(g, x, y - u * 5.4, u * 2.1, shade(lc, 1.12));
        break;
      case 'tree':
        g.fillStyle = '#5b3a1e'; g.fillRect(x - u * 0.3, y - u * 2, u * 0.6, u * 2);
        poly(g, x - u * 2, y - u * 1.6, x + u * 2, y - u * 1.6, x + u * 0.2, y - u * 5, x - u * 0.2, y - u * 5, '#1f6b3a');
        poly(g, x - u * 1.5, y - u * 3.4, x + u * 1.5, y - u * 3.4, x + u * 0.1, y - u * 6.2, x - u * 0.1, y - u * 6.2, '#27804a');
        break;
      case 'pine': case 'snowpine':
        g.fillStyle = '#4a2f1a'; g.fillRect(x - u * 0.25, y - u * 1.4, u * 0.5, u * 1.4);
        for (i = 0; i < 3; i++) {
          var by = y - u * (1.2 + i * 1.7), bw = u * (2.2 - i * 0.55);
          poly(g, x - bw, by, x + bw, by, x + u * 0.1, by - u * 2.6, x - u * 0.1, by - u * 2.6, i % 2 ? '#1b5e20' : '#236b2a');
          if (sp.kind === 'snowpine') poly(g, x - bw * 0.45, by - u * 1.5, x + bw * 0.45, by - u * 1.5, x + u * 0.1, by - u * 2.6, x - u * 0.1, by - u * 2.6, '#f4f8fb');
        }
        break;
      case 'maple':
        g.fillStyle = '#4e342e'; g.fillRect(x - u * 0.3, y - u * 2.2, u * 0.6, u * 2.2);
        var mc = ['#d84315', '#ef6c00', '#c62828', '#f9a825'][sp.seed % 4];
        circle(g, x - u * 1.1, y - u * 3, u * 1.5, shade(mc, 0.8)); circle(g, x + u * 1.1, y - u * 3.2, u * 1.5, mc); circle(g, x, y - u * 4.2, u * 1.7, shade(mc, 1.1));
        break;
      case 'fuji':
        break;
      case 'bush':
        circle(g, x - u * 0.9, y - u * 0.8, u * 1.1, '#2e7d32'); circle(g, x + u * 0.8, y - u * 0.9, u * 1.2, '#388e3c'); circle(g, x, y - u * 1.4, u * 1.2, '#43a047');
        break;
      case 'palm':
        poly(g, x - u * 0.3, y, x + u * 0.3, y, x + u * 0.8, y - u * 6, x + u * 0.3, y - u * 6, '#8a5a2b');
        for (i = 0; i < 5; i++) {
          var a = -Math.PI / 2 + (i - 2) * 0.7;
          poly(g, x + u * 0.5, y - u * 6, x + u * 0.5 + Math.cos(a) * u * 3, y - u * 6 + Math.sin(a) * u * 3 + u * 1.2,
               x + u * 0.5 + Math.cos(a) * u * 3.2, y - u * 6 + Math.sin(a) * u * 3 + u * 1.6, x + u * 0.5, y - u * 5.6, i % 2 ? '#2e9b4f' : '#38b05a');
        }
        break;
      case 'cactus':
        g.fillStyle = '#2e7d32';
        g.fillRect(x - u * 0.4, y - u * 4, u * 0.8, u * 4);
        g.fillRect(x - u * 1.4, y - u * 2.8, u * 0.6, u * 1.4); g.fillRect(x - u * 1.4, y - u * 2.2, u * 1.2, u * 0.5);
        g.fillRect(x + u * 0.8, y - u * 3.4, u * 0.6, u * 1.6); g.fillRect(x + u * 0.2, y - u * 2.3, u * 1.2, u * 0.5);
        break;
      case 'mesa':
        var mw = u * (8 + (sp.seed % 3) * 3), mh = u * (5 + (sp.seed % 4));
        poly(g, x - mw, y, x + mw, y, x + mw * 0.7, y - mh, x - mw * 0.75, y - mh, '#b5562a');
        poly(g, x - mw * 0.82, y - mh * 0.45, x + mw * 0.85, y - mh * 0.45, x + mw * 0.78, y - mh * 0.62, x - mw * 0.8, y - mh * 0.62, 'rgba(0,0,0,.14)');
        poly(g, x - mw * 0.75, y - mh, x + mw * 0.7, y - mh, x + mw * 0.66, y - mh * 1.06, x - mw * 0.7, y - mh * 1.06, '#d9784a');
        break;
      case 'rock':
        poly(g, x - u * 1.6, y, x + u * 1.5, y, x + u * 0.9, y - u * 1.4, x - u * 0.8, y - u * 1.6, '#8c8c8c');
        poly(g, x - u * 0.8, y - u * 1.6, x + u * 0.9, y - u * 1.4, x + u * 0.3, y - u * 2.1, x - u * 0.3, y - u * 2.2, '#a8a8a8');
        break;
      case 'lavarock':
        poly(g, x - u * 1.8, y, x + u * 1.7, y, x + u * 1, y - u * 1.8, x - u * 0.9, y - u * 2, '#2a1a17');
        g.fillStyle = 'rgba(255,' + (100 + Math.floor(Math.sin(t * 3 + sp.seed) * 40)) + ',0,.9)';
        g.fillRect(x - u * 0.9, y - u * 0.9, u * 1.2, u * 0.18); g.fillRect(x + u * 0.1, y - u * 1.4, u * 0.14, u * 0.9);
        break;
      case 'snowman':
        circle(g, x, y - u * 1.1, u * 1.1, '#f5f8fb'); circle(g, x, y - u * 2.7, u * 0.75, '#ffffff');
        g.fillStyle = '#222'; g.fillRect(x - u * 0.6, y - u * 3.5, u * 1.2, u * 0.2); g.fillRect(x - u * 0.4, y - u * 4.1, u * 0.8, u * 0.6);
        g.fillStyle = '#ff7043'; g.fillRect(x - u * 0.1, y - u * 2.7, u * 0.5, u * 0.15);
        break;
      case 'lamp':
        var sd = Math.sign(sp.offset);
        g.fillStyle = '#555'; g.fillRect(x - u * 0.15, y - u * 6, u * 0.3, u * 6);
        g.fillRect(x - u * 1.2 * sd, y - u * 6, u * 1.2, u * 0.25);
        g.fillStyle = night ? '#ffe9a3' : '#ddd';
        g.fillRect(x - u * 1.3 * sd - u * 0.2, y - u * 5.95, u * 0.6, u * 0.3);
        if (night) circle(g, x - u * 1.2 * sd, y - u * 5.6, u * 2.2, 'rgba(255,233,163,.12)');
        break;
      case 'tlight':
        break;   // トンネルの照明は壁と一緒に描く
      case 'building':
        var bw2 = u * (6 + (sp.seed % 3) * 2), bh = u * (10 + (sp.seed % 4) * 4);
        g.fillStyle = night ? '#1b1f33' : '#6b7280';
        g.fillRect(x - bw2 / 2, y - bh, bw2, bh);
        if (u > 1.2) {
          for (var wy = 1; wy * u * 1.6 < bh - u; wy++) {
            for (var wx = 0; wx < 4; wx++) {
              var lit = ((sp.seed + wy * 3 + wx * 5) % 4) !== 0;
              g.fillStyle = night ? (lit ? '#ffd76a' : '#2a2f47') : '#9aa3b1';
              g.fillRect(x - bw2 / 2 + bw2 * (0.12 + wx * 0.22), y - bh + wy * u * 1.6, bw2 * 0.12, u * 0.8);
            }
          }
        }
        break;
      case 'lighthouse':
        for (i = 0; i < 5; i++) poly(g, x - u * (1.1 - i * 0.12), y - u * i * 1.6, x + u * (1.1 - i * 0.12), y - u * i * 1.6,
                                     x + u * (0.98 - i * 0.12), y - u * (i + 1) * 1.6, x - u * (0.98 - i * 0.12), y - u * (i + 1) * 1.6, i % 2 ? '#e53935' : '#f5f5f5');
        g.fillStyle = '#333'; g.fillRect(x - u * 0.6, y - u * 9.2, u * 1.2, u * 1.2);
        g.fillStyle = '#fff59d'; g.fillRect(x - u * 0.4, y - u * 9, u * 0.8, u * 0.8);
        break;
      case 'torii':
        g.fillStyle = '#d32f2f';
        g.fillRect(x - u * 2.2, y - u * 5, u * 0.45, u * 5); g.fillRect(x + u * 1.75, y - u * 5, u * 0.45, u * 5);
        g.fillRect(x - u * 2.6, y - u * 4.2, u * 5.2, u * 0.35);
        g.fillStyle = '#222'; g.fillRect(x - u * 3, y - u * 5.4, u * 6, u * 0.45);
        break;
      case 'container':
        var cols = ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a'];
        for (i = 0; i < 1 + sp.seed % 3; i++) {
          g.fillStyle = cols[(sp.seed + i) % cols.length];
          g.fillRect(x - u * 2.6, y - u * (i + 1) * 1.9, u * 5.2, u * 1.8);
          if (u > 1) { g.fillStyle = 'rgba(0,0,0,.2)'; for (k = 1; k < 6; k++) g.fillRect(x - u * 2.6 + k * u * 0.87, y - u * (i + 1) * 1.9, u * 0.1, u * 1.8); }
        }
        break;
      case 'crane':
        g.fillStyle = '#f9a825';
        g.fillRect(x - u * 3, y - u * 14, u * 0.5, u * 14); g.fillRect(x + u * 2.5, y - u * 14, u * 0.5, u * 14);
        g.fillRect(x - u * 5, y - u * 14.5, u * 12, u * 0.8);
        g.fillStyle = '#333'; g.fillRect(x + u * 3.5, y - u * 13.7, u * 0.1, u * 5); g.fillRect(x + u * 3, y - u * 8.8, u * 1.1, u * 0.6);
        break;
      case 'barrier':
        g.fillStyle = '#9e9e9e';
        g.fillRect(x - u * 3, y - u * 1.3, u * 6, u * 0.45);
        g.fillStyle = '#616161'; g.fillRect(x - u * 2.8, y - u * 1.3, u * 0.25, u * 1.3); g.fillRect(x + u * 2.55, y - u * 1.3, u * 0.25, u * 1.3);
        break;
      case 'billboard':
        g.fillStyle = '#444'; g.fillRect(x - u * 2, y - u * 4, u * 0.3, u * 4); g.fillRect(x + u * 1.7, y - u * 4, u * 0.3, u * 4);
        g.fillStyle = night ? '#101830' : '#fafafa'; g.fillRect(x - u * 3.2, y - u * 7, u * 6.4, u * 3.2);
        g.fillStyle = ['#e53935', '#1e88e5', '#43a047', '#8e24aa'][sp.seed % 4]; g.fillRect(x - u * 3.2, y - u * 7, u * 6.4, u * 0.6);
        if (u > 1.2) {
          g.font = 'bold ' + Math.round(u * 1.4) + 'px ui-monospace, monospace'; g.textAlign = 'center';
          g.fillStyle = night ? '#5ccfa0' : '#222';
          g.fillText(sp.real ? ['RACING', 'TIRES', 'MOTOR OIL', 'BRAKES'][sp.seed % 4] : ['TENRYU', 'GO!', 'ZERO-DAY', 'NITRO'][sp.seed % 4], x, y - u * 4.9);
        }
        break;
      case 'grandstand':
        for (i = 0; i < 4; i++) {
          g.fillStyle = i % 2 ? '#78909c' : '#90a4ae';
          g.fillRect(x - u * 7, y - u * (i + 1) * 1.6, u * 14, u * 1.6);
          if (u > 0.8) {
            for (k = 0; k < 14; k++) {
              g.fillStyle = ['#e53935', '#fdd835', '#1e88e5', '#fafafa', '#43a047'][(k + i + sp.seed + Math.floor(t * 2)) % 5];
              g.fillRect(x - u * 6.6 + k * u, y - u * (i + 1) * 1.6 + u * 0.2 + (Math.sin(t * 8 + k + i) > 0.7 ? -u * 0.3 : 0), u * 0.55, u * 0.6);
            }
          }
        }
        g.fillStyle = '#546e7a'; g.fillRect(x - u * 7.4, y - u * 7.4, u * 14.8, u * 0.8);
        break;
      case 'tyrewall':
        for (i = 0; i < 3; i++) for (k = 0; k < 5; k++) circle(g, x - u * 2 + k * u, y - u * 0.5 - i * u, u * 0.5, (i + k) % 2 ? '#222' : '#e53935');
        break;
      case 'neon':
        var nc = sp.seed % 2 ? '#00e5ff' : '#ff00c8';
        g.fillStyle = rgba(nc, 0.18); g.fillRect(x - u * 1.1, y - u * 9, u * 2.2, u * 9);
        g.fillStyle = nc; g.fillRect(x - u * 0.3, y - u * 9, u * 0.6, u * 9);
        g.fillStyle = '#fff'; g.fillRect(x - u * 0.1, y - u * 9, u * 0.2, u * 9);
        break;
      case 'holo':
        g.strokeStyle = sp.seed % 2 ? '#ff00c8' : '#00e5ff'; g.lineWidth = Math.max(1, u * 0.25);
        g.strokeRect(x - u * 3, y - u * 7 + Math.sin(t * 2 + sp.seed) * u * 0.3, u * 6, u * 3);
        if (u > 1) {
          g.font = 'bold ' + Math.round(u * 1.6) + 'px ui-monospace, monospace'; g.textAlign = 'center';
          g.fillStyle = g.strokeStyle; g.fillText(sp.seed % 3 ? 'RACE' : '▶ GO', x, y - u * 5 + Math.sin(t * 2 + sp.seed) * u * 0.3);
        }
        g.lineWidth = 1;
        break;
      case 'arch':
        var aw = s * 1.3, ah = s * 1.0;
        g.strokeStyle = 'rgba(0,229,255,.8)'; g.lineWidth = Math.max(1, s * 0.03);
        g.strokeRect(x - aw, y - ah, aw * 2, ah);
        g.strokeStyle = 'rgba(255,0,200,.6)'; g.strokeRect(x - aw * 0.96, y - ah * 0.96, aw * 1.92, ah * 0.96);
        g.lineWidth = 1;
        break;
      case 'acttower':   // 駅前の高いタワー（ハーモニカのような形）
        g.fillStyle = '#b0bec5'; g.fillRect(x - u * 2.2, y - u * 34, u * 4.4, u * 34);
        g.fillStyle = '#cfd8dc'; g.fillRect(x - u * 2.2, y - u * 34, u * 1.2, u * 34);
        g.beginPath(); g.fillStyle = '#90a4ae'; g.ellipse(x, y - u * 34, u * 2.2, u * 1.6, 0, Math.PI, 0); g.fill();
        if (u > 0.6) for (k = 0; k < 16; k++) { g.fillStyle = night ? 'rgba(255,215,106,.7)' : 'rgba(40,60,80,.35)'; g.fillRect(x - u * 1.8, y - u * (32 - k * 2), u * 3.6, u * 0.4); }
        break;
      case 'castle':
        g.fillStyle = '#9e9e9e'; poly(g, x - u * 6, y, x + u * 6, y, x + u * 4.8, y - u * 3, x - u * 4.8, y - u * 3, '#8d8d8d');
        for (k = 0; k < 3; k++) {
          var cw2 = u * (4.2 - k * 1.1), cy2 = y - u * (3 + k * 2.6);
          g.fillStyle = '#f5f5f0'; g.fillRect(x - cw2 * 0.8, cy2 - u * 2, cw2 * 1.6, u * 2);
          poly(g, x - cw2 * 1.15, cy2 - u * 1.8, x + cw2 * 1.15, cy2 - u * 1.8, x + cw2 * 0.6, cy2 - u * 2.8, x - cw2 * 0.6, cy2 - u * 2.8, '#37474f');
        }
        g.fillStyle = '#ffd700'; g.fillRect(x - u * 1.3, y - u * 11.8, u * 0.5, u * 0.9); g.fillRect(x + u * 0.8, y - u * 11.8, u * 0.5, u * 0.9);
        break;
      case 'twintower':
        [[-2.8, 30], [2.8, 26]].forEach(function (tw) {
          g.fillStyle = night ? '#2a3350' : '#b3c4d6'; g.fillRect(x + u * tw[0] - u * 1.6, y - u * tw[1], u * 3.2, u * tw[1]);
          g.fillStyle = night ? '#3a4568' : '#d6e2ee'; g.fillRect(x + u * tw[0] - u * 1.6, y - u * tw[1], u * 0.9, u * tw[1]);
          if (night && u > 0.5) for (var q = 2; q < tw[1]; q += 3) { g.fillStyle = 'rgba(255,215,106,.6)'; g.fillRect(x + u * tw[0] - u * 1.2, y - u * q, u * 2.4, u * 0.35); }
        });
        g.fillStyle = night ? '#232b45' : '#8fa3b8'; g.fillRect(x - u * 6, y - u * 8, u * 12, u * 8);
        break;
      case 'tvtower':
        g.strokeStyle = night ? '#ff8a65' : '#b0443a'; g.lineWidth = Math.max(1, u * 0.35);
        g.beginPath(); g.moveTo(x - u * 3, y); g.lineTo(x - u * 0.6, y - u * 20); g.lineTo(x + u * 0.6, y - u * 20); g.lineTo(x + u * 3, y); g.stroke();
        for (k = 1; k < 6; k++) { var ww = u * (3 - k * 0.45); g.beginPath(); g.moveTo(x - ww, y - u * k * 3.4); g.lineTo(x + ww, y - u * k * 3.4); g.stroke(); }
        g.fillStyle = night ? '#ffcc80' : '#cfd8dc'; g.fillRect(x - u * 1.6, y - u * 16, u * 3.2, u * 1.4);
        g.fillStyle = g.strokeStyle; g.fillRect(x - u * 0.15, y - u * 25, u * 0.3, u * 5);
        g.lineWidth = 1;
        break;
      case 'ferris':
        var fr = u * 6, fcx = x, fcy = y - u * 7.5;
        g.strokeStyle = night ? '#80deea' : '#eceff1'; g.lineWidth = Math.max(1, u * 0.3);
        g.beginPath(); g.arc(fcx, fcy, fr, 0, Math.PI * 2); g.stroke();
        for (k = 0; k < 8; k++) {
          var fa = k * Math.PI / 4 + t * 0.2;
          g.beginPath(); g.moveTo(fcx, fcy); g.lineTo(fcx + Math.cos(fa) * fr, fcy + Math.sin(fa) * fr); g.stroke();
          g.fillStyle = ['#e53935', '#fdd835', '#1e88e5', '#43a047'][k % 4]; g.fillRect(fcx + Math.cos(fa) * fr - u * 0.5, fcy + Math.sin(fa) * fr, u, u * 0.9);
        }
        g.beginPath(); g.moveTo(fcx - u * 3, y); g.lineTo(fcx, fcy); g.lineTo(fcx + u * 3, y); g.stroke();
        g.lineWidth = 1;
        break;
      case 'house':
        var hc = ['#eceff1', '#d7ccc8', '#cfd8dc', '#fff3e0'][sp.seed % 4], hr = ['#455a64', '#6d4c41', '#37474f', '#8d6e63'][sp.seed % 4];
        g.fillStyle = hc; g.fillRect(x - u * 3, y - u * 3.6, u * 6, u * 3.6);
        poly(g, x - u * 3.5, y - u * 3.5, x + u * 3.5, y - u * 3.5, x + u * 2.2, y - u * 5.4, x - u * 2.2, y - u * 5.4, hr);
        g.fillStyle = night ? '#ffd76a' : '#90a4ae'; g.fillRect(x - u * 2.2, y - u * 2.8, u * 1.3, u * 1); g.fillRect(x + u * 0.9, y - u * 2.8, u * 1.3, u * 1);
        break;
      case 'factory':
        g.fillStyle = '#b0bec5'; g.fillRect(x - u * 6, y - u * 5, u * 12, u * 5);
        for (k = 0; k < 4; k++) poly(g, x - u * 6 + k * u * 3, y - u * 5, x - u * 3 + k * u * 3, y - u * 5, x - u * 3 + k * u * 3, y - u * 6.5, x - u * 6 + k * u * 3, y - u * 5, '#90a4ae');
        g.fillStyle = '#78909c'; g.fillRect(x + u * 3.5, y - u * 10, u * 0.9, u * 5);
        g.fillStyle = 'rgba(220,220,220,.5)'; circle(g, x + u * 4.2, y - u * (10.8 + (t * 2 % 2)), u * (0.8 + (t * 2 % 2) * 0.4), g.fillStyle);
        break;
      case 'gyoza':
        g.fillStyle = '#5d4037'; g.fillRect(x - u * 2.4, y - u * 4, u * 4.8, u * 4);
        g.fillStyle = '#c62828'; g.fillRect(x - u * 2.2, y - u * 4, u * 4.4, u * 1.4);
        if (u > 1.1) { g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(u * 1.1) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('餃子', x, y - u * 2.9); }
        break;
      case 'mikan':
        g.fillStyle = '#4e342e'; g.fillRect(x - u * 0.25, y - u * 1.4, u * 0.5, u * 1.4);
        circle(g, x, y - u * 2.4, u * 1.6, '#2e7d32');
        g.fillStyle = '#ff9800'; for (k = 0; k < 5; k++) circle(g, x + Math.cos(k * 1.3) * u, y - u * 2.4 + Math.sin(k * 1.3) * u, u * 0.28, '#ff9800');
        break;
      case 'cedar':
        g.fillStyle = '#3e2723'; g.fillRect(x - u * 0.2, y - u * 2, u * 0.4, u * 2);
        poly(g, x - u * 1.3, y - u * 1.5, x + u * 1.3, y - u * 1.5, x + u * 0.1, y - u * 9, x - u * 0.1, y - u * 9, '#1b4d2b');
        poly(g, x - u * 0.2, y - u * 2, x + u * 1.3, y - u * 1.5, x + u * 0.1, y - u * 9, x, y - u * 9, 'rgba(0,0,0,.18)');
        break;
      case 'bigtorii':
        g.fillStyle = '#d32f2f';
        g.fillRect(x - u * 5, y - u * 11, u * 0.9, u * 11); g.fillRect(x + u * 4.1, y - u * 11, u * 0.9, u * 11);
        g.fillRect(x - u * 6, y - u * 9.5, u * 12, u * 0.7);
        g.fillStyle = '#222'; g.fillRect(x - u * 7, y - u * 11.8, u * 14, u * 0.9);
        break;
      case 'station':
        g.fillStyle = '#eceff1'; g.fillRect(x - u * 6, y - u * 4.5, u * 12, u * 4.5);
        g.fillStyle = '#37474f'; g.fillRect(x - u * 6.6, y - u * 5.3, u * 13.2, u * 0.9);
        g.fillStyle = '#90a4ae'; g.fillRect(x - u * 4, y - u * 3, u * 8, u * 2);
        if (u > 1) { g.fillStyle = '#1565c0'; g.font = 'bold ' + Math.round(u * 1.1) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('駅', x, y - u * 3.7); }
        break;
      case 'orbis':
        g.fillStyle = '#555'; g.fillRect(x - s * 1.15, y - s * 0.95, s * 2.3, s * 0.05);
        g.fillRect(x + s * 1.1, y - s * 0.95, s * 0.04, s * 0.95);
        g.fillStyle = '#263238'; g.fillRect(x + s * 0.2, y - s * 0.94, s * 0.18, s * 0.1);
        g.fillStyle = sp.flash > 0 ? '#ffffff' : '#b71c1c'; circle(g, x + s * 0.29, y - s * 0.86, s * 0.025, g.fillStyle);
        break;
      case 'limitsign':
        g.fillStyle = '#666'; g.fillRect(x - u * 0.12, y - u * 4, u * 0.24, u * 4);
        circle(g, x, y - u * 4.6, u * 1.3, '#d32f2f'); circle(g, x, y - u * 4.6, u * 1.02, '#ffffff');
        if (u > 0.9) { g.fillStyle = '#1a47a0'; g.font = 'bold ' + Math.round(u * 1.05) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(String(sp.n), x, y - u * 4.25); }
        break;
      case 'signal':   // 横型の信号機（青・黄・赤）
        var ph = sp.phase ? sp.phase() : 'green';
        g.fillStyle = '#555'; g.fillRect(x - u * 0.2, y - u * 7.5, u * 0.4, u * 7.5);
        g.fillRect(x - s * 0.9, y - u * 7.5, s * 0.9, u * 0.3);
        var bx = x - s * 0.62, by = y - u * 8.4;
        g.fillStyle = '#2b2f36'; g.fillRect(bx, by, u * 5, u * 1.8);
        [['green', '#00e0a0'], ['yellow', '#ffc400'], ['red', '#ff2a2a']].forEach(function (lc, li) {
          circle(g, bx + u * (0.9 + li * 1.6), by + u * 0.9, u * 0.62, ph === lc[0] ? lc[1] : '#15181d');
          if (ph === lc[0]) circle(g, bx + u * (0.9 + li * 1.6), by + u * 0.9, u * 1.5, ph === 'red' ? 'rgba(255,42,42,.18)' : ph === 'yellow' ? 'rgba(255,196,0,.18)' : 'rgba(0,224,160,.18)');
        });
        break;
      case 'tea':   // 茶畑の畝
        for (k = 0; k < 3; k++) { g.fillStyle = k % 2 ? '#2e7d32' : '#388e3c'; g.beginPath(); g.ellipse(x + (k - 1) * u * 2.4, y - u * 0.7, u * 1.2, u * 0.8, 0, Math.PI, 0); g.fill(); }
        break;
      case 'dune':
        g.fillStyle = '#e8d3a0'; g.beginPath(); g.ellipse(x, y, u * 7, u * 3, 0, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(0,0,0,.07)'; g.beginPath(); g.ellipse(x + u * 2, y, u * 4, u * 2, 0, Math.PI, 0); g.fill();
        break;
      case 'kite':   // 凧揚げの凧
        var ky = y - u * (9 + Math.sin(t + sp.seed) * 1.5);
        poly(g, x, ky - u * 1.6, x + u * 1.2, ky, x, ky + u * 1.6, x - u * 1.2, ky, ['#e53935', '#1e88e5', '#fdd835'][sp.seed % 3]);
        g.strokeStyle = 'rgba(80,80,80,.6)'; g.beginPath(); g.moveTo(x, ky + u * 1.6); g.lineTo(x - u * 2, y); g.stroke();
        break;
      case 'unagi':  // うなぎ屋ののれん
        g.fillStyle = '#5d4037'; g.fillRect(x - u * 2.4, y - u * 4, u * 4.8, u * 4);
        g.fillStyle = '#1a237e'; g.fillRect(x - u * 2.2, y - u * 4, u * 4.4, u * 1.4);
        if (u > 1.1) { g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(u * 1.1) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('うなぎ', x, y - u * 2.9); }
        break;
      case 'piano':  // 鍵盤の看板（楽器の街）
        g.fillStyle = '#222'; g.fillRect(x - u * 3, y - u * 3.4, u * 6, u * 2);
        for (k = 0; k < 10; k++) { g.fillStyle = '#fafafa'; g.fillRect(x - u * 2.9 + k * u * 0.58, y - u * 3.3, u * 0.5, u * 1.8); }
        for (k = 0; k < 9; k++) if (k % 7 !== 2 && k % 7 !== 6) { g.fillStyle = '#111'; g.fillRect(x - u * 2.55 + k * u * 0.58, y - u * 3.3, u * 0.3, u * 1.1); }
        g.fillStyle = '#444'; g.fillRect(x - u * 0.15, y - u * 1.4, u * 0.3, u * 1.4);
        break;
      case 'soundwall':
        g.fillStyle = '#9aa7b3'; g.fillRect(x - u * 5, y - u * 3, u * 10, u * 3);
        g.fillStyle = 'rgba(255,255,255,.2)'; for (k = 0; k < 5; k++) g.fillRect(x - u * 5 + k * u * 2, y - u * 3, u * 0.2, u * 3);
        break;
      case 'greensign':
        g.fillStyle = '#555'; g.fillRect(x - u * 0.2, y - u * 5, u * 0.4, u * 5);
        g.fillStyle = '#1b7a3e'; g.fillRect(x - u * 3, y - u * 7.5, u * 6, u * 2.8);
        g.strokeStyle = '#fff'; g.strokeRect(x - u * 2.8, y - u * 7.3, u * 5.6, u * 2.4);
        if (u > 1) { g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(u * 1.1) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(['名古屋', '浜松', '豊橋', '岡崎'][sp.seed % 4], x, y - u * 5.7); }
        break;
      case 'tollgate':
        for (k = -2; k <= 2; k++) { g.fillStyle = '#607d8b'; g.fillRect(x + k * u * 2.6 - u * 0.4, y - u * 4, u * 0.8, u * 4); }
        g.fillStyle = '#eceff1'; g.fillRect(x - u * 6, y - u * 5, u * 12, u * 1.2);
        g.fillStyle = '#1e88e5'; g.fillRect(x - u * 6, y - u * 5, u * 12, u * 0.3);
        break;
      case 'banner': case 'fork':
        var bh2 = s * (sp.kind === 'fork' ? 0.32 : 0.2), half2 = s * 1.15, top2 = y - s * 1.05;
        g.fillStyle = '#444'; g.fillRect(x - half2, top2, s * 0.04, y - top2); g.fillRect(x + half2 - s * 0.04, top2, s * 0.04, y - top2);
        g.fillStyle = sp.kind === 'fork' ? (sp.blue ? '#1d4fa3' : '#1b7a3e') : '#0d47a1'; g.fillRect(x - half2, top2, half2 * 2, bh2);
        if (sp.blue) { g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, s * 0.01); g.strokeRect(x - half2 + s * 0.02, top2 + s * 0.02, half2 * 2 - s * 0.04, bh2 - s * 0.04); }
        if (s > 24) {
          g.fillStyle = '#fff'; g.textAlign = 'center';
          g.font = 'bold ' + Math.max(7, Math.round(s * (sp.kind === 'fork' ? 0.09 : 0.1))) + 'px sans-serif';
          if (sp.kind === 'fork') sp.texts.forEach(function (tx, j, arr) { g.fillText(tx, x - half2 + half2 * 2 * (j + 0.5) / arr.length, top2 + bh2 * 0.62); });
          else g.fillText(sp.text, x, top2 + bh2 * 0.7);
        }
        break;
      case 'sign':
        g.fillStyle = '#444'; g.fillRect(x - u * 1.4, y - u * 2.4, u * 0.2, u * 2.4); g.fillRect(x + u * 1.2, y - u * 2.4, u * 0.2, u * 2.4);
        g.fillStyle = '#f2f2f2'; g.fillRect(x - u * 1.8, y - u * 4, u * 3.6, u * 1.8);
        if (u > 1.4) {
          g.fillStyle = '#e14d4d'; g.font = 'bold ' + Math.round(u * 1.1) + 'px monospace'; g.textAlign = 'center';
          g.fillText('GO', x, y - u * 2.7);
        }
        break;
      case 'chevron':
        g.fillStyle = '#333'; g.fillRect(x - u * 0.15, y - u * 2.2, u * 0.3, u * 2.2);
        g.fillStyle = '#ffd93d'; g.fillRect(x - u * 1.6, y - u * 3.6, u * 3.2, u * 1.6);
        for (var c = -1; c <= 1; c++) {
          var cx = x + c * u * 0.9, d = sp.dir;
          poly(g, cx - d * u * 0.3, y - u * 3.45, cx + d * u * 0.2, y - u * 2.8, cx - d * u * 0.3, y - u * 2.15, cx - d * u * 0.1, y - u * 2.8, '#222');
        }
        break;
      case 'gantry': case 'cpgate':
        var half = s * 1.2;
        g.fillStyle = '#333';
        g.fillRect(x - half, y - s * 0.9, s * 0.05, s * 0.9);
        g.fillRect(x + half - s * 0.05, y - s * 0.9, s * 0.05, s * 0.9);
        if (sp.kind === 'cpgate') {
          g.fillStyle = '#1565c0'; g.fillRect(x - half, y - s * 0.98, half * 2, s * 0.16);
          if (s > 30) { g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(s * 0.1) + 'px ui-monospace, monospace'; g.textAlign = 'center'; g.fillText('CHECKPOINT', x, y - s * 0.86); }
          break;
        }
        var cells = 16, cw = (half * 2) / cells;
        for (k = 0; k < cells; k++) {
          g.fillStyle = k % 2 ? '#111' : '#f5f5f5';
          g.fillRect(x - half + k * cw, y - s * 0.95, cw, s * 0.07);
          g.fillStyle = k % 2 ? '#f5f5f5' : '#111';
          g.fillRect(x - half + k * cw, y - s * 0.88, cw, s * 0.07);
        }
        break;
    }
  }

  /** 道の上の物（コーン・オイル・加速パネル・落石） */
  function drawObj(g, o, x, y, s, t) {
    var u = s * 0.12;
    if (o.hit && o.kind !== 'oil' && o.kind !== 'pad') return;
    switch (o.kind) {
      case 'cone':
        poly(g, x - u * 0.6, y, x + u * 0.6, y, x + u * 0.12, y - u * 1.6, x - u * 0.12, y - u * 1.6, '#ff6d00');
        g.fillStyle = '#fff'; g.fillRect(x - u * 0.35, y - u * 0.9, u * 0.7, u * 0.25);
        break;
      case 'debris':
        poly(g, x - u, y, x + u * 0.9, y, x + u * 0.5, y - u * 0.9, x - u * 0.6, y - u * 1.1, '#6d5d55');
        break;
      case 'oil':
        g.fillStyle = 'rgba(10,10,14,.85)';
        g.beginPath(); g.ellipse(x, y - u * 0.1, u * 2.2, u * 0.45, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(140,120,255,.25)';
        g.beginPath(); g.ellipse(x - u * 0.4, y - u * 0.2, u * 0.9, u * 0.15, 0, 0, Math.PI * 2); g.fill();
        break;
      case 'coin':
        if (o.hit) return;
        var sq = Math.abs(Math.sin(t * 4 + o.offset * 3));
        g.fillStyle = '#ffd54f';
        g.beginPath(); g.ellipse(x, y - u * 1.2, Math.max(1, u * 0.7 * sq), u * 0.7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ff8f00'; g.fillRect(x - Math.max(0.5, u * 0.12 * sq), y - u * 1.5, Math.max(1, u * 0.24 * sq), u * 0.6);
        break;
      case 'pad':
        var glow = 0.55 + Math.sin(t * 8) * 0.3;
        g.fillStyle = 'rgba(0,229,255,' + glow + ')';
        for (var k = 0; k < 3; k++) {
          var yy = y - u * k * 0.35;
          poly(g, x - u * 1.8, yy, x - u * 1.2, yy, x, yy - u * 0.5, x, yy - u * 0.25, g.fillStyle);
          poly(g, x + u * 1.8, yy, x + u * 1.2, yy, x, yy - u * 0.5, x, yy - u * 0.25, g.fillStyle);
        }
        break;
    }
  }

  function spriteWidth(kind) {
    return { tree: 0.35, pine: 0.35, snowpine: 0.35, palm: 0.3, rock: 0.35, lavarock: 0.35, lamp: 0.12, building: 0.9,
             sign: 0.4, chevron: 0.35, cactus: 0.25, mesa: 1.2, bush: 0.3, snowman: 0.25, lighthouse: 0.3, torii: 0.6,
             container: 0.6, crane: 0.9, barrier: 0.6, billboard: 0.6, grandstand: 1.4, tyrewall: 0.45, neon: 0.15, holo: 0,
             acttower: 0.5, castle: 1.2, twintower: 1.2, tvtower: 0.6, ferris: 0.8, unagi: 0.5, piano: 0.5, soundwall: 1, greensign: 0.1,
             tollgate: 0, maple: 0.35, house: 0.7, factory: 1.3, gyoza: 0.5, mikan: 0.3, cedar: 0.25, station: 1.3, bigtorii: 0, orbis: 0, limitsign: 0.05, signal: 0.05 }[kind] || 0;
  }
  function objWidth(kind) { return { cone: 0.06, debris: 0.1, oil: 0.24, pad: 0.22, coin: 0.12 }[kind] || 0; }

  /* ---------- 顔（会話の場面で使う 24×24 の絵） ---------- */

  function drawPortrait(cv, f, emo) {
    var g = cv.getContext('2d'), N = 24, p = cv.width / N;
    function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x * p), Math.round(y * p), Math.ceil(w * p), Math.ceil(h * p)); }
    px(0, 0, N, N, f.bg);
    for (var i = 0; i < N; i += 2) px(0, i, N, 1, 'rgba(255,255,255,.03)');
    px(3, 19, 18, 5, f.shirt); px(9, 17, 6, 3, shade(f.skin, 0.85));
    px(6, 5, 12, 13, f.skin); px(7, 17, 10, 1, shade(f.skin, 0.85));
    var hair = f.hair;
    switch (f.style) {
      case 'bob': px(5, 3, 14, 4, hair); px(5, 6, 2, 9, hair); px(17, 6, 2, 9, hair); px(8, 6, 4, 1, hair); break;
      case 'spiky': px(6, 3, 12, 3, hair); for (i = 0; i < 6; i++) px(6 + i * 2, 1 + (i % 2), 1, 2, hair); px(5, 5, 1, 4, hair); px(18, 5, 1, 4, hair); break;
      case 'swept': px(6, 3, 12, 3, hair); px(4, 4, 6, 2, hair); px(5, 5, 2, 5, hair); px(17, 5, 1, 3, hair); break;
      case 'long': px(5, 3, 14, 3, hair); px(4, 5, 3, 15, hair); px(17, 5, 3, 15, hair); break;
      case 'cap': px(5, 3, 14, 3, '#1a2f5a'); px(4, 5, 16, 1, '#10203d'); px(11, 3, 2, 2, '#ffd54f'); px(6, 6, 2, 3, hair); px(16, 6, 2, 3, hair); break;
      case 'hood': px(4, 2, 16, 4, hair); px(3, 4, 3, 16, hair); px(18, 4, 3, 16, hair); break;
      case 'bald': px(6, 4, 12, 2, shade(f.skin, 1.08)); break;
      case 'short': px(6, 3, 12, 3, hair); px(5, 5, 1, 3, hair); px(18, 5, 1, 3, hair); break;
      case 'ponytail': px(5, 3, 14, 3, hair); px(5, 5, 2, 5, hair); px(17, 5, 2, 5, hair); px(19, 6, 3, 2, hair); px(20, 8, 2, 7, hair); break;
      case 'pompadour': px(5, 1, 14, 2, hair); px(4, 2, 5, 2, hair); px(6, 3, 12, 3, hair); px(5, 5, 1, 4, hair); px(18, 5, 1, 4, hair); break;
      case 'bun': px(6, 3, 12, 3, hair); px(9, 0, 6, 3, hair); px(5, 5, 2, 4, hair); px(17, 5, 2, 4, hair); break;
      case 'wavy': px(5, 3, 14, 3, hair); for (i = 0; i < 7; i++) px(4 + (i % 2), 5 + i * 2, 3, 2, hair); for (i = 0; i < 7; i++) px(17 - (i % 2), 5 + i * 2, 3, 2, hair); break;
      case 'buzz': px(6, 3, 12, 2, shade(hair, 1.2)); break;
    }
    var mouth = shade(f.skin, 0.6), brow = shade(f.hair === f.skin ? '#555555' : f.hair, 0.8);
    var EXTRA = { laugh: 1, worry: 1, blush: 1, cry: 1, think: 1, sleepy: 1, wink: 1, smug: 1, determined: 1, panic: 1, tired: 1, gentle: 1 };
    if (EXTRA[emo]) {
      var ey = f.eyes, tear = '#8ad7ff', cheek = 'rgba(240,110,110,.5)', dark = '#3a1010';
      switch (emo) {
        case 'laugh':   // 目を細めて大きく笑う
          px(7, 11, 1, 1, ey); px(8, 10, 2, 1, ey); px(10, 11, 1, 1, ey); px(13, 11, 1, 1, ey); px(14, 10, 2, 1, ey); px(16, 11, 1, 1, ey);
          px(9, 14, 6, 1, mouth); px(10, 15, 4, 2, dark); px(11, 16, 2, 1, '#e57373'); px(7, 13, 2, 1, cheek); px(15, 13, 2, 1, cheek); break;
        case 'worry':   // 眉がハの字、小さな口、汗
          px(8, 10, 2, 2, ey); px(14, 10, 2, 2, ey); px(8, 10, 1, 1, '#fff'); px(14, 10, 1, 1, '#fff');
          px(8, 8, 2, 1, brow); px(10, 7, 1, 1, brow); px(14, 8, 2, 1, brow); px(13, 7, 1, 1, brow);
          px(10, 16, 1, 1, mouth); px(11, 15, 2, 1, mouth); px(13, 16, 1, 1, mouth); px(18, 7, 1, 2, tear); break;
        case 'blush':   // はにかみ（ほおが赤い）
          px(8, 10, 2, 1, ey); px(14, 10, 2, 1, ey); px(8, 11, 1, 1, ey); px(15, 11, 1, 1, ey);
          px(7, 12, 3, 2, cheek); px(14, 12, 3, 2, cheek); px(10, 15, 4, 1, mouth); px(9, 14, 1, 1, mouth); px(14, 14, 1, 1, mouth); break;
        case 'cry':     // なみだ
          px(8, 10, 2, 2, ey); px(14, 10, 2, 2, ey); px(8, 10, 1, 1, '#fff'); px(14, 10, 1, 1, '#fff');
          px(9, 8, 2, 1, brow); px(7, 9, 2, 1, brow); px(13, 8, 2, 1, brow); px(15, 9, 2, 1, brow);
          px(8, 12, 1, 4, tear); px(15, 12, 1, 4, tear); px(7, 13, 1, 2, tear); px(16, 13, 1, 2, tear);
          px(9, 15, 6, 1, mouth); px(9, 16, 1, 1, mouth); px(14, 16, 1, 1, mouth); break;
        case 'think':   // 片眉を上げて考える
          px(8, 10, 2, 2, ey); px(14, 10, 2, 2, ey); px(8, 10, 1, 1, '#fff'); px(14, 10, 1, 1, '#fff');
          px(7, 8, 3, 1, brow); px(14, 7, 3, 1, brow); px(10, 15, 3, 1, mouth); px(13, 14, 1, 1, mouth); break;
        case 'sleepy':  // うとうと
          px(8, 11, 3, 1, ey); px(14, 11, 3, 1, ey); px(8, 9, 3, 1, brow); px(14, 9, 3, 1, brow); px(11, 15, 2, 1, mouth); px(18, 6, 2, 1, '#fff'); px(19, 5, 2, 1, '#fff'); break;
        case 'wink':    // ウインク
          px(8, 10, 2, 2, ey); px(8, 10, 1, 1, '#fff'); px(14, 11, 3, 1, ey); px(15, 10, 1, 1, ey);
          px(9, 14, 1, 1, mouth); px(14, 14, 1, 1, mouth); px(10, 15, 4, 1, mouth); px(15, 13, 2, 1, cheek); break;
        case 'smug':    // ドヤ顔（半目と、片側だけ上がる口）
          px(8, 10, 3, 1, shade(f.skin, 0.62)); px(14, 10, 3, 1, shade(f.skin, 0.62)); px(9, 11, 1, 1, ey); px(15, 11, 1, 1, ey);
          px(8, 9, 3, 1, brow); px(14, 8, 3, 1, brow);
          px(10, 15, 3, 1, mouth); px(13, 14, 2, 1, mouth); px(15, 13, 1, 1, mouth); break;
        case 'determined': // 決意（まっすぐな目と、きゅっと結んだ口）
          px(8, 10, 2, 2, ey); px(14, 10, 2, 2, ey); px(8, 10, 1, 1, '#fff'); px(14, 10, 1, 1, '#fff');
          px(7, 9, 3, 1, brow); px(14, 9, 3, 1, brow); px(8, 8, 1, 1, brow); px(15, 8, 1, 1, brow); px(10, 15, 4, 1, mouth); px(10, 14, 4, 1, shade(f.skin, 0.8)); break;
        case 'panic':   // あわてる（目が丸く、汗、波うつ口）
          px(7, 9, 4, 4, '#fff'); px(13, 9, 4, 4, '#fff'); px(9, 10, 1, 2, ey); px(14, 10, 1, 2, ey);
          px(8, 7, 3, 1, brow); px(13, 7, 3, 1, brow); px(9, 15, 1, 1, mouth); px(10, 16, 1, 1, mouth); px(11, 15, 1, 1, mouth); px(12, 16, 1, 1, mouth); px(13, 15, 1, 1, mouth);
          px(5, 8, 1, 2, tear); px(19, 7, 1, 2, tear); px(18, 10, 1, 1, tear); break;
        case 'tired':   // つかれた顔
          px(8, 11, 2, 1, ey); px(14, 11, 2, 1, ey); px(8, 12, 2, 1, shade(f.skin, 0.8)); px(14, 12, 2, 1, shade(f.skin, 0.8));
          px(8, 9, 2, 1, brow); px(14, 9, 2, 1, brow); px(10, 16, 4, 1, mouth); px(9, 15, 1, 1, mouth); px(14, 15, 1, 1, mouth); break;
        case 'gentle':  // おだやかな笑み
          px(8, 10, 2, 1, ey); px(14, 10, 2, 1, ey); px(7, 11, 1, 1, ey); px(10, 11, 1, 1, ey); px(13, 11, 1, 1, ey); px(16, 11, 1, 1, ey);
          px(8, 8, 2, 1, brow); px(14, 8, 2, 1, brow); px(10, 15, 4, 1, mouth); px(9, 14, 1, 1, mouth); px(14, 14, 1, 1, mouth); break;
      }
    } else {
    if (emo === 'shock') { px(7, 9, 4, 3, '#fff'); px(13, 9, 4, 3, '#fff'); px(8, 10, 1, 1, f.eyes); px(14, 10, 1, 1, f.eyes); }
    else if (emo === 'cool') { px(8, 11, 2, 1, f.eyes); px(14, 11, 2, 1, f.eyes); }
    else if (emo === 'smile') { px(8, 10, 2, 1, f.eyes); px(14, 10, 2, 1, f.eyes); px(7, 11, 1, 1, f.eyes); px(10, 11, 1, 1, f.eyes); px(13, 11, 1, 1, f.eyes); px(16, 11, 1, 1, f.eyes); }
    else { px(8, 10, 2, 2, f.eyes); px(14, 10, 2, 2, f.eyes); px(8, 10, 1, 1, '#fff'); px(14, 10, 1, 1, '#fff'); }
    if (emo === 'angry') { px(7, 8, 1, 1, brow); px(8, 8, 1, 1, brow); px(9, 9, 2, 1, brow); px(13, 9, 2, 1, brow); px(15, 8, 2, 1, brow); px(10, 15, 4, 1, mouth); px(9, 16, 1, 1, mouth); px(14, 16, 1, 1, mouth); }
    else if (emo === 'sad') { px(9, 8, 2, 1, brow); px(7, 9, 2, 1, brow); px(13, 8, 2, 1, brow); px(15, 9, 2, 1, brow); px(10, 16, 4, 1, mouth); px(9, 15, 1, 1, mouth); px(14, 15, 1, 1, mouth); }
    else if (emo === 'smile') { px(9, 14, 1, 1, mouth); px(14, 14, 1, 1, mouth); px(10, 15, 4, 1, mouth); }
    else if (emo === 'shock') { px(11, 14, 2, 3, '#3a1010'); }
    else px(10, 15, 4, 1, mouth);
    }
    switch (f.acc) {
      case 'goggles': px(6, 4, 12, 2, '#5d4037'); px(7, 4, 4, 2, '#80deea'); px(13, 4, 4, 2, '#80deea'); break;
      case 'headset': px(5, 8, 1, 5, '#222'); px(18, 8, 1, 5, '#222'); px(5, 3, 14, 1, '#222'); px(15, 14, 4, 1, '#222'); break;
      case 'visor': px(6, 9, 12, 3, 'rgba(79,143,247,.75)'); break;
      case 'scar': px(15, 8, 1, 6, '#8e3b3b'); break;
      case 'mustache': px(9, 14, 6, 1, '#757575'); break;
      case 'mask': px(6, 12, 12, 6, '#263238'); px(8, 10, 2, 2, '#ff5252'); px(14, 10, 2, 2, '#ff5252'); break;
      case 'glasses': px(7, 9, 4, 3, 'rgba(0,0,0,.5)'); px(13, 9, 4, 3, 'rgba(0,0,0,.5)'); px(11, 10, 2, 1, '#111'); break;
      case 'shades': px(7, 9, 10, 3, '#111'); px(8, 9, 2, 1, '#555'); break;
      case 'monocle': px(13, 9, 4, 4, 'rgba(255,215,0,.35)'); px(13, 9, 4, 1, '#ffd700'); px(16, 13, 1, 5, '#ffd700'); break;
      case 'cig': px(15, 15, 4, 1, '#f5f5f5'); px(19, 15, 1, 1, '#ff7043'); px(19, 13, 1, 1, 'rgba(220,220,220,.5)'); px(20, 12, 1, 1, 'rgba(220,220,220,.35)'); break;
      case 'hachimaki': px(5, 5, 14, 2, '#f5f5f5'); px(9, 5, 3, 2, '#e53935'); px(3, 6, 2, 3, '#f5f5f5'); break;
      case 'bandana': px(5, 3, 14, 3, '#c62828'); px(6, 4, 1, 1, '#fff'); px(12, 3, 1, 1, '#fff'); px(3, 5, 3, 2, '#c62828'); break;
      case 'earring': px(5, 12, 1, 2, '#ffd700'); px(18, 12, 1, 2, '#ffd700'); break;
      case 'nurse': px(7, 1, 10, 3, '#fafafa'); px(11, 2, 2, 1, '#e53935'); break;
      case 'helmet': px(5, 2, 14, 5, '#eceff1'); px(4, 5, 2, 8, '#eceff1'); px(18, 5, 2, 8, '#eceff1'); px(6, 4, 12, 1, '#e53935'); break;
      case 'freckles': px(8, 12, 1, 1, '#b07050'); px(10, 13, 1, 1, '#b07050'); px(14, 13, 1, 1, '#b07050'); px(16, 12, 1, 1, '#b07050'); break;
    }
  }
  R.drawPortrait = drawPortrait;

  /* =====================================================================
     1 回のレース
     ===================================================================== */

  /*
   * cfg:
   *   track, mirror, weather, laps（Infinity も可）, mode（race/time/elim/duel/arcade/chase/traffic）
   *   field [{name,color,body,ai,skill,pace,boss,ability,target}], traffic（台数）
   *   car {body,color,stats,offroad,siren}, levelMul, bestLap, ghost, timeLimit, cpBonus
   *   demo（自動運転の見本）, onFinish(result)
   */
  R.Session = function (cfg) {
    var sess = {};
    var weather = cfg.weather || 'clear';
    var T = buildTrack(cfg.track, cfg.mirror, weather);
    var segs = T.segs, trackLen = T.length, spec = T.spec, pal = T.pal, night = !!spec.night;
    var mode = cfg.mode || 'race', demo = !!cfg.demo;
    var laps = cfg.laps || Infinity;
    var lvl = cfg.levelMul || 1;
    var car = cfg.car || { body: 'sedan', color: '#5ccfa0', stats: { spd: 6, acc: 6, grp: 6, arm: 6, nit: 6 } };
    var st = car.stats;
    var wGrip = { rain: 0.86, snow: 0.76 }[weather] || 1;
    if (car.offroad) wGrip = 1 - (1 - wGrip) * 0.35;
    var fogDensity = { fog: 10, rain: 6.5, snow: 7, sand: 7, ash: 7 }[weather] || 5;

    // 性能を物理の数字に直す
    var topSpeed0 = MAX * (0.7 + st.spd * 0.035), accel0 = MAX / 5 * (0.7 + st.acc * 0.07);
    var steer0 = 2 * (0.82 + st.grp * 0.03), grip0 = (1.35 - st.grp * 0.07) / wGrip;
    var topSpeed = topSpeed0, accel = accel0, steer = steer0, grip = grip0, RV = 1;   // 管理者モードの倍率で毎フレーム更新する
    var offDecel = -MAX / 2 * (car.offroad ? 0.5 : 1) * (1.2 - st.grp * 0.04);
    var dmgTaken = clamp(1.4 - st.arm * 0.09, 0.35, 1.3);
    var nitroRate = 0.34 / (0.7 + st.nit * 0.08);
    var nitroPower = 1.16 + st.nit * 0.012;
    var nitroRefill = 0.8 + st.nit * 0.06;

    // アーケードのチェックポイント門
    if (mode === 'arcade') {
      [1, 2].forEach(function (k) { segs[Math.floor(segs.length * k / 3)].sprites.push({ kind: 'cpgate', offset: 0 }); });
    }

    var P = {
      pos: 0, x: 0, speed: 0, total: 0, lap: 0,
      nitro: mode === 'traffic' ? 0.4 : 0.6, boosting: false, damage: 0,
      lapStart: 0, lastLap: null, bestLap: null, laps: [],
      finished: false, finishTime: null, bump: 0, draft: 0, hitCool: 0, spin: 0, padT: 0, skid: 0
    };

    /* --- 相手 --- */
    var field = cfg.field || [];
    var nrows = Math.ceil(field.length / 2);
    var cars = field.map(function (d, i) {
      var c = {
        name: d.name, color: d.color, body: d.body || 'sedan', ai: d.ai || 'balanced', ability: d.ability || null,
        boss: !!d.boss, isTarget: !!d.target, skill: d.skill || 0.7,
        max: MAX * (d.pace || 1) * lvl * (d.ai === 'speedster' ? 1.03 : 1) * (AI_TRACK_SCALE[cfg.track] || 1),
        speed: 0, boostT: 0, burst: 1.14, finished: false, finishTime: null, out: false,
        wm: bodyWm(d.body), oilT: 4 + Math.random() * 4, blockT: 0, hp: 1, hitCool: 0, lane: 0, laneT: 0
      };
      if (mode === 'duel' || mode === 'drag') { c.total = PLAYER_Z; c.offset = -0.45; }
      else if (mode === 'touge') { c.total = PLAYER_Z + SEG * 7; c.offset = 0; }
      else if (mode === 'sp') { c.total = PLAYER_Z + SEG * 2; c.offset = -0.5; }
      else if (mode === 'chase') { c.total = PLAYER_Z + SEG * 45; c.offset = 0; }
      else {
        var row = Math.floor(i / 2);
        c.total = PLAYER_Z + (nrows - row) * SEG * 3 + (i % 2) * SEG;
        c.offset = i % 2 ? 0.45 : -0.45;
      }
      c.target = c.offset;
      return c;
    });
    if (mode === 'duel' || mode === 'drag' || mode === 'sp') P.x = 0.45;
    if (cfg.start) {   // 前の道から引き継ぐ（オープンワールド）
      ['speed', 'x', 'nitro', 'damage', 'total'].forEach(function (k) { if (cfg.start[k] !== undefined) P[k] = cfg.start[k]; });
      if (cfg.start.frac !== undefined) P.total = clamp(cfg.start.frac, 0, 0.95) * (spec.jEnd ? spec.jEnd * SEG : trackLen);
      if (cfg.start.fromEnd !== undefined) P.total = Math.max(0, (spec.jEnd ? spec.jEnd * SEG : trackLen) - (cfg.start.fromEnd + 6) * SEG);
      if (cfg.start.rev) P.rev = true;
      P.pos = P.total % trackLen;
    }
    var GEAR_TOP = [0.3, 0.48, 0.66, 0.84, 1.02], GEAR_ACC = [2.3, 1.75, 1.4, 1.12, 0.92];
    P.gear = 1; P.rpm = 0; P.maxSpeed = 0; P.stopT = 0;
    var edgeDone = false, coinsGot = 0;
    var edgeLen = spec.jEnd ? spec.jEnd * SEG : trackLen;   // 交差点（この道の終わり）までの長さ
    var p2p = !!(spec.touge || spec.p2p) || mode === 'drag';
    var goalDist = mode === 'drag' ? SEG * Math.round(402 / MPS) : (spec.finishAt ? spec.finishAt * SEG - PLAYER_Z : Infinity);
    var dragLen = goalDist;
    if (p2p) laps = 1;
    var gates = [], penalty = 0;
    /* --- SP バトルと無線 --- */
    var spg = { me: 100, foe: 100 };
    var radioQ = cfg.radio ? cfg.radio.map(function (r) { return { at: r.at, who: r.who, text: r.text, used: 0 }; }) : [];
    var radio = null, evCool = {}, damageSaid = false;
    function event(name) {
      if (demo) return;
      if (evCool[name] > 0) return;
      evCool[name] = 10;
      var r = radioQ.filter(function (x) { return x.at === name && x.used < (name === 'overtook' || name === 'overtaken' || name === 'damage' ? 2 : 1); })[0];
      if (!r) return;
      r.used++;
      var ch = R.CHARS[r.who] || { name: r.who, color: '#fff' };
      radio = { who: r.who, name: TB.t(ch.name), color: ch.color, text: TB.t(r.text), t: 4.2 };
      sfx('click');
    }
    /* --- 交差点の信号・交差車両・警察 --- */
    var sig = { phase: 'green', t: Math.random() * 14, cross: [], crossT: 0 };
    var cops = [], wantedT = 0, escapeT = 0, bustHits = 0, orbisDone = false, stopDone = false;
    segs.forEach(function (sg) { sg.sprites.forEach(function (sp) { if (sp.kind === 'signal') sp.phase = function () { return sig.phase; }; if (sp.kind === 'orbis') sig.orbis = sp; }); });
    function violation(kind) {
      if (mode !== 'world' || demo) return;
      var seen = cops.length > 0 || traffic.some(function (t) { return t.cop && Math.abs(t.total - pz()) < SEG * (kind === 'speed' ? 30 : 90); });
      if (kind === 'signal' && !seen && Math.random() < 0.3) seen = true;   // 信号の監視カメラ
      if (kind === 'copHit') seen = true;
      if (cfg.onViolation) cfg.onViolation(kind, seen);
      if (seen && !cops.length) startPursuit(SEG * 30);
    }
    function startPursuit(gapBack) {
      var src = traffic.filter(function (t) { return t.cop; }).sort(function (a, b) { return Math.abs(a.total - pz()) - Math.abs(b.total - pz()); })[0];
      if (src) { src.total = -1e9; src.cop = false; }   // 巡回中のパトカーが追跡に移る
      cops.push({ name: 'POLICE', color: '#f5f5f5', body: 'police', total: pz() - gapBack, offset: P.x, speed: Math.max(P.speed, MAX * 0.5), wm: 1, cop: true, siren: true });
      wantedT = 0; escapeT = 0; bustHits = 0;
      say(L('パトカーが追ってくる！', 'POLICE PURSUIT!'), 2.2); sfx('bad');
      if (!sirenA && R.sirenAudio) sirenA = R.sirenAudio();
      if (cfg.onPursuit) cfg.onPursuit(true);
    }
    var sirenA = null;
    function worldRules(dt) {
      // 信号: 青 8 秒 → 黄 2.5 秒 → 赤 6 秒
      if (spec.stopSeg) {
        sig.t = (sig.t + dt) % 16.5;
        sig.phase = sig.t < 8 ? 'green' : sig.t < 10.5 ? 'yellow' : 'red';
        var stopZ = spec.stopSeg * SEG, crossZ = spec.crossSeg * SEG;
        if (!stopDone && pz() > stopZ) {
          stopDone = true;
          if (sig.phase === 'red' && spec.junction.signal) { pop(L('信号無視！', 'RAN A RED LIGHT!'), '#ff5252'); violation('signal'); }
        }
        // 赤の間は交差する道路を車が横切る
        if (spec.junction.signal && sig.phase === 'red') {
          sig.crossT -= dt;
          if (sig.crossT <= 0) {
            var tt = R.TRAFFIC[Math.floor(Math.random() * R.TRAFFIC.length)];
            sig.cross.push({ x: Math.random() < 0.5 ? -4 : 4, v: 0, body: tt.body, color: tt.color });
            sig.cross[sig.cross.length - 1].v = sig.cross[sig.cross.length - 1].x < 0 ? 3.2 : -3.2;
            sig.crossT = 0.9 + Math.random() * 0.8;
          }
        }
        sig.cross.forEach(function (c) {
          c.x += c.v * dt;
          if (Math.abs(pz() - crossZ) < SEG * 3 && Math.abs(c.x - P.x) < 0.35 && P.hitCool <= 0) {
            P.speed *= 0.2; hurt(0.15); P.hitCool = 1; P.bump = 0.4; flash = 0.2; sfx('crash'); eng.event('crash');
            say(L('出会い頭の事故！', 'T-BONED!'), 1.6); violation('accident');
          }
        });
        sig.cross = sig.cross.filter(function (c) { return Math.abs(c.x) < 4.5; });
      }
      // 速度違反（パトカーの近く）・オービス
      var kmNow = kmh(P.speed);
      if (limitKmh && kmNow > limitKmh + 35 && !cops.length && traffic.some(function (t) { return t.cop && Math.abs(t.total - pz()) < SEG * 25; })) {
        pop(L('速度違反！', 'SPEEDING!'), '#ff5252'); violation('speed');
      }
      if (sig.orbis && !orbisDone && pz() > spec.orbisSeg * SEG) {
        orbisDone = true;
        if (limitKmh && kmNow > limitKmh + 40) { sig.orbis.flash = 0.3; flash = 0.25; pop(L('オービスが光った…', 'Speed camera flash!'), '#ffffff'); if (cfg.onViolation) cfg.onViolation('orbis', true, kmNow - limitKmh); }
      }
      if (sig.orbis && sig.orbis.flash > 0) sig.orbis.flash -= dt;
      // 追跡
      cops.forEach(function (c) {
        var gap = pz() - c.total;   // 正ならパトカーが後ろ
        var want = gap > SEG * 20 ? MAX * 1.1 : gap > SEG * 2 ? Math.max(P.speed * 1.06, MAX * 0.2) : P.speed * 0.97;
        c.speed += (c.speed < want ? MAX / 3 : -MAX / 2) * dt;
        c.total = Math.min(c.total + c.speed * dt, pz() - SEG * 0.6);   // 自車を追い越さない
        var tx = gap < SEG * 12 ? P.x : c.offset;
        traffic.forEach(function (t) { var d = t.total - c.total; if (d > 0 && d < SEG * 6 && Math.abs(t.offset - c.offset) < 0.4) tx = t.offset > 0 ? t.offset - 0.6 : t.offset + 0.6; });
        c.offset += clamp(tx - c.offset, -dt * 1.2, dt * 1.2);
        if (gap > -SEG * 0.2 && gap < SEG * 0.7 && Math.abs(c.offset - P.x) < OVERLAP && P.hitCool <= 0) {
          bustHits++; P.speed *= 0.75; P.hitCool = 0.8; P.bump = 0.25; sfx('hit'); pop(L('体当たりされた！', 'RAMMED BY POLICE!'), '#ff5252');
          if (c.total > pz() - SEG * 0.2) c.total = pz() - SEG * 0.8;
        }
        if (gap < SEG * 6 && P.speed < MAX * 0.05) wantedT += dt; else wantedT = Math.max(0, wantedT - dt * 0.5);
        if (gap > SEG * 300) escapeT += dt; else escapeT = 0;
        if (sirenA) sirenA.level(clamp(1 - gap / (SEG * 350), 0.05, 1));
      });
      if (cops.length && (bustHits >= 3 || wantedT > 2.5)) {
        cops = []; say(L('確保されました…', 'BUSTED'), 2.5); sfx('die');
        if (sirenA) { sirenA.stop(); sirenA = null; }
        if (cfg.onBusted) cfg.onBusted();
      } else if (cops.length && escapeT > 6) {
        cops = []; say(L('逃げ切った！', 'ESCAPED!'), 2.5); sfx('win');
        if (sirenA) { sirenA.stop(); sirenA = null; }
        if (cfg.onEscape) cfg.onEscape();
      }
    }
    if (mode === 'gymkhana') {
      for (var gi = 30, gk = 0; gi < spec.finishAt - 10; gi += 20, gk++) {
        var goff = clamp((gk % 2 ? 0.38 : -0.38) - cv(segs[gi]) * 0.03, -0.7, 0.7);
        segs[gi].objs.push({ kind: 'cone', offset: goff - 0.27 }, { kind: 'cone', offset: goff + 0.27 });
        gates.push({ z: (gi + 0.5) * SEG, off: goff, done: false });
      }
    }
    if (cfg.casual) segs.forEach(function (sg, i) {
      if (i < 40 || sg.tunnel || sg.finishLine) return;
      if (i % 70 === 0) sg.objs.push({ kind: 'pad', offset: [-0.55, 0, 0.55][Math.floor(i / 70) % 3] });
      else if (i % 45 === 0) for (var c3 = 0; c3 < 5 && segs[i + c3 * 3]; c3++) segs[i + c3 * 3].objs.push({ kind: 'coin', offset: [0.6, 0, -0.6][Math.floor(i / 45) % 3] });
    });
    if (mode === 'coins') segs.forEach(function (sg, i) { if (i > 30 && i % 9 === 0 && !sg.tunnel) sg.objs.push({ kind: 'coin', offset: [-0.6, 0, 0.6][Math.floor(i / 9) % 3] + Math.sin(i) * 0.1 }); });
    var targetCar = cars.filter(function (c) { return c.isTarget; })[0] || null;
    var bossCar = cars.filter(function (c) { return c.boss; })[0] || (mode === 'touge' || mode === 'sp' ? cars[0] : null);

    /* --- 一般車 --- */
    var traffic = [];
    var LANE_X = [-0.62, 0, 0.62];
    var twoWay = !!spec.twoWay, limitKmh = spec.limit || 0;
    function newTraffic(ahead) {
      var t = R.TRAFFIC[Math.floor(Math.random() * R.TRAFFIC.length)];
      var cop = spec.police && Math.random() < 0.12 * spec.police;
      var onc = twoWay && Math.random() < 0.45;
      var lim = limitKmh ? limitKmh / 280 : 0.4;
      var v = MAX * (twoWay || limitKmh ? lim * (0.85 + Math.random() * 0.3) : 0.3 + Math.random() * 0.2);
      return { body: cop ? 'police' : t.body, color: cop ? '#f5f5f5' : t.color, traffic: true, cop: cop, wm: bodyWm(cop ? 'police' : t.body),
               total: pz() + ahead, dir: onc ? -1 : 1,
               offset: twoWay ? (onc ? 0.5 : -0.5) + (Math.random() - 0.5) * 0.06 : LANE_X[Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * 0.1,
               speed: v, cruise: v, passed: false };
    }
    var trafficN = Math.round((cfg.traffic || 0) * (R.admin && R.admin.on ? R.admin.v.traffic : 1));
    for (var ti = 0; ti < trafficN; ti++) traffic.push(newTraffic(SEG * (30 + ti * (260 / Math.max(1, trafficN)))));
    if (spec.train) traffic.push({ body: 'train', color: spec.train === 'entetsu' ? '#d32f2f' : '#eceff1', traffic: true, train: true, wm: 1.35,
                                   total: pz() + SEG * 60, offset: spec.water === 'left' ? 2.6 : -2.6, speed: MAX * 0.28, cruise: MAX * 0.28, dir: 1, passed: true });

    /* --- 状態 --- */
    var state = demo || cfg.start ? 'race' : 'count', countT = 3.2, raceT = 0, keys = {};
    var msg = { text: '', t: 0 }, popups = [], parts = [], dyn = [];
    var skyOff = 0, hillOff = 0, finishWait = 0, result = null;
    var timer = (cfg.timeLimit || 0) * (R.admin && R.admin.on ? R.admin.v.time : 1), cpDist = trackLen / 3, nextCp = cpDist;
    var score = 0, combo = 0, comboT = 0, nearCount = 0, maxCombo = 0, overtakes = 0, topKmh = 0;
    var prevRank = null, eliminated = [], flash = 0, lastHitName = '';
    var ghost = cfg.ghost || null, rec = { s: [], x: [] }, newGhost = null;
    var t0 = 0;
    var eng = !demo && R.carAudio ? R.carAudio(car.body) : { update: function () {}, set: function () {}, stop: function () {}, mute: function () {}, event: function () {}, info: function () { return {}; } };
    var passT = 0;

    function say(text, t) { msg.text = text; msg.t = t || 1.6; }
    function pop(text, color) { popups.push({ text: text, color: color || '#ffd93d', t: 1.6 }); if (popups.length > 4) popups.shift(); }
    function findSeg(z) { return segs[Math.floor((((z % trackLen) + trackLen) % trackLen) / SEG) % segs.length]; }
    function pz() { return P.total + PLAYER_Z; }
    function racers() { return cars.filter(function (c) { return !c.out; }); }
    function rank() {
      var n = 1, me = pz();
      racers().forEach(function (c) { if (c.total > me) n++; });
      return n;
    }
    function kmh(v) { return Math.round(Math.abs(v) / MAX * 280); }
    function canReverse() { return mode !== 'drag' && mode !== 'brake' && !P.finished && state === 'race'; }
    /* ウインカー: -1 左 / 0 なし / 1 右。交差点ではこれで曲がる方向を決める */
    P.blink = 0;
    function chooseExit() {
      var d = cfg.exitDirs, i, best = -1;
      if (P.blink < 0) { for (i = 0; i < d.length; i++) if (d[i] === 'left' || d[i] === 'uturn') { best = i; break; } }
      else if (P.blink > 0) { for (i = d.length - 1; i >= 0; i--) if (d[i] === 'right' || d[i] === 'uturn') { best = i; break; } }
      if (best < 0) {
        best = d.indexOf('straight');
        if (best < 0) best = cfg.exitDefault !== undefined ? cfg.exitDefault : 0;
        if (P.blink < 0) best = 0; else if (P.blink > 0) best = d.length - 1;
      }
      return best;
    }
    sess.exitChoice = function () { return cfg.exitDirs ? chooseExit() : null; };
    function cv(sg) { return sg.phys !== undefined ? sg.phys : sg.curve; }   // 物理で使うカーブ（実在の道は別に持つ）

    /* --- 自動運転（見本走行・ゴール後・テスト用） --- */
    function autopilot() {
      var ahead = findSeg(pz() + SEG * 10), far = findSeg(pz() + SEG * 22);
      var tx = clamp(-(cv(ahead) * 0.08 + cv(far) * 0.04), -0.65, 0.65);
      if (twoWay) tx = -0.5;
      if (targetCar && !targetCar.caught && targetCar.total - pz() < SEG * 40) tx = targetCar.offset;
      cars.concat(traffic).forEach(function (c) {
        if (c.out || c.isTarget) return;
        var gap = c.total - pz();
        if (gap > 0 && gap < SEG * 12 && Math.abs(c.offset - tx) < 0.42) tx = c.offset > 0 ? c.offset - 0.6 : c.offset + 0.6;
      });
      tx = clamp(tx, -0.8, 0.8);
      keys.left = P.x > tx + 0.06; keys.right = P.x < tx - 0.06;
      var sharp = Math.max(Math.abs(cv(ahead)), Math.abs(cv(far))) > 4.5 && P.speed > topSpeed * 0.84;
      keys.up = !sharp; keys.down = sharp && P.speed > topSpeed * 0.92;
      keys.nitro = Math.abs(cv(ahead)) < 1.2 && Math.abs(cv(far)) < 2 && P.nitro > 0.45;
      {   // この先のカーブに合わせて速さを決める（曲がりきれる速さは、ハンドルの切れ・グリップ・天気で車ごとに違う）
        var look = Math.min(260, 20 + P.speed * P.speed / (2 * BRAKE) / SEG * 1.2), vOk = spec.custom && limitKmh && mode === 'world' ? (limitKmh + 8) / 280 * MAX : topSpeed;
        var kcar = 0.8 * steer / (0.6 * grip);
        for (var la = 2; la < look; la += 2) {
          var sgA = findSeg(pz() + SEG * la), pc = Math.abs(cv(sgA));
          if (pc > 0.5) { var vv = MAX * Math.min(1, kcar / pc); vOk = Math.min(vOk, Math.sqrt(vv * vv + 2 * BRAKE * SEG * Math.max(0, la - 4))); }
        }
        keys.up = P.speed < vOk * 0.97; keys.down = P.speed > vOk * 1.03;
        if (spec.custom || vOk < topSpeed * 0.98) keys.nitro = false;
      }
      if (mode === 'drag') { keys.nitro = P.rpm > 0.86; keys.left = keys.right = false; }
      if (mode === 'brake') { var dz = (cfg.stopAt + 0.5) * SEG - pz(), stopD = P.speed * P.speed / (2 * BRAKE); keys.up = dz > stopD * 1.02; keys.down = !keys.up; keys.nitro = false; }
    }

    /* --- 更新 --- */
    var geom = spec.geom ? { rw: spec.geom.rw, cw: spec.geom.cw, lanes: spec.geom.lanes } : spec.touge || spec.narrow ? { rw: 1350, cw: 0.19, lanes: 2 } : { rw: 2000, cw: 0.13, lanes: 3 };
    function useGeom() { ROAD_W = geom.rw; CAR_W = geom.cw; OVERLAP = CAR_W * 2 * 0.9; LANES = geom.lanes; }
    function update(dt) {
      useGeom();
      var adm = R.admin && R.admin.on ? R.admin.v : null;
      topSpeed = topSpeed0 * (adm ? adm.speed : 1); accel = accel0 * (adm ? adm.accel : 1);
      steer = steer0 * (adm ? adm.grip : 1); grip = grip0 / (adm ? adm.grip : 1); RV = adm ? adm.rival : 1;
      if (adm && state === 'race' && !P.finished) { if (adm.nitro) P.nitro = 1; if (adm.god) P.damage = 0; }
      t0 += dt;
      if (msg.t > 0) msg.t -= dt;
      if (radio) { radio.t -= dt; if (radio.t <= 0) radio = null; }
      for (var ek in evCool) if (evCool[ek] > 0) evCool[ek] -= dt;
      popups.forEach(function (p) { p.t -= dt; });
      popups = popups.filter(function (p) { return p.t > 0; });
      if (flash > 0) flash -= dt;
      updateParts(dt);

      if (state === 'count') {
        var before = Math.ceil(countT);
        countT -= dt;
        var after = Math.ceil(countT);
        if (after !== before && after >= 1 && after <= 3) sfx('count');
        if (countT <= 0) { state = 'race'; say('GO!', 1); sfx('go'); setTimeout(function () { event('start'); }, 700); }
        eng.update({ speed: 0, throttle: keys.up, rain: weather === 'rain' });
        moveTraffic(dt);
        return;
      }
      if (state === 'results') { eng.update({ speed: P.speed / topSpeed, throttle: false }); moveTraffic(dt); return; }

      raceT += dt;
      if (demo || R.auto || P.finished || (adm && adm.auto)) autopilot();

      var seg = findSeg(pz());
      var pct = P.speed / MAX;
      var dxs = dt * steer * pct, dxc = dt * 2 * pct;

      if (P.spin > 0) {
        P.spin -= dt;
        P.x += Math.sin(raceT * 13) * dt * 1.4;
        P.speed -= MAX * 0.4 * dt;
      } else {
        if (keys.left) P.x -= dxs;
        else if (keys.right) P.x += dxs;
      }
      var sc = cv(seg);
      P.x -= dxc * Math.abs(pct) * sc * CENTRIFUGAL * grip;
      P.skid = (Math.abs(sc) > 3 && pct > 0.7 && ((sc > 0 && keys.right) || (sc < 0 && keys.left))) ? 1 : 0;

      // スリップストリーム
      P.draft = 0;
      racers().forEach(function (c) {
        var gap = c.total - pz();
        if (gap > SEG * 1.5 && gap < SEG * 9 && Math.abs(c.offset - P.x) < 0.35) P.draft = 1;
      });

      // ニトロ
      P.boosting = false;
      if (keys.nitro && P.nitro > 0.02 && pct > 0.2 && P.spin <= 0 && mode !== 'drag' && mode !== 'brake') {
        P.boosting = true;
        P.nitro = Math.max(0, P.nitro - nitroRate * dt);
        if (!P.wasBoosting && !demo) sfx('boost');
      }
      P.wasBoosting = P.boosting;
      var refill = (0.012 + (P.draft ? 0.08 : 0) + (pct > 0.85 && Math.abs(P.x) < 1 ? 0.018 : 0)) * nitroRefill;
      if (!P.boosting) P.nitro = Math.min(1, P.nitro + refill * dt);
      if (P.padT > 0) P.padT -= dt;

      var wrecked = P.damage >= 1;
      var limit = topSpeed * (1 - Math.min(P.damage, 1) * 0.18) * (P.boosting ? nitroPower : 1) * (P.draft ? 1.06 : 1) *
                  (P.padT > 0 ? 1.18 : 1) * (wrecked ? 0.8 : 1);
      if (P.finished && !demo) limit = Math.min(limit, MAX * 0.5);
      if (mode === 'drag') {
        var gtop = topSpeed * GEAR_TOP[P.gear - 1];
        P.rpm = clamp(P.speed / gtop, 0, 1.05);
        var torque = P.rpm < 0.25 ? 0.75 : P.rpm < 0.97 ? 1 : 0;
        if (!P.finished) P.speed += accel * GEAR_ACC[P.gear - 1] * torque * (P.padT > 0 ? 1.25 : 1) * dt;
        else P.speed -= MAX * 0.5 * dt;
        P.boosting = false;
        if (keys.nitro && !P.shiftHeld && P.gear < 5 && !P.finished) {
          var q = P.rpm >= 0.8 && P.rpm <= 0.97 ? 'perfect' : P.rpm < 0.62 ? 'early' : 'good';
          P.gear++;
          if (q === 'perfect') { P.padT = 0.7; pop('PERFECT SHIFT!', '#5ccfa0'); sfx('coin'); }
          else if (q === 'early') { P.speed *= 0.97; pop(L('早すぎ…', 'EARLY'), '#ff8a80'); }
          else pop('GOOD', '#ffd93d');
        }
        P.shiftHeld = !!keys.nitro;
        limit = topSpeed * 1.1;
      } else if (P.rev) {
        // バック（後退ギア）: ↓で下がる、↑でブレーキ → 止まったら前進に戻る
        if (keys.down) P.speed -= accel * 0.45 * dt;
        else if (keys.up) P.speed += BRAKE * dt;
        else P.speed = Math.min(0, P.speed + COAST * dt);
        if (P.speed >= 0 && keys.up) { P.rev = false; P.speed = 0; }
      } else if (keys.up || P.boosting) P.speed += (P.boosting ? accel * 1.6 : accel) * dt;
      else if (keys.down) {
        P.speed -= BRAKE * dt;
        // 止まってから↓を押し続けるとバックに入る
        if (P.speed <= MAX * 0.004 && canReverse()) { P.revT = (P.revT || 0) + dt; if (P.revT > 0.35) { P.rev = true; P.revT = 0; pop(L('R（バック）', 'REVERSE'), '#cfd8dc'); } }
      }
      else P.speed -= COAST * dt;
      if (!keys.down) P.revT = 0;

      // 芝生・壁・飾り
      var off = P.x < -1 || P.x > 1;
      var wallX = seg.tunnel ? 1.12 : seg.rails ? 1.06 : 0;
      if (wallX && Math.abs(P.x) > wallX) {
        P.x = clamp(P.x, -wallX, wallX);
        if (seg.rails && P.hitCool <= 0 && P.speed > MAX / 4) { sfx('hit'); eng.event('scrape'); P.hitCool = 0.4; P.bump = 0.15; }
        if (P.speed > MAX / 5) { P.speed -= MAX * 0.9 * dt; P.damage = Math.min(1.2, P.damage + 0.03 * dt * dmgTaken); spark(W / 2 + (P.x > 0 ? 40 : -40), H - 30, 2); }
      } else if (off) {
        if (P.speed > MAX / 4) P.speed += offDecel * dt;
        if (Math.random() < 0.6) dust();
        seg.sprites.forEach(function (sp) {
          var sw = spriteWidth(sp.kind);
          if (!sw) return;
          var so = sp.offset + (sp.offset > 0 ? sw / 2 : -sw / 2) * 0.6;
          if (Math.abs(P.x - so) < sw * 0.5 + CAR_W && P.speed > MAX / 6) {
            P.speed = MAX / 6;
            hurt(0.08);
            P.pos = Math.max(0, P.pos - SEG * 0.4);
            P.bump = 0.3; flash = 0.15;
            sfx('crash'); eng.event('crash'); spark(W / 2, H - 30, 10);
            say(L('クラッシュ！', 'CRASH!'), 1);
            combo = 0;
          }
        });
      }

      // 道の上の物
      seg.objs.forEach(function (o) { touchObj(o); });
      dyn.forEach(function (o) { if (Math.abs(o.z - pz()) < SEG * 0.6) touchObj(o); });

      // 車との接触
      if (P.hitCool > 0) P.hitCool -= dt;
      racers().concat(traffic).forEach(function (c) { contact(c, dt); });

      P.speed = clamp(P.speed, P.rev ? -MAX * 0.09 : 0, limit);
      P.x = clamp(P.x, -2.6, 2.6);
      if (P.bump > 0) P.bump -= dt;
      topKmh = Math.max(topKmh, kmh(P.speed));

      var move = P.speed * dt;
      if (move < 0 && P.total + move < 0) {
        if (mode === 'world' && !edgeDone && cfg.onEdgeEnd && cfg.canBack) {
          edgeDone = true;
          cfg.onEdgeEnd({ speed: P.speed, x: P.x, nitro: P.nitro, damage: P.damage, back: true });
        }
        move = -P.total; P.speed = 0;
      }
      P.pos += move;
      P.total += move;
      while (P.pos >= trackLen) P.pos -= trackLen;
      while (P.pos < 0) P.pos += trackLen;
      if (!demo && state === 'race') {
        R._km = (R._km || 0) + move / SEG * MPS / 1000;
      }

      P.maxSpeed = Math.max(P.maxSpeed, P.speed);
      if (cfg.onTick && !demo) cfg.onTick(dt, { speed: P.speed, damage: P.damage, x: P.x, kmh: kmh(P.speed), frac: P.total / edgeLen });
      if (mode === 'world' && !edgeDone && P.total >= edgeLen - SEG * 3) {
        edgeDone = true;
        var nx = cfg.exits || 1, ch = 0;
        if (cfg.exitDirs) ch = chooseExit();   // ウインカーで選ぶ（車線はそのまま）
        else if (nx === 2) ch = P.x < 0 ? 0 : 1;
        else if (nx >= 3) ch = P.x < -0.3 ? 0 : P.x > 0.3 ? 2 : 1;
        if (sirenA) { sirenA.stop(); sirenA = null; }
        if (cfg.onEdgeEnd) cfg.onEdgeEnd({ speed: P.speed, x: clamp(P.x, -0.9, 0.9), nitro: P.nitro, damage: P.damage, choice: ch,
                                           copGap: cops.length ? clamp(pz() - cops[0].total, SEG * 5, SEG * 200) : 0 });
      }
      if (mode === 'brake' && !P.finished) {
        var zc = (cfg.stopAt + 0.5) * SEG;
        if (P.maxSpeed > MAX * 0.4 && P.speed < 2) P.stopT += dt; else P.stopT = 0;
        if (P.stopT > 0.4) {
          var dm = (pz() - zc) / SEG * MPS;
          score = Math.max(0, Math.round((1000 - Math.abs(dm) * 45) * clamp(kmh(P.maxSpeed) / 240, 0.3, 1.2)));
          P.stopDist = dm;
          pop(Math.abs(dm) < 1.5 ? L('ピタッ！', 'PERFECT STOP!') : (dm > 0 ? L('行き過ぎ ', 'Over by ') : L('手前 ', 'Short by ')) + Math.abs(dm).toFixed(1) + 'm', '#ffd93d');
          sfx(Math.abs(dm) < 6 ? 'win' : 'lap');
          end('stopped');
        } else if (pz() > zc + SEG * 40) { score = 0; P.stopDist = (pz() - zc) / SEG * MPS; say(L('止まれず…', 'OVERSHOT'), 2); sfx('bad'); end('over'); }
      }
      if (mode === 'gymkhana') gates.forEach(function (gt) {
        if (gt.done || pz() < gt.z) return;
        gt.done = true;
        if (Math.abs(P.x - gt.off) < 0.2) { pop(L('ゲート OK', 'GATE OK'), '#5ccfa0'); sfx('click'); }
        else { penalty += 5; pop(L('ゲート失敗 +5秒', 'MISSED GATE +5s'), '#ff5252'); sfx('bad'); }
      });
      if (mode === 'touge' && !P.finished && cars[0] && raceT > 12) {
        var tg = cars[0].total - pz();
        if (tg > SEG * 116) { P.place = 2; say(L('引き離された…', 'LEFT BEHIND'), 3); sfx('bad'); end('finish'); }
        else if (tg < -SEG * 116) { P.place = 1; say(L('引き離し勝ち！', 'PULLED AWAY — WIN!'), 3); sfx('win'); end('finish'); }
      }
      if (p2p && !P.finished && P.total >= goalDist) {
        var tRun = raceT * 1000;
        P.laps.push(tRun); P.bestLap = tRun; P.lastLap = tRun;
        if (mode !== 'drag' && mode !== 'gymkhana') {
          if (cfg.bestLap === null || cfg.bestLap === undefined || tRun < cfg.bestLap) { cfg.bestLap = tRun; pop(L('自己ベスト！ ', 'NEW BEST ') + fmt(tRun), '#5ccfa0'); }
          if (mode === 'time' && rec.s.length > 5 && (!ghost || tRun < ghost.t)) newGhost = { t: Math.round(tRun), s: rec.s, x: rec.x };
        }
        P.place = mode === 'drag' || mode === 'touge' ? (cars.some(function (c) { return c.finished; }) ? 2 : 1) : 1 + racers().filter(function (c) { return c.finished; }).length;
        if (mode === 'gymkhana') { say(L('ゴール！ ', 'FINISH! ') + fmt((raceT + penalty) * 1000), 3); sfx('win'); }
        else { say(P.place === 1 ? L('勝ち！', 'YOU WIN!') : L(P.place + ' 位', 'P' + P.place), 3); sfx(P.place === 1 ? 'win' : 'lap'); }
        end('finish');
      }
      if (mode === 'world') worldRules(dt);
      if (!P.finished && state === 'race') {
        var foe0 = bossCar || cars[0];
        if (foe0) {
          var fg = foe0.total - pz();
          if (fg > 0 && fg < SEG * 8) event('close');
          if (fg < -SEG * 30) event('ahead');
        }
        if (P.damage > 0.5 && !damageSaid) { damageSaid = true; event('damage'); }
        if (p2p && goalDist < Infinity && P.total > goalDist * 0.78) event('final');
        if (mode === 'sp' && cars[0]) {
          var sg2 = cars[0].total - pz(), m2 = Math.abs(sg2) / SEG * MPS;
          var drain = Math.min(11, 0.6 + m2 * 0.05) * dt;
          if (sg2 > SEG * 1.5) spg.me -= drain; else if (sg2 < -SEG * 1.5) spg.foe -= drain;
          if (spg.me <= 0 || spg.foe <= 0) {
            spg.me = Math.max(0, spg.me); spg.foe = Math.max(0, spg.foe);
            P.place = spg.foe <= 0 ? 1 : 2;
            say(P.place === 1 ? L('SP バトル 勝利！', 'SP BATTLE WON!') : L('SP 切れ…', 'OUT OF SPIRIT...'), 3);
            sfx(P.place === 1 ? 'win' : 'bad'); event(P.place === 1 ? 'win' : 'lose');
            end('finish');
          }
        }
      }
      recordGhost();
      if (mode !== 'world' && mode !== 'brake' && !p2p) lapCheck();
      modeRules(dt);
      updateRivals(dt);
      moveTraffic(dt);
      dyn.forEach(function (o) { o.life -= dt; });
      dyn = dyn.filter(function (o) { return o.life > 0; });

      // 順位が上がったら知らせる
      if (!demo && (mode === 'race' || mode === 'duel' || mode === 'elim' || mode === 'touge' || mode === 'sp') && !P.finished) {
        var rk = rank();
        if (prevRank !== null && rk < prevRank && raceT > 2) { pop(L('▲ ' + rk + ' 位', '▲ P' + rk), '#5ccfa0'); overtakes += prevRank - rk; event('overtook'); }
        else if (prevRank !== null && rk > prevRank && raceT > 2) event('overtaken');
        prevRank = rk;
      }

      var skc = clamp(seg.curve, -8, 8);
      skyOff += dt * pct * skc * 0.0012;
      hillOff += dt * pct * skc * 0.0025;
      eng.update({ speed: Math.abs(P.speed) / topSpeed, throttle: (P.rev ? keys.down : keys.up) || P.boosting || (mode === 'drag' && !P.finished && state === 'race'), boost: P.boosting,
                   skid: P.skid || P.spin > 0 || (Math.abs(sc) > 4 && pct > 0.75), off: (P.x < -1 || P.x > 1) && !seg.tunnel && !seg.rails,
                   rain: weather === 'rain', rpm01: mode === 'drag' ? P.rpm : undefined });
      // すれ違い（近くの車を抜いたときの風の音）
      if (passT > 0) passT -= dt;
      if (passT <= 0) cars.concat(traffic).forEach(function (c) { var gp = c.total - pz(); if (gp < 0 && gp > -SEG * 0.5 && Math.abs(c.offset - P.x) < 0.6 && P.speed > c.speed + MAX * 0.1) { eng.event('passby'); passT = 0.4; } });

      if (P.boosting && Math.random() < 0.9) flame();
      if (P.skid && Math.random() < 0.7) smoke();
      if (P.damage > 0.6 && Math.random() < P.damage * 0.3) smoke(true);

      if (P.finished && !demo) {
        finishWait += dt;
        var wait = (mode === 'race' || mode === 'duel' || mode === 'drag' || mode === 'touge') ? (racers().every(function (c) { return c.finished; }) || finishWait > 7) : finishWait > 1.6;
        if (wait) settle();
      }
    }

    function hurt(n) {
      P.damage = Math.min(1.2, P.damage + n * dmgTaken);
      if (mode === 'sp') spg.me -= n * 60;
      if (mode === 'traffic' && P.damage >= 1 && !P.finished) end('wrecked');
    }

    function touchObj(o) {
      if (o.hit && o.kind !== 'oil' && o.kind !== 'pad') return;
      if (Math.abs(P.x - o.offset) > CAR_W + objWidth(o.kind)) return;
      if (o.kind === 'coin') {
        o.hit = true; coinsGot++; sfx('coin');
        if (mode === 'coins') score = coinsGot;
        if (cfg.onCoin) cfg.onCoin();
        return;
      }
      if (o.kind === 'oil') {
        if (P.spin <= 0 && P.speed > MAX / 5) { P.spin = 1.0; sfx('crash'); say(L('スリップ！', 'OIL SLICK!'), 1.2); combo = 0; }
      } else if (o.kind === 'pad') {
        if (P.padT <= 0.9) { P.padT = 1.3; P.speed = Math.max(P.speed, topSpeed * 1.05); sfx('boost'); pop(L('加速！', 'BOOST!'), '#00e5ff'); }
      } else {
        o.hit = true;
        if (mode === 'gymkhana') { penalty += 2; pop(L('パイロン +2秒', 'CONE +2s'), '#ff8a80'); sfx('hit'); return; }
        if (P.speed > MAX / 5) P.speed *= 0.8;
        hurt(0.025); P.bump = 0.15; sfx('hit'); spark(W / 2, H - 34, 4);
      }
    }

    function contact(c, dt) {
      var gap = c.total - pz(), dx = c.offset - P.x, wide2 = OVERLAP * (1 + (c.wm - 1) * 0.5);
      if (c.dir === -1) {   // 対向車と正面衝突
        if (gap > -SEG * 0.3 && gap < SEG * 0.8 && Math.abs(dx) < wide2 && P.hitCool <= 0) {
          P.speed = 0; c.speed = 0; hurt(0.22); P.hitCool = 1; P.bump = 0.4; flash = 0.2;
          sfx('crash'); eng.event('crash'); spark(W / 2, H * 0.6, 16); say(L('正面衝突！', 'HEAD-ON!'), 1.6);
          violation('accident');
        }
        if (!c.passed && gap < 0) c.passed = true;
        return;
      }
      // 追突
      if (gap > 0 && gap < SEG * 0.8 && Math.abs(dx) < wide2 && P.speed > c.speed) {
        var closing = (P.speed - c.speed) / MAX;
        if (c.isTarget && !c.caught) {
          P.speed = c.speed * 0.92;
          if (P.hitCool <= 0) {
            c.hp -= clamp(0.1 + closing * 0.5, 0.1, 0.3);
            P.hitCool = 0.5; P.bump = 0.2; flash = 0.1; sfx('crash'); spark(W / 2, H * 0.6, 12);
            c.target = clamp(c.offset + (Math.random() < 0.5 ? -0.5 : 0.5), -0.8, 0.8);
            if (c.hp <= 0) { c.caught = true; c.hp = 0; say(L('確保！', 'BUSTED!'), 2.5); sfx('win'); end('caught'); }
            else pop(L('ヒット！ 残り ', 'HIT! ') + Math.round(c.hp * 100) + '%', '#ff5252');
          }
          return;
        }
        P.speed = c.speed * (c.traffic ? 0.75 : 0.9);
        P.x += (P.x > c.offset ? 0.12 : -0.12);
        if (!c.traffic) c.target = clamp(c.offset + (c.offset > P.x ? 0.3 : -0.3), -0.85, 0.85);
        if (P.hitCool <= 0) {
          hurt(c.traffic ? clamp(closing * 0.25, 0.03, 0.09) : clamp(closing * 0.12, 0.005, 0.03));
          P.hitCool = 0.6; P.bump = c.traffic ? 0.3 : 0.2;
          if (c.traffic) { flash = 0.12; sfx('crash'); eng.event('crash'); combo = 0; violation(c.cop ? 'copHit' : 'accident'); spark(W / 2, H * 0.62, 10); }
          else { sfx('hit'); spark(W / 2, H * 0.62, 5); }
        }
        return;
      }
      // 横に並んでこすった
      if (Math.abs(gap) < SEG * 0.5 && Math.abs(dx) < wide2 * 0.9 && !c.caught) {
        var push = dx > 0 ? -1 : 1;
        var hard = (c.ai === 'aggressive' || c.ability === 'ram' || c.ability === 'all') ? 2 : 1;
        P.x += push * dt * 1.4 * hard;
        c.offset -= push * dt * 0.8;
        if (P.hitCool <= 0) { hurt(c.traffic ? 0.03 : 0.012 * hard); P.hitCool = 0.5; sfx('hit'); spark(W / 2 + push * -30, H - 36, 4); }
      }
      // ニアミス（一般車の横をすれすれで抜けた）
      if (c.traffic && !c.passed && gap < 0) {
        c.passed = true;
        if (Math.abs(dx) < 0.46 && P.speed > MAX * 0.55 && P.hitCool <= 0) {
          combo = comboT > 0 ? combo + 1 : 1; comboT = 4; nearCount++; maxCombo = Math.max(maxCombo, combo);
          var pts = 250 * combo;
          if (mode === 'traffic') score += pts;
          P.nitro = Math.min(1, P.nitro + 0.08);
          pop(L('ニアミス ×', 'NEAR MISS ×') + combo + (mode === 'traffic' ? '  +' + pts : ''), '#ffd93d');
          sfx('coin');
        }
      }
    }

    function lapCheck() {
      var lapNow = Math.floor(P.total / trackLen);
      if (lapNow <= P.lap || P.finished) return;
      var t = (raceT - P.lapStart) * 1000;
      P.laps.push(t);
      P.lastLap = t;
      if (P.bestLap === null || t < P.bestLap) P.bestLap = t;
      var timed = mode !== 'chase' && mode !== 'traffic' && mode !== 'coins';
      if (mode === 'coins') segs.forEach(function (sg) { sg.objs.forEach(function (o) { o.hit = false; }); });
      if (timed && !demo) {
        if (cfg.bestLap === null || cfg.bestLap === undefined || t < cfg.bestLap) {
          cfg.bestLap = t;
          pop(L('自己ベスト！ ', 'NEW BEST LAP ') + fmt(t), '#5ccfa0');
        } else pop(L('ラップ ', 'LAP ') + fmt(t), '#ffffff');
        sfx('lap');
      }
      // ゴースト（この周が今までで一番速ければ入れ替える）
      if (mode === 'time' && rec.s.length > 5 && (!ghost || t < ghost.t)) {
        newGhost = { t: Math.round(t), s: rec.s, x: rec.x };
        ghost = newGhost;
      }
      rec = { s: [], x: [] };
      P.lap = lapNow;
      P.lapStart = raceT;

      if (mode === 'elim') eliminate();
      if (mode === 'arcade') { timer += cfg.cpBonus || 10; nextCp = (P.lap * 3 + 1) * cpDist; pop(L('チェックポイント +', 'CHECKPOINT +') + Math.round(cfg.cpBonus || 10) + 's', '#56a8f5'); sfx('lap'); }
      if (P.finished) return;
      if (P.lap >= laps) {
        P.place = rank();
        if (mode === 'race' || mode === 'duel') {
          say(P.place === 1 ? L('優勝！', 'VICTORY!') : L('ゴール！ ' + P.place + ' 位', 'FINISH! P' + P.place), 3);
          sfx(P.place <= 3 ? 'win' : 'lap');
        } else if (mode === 'elim') { say(L('生き残った！', 'LAST ONE STANDING!'), 3); sfx('win'); }
        else { say(L('ゴール！', 'FINISH!'), 3); sfx('win'); }
        end('finish');
      } else if (P.lap === laps - 1 && laps > 1) {
        say(L('ファイナルラップ', 'FINAL LAP'), 1.8); event('final');
      } else event('lap');
    }

    function eliminate() {
      var alive = racers();
      if (!alive.length) return;
      var lastC = alive.reduce(function (a, c) { return c.total < a.total ? c : a; });
      if (lastC.total > pz()) {
        say(L('脱落…', 'ELIMINATED'), 3); sfx('bad');
        eliminated.push({ name: 'YOU', you: true });
        end('eliminated');
        return;
      }
      lastC.out = true; lastC.target = lastC.offset > 0 ? 1.5 : -1.5;
      eliminated.push({ name: lastC.name, color: lastC.color });
      pop(lastC.name + L(' 脱落！', ' ELIMINATED!'), '#ff5252');
      sfx('flag');
    }

    function end(reason) {
      if (P.finished) return;
      P.finished = true;
      P.finishTime = raceT;
      P.endReason = reason;
      if (!P.place) P.place = rank();
      if (reason === 'wrecked') { say(L('大破！', 'WRECKED!'), 3); sfx('die'); }
      if (reason === 'timeout') { say(L('タイムアップ', "TIME'S UP"), 3); sfx('bad'); }
    }

    function modeRules(dt) {
      if (P.finished) return;
      if (mode === 'arcade' || mode === 'chase' || mode === 'coins' || (mode === 'world' && cfg.timeLimit)) {
        timer -= dt;
        if (mode === 'arcade' && P.total >= nextCp) {
          var onLine = Math.abs(P.total / trackLen - Math.round(P.total / trackLen)) < 0.01;
          if (!onLine) { timer += cfg.cpBonus || 10; pop(L('チェックポイント +', 'CHECKPOINT +') + Math.round(cfg.cpBonus || 10) + 's', '#56a8f5'); sfx('lap'); }
          nextCp += cpDist;
        }
        if (timer <= 0) { timer = 0; if (mode === 'coins') { say(L('タイムアップ！ ', "TIME'S UP! ") + coinsGot + L(' 枚', ' coins'), 3); sfx('win'); end('finish'); } else end('timeout'); }
      }
      if (mode === 'traffic') {
        score += P.speed / MAX * 100 * dt * (1 + Math.min(combo, 10) * 0.1);
        if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
        if (Math.floor(raceT / 20) > Math.floor((raceT - dt) / 20) && traffic.length < 40) {
          for (var i = 0; i < 3; i++) traffic.push(newTraffic(SEG * (120 + Math.random() * 120)));
          pop(L('交通量アップ', 'TRAFFIC UP'), '#ff9f43');
        }
      } else if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
    }

    /* --- ライバルの頭脳 --- */
    function updateRivals(dt) {
      if (mode === 'drag') {
        cars.forEach(function (c) {
          if (state !== 'race') return;
          var tgt = c.max * RV * (c.total - PLAYER_Z < dragLen ? 1 : 0.4);
          c.speed += (c.speed < tgt ? MAX / 3.4 * (1.2 - c.speed / c.max * 0.6) : -MAX / 2) * dt;
          c.speed = clamp(c.speed, 0, c.max);
          c.total += c.speed * dt;
          if (!c.finished && c.total - PLAYER_Z >= goalDist) { c.finished = true; c.finishTime = raceT; }
        });
        return;
      }
      cars.forEach(function (c) {
        if (c.out) {
          c.speed = Math.max(0, c.speed - MAX * 0.5 * dt);
          c.total += c.speed * dt;
          c.offset += clamp(c.target - c.offset, -dt, dt);
          return;
        }
        if (c.caught) { c.speed = Math.max(0, c.speed - MAX * 0.8 * dt); c.total += c.speed * dt; return; }
        var cs = findSeg(c.total + SEG * 6), curv = Math.abs(cv(cs));
        var cp = c.ai === 'technician' ? 0.5 : c.ai === 'speedster' ? 1.6 : 1;
        var target = c.max * RV * (1 - curv * (spec.custom ? 0.05 : 0.022) * (1.2 - c.skill) * cp) * ({ rain: 0.97, snow: 0.94 }[weather] || 1);
        var gap = pz() - c.total;
        if (!P.finished) {
          if (c.isTarget) {
            if (gap < -SEG * 300) target *= 0.72;
            else if (gap < -SEG * 140) target *= 0.85;
            else if (gap > -SEG * 12) target *= 1.02;
          } else if (gap > SEG * 60) target *= c.boss ? 1.1 : 1.07;
          else if (gap > SEG * 25) target *= c.boss ? 1.05 : 1.03;
          else if (gap < -SEG * 60) target *= c.boss ? 0.97 : 0.93;
        }
        // ニトロ
        var burstAb = c.ability === 'burst' || c.ability === 'all';
        if (c.boostT > 0) { c.boostT -= dt; target *= c.burst; }
        else if (state === 'race' && curv < 0.6) {
          if (burstAb && Math.random() < 0.3 * dt) { c.boostT = 2.6; c.burst = 1.24; }
          else if (Math.random() < 0.12 * dt * c.skill * (c.ai === 'nitro' ? 2.5 : 1)) { c.boostT = 1.2 + Math.random(); c.burst = 1.14; }
        }
        c.speed += (c.speed < target ? MAX / (c.boss || mode === 'touge' ? 4 : 5.5) : -MAX / 3) * dt;
        c.speed = clamp(c.speed, 0, c.max * 1.3);
        if (state === 'race') c.total += c.speed * dt;

        // 前の車をよける
        var blocked = false;
        cars.concat(traffic).forEach(function (o) {
          if (o === c || o.out) return;
          var d = o.total - c.total;
          if (d > 0 && d < SEG * 5 && Math.abs(o.offset - c.offset) < OVERLAP * 1.3 * (o.wm || 1) && o.speed < c.speed) blocked = true;
        });
        var dp = pz() - c.total;
        if (dp > 0 && dp < SEG * 5 && Math.abs(P.x - c.offset) < OVERLAP * 1.3) blocked = true;
        if (blocked) c.target = c.offset > 0 ? c.offset - 0.6 : c.offset + 0.6;

        var behind = c.total - pz();   // 正なら自車が後ろ
        // 進路をふさぐ
        var blockAb = c.ai === 'blocker' || c.ability === 'block' || c.ability === 'all';
        if (blockAb && !blocked && behind > 0 && behind < SEG * 10 && !P.finished) {
          c.blockT -= dt;
          if (c.blockT < 0) { c.blockT = Math.random() < (c.boss ? 0.5 : 0.3) ? 1.3 : -1.6; c.aimJit = (Math.random() - 0.5) * 0.5; }
          if (c.blockT > 0) { c.aimX = (c.aimX === undefined ? P.x : c.aimX) + (P.x - (c.aimX === undefined ? P.x : c.aimX)) * Math.min(1, dt * 1.6); c.target = clamp(c.aimX + (c.aimJit || 0), -0.8, 0.8); }   // 狙いはプレイヤーの動きに遅れてついてくる
        }
        // 体当たり
        var ramAb = c.ai === 'aggressive' || c.ability === 'ram' || c.ability === 'all';
        if (ramAb && Math.abs(behind) < SEG * 1.5 && Math.random() < (c.ability ? 0.45 : 0.15) * dt) c.target = clamp(P.x + (Math.random() - 0.5) * 0.5, -0.85, 0.85);
        // オイル
        if ((c.ability === 'oil' || c.ability === 'all') && state === 'race' && !P.finished) {
          c.oilT -= dt;
          if (c.oilT <= 0 && behind > SEG * 4 && behind < SEG * 60) {
            dyn.push({ kind: 'oil', z: c.total - SEG * 0.6, offset: c.offset, life: 24 });
            c.oilT = 5 + Math.random() * 4;
            pop(c.name + L(' がオイルをまいた！', ' dropped oil!'), '#b388ff');
          }
        }
        // 逃走車は車線を変えながら逃げる
        if (c.isTarget) {
          c.laneT -= dt;
          if (c.laneT <= 0) { c.target = LANE_X[Math.floor(Math.random() * 3)]; c.laneT = 1.5 + Math.random() * 2; }
        }
        if (!blocked && !c.isTarget && Math.random() < 0.01) c.target = clamp(-cv(cs) * 0.12 + (Math.random() - 0.5) * 0.6, -0.8, 0.8);
        c.target = clamp(c.target, -0.85, 0.85);
        c.offset += clamp(c.target - c.offset, -dt * (c.boss ? 0.8 : 0.65), dt * (c.boss ? 0.8 : 0.65));

        if (p2p) { if (!c.finished && c.total - PLAYER_Z >= goalDist) { c.finished = true; c.finishTime = raceT; c.max *= 0.5; } }
        else {
          var cl = Math.floor((c.total - PLAYER_Z) / trackLen);
          if (laps !== Infinity && cl >= laps && !c.finished) { c.finished = true; c.finishTime = raceT; }
        }
      });
    }

    function moveTraffic(dt) {
      var stopZ = spec.stopSeg ? spec.stopSeg * SEG : null, holding = stopZ !== null && sig.phase !== 'green';
      traffic.forEach(function (t) {
        if (t.train) { if (state === 'race') t.total += t.speed * dt; return; }
        if (t.dir !== -1 && stopZ !== null) {   // 赤・黄では停止線の手前で止まる
          var dz = stopZ - t.total;
          if (holding && dz > 0 && dz < SEG * 14) t.speed = Math.max(0, Math.min(t.speed, (dz - SEG * 1.2) / SEG * MAX * 0.05));
          else t.speed = Math.min(t.cruise || t.speed, t.speed + MAX * 0.25 * dt);
        }
        if (state === 'race') t.total += t.speed * dt * (t.dir === -1 ? -1 : 1);
        if (t.train) { if (t.total < pz() - SEG * 40) t.total = pz() + SEG * (220 + Math.random() * 120); return; }
        if (t.total < pz() - SEG * 15 || (t.dir === -1 && t.total > pz() + SEG * 400)) {
          var dens = mode === 'traffic' ? clamp(1 - raceT / 240, 0.55, 1) : 1;
          var n = newTraffic(SEG * (150 + Math.random() * 130) * dens);
          for (var k in n) t[k] = n[k];
        }
      });
    }

    function recordGhost() {
      var el = raceT - P.lapStart;
      while (rec.s.length <= el / 0.1 && rec.s.length < 3000) {
        rec.s.push(Math.round((P.total - P.lap * trackLen) / 10));
        rec.x.push(Math.round(P.x * 100));
      }
    }
    function ghostPos() {
      if (!ghost || mode !== 'time' || P.finished) return null;
      var el = (raceT - P.lapStart) / 0.1, i = Math.floor(el), f = el - i;
      if (i >= ghost.s.length - 1) return null;
      var d = lerp(ghost.s[i], ghost.s[i + 1], f) * 10;
      return { total: P.lap * trackLen + PLAYER_Z + d, offset: lerp(ghost.x[i], ghost.x[i + 1], f) / 100 };
    }

    function settle() {
      if (state === 'results') return;
      state = 'results';
      var list = [{ name: 'YOU', you: true, time: P.endReason === 'finish' ? P.finishTime : null, total: pz() }].concat(racers().map(function (c) {
        return { name: c.name, color: c.color, boss: c.boss, time: c.finished ? c.finishTime : null, total: c.total };
      }));
      list.sort(function (a, b) {
        if (a.time !== null && b.time !== null) return a.time - b.time;
        if (a.time !== null) return -1;
        if (b.time !== null) return 1;
        return b.total - a.total;
      });
      if (mode === 'elim') list = list.concat(eliminated.filter(function (e) { return !e.you; }).reverse().map(function (e) { return { name: e.name, color: e.color, time: null, out: true }; }));
      if (mode === 'elim' && P.endReason === 'eliminated') list = list.filter(function (e) { return !e.you; }).concat([{ name: 'YOU', you: true, time: null, out: true }]);
      if ((mode === 'sp' || mode === 'touge' || mode === 'drag') && P.place) {   // 勝敗はバトルの決まりで決める
        var me = list.filter(function (r) { return r.you; })[0];
        list = list.filter(function (r) { return !r.you; });
        list.splice(Math.min(P.place - 1, list.length), 0, me);
      }
      var place = list.findIndex(function (r) { return r.you; }) + 1;
      result = {
        mode: mode, track: cfg.track, place: place, list: list, reason: P.endReason,
        time: P.finishTime, best: P.bestLap, laps: P.laps.slice(), score: Math.round(score), near: nearCount,
        maxCombo: maxCombo, caught: !!(targetCar && targetCar.caught), damage: P.damage, topKmh: topKmh,
        overtakes: overtakes, ghost: newGhost, km: R._km || 0, field: cars.length, coins: coinsGot,
        stopDist: P.stopDist, maxKmh: kmh(P.maxSpeed), sp: { me: Math.round(spg.me), foe: Math.round(spg.foe) }, penalty: penalty, total: (mode === 'gymkhana' ? (P.finishTime || 0) + penalty : P.finishTime)
      };
      R._km = 0;
      eng.stop();
      if (cfg.onFinish) cfg.onFinish(result);
    }

    /* --- 粒（煙・火花・砂ぼこり） --- */
    function part(x, y, vx, vy, life, color, size, grav) {
      if (parts.length > 160) return;
      parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, color: color, size: size, g: grav || 0 });
    }
    function updateParts(dt) {
      parts.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; });
      parts = parts.filter(function (p) { return p.life > 0; });
    }
    function spark(x, y, n) { for (var i = 0; i < n; i++) part(x + (Math.random() - 0.5) * 30, y, (Math.random() - 0.5) * 260, -Math.random() * 180, 0.4, '#ffd54f', 2, 500); }
    function dust() {
      var c = spec.weather === 'snow' || weather === 'snow' ? '#ffffff' : pal.grass[0];
      part(W / 2 + (Math.random() - 0.5) * 60, H - 12, (Math.random() - 0.5) * 80, -40 - Math.random() * 40, 0.6, c, 5, 40);
    }
    function smoke(black) {
      part(W / 2 + (Math.random() - 0.5) * 50, H - 16, (Math.random() - 0.5) * 50, -30 - Math.random() * 30, 0.8, black ? 'rgba(40,40,40,.6)' : 'rgba(220,220,220,.5)', 7, -10);
    }
    function flame() { part(W / 2 + (Math.random() < 0.5 ? -16 : 16), H - 18, (Math.random() - 0.5) * 30, 40 + Math.random() * 40, 0.25, Math.random() < 0.5 ? '#5ab4ff' : '#ffffff', 3, 0); }

    /* =====================================================================
       GUI の描画
       ===================================================================== */
    var cache = {}, frameNo = 0, wirePrev = {};
    /* ---- 実在の街並み（疑似 3D で箱として描く） ---- */
    function farSeg(sg, k) {
      var j = Math.min(segs.length - 1, sg.index + k), f = segs[j];
      while (j > sg.index && (f.pf !== frameNo || f.p1.camera.z <= DEPTH)) { j--; f = segs[j]; }
      return f;
    }
    function sxOf(s2, o) { return s2.p1.screen.x + s2.p1.screen.scale * o * ROAD_W * W / 2; }
    function syOf(s2, hm) { return s2.p1.screen.y - s2.p1.screen.scale * hm * UNITS_M * H / 2; }
    function fogc(c, sg) { return sg.fog < 1 && pal.fog ? mix(c.charAt(0) === '#' ? c : '#888888', pal.fog, clamp(1 - sg.fog, 0, 1)) : c; }
    function drawBldg(g, sg, sp) {
      var fs = farSeg(sg, sp.len), sd = sp.offset > 0 ? 1 : -1;
      var xa = sxOf(sg, sp.offset), xb = sxOf(sg, sp.off2), ya = sg.p1.screen.y, yt = syOf(sg, sp.hm);
      var xa2 = sxOf(fs, sp.offset), xb2 = sxOf(fs, sp.off2), ya2 = fs.p1.screen.y, yt2 = syOf(fs, sp.hm);
      if (Math.max(xa, xb, xa2) < -50 || Math.min(xa, xb, xa2) > W + 50 || ya - yt < 0.6) return;
      var base = sp.c || '#cccccc', lit = night;
      var cF = fogc(shade(base, lit ? 0.35 : 1.0), sg), cS = fogc(shade(base, lit ? 0.28 : (sd > 0 ? 0.78 : 0.9)), sg);
      // 道に面した壁（奥へのびる面）
      poly(g, xa, ya, xa, yt, xa2, yt2, xa2, ya2, cS);
      var gable = sp.roof === 'gable' || sp.roof === 'temple', rh = gable ? (ya - yt) * 0.42 : 0;
      if (gable) {
        var xm = (xa + xb) / 2, xm2 = (xa2 + xb2) / 2, rc = fogc(shade(sp.rc || '#4a4f57', lit ? 0.4 : 1), sg);
        poly(g, xa - (xb - xa) * 0.04, yt, xm, yt - rh, xm2, yt2 - (ya2 - yt2) * 0.42, xa2 - (xb2 - xa2) * 0.04, yt2, rc);
      } else if (yt2 < yt - 0.5) {
        poly(g, xa, yt, xb, yt, xb2, yt2, xa2, yt2, fogc(shade(base, 0.7), sg));   // 屋上（見下ろすとき）
      }
      // 手前の面
      var x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      g.fillStyle = cF; g.fillRect(x0, yt, x1 - x0, ya - yt);
      if (gable) poly(g, xa, yt, xb, yt, (xa + xb) / 2, yt - rh, (xa + xb) / 2, yt - rh, cF);
      // 窓
      var fh = ya - yt, fw = x1 - x0;
      if (sp.win !== 'none' && fh > 14 && fw > 10 && sg.fog > 0.35) {
        var floors = Math.max(1, Math.round(sp.hm / 3.1)), cols = Math.max(1, Math.min(14, Math.round(fw / fh * floors * 0.9)));
        if (floors > 22) floors = 22;
        var ww = fw / cols, hh = fh / floors, wc = lit ? 'rgba(255,214,120,.85)' : sp.win === 'grid' ? 'rgba(40,60,85,.55)' : 'rgba(30,40,55,.45)';
        g.fillStyle = wc;
        for (var fl = 0; fl < floors; fl++) for (var cc = 0; cc < cols; cc++) {
          if (sp.win === 'house' && (fl + cc + sp.seed) % 3 === 0) continue;
          if (lit && ((fl * 7 + cc * 3 + sp.seed) % 5) < 2) continue;
          if (sp.win === 'factory' && fl > 0) continue;
          g.fillRect(x0 + cc * ww + ww * 0.2, yt + fl * hh + hh * (sp.win === 'grid' ? 0.15 : 0.3), ww * (sp.win === 'grid' ? 0.62 : 0.5), hh * (sp.win === 'grid' ? 0.6 : 0.4));
        }
        // 側面の窓（遠近で詰める）
        if (Math.abs(xa - xa2) > 12) {
          var colsS = Math.max(1, Math.min(12, Math.round(sp.len * 1.3 / 3.6)));
          for (var k2 = 0; k2 < colsS; k2++) {
            var t1 = (k2 + 0.25) / colsS, t2 = (k2 + 0.7) / colsS;
            var p1 = 1 - Math.pow(1 - t1, 2.2), p2 = 1 - Math.pow(1 - t2, 2.2);
            var sx1 = xa + (xa2 - xa) * p1, sx2 = xa + (xa2 - xa) * p2;
            var gy1 = ya + (ya2 - ya) * p1, gt1 = yt + (yt2 - yt) * p1;
            for (fl = 0; fl < Math.min(floors, 14); fl++) {
              if (sp.win === 'house' && (fl + k2 + sp.seed) % 2) continue;
              if (lit && ((fl * 5 + k2 * 7 + sp.seed) % 5) < 2) continue;
              var hy = (gy1 - gt1) / floors;
              g.fillRect(Math.min(sx1, sx2), gt1 + fl * hy + hy * 0.28, Math.max(1, Math.abs(sx2 - sx1)), hy * 0.42);
            }
          }
        }
      }
      if (sp.win === 'grid' && !lit && fh > 30) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0, yt, fw * 0.12, fh); }
    }
    function drawWall(g, sg, sp) {   // 高速道路の遮音壁
      var fs = farSeg(sg, sp.len), xa = sxOf(sg, sp.offset), xa2 = sxOf(fs, sp.offset);
      var ya = sg.p1.screen.y, ya2 = fs.p1.screen.y, yt = syOf(sg, 3.5), yt2 = syOf(fs, 3.5);
      poly(g, xa, ya, xa, yt, xa2, yt2, xa2, ya2, fogc(night ? '#39424c' : '#a8b6c0', sg));
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(Math.min(xa, xa2), yt, Math.max(1, Math.abs(xa2 - xa) * 0.08), ya - yt);
    }
    function wire(g, sp, sx, sg) {   // 電柱どうしを電線でつなぐ
      var key = sp.offset > 0 ? 'r' : 'l', top = syOf(sg, 10.2), top2 = syOf(sg, 9.3), prev = wirePrev[key];
      if (prev && sg.fog > 0.2) {
        g.strokeStyle = night ? 'rgba(160,170,190,.35)' : 'rgba(40,40,45,.55)'; g.lineWidth = 1;
        g.beginPath();
        [[0, top, prev.t], [0.15, top2, prev.t2]].forEach(function (w2) {
          var mx = (sx + prev.x) / 2, my = (w2[1] + w2[2]) / 2 + Math.abs(sx - prev.x) * 0.03;
          g.moveTo(prev.x, w2[2]); g.quadraticCurveTo(mx, my, sx, w2[1]);
        });
        g.stroke();
      }
      wirePrev[key] = { x: sx, t: top, t2: top2 };
    }
    function render(g) {
      useGeom();
      W = sess.W; H = sess.H;
      var shake = P.bump > 0 ? (Math.random() - 0.5) * 6 * P.bump / 0.3 : 0;
      g.save();
      if (shake) g.translate(shake, shake * 0.5);

      var base = findSeg(P.pos);
      var basePct = (P.pos % SEG) / SEG;
      var pSeg = findSeg(pz());
      var pPct = (((pz() % trackLen) + trackLen) % trackLen % SEG) / SEG;
      var pY = lerp(pSeg.p1.world.y, pSeg.p2.world.y, pPct);
      var maxy = H, x = 0, dx = -(base.curve * basePct), n;

      drawSky(g);

      // 道路（手前から奥へ）
      frameNo++; wirePrev = {};
      for (n = 0; n < DRAW; n++) {
        var s = segs[(base.index + n) % segs.length];
        var looped = s.index < base.index;
        if (looped && spec.custom && !spec.loop) break;   // 実在の道は先が別の道（ぐるっと戻らない）
        s.pf = frameNo;
        s.fog = 1 / Math.pow(Math.E, Math.pow(n / DRAW, 2) * fogDensity);
        s.clip = maxy;
        s.drawn = false;
        project(s.p1, (P.x * ROAD_W) - x, pY + CAM_H, P.pos - (looped ? trackLen : 0));
        project(s.p2, (P.x * ROAD_W) - x - dx, pY + CAM_H, P.pos - (looped ? trackLen : 0));
        x += dx; dx += s.curve;
        if (s.p1.camera.z <= DEPTH || s.p2.screen.y >= s.p1.screen.y || s.p2.screen.y >= maxy) continue;
        s.drawn = true;
        drawSegment(g, s);
        maxy = s.p2.screen.y;
      }

      // 飾り・物・車（奥から手前へ）
      var bySeg = {};
      function addTo(obj, total, kind) {
        var z = ((total % trackLen) + trackLen) % trackLen, idx = Math.floor(z / SEG);
        (bySeg[idx] = bySeg[idx] || []).push({ o: obj, pct: (z % SEG) / SEG, kind: kind });
      }
      cars.forEach(function (c) { if (c.total - pz() > -SEG * 0.3 && !(c.out && c.speed < 1)) addTo(c, c.total, 'car'); });
      traffic.forEach(function (c) { if (c.total - pz() > -SEG * 0.3) addTo(c, c.total, 'car'); });
      cops.forEach(function (c) { if (c.total - pz() > -SEG * 0.3) addTo(c, c.total, 'car'); });
      if (spec.crossSeg) sig.cross.forEach(function (c) { addTo(c, spec.crossSeg * SEG, 'xcar'); });
      var gp = ghostPos();
      if (gp && gp.total - pz() > SEG * 0.4) addTo({ ghost: true, offset: gp.offset, body: car.body, color: car.color }, gp.total, 'car');
      dyn.forEach(function (o) { addTo(o, o.z, 'dyn'); });

      for (n = DRAW - 1; n > 0; n--) {
        var sg = segs[(base.index + n) % segs.length];
        if (!sg.p1.screen.scale || sg.p1.camera.z <= DEPTH || sg.pf !== frameNo) continue;
        var scale = sg.p1.screen.scale;
        if (sg.tunnel) drawTunnel(g, sg, segs[(sg.index + segs.length - 1) % segs.length]);
        else if (sg.rails && sg.drawn) drawRails(g, sg);
        g.save();
        g.beginPath(); g.rect(0, 0, W, sg.clip); g.clip();
        sg.objs.forEach(function (o) {
          drawObj(g, o, sg.p1.screen.x + (scale * o.offset * ROAD_W * W / 2), sg.p1.screen.y, sg.p1.screen.w, t0);
        });
        sg.sprites.forEach(function (sp) {
          if (sp.kind === 'bldg') { drawBldg(g, sg, sp); return; }
          if (sp.kind === 'noisewall') { drawWall(g, sg, sp); return; }
          var sx = sg.p1.screen.x + (scale * sp.offset * ROAD_W * W / 2);
          drawSprite(g, sp, sx, sg.p1.screen.y, sg.p1.screen.w, night, t0);
          if (sp.kind === 'pole') wire(g, sp, sx, sg);
        });
        (bySeg[sg.index] || []).forEach(function (e) {
          var o = e.o;
          var sc2 = lerp(sg.p1.screen.scale, sg.p2.screen.scale, e.pct);
          var cx = lerp(sg.p1.screen.x, sg.p2.screen.x, e.pct) + (sc2 * o.offset * ROAD_W * W / 2);
          var cy = lerp(sg.p1.screen.y, sg.p2.screen.y, e.pct);
          if (e.kind === 'dyn') { drawObj(g, o, cx, cy, lerp(sg.p1.screen.w, sg.p2.screen.w, e.pct), t0); return; }
          if (e.kind === 'xcar') { drawSide(g, lerp(sg.p1.screen.x, sg.p2.screen.x, e.pct) + (sc2 * o.x * ROAD_W * W / 2), cy, sc2 * CAR_W * 4.4 * ROAD_W * W / 2, o.color, o.v > 0); return; }
          var cw = sc2 * CAR_W * 2 * ROAD_W * W / 2;
          if (cw < 2) return;
          if (o.ghost) g.globalAlpha = 0.4;
          drawCar(g, cx, cy, cw, o.color, o.body, {
            brake: o.traffic ? o.speed < (o.cruise || 1) * 0.6 : o.cop ? false : o.speed < o.max * 0.8, boost: o.boostT > 0, t: t0, front: o.dir === -1, siren: o.siren,
            label: !o.traffic && !o.ghost && cw > 30 ? o.name : (o.ghost && cw > 30 ? 'GHOST' : ''), boss: o.boss && cw > 30
          });
          g.globalAlpha = 1;
          if (night && o.traffic && cw > 6) {   // 夜の一般車のテールランプの光
            g.fillStyle = 'rgba(255,40,40,.35)'; g.fillRect(cx - cw * 0.6, cy - cw * 0.45, cw * 1.2, cw * 0.12);
          }
        });
        g.restore();
      }

      // 夜はヘッドライトで前を照らす
      if (night || pSeg.tunnel) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.translate(W / 2, H * 0.76); g.scale(1, 0.32);
        if (!cache.head) {
          cache.head = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.42);
          cache.head.addColorStop(0, 'rgba(255,240,200,.28)'); cache.head.addColorStop(1, 'rgba(255,240,200,0)');
        }
        g.fillStyle = cache.head;
        g.beginPath(); g.arc(0, 0, W * 0.42, 0, Math.PI * 2); g.fill();
        g.restore();
      }

      // 自車
      var off = P.x < -1 || P.x > 1;
      var bounce = (P.speed > 0 ? (Math.random() - 0.5) * 2 * (off ? 2 : 0.6) : 0) + (P.bump > 0 ? Math.sin(raceT * 60) * 3 : 0);
      var lean = keys.left ? -1 : keys.right ? 1 : 0;
      var myW = (DEPTH / PLAYER_Z) * CAR_W * 2 * ROAD_W * W / 2;
      var spinX = P.spin > 0 ? Math.sin(raceT * 20) * 10 : 0;
      if (!cfg.hideCar) drawCar(g, W / 2 + spinX, H - 14 + bounce, myW, car.color, car.body, { brake: keys.down, boost: P.boosting, lean: lean, t: t0, siren: car.siren });
      parts.forEach(function (p) {
        g.globalAlpha = clamp(p.life / p.max, 0, 1);
        g.fillStyle = p.color;
        var sz = p.size * (p.g < 0 ? 2 - p.life / p.max : 1);
        g.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      });
      g.globalAlpha = 1;

      drawWeather(g);
      if (P.boosting || P.padT > 0) speedLines(g);
      if (flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (flash * 2) + ')'; g.fillRect(0, 0, W, H); }
      if (!cache.vig) {
        cache.vig = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.75);
        cache.vig.addColorStop(0, 'rgba(0,0,0,0)'); cache.vig.addColorStop(1, 'rgba(0,0,0,.38)');
      }
      g.fillStyle = cache.vig; g.fillRect(0, 0, W, H);
      g.restore();
      if (!demo) drawHud(g);
    }

    /** 3D 表示のとき、透明な 2D キャンバスに重ねて描くもの（天気・効果・HUD） */
    function renderHud(g) {
      useGeom();
      W = sess.W; H = sess.H;
      g.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        g.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.8;
        g.fillStyle = p.color;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });
      g.globalAlpha = 1;
      drawWeather(g);
      if (P.boosting || P.padT > 0) speedLines(g);
      if (flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (flash * 2) + ')'; g.fillRect(0, 0, W, H); }
      if (!cache.vig2) {
        cache.vig2 = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.4, W / 2, H * 0.55, Math.max(W, H) * 0.8);
        cache.vig2.addColorStop(0, 'rgba(0,0,0,0)'); cache.vig2.addColorStop(1, 'rgba(0,0,0,.3)');
      }
      g.fillStyle = cache.vig2; g.fillRect(0, 0, W, H);
      if (!demo) drawHud(g);
    }

    function drawSky(g) {
      if (!cache.sky) {
        cache.sky = g.createLinearGradient(0, 0, 0, H * 0.62);
        cache.sky.addColorStop(0, pal.sky[0]); cache.sky.addColorStop(0.55, pal.sky[1]); cache.sky.addColorStop(1, pal.sky[2]);
      }
      g.fillStyle = cache.sky; g.fillRect(0, 0, W, H);
      var orb = pal.sun || pal.moon;
      if (orb && weather !== 'fog' && weather !== 'rain') {
        var ox = ((orb.x * W - skyOff * 400) % (W * 1.5) + W * 1.5) % (W * 1.5) - W * 0.25, oy = orb.y * H;
        var r = orb.r * H / 360;
        var gl = g.createRadialGradient(ox, oy, r * 0.5, ox, oy, r * 4);
        gl.addColorStop(0, rgba(orb.c, pal.sun ? 0.55 : 0.3)); gl.addColorStop(1, rgba(orb.c, 0));
        g.fillStyle = gl; g.beginPath(); g.arc(ox, oy, r * 4, 0, Math.PI * 2); g.fill();
        circle(g, ox, oy, r, orb.c);
        if (pal.moon) circle(g, ox + r * 0.35, oy - r * 0.2, r * 0.85, pal.sky[0]);
      }
      if (night) {
        g.fillStyle = 'rgba(255,255,255,.7)';
        for (var st2 = 0; st2 < 50; st2++) {
          var sx = ((st2 * 97 + skyOff * 800) % W + W) % W, sy = (st2 * 53) % (H * 0.4);
          g.fillRect(sx, sy, st2 % 7 ? 1 : 2, st2 % 7 ? 1 : 2);
        }
      } else if (weather === 'clear' || weather === 'sand') {
        for (var cl = 0; cl < 7; cl++) {
          var sp = 0.6 + (cl % 3) * 0.35, ccx = ((cl * 140 + skyOff * 600 * sp + t0 * 3 * sp) % (W + 200) + W + 200) % (W + 200) - 100;
          drawCloud(g, ccx, H * 0.07 + (cl % 4) * H * 0.045, (0.7 + (cl % 3) * 0.3) * H / 360, weather === 'sand' ? 0.35 : 0.9);
        }
      }
      if (spec.lava) {
        var lg = g.createLinearGradient(0, H * 0.35, 0, H * 0.56);
        lg.addColorStop(0, 'rgba(255,90,0,0)'); lg.addColorStop(1, 'rgba(255,90,0,.45)');
        g.fillStyle = lg; g.fillRect(0, H * 0.35, W, H * 0.21);
      }
      if (!cache.farC) { cache.farC = mix(pal.far, pal.fog, 0.45); cache.midC = mix(pal.hill, pal.fog, 0.3); }
      if ((spec.landmarks || []).indexOf('fuji') >= 0) {
        var fx = ((W * 0.62 - skyOff * 500) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3, fy = H * 0.5, fw = W * 0.28, fh = H * 0.24;
        poly(g, fx - fw, fy, fx + fw, fy, fx + fw * 0.16, fy - fh, fx - fw * 0.16, fy - fh, mix('#5d7896', pal.fog, 0.35));
        poly(g, fx - fw * 0.34, fy - fh * 0.62, fx + fw * 0.34, fy - fh * 0.62, fx + fw * 0.16, fy - fh, fx - fw * 0.16, fy - fh, '#f4f7fb');
      }
      if (spec.skyline) drawSkyline(g, cache.farC, H * 0.52, skyOff * 900);
      else { drawRange(g, mix(pal.far, pal.fog, 0.65), H * 0.49, H * 0.13, skyOff * 600, 3); drawRange(g, cache.farC, H * 0.5, H * 0.105, skyOff * 900, 7); }
      drawRange(g, cache.midC, H * 0.53, H * 0.072, hillOff * 1200, 13);
      if (!cache.haze) {
        cache.haze = g.createLinearGradient(0, H * 0.34, 0, H * 0.56);
        cache.haze.addColorStop(0, rgba(pal.fog, 0)); cache.haze.addColorStop(1, rgba(pal.fog, night ? 0.25 : 0.55));
      }
      g.fillStyle = cache.haze; g.fillRect(0, H * 0.34, W, H * 0.22);
      if (spec.lava) {
        g.fillStyle = 'rgba(255,120,0,.8)';
        for (var v = 0; v < 3; v++) { var vx = ((v * 230 + hillOff * 1200 * 0.5) % (W + 100) + W + 100) % (W + 100) - 50; g.fillRect(vx, H * 0.5 - 2, 3, 6 + Math.sin(t0 * 4 + v) * 3); }
      }
    }

    function drawCloud(g, x, y, k, a) {
      var puffs = [[0, 0, 26], [22, -8, 22], [-24, 2, 20], [44, 4, 18], [-46, 8, 15], [10, 6, 24]];
      g.save(); g.globalAlpha = a;
      puffs.forEach(function (p) {
        var px = x + p[0] * k, py = y + p[1] * k, r = p[2] * k * 0.8;
        var gr = g.createRadialGradient(px - r * 0.2, py - r * 0.35, r * 0.2, px, py, r);
        gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(226,236,248,.85)');
        g.fillStyle = gr; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      });
      g.fillStyle = 'rgba(160,185,215,.22)'; g.beginPath(); g.ellipse(x, y + 12 * k, 60 * k, 5 * k, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    function drawRange(g, color, baseY, amp, off, seed) {
      var pts = [];
      for (var i = 0; i <= W; i += 6) {
        var tt = (i + off) * 0.012 * 640 / W;
        // 大きな起伏に、小さな尾根をかさねる
        var y = baseY - (Math.sin(tt + seed) * 0.5 + Math.sin(tt * 2.3 + seed * 1.7) * 0.3 + Math.sin(tt * 5.1 + seed * 0.7) * 0.12 + 0.72) * amp;
        pts.push(i, y);
      }
      var gr = g.createLinearGradient(0, baseY - amp * 1.3, 0, baseY + amp * 0.3);
      gr.addColorStop(0, mix(color, '#ffffff', 0.16)); gr.addColorStop(1, color);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, H);
      for (var k = 0; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
      g.lineTo(W, H); g.closePath(); g.fill();
      g.strokeStyle = rgba(mix(color, '#ffffff', 0.4), 0.45); g.lineWidth = 1.2;
      g.beginPath(); for (k = 0; k < pts.length; k += 2) { if (k) g.lineTo(pts[k], pts[k + 1]); else g.moveTo(pts[k], pts[k + 1]); } g.stroke();
    }
    function drawSkyline(g, color, baseY, off) {
      g.fillStyle = color;
      var bw = W / 16;
      for (var i = -1; i < 18; i++) {
        var k = Math.floor((i * bw - off) / bw), hh = (20 + ((k * 37) % 50 + 50) % 50) * H / 360;
        var x = i * bw + (((-off) % bw) + bw) % bw - bw;
        g.fillStyle = color; g.fillRect(x, baseY - hh, bw - 2, hh + H);
        if (night) {
          for (var y = 4; y < hh - 4; y += 6) for (var wx = 3; wx < bw - 6; wx += 6) {
            if (((k * 13 + y * 7 + wx) % 5 + 5) % 5 === 0) { g.fillStyle = 'rgba(255,215,106,.6)'; g.fillRect(x + wx, baseY - hh + y, 2, 2); }
          }
        }
      }
    }

    function drawSegment(g, s) {
      var x1 = s.p1.screen.x, y1 = s.p1.screen.y, w1 = s.p1.screen.w;
      var x2 = s.p2.screen.x, y2 = s.p2.screen.y, w2 = s.p2.screen.w;
      var r1 = s.rumW ? w1 * s.rumW : w1 / 6, r2 = s.rumW ? w2 * s.rumW : w2 / 6, l1 = w1 / 32, l2 = w2 / 32;
      if (s.cGrassL) {   // 左右で違う地面（田んぼ・住宅地・森など）
        var cx0 = Math.round((x1 + x2) / 2);
        g.fillStyle = s.cGrassL; g.fillRect(0, y2 - 1, Math.max(0, cx0), y1 - y2 + 1);
        g.fillStyle = s.cGrassR; g.fillRect(Math.max(0, cx0), y2 - 1, W - Math.max(0, cx0), y1 - y2 + 1);
      } else {
        g.fillStyle = s.cGrass;
        g.fillRect(0, y2 - 1, W, y1 - y2 + 1);
      }
      if (s.waterSide && !s.tunnel) {
        var wc = s.alt ? pal.water : shade(pal.water, 1.08);
        if (s.waterSide !== 'right') poly(g, -2, y1, x1 - w1 * 1.7, y1, x2 - w2 * 1.7, y2, -2, y2, wc);
        if (s.waterSide !== 'left') poly(g, W + 2, y1, x1 + w1 * 1.7, y1, x2 + w2 * 1.7, y2, W + 2, y2, wc);
      }
      if (s.cross) {   // 交差する道路
        g.fillStyle = s.cRoad; g.fillRect(0, y2 - 1, W, y1 - y2 + 1);
      }
      if (spec.neon && s.index % 4 === 0) { g.fillStyle = 'rgba(0,229,255,.35)'; g.fillRect(0, y2, W, 1); }
      poly(g, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, s.cRumble);
      poly(g, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, s.cRumble);
      if (s.finishLine) {
        var cells = 12;
        for (var k = 0; k < cells; k++) {
          var a1 = x1 - w1 + (w1 * 2 / cells) * k, a2 = x2 - w2 + (w2 * 2 / cells) * k;
          poly(g, a1, y1, a1 + w1 * 2 / cells, y1, a2 + w2 * 2 / cells, y2, a2, y2, (k + s.index) % 2 ? '#111' : '#f5f5f5');
        }
      } else {
        poly(g, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, s.stopZone ? '#b71c1c' : s.cRoad);
        var lw1 = w1 * 2 / LANES, lw2 = w2 * 2 / LANES, lx1 = x1 - w1 + lw1, lx2 = x2 - w2 + lw2;
        for (var lane = 1; lane < LANES; lane++, lx1 += lw1, lx2 += lw2) {
          var center = spec.twoWay && lane * 2 === LANES;
          if (!s.alt && !(center && LANES >= 4)) continue;
          if (s.cross || spec.noLanes) continue;
          var lc2 = center && LANES >= 4 && spec.custom ? '#f0c030' : pal.lane;
          poly(g, lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, lc2);
        }
        if (s.curb) {   // 歩道の縁石
          poly(g, x1 - w1 - r1 * 0.12, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2 * 0.12, y2, '#8a8a86');
          poly(g, x1 + w1, y1, x1 + w1 + r1 * 0.12, y1, x2 + w2 + r2 * 0.12, y2, x2 + w2, y2, '#8a8a86');
        }
        if (s.crosswalk) {
          for (var zk = 0; zk < 10; zk++) {
            var za1 = x1 - w1 + (w1 * 2 / 10) * zk, za2 = x2 - w2 + (w2 * 2 / 10) * zk;
            if (zk % 2 === 0) poly(g, za1, y1, za1 + w1 * 0.2, y1, za2 + w2 * 0.2, y2, za2, y2, '#e8e8e8');
          }
        }
        if (s.stopLine) poly(g, x1 - w1, y1, x1 + w1 * 0.05, y1, x2 + w2 * 0.05, y2 - 1, x2 - w2, y2 - 1, '#ffffff');
        if (w1 > 60) {   // 路肩の白線
          poly(g, x1 - w1 * 0.97, y1, x1 - w1 * 0.94, y1, x2 - w2 * 0.94, y2, x2 - w2 * 0.97, y2, 'rgba(255,255,255,.55)');
          poly(g, x1 + w1 * 0.94, y1, x1 + w1 * 0.97, y1, x2 + w2 * 0.97, y2, x2 + w2 * 0.94, y2, 'rgba(255,255,255,.55)');
        }
      }
      if (s.fog < 1) {
        g.globalAlpha = 1 - s.fog;
        g.fillStyle = pal.fog;
        g.fillRect(0, y2, W, y1 - y2);
        g.globalAlpha = 1;
      }
    }

    function drawRails(g, s) {
      var a = s.p1.screen, b = s.p2.screen, h1 = a.scale * 380 * H / 2, h2 = b.scale * 380 * H / 2;
      var f = 0.45 + 0.55 * (s.fog === undefined ? 1 : s.fog);
      [-1, 1].forEach(function (sd) {
        var x1 = a.x + sd * a.w * 1.1, x2 = b.x + sd * b.w * 1.1;
        poly(g, x1, a.y - h1, x2, b.y - h2, x2, b.y - h2 * 0.55, x1, a.y - h1 * 0.55, shade('#c9ced4', f));
        poly(g, x1, a.y - h1 * 0.55, x2, b.y - h2 * 0.55, x2, b.y - h2 * 0.45, x1, a.y - h1 * 0.45, shade('#7d848c', f));
        if (s.index % 2 === 0) { g.fillStyle = shade('#6d737a', f); g.fillRect(x1 - Math.max(1, h1 * 0.08), a.y - h1, Math.max(1, h1 * 0.16), h1); }
      });
    }

    function drawTunnel(g, s, prev) {
      var y1 = s.p1.screen.y, y2 = s.p2.screen.y, x1 = s.p1.screen.x, x2 = s.p2.screen.x, w1 = s.p1.screen.w, w2 = s.p2.screen.w;
      var c1 = y1 - s.p1.screen.scale * TUNNEL_H * H / 2, c2 = y2 - s.p2.screen.scale * TUNNEL_H * H / 2;
      var wl1 = x1 - w1 * 1.2, wl2 = x2 - w2 * 1.2, wr1 = x1 + w1 * 1.2, wr2 = x2 + w2 * 1.2;
      var wall = pal.wall || '#333', f = s.fog === undefined ? 1 : s.fog;
      var col = shade(wall, (s.alt ? 1 : 0.88) * (0.45 + 0.55 * f));
      g.fillStyle = col;
      g.beginPath(); g.moveTo(-5, y1); g.lineTo(wl1, y1); g.lineTo(wl2, y2); g.lineTo(wl2, c2); g.lineTo(wl1, c1); g.lineTo(-5, c1); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W + 5, y1); g.lineTo(wr1, y1); g.lineTo(wr2, y2); g.lineTo(wr2, c2); g.lineTo(wr1, c1); g.lineTo(W + 5, c1); g.closePath(); g.fill();
      poly(g, wl1, c1, wr1, c1, wr2, c2, wl2, c2, shade(wall, 0.6 * (0.45 + 0.55 * f)));
      g.fillStyle = shade(wall, 0.6); g.fillRect(-5, c1 - (y1 - c1), W + 10, y1 - c1 > 0 ? (y1 - c1) : 0);
      if (s.index % 6 === 0) {   // 天井の照明
        var lw = w1 * 0.3;
        g.fillStyle = '#ffe9a3'; g.fillRect(x1 - lw / 2, c1 + (c2 - c1) * 0.2, lw, Math.max(1, (c2 - c1) * 0.4 + 1));
        g.fillStyle = 'rgba(255,200,80,.9)';
        g.fillRect(wl1 + (x1 - wl1) * 0.02, c1 + (y1 - c1) * 0.3, Math.max(1, w1 * 0.03), Math.max(1, (y1 - c1) * 0.06));
        g.fillRect(wr1 - (wr1 - x1) * 0.02 - Math.max(1, w1 * 0.03), c1 + (y1 - c1) * 0.3, Math.max(1, w1 * 0.03), Math.max(1, (y1 - c1) * 0.06));
      }
      if (prev && !prev.tunnel) {   // 入口の壁
        g.fillStyle = shade(wall, 1.1);
        g.fillRect(-5, -5, W + 10, c1 + 5);
        g.fillRect(-5, c1, wl1 + 5, y1 - c1);
        g.fillRect(wr1, c1, W - wr1 + 5, y1 - c1);
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(wl1, c1, wr1 - wl1, Math.max(1, (y1 - c1) * 0.06));
      }
    }

    // 雨粒・雪・砂・灰（画面の決まった位置から、時間で流す）
    function drawWeather(g) {
      var i, n, x, y;
      if (weather === 'rain') {
        g.strokeStyle = 'rgba(200,220,255,.45)'; g.lineWidth = 1;
        g.beginPath();
        n = 140;
        for (i = 0; i < n; i++) {
          x = ((i * 73.3 + t0 * 120 - skyOff * 600) % W + W) % W;
          y = ((i * 41.7 + t0 * (700 + (i % 5) * 60)) % H + H) % H;
          g.moveTo(x, y); g.lineTo(x - 3, y + 12 + P.speed / MAX * 8);
        }
        g.stroke();
        g.fillStyle = 'rgba(40,50,70,.12)'; g.fillRect(0, 0, W, H);
        if (Math.sin(t0 * 0.7) > 0.995) { g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(0, 0, W, H); }
      } else if (weather === 'snow') {
        g.fillStyle = 'rgba(255,255,255,.85)';
        for (i = 0; i < 110; i++) {
          x = ((i * 91.3 + Math.sin(t0 + i) * 20 - skyOff * 700 + (i % 3) * t0 * 20) % W + W) % W;
          y = ((i * 57.1 + t0 * (60 + (i % 4) * 25) * (1 + P.speed / MAX)) % H + H) % H;
          g.fillRect(x, y, i % 3 ? 2 : 3, i % 3 ? 2 : 3);
        }
      } else if (weather === 'sand') {
        g.fillStyle = 'rgba(230,180,110,.16)'; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(240,200,140,.6)';
        for (i = 0; i < 70; i++) {
          x = ((i * 67.1 - t0 * (300 + (i % 4) * 80)) % W + W) % W; y = (i * 37.3) % H;
          g.fillRect(x, y, 4, 1);
        }
      } else if (weather === 'ash') {
        for (i = 0; i < 70; i++) {
          x = ((i * 83.1 + Math.sin(t0 * 0.8 + i) * 25) % W + W) % W;
          y = (((i * 47.9 - t0 * (30 + (i % 3) * 15)) % H) + H) % H;
          g.fillStyle = i % 4 ? 'rgba(160,160,160,.6)' : 'rgba(255,140,40,.9)';
          g.fillRect(x, y, 2, 2);
        }
      } else if (weather === 'fog') {
        g.fillStyle = 'rgba(200,208,216,.14)'; g.fillRect(0, 0, W, H);
      }
    }

    function speedLines(g) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
      g.beginPath();
      for (var i = 0; i < 18; i++) {
        var a = (i / 18) * Math.PI * 2 + t0 * 3, r0 = W * (0.35 + ((i * 37 + Math.floor(t0 * 30)) % 10) / 40);
        var cx = W / 2 + Math.cos(a) * r0, cy = H * 0.5 + Math.sin(a) * r0 * 0.6;
        g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 24);
      }
      g.stroke();
    }

    /* ---------- HUD ---------- */
    function panel(g, x, y, w, h) {
      g.fillStyle = 'rgba(8,12,20,.62)'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    function text(g, t, x, y, size, color, align) {
      g.font = 'bold ' + size + 'px ui-monospace, Menlo, Consolas, monospace';
      g.textAlign = align || 'left';
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(t, x + 1, y + 1);
      g.fillStyle = color || '#fff'; g.fillText(t, x, y);
    }
    function meter(g, x, y, w, h, v, color, label) {
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, w, h);
      g.fillStyle = color; g.fillRect(x, y, w * clamp(v, 0, 1), h);
      text(g, label, x, y - 3, 9, '#cfd8e3');
    }

    function drawHud(g) {
      var k = Math.max(1, Math.min(W / 640, H / 360)), W0 = W, H0 = H;
      g.save(); g.scale(k, k); W = W0 / k; H = H0 / k;
      try { hud0(g); } finally { g.restore(); W = W0; H = H0; }
    }
    function hud0(g) {
      var narrow = W < 500;
      var admS = R.adminSummary();
      if (admS.length) text(g, 'ADMIN  ' + admS.join('  '), W / 2, H - 6, 9, '#ff8a80', 'center');
      var racing = mode === 'race' || mode === 'duel' || mode === 'elim' || mode === 'touge' || mode === 'sp';
      var place = P.finished && P.place ? P.place : rank();

      // 左上: 順位・周回（モードで中身が変わる）
      panel(g, 8, 8, narrow ? 104 : 124, 50);
      if (racing) {
        text(g, L('順位', 'POS'), 16, 22, 10, '#9fb0c2');
        text(g, place + '/' + (racers().length + 1), 16, 50, narrow ? 20 : 24, place === 1 ? '#ffd93d' : '#fff');
      } else if (mode === 'coins') {
        text(g, L('コイン', 'COINS'), 16, 22, 10, '#9fb0c2');
        text(g, String(coinsGot), 16, 50, 22, '#ffd54f');
      } else if (mode === 'traffic') {
        text(g, L('点数', 'SCORE'), 16, 22, 10, '#9fb0c2');
        text(g, String(Math.round(score)), 16, 50, narrow ? 16 : 20, '#ffd93d');
      } else {
        text(g, L('モード', 'MODE'), 16, 22, 10, '#9fb0c2');
        text(g, TB.t((R.MODES[mode] || R.MINIS[mode] || { name: { ja: 'フリー走行', en: 'Free roam' } }).name).slice(0, p2p || laps !== Infinity ? 4 : 8), 16, 46, 12, '#fff');
      }
      if (p2p) {
        text(g, L('残り', 'TO GO'), narrow ? 70 : 84, 22, 10, '#9fb0c2');
        text(g, (Math.max(0, goalDist - P.total) / SEG * MPS / 1000).toFixed(2) + 'km', narrow ? 62 : 76, 48, 11, '#fff');
      } else if (laps !== Infinity) {
        text(g, L('周', 'LAP'), narrow ? 70 : 84, 22, 10, '#9fb0c2');
        text(g, Math.min(P.lap + 1, laps) + '/' + laps, narrow ? 70 : 84, 50, narrow ? 14 : 16, '#fff');
      }

      // 左: 順位表
      if (racing && H > 300) {
        var list = [{ name: L('あなた', 'YOU'), total: pz(), you: true, color: car.color }].concat(racers().map(function (c) { return { name: c.name, total: c.total, color: c.color, boss: c.boss }; }))
          .sort(function (a, b) { return b.total - a.total; });
        var ly = 70;
        list.slice(0, 8).forEach(function (e, i) {
          g.fillStyle = e.you ? 'rgba(92,207,160,.28)' : 'rgba(8,12,20,.45)';
          g.fillRect(8, ly + i * 13 - 9, narrow ? 84 : 96, 12);
          g.fillStyle = e.color; g.fillRect(10, ly + i * 13 - 7, 3, 8);
          text(g, (i + 1) + ' ' + e.name, 16, ly + i * 13, 9, e.you ? '#5ccfa0' : e.boss ? '#ffd93d' : '#e8e8f0');
        });
      }

      // 中央上: 時間
      var tw = narrow ? 150 : 200, cx = W / 2;
      var hud = cfg.hud ? cfg.hud() : null;
      if (hud) {
        var hw = Math.min(W - 230, narrow ? 190 : 320), hl = hud.lines.length;
        panel(g, cx - hw / 2, 8, hw, 22 + hl * 14);
        text(g, hud.title, cx, 23, 12, '#ffd93d', 'center');
        hud.lines.forEach(function (ln, i) { text(g, ln.t, cx, 38 + i * 14, 10, ln.c || '#e8e8f0', 'center'); });
      } else panel(g, cx - tw / 2, 8, tw, 44);
      if (hud) { /* 表示済み */ } else if (mode === 'arcade' || mode === 'chase' || mode === 'coins') {
        text(g, L('残り時間', 'TIME'), cx, 20, 9, '#9fb0c2', 'center');
        text(g, Math.ceil(timer) + '', cx, 46, 24, timer < 10 ? '#ff5252' : '#ffd93d', 'center');
      } else if (mode === 'sp') {
        var bw2 = tw / 2 - 16;
        text(g, L('あなた', 'YOU'), cx - tw / 2 + 10, 22, 9, '#5ccfa0');
        text(g, (cars[0] ? cars[0].name : ''), cx + tw / 2 - 10, 22, 9, '#ff8a80', 'right');
        meter(g, cx - tw / 2 + 10, 30, bw2, 10, spg.me / 100, spg.me < 30 ? '#ff5252' : '#5ccfa0', '');
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(cx + 6, 30, bw2, 10);
        g.fillStyle = spg.foe < 30 ? '#ff5252' : '#ff8a80'; g.fillRect(cx + 6 + bw2 * (1 - clamp(spg.foe / 100, 0, 1)), 30, bw2 * clamp(spg.foe / 100, 0, 1), 10);
        text(g, 'SP', cx, 47, 10, '#ffd93d', 'center');
      } else if (mode === 'gymkhana') {
        text(g, fmt((raceT + penalty) * 1000), cx, 30, 18, '#fff', 'center');
        text(g, L('ペナルティ +', 'PENALTY +') + penalty + 's', cx, 45, 10, penalty ? '#ff8a80' : '#9fb0c2', 'center');
      } else if (mode === 'brake') {
        text(g, L('赤い枠で止まれ', 'STOP IN THE RED BOX'), cx, 26, 11, '#ff8a80', 'center');
        text(g, Math.max(0, Math.round(((cfg.stopAt + 0.5) * SEG - pz()) / SEG * MPS)) + ' m', cx, 44, 14, '#fff', 'center');
      } else if (mode === 'drag') {
        text(g, fmt(raceT * 1000), cx, 28, 16, '#fff', 'center');
        text(g, Math.max(0, Math.round((dragLen - P.total) / SEG * MPS)) + ' m', cx, 44, 10, '#9fb0c2', 'center');
      } else if (mode === 'traffic') {
        text(g, fmt(raceT * 1000), cx, 28, 16, '#fff', 'center');
        text(g, combo > 1 ? L('連続 ×', 'COMBO ×') + combo : L('ニアミスで得点', 'near misses score'), cx, 44, 10, combo > 1 ? '#ffd93d' : '#9fb0c2', 'center');
      } else {
        text(g, fmt((state === 'race' ? raceT - P.lapStart : 0) * 1000), cx, 30, 18, '#fff', 'center');
        text(g, L('ベスト ', 'BEST ') + fmt(P.bestLap !== null ? (cfg.bestLap !== undefined && cfg.bestLap !== null ? Math.min(P.bestLap, cfg.bestLap) : P.bestLap) : cfg.bestLap), cx, 45, 10, '#9fb0c2', 'center');
      }
      // ボス・逃走車との差
      var foe = targetCar || (mode === 'duel' || mode === 'race' || mode === 'touge' || mode === 'sp' ? bossCar : null);
      if (foe && !foe.out) {
        var gapM = Math.round((foe.total - pz()) / SEG * MPS);
        panel(g, cx - tw / 2, 56, tw, targetCar ? 30 : 18);
        text(g, foe.name + '  ' + (gapM >= 0 ? '▲ ' + gapM : '▼ ' + (-gapM)) + 'm', cx, 69, 10, gapM >= 0 ? '#ff8a80' : '#5ccfa0', 'center');
        if (targetCar) meter(g, cx - tw / 2 + 10, 76, tw - 20, 5, targetCar.hp, '#ff5252', '');
      }

      // 右上: ミニマップ
      var ms = narrow ? 84 : 100, mx = W - ms - 8, my = 8;
      panel(g, mx, my, ms, ms);
      if (cfg.drawMap) { cfg.drawMap(g, mx, my, ms, clamp(P.total / edgeLen, 0, 1)); ms = -1; }
      if (ms > 0) {
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
      if (!cache.mapPath) {
        cache.mapPath = new Path2D();
        T.map.forEach(function (p, i) { var px = mx + 8 + p[0] * (ms - 16), py = my + 8 + p[1] * (ms - 16); if (i === 0) cache.mapPath.moveTo(px, py); else cache.mapPath.lineTo(px, py); });
        cache.mapPath.closePath();
      }
      g.stroke(cache.mapPath); g.lineWidth = 1;
      function dot(total, color, r) {
        var i = Math.floor(((total % trackLen) + trackLen) % trackLen / SEG) % T.map.length, p = T.map[i];
        circle(g, mx + 8 + p[0] * (ms - 16), my + 8 + p[1] * (ms - 16), r, color);
      }
      racers().forEach(function (c) { dot(c.total, c.isTarget ? '#ff5252' : c.color, c.boss ? 3.2 : 2.2); });
      dot(pz(), '#ffffff', 3.8); dot(pz(), car.color, 2.6);
      }
      ms = narrow ? 84 : 100;

      // 左下: 速度計
      var sp = kmh(P.speed), gx = 52, gy = H - 44, rr = 36;
      if (mode === 'drag') {   // 回転計とシフトランプ
        g.fillStyle = 'rgba(8,12,20,.7)'; g.beginPath(); g.arc(gx, gy, rr + 6, 0, Math.PI * 2); g.fill();
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(gx, gy, rr, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
        g.strokeStyle = '#2e7d32'; g.beginPath(); g.arc(gx, gy, rr, Math.PI * (0.75 + 1.5 * 0.8), Math.PI * (0.75 + 1.5 * 0.97)); g.stroke();
        g.lineWidth = 2;
        var ra = Math.PI * (0.75 + 1.5 * clamp(P.rpm, 0, 1));
        g.strokeStyle = P.rpm >= 0.8 && P.rpm <= 0.97 ? '#76ff03' : '#fff';
        g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + Math.cos(ra) * (rr - 4), gy + Math.sin(ra) * (rr - 4)); g.stroke(); g.lineWidth = 1;
        text(g, P.gear + L('速', 'th'), gx, gy + 16, 13, '#ffd93d', 'center');
        text(g, sp + 'km/h', gx, gy + 28, 8, '#9fb0c2', 'center');
        if (P.rpm >= 0.8 && P.rpm <= 0.97 && P.gear < 5) text(g, L('今だ！ スペース', 'SHIFT NOW!'), cx, H * 0.3, 18, '#76ff03', 'center');
        return;
      }
      g.fillStyle = 'rgba(8,12,20,.7)'; g.beginPath(); g.arc(gx, gy, rr + 6, 0, Math.PI * 2); g.fill();
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(gx, gy, rr, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
      var frac = clamp(sp / 320, 0, 1);
      g.strokeStyle = P.boosting ? '#5ab4ff' : frac > 0.85 ? '#ff5252' : '#5ccfa0';
      g.beginPath(); g.arc(gx, gy, rr, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * frac)); g.stroke();
      g.lineWidth = 1;
      var na = Math.PI * (0.75 + 1.5 * frac);
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + Math.cos(na) * (rr - 8), gy + Math.sin(na) * (rr - 8)); g.stroke();
      text(g, String(sp), gx, gy + 16, 14, '#fff', 'center');
      text(g, 'km/h', gx, gy + 27, 8, '#9fb0c2', 'center');
      var gear = P.rev ? 'R' : P.speed < 1 ? 'N' : String(Math.min(6, 1 + Math.floor(P.speed / (topSpeed * nitroPower) * 6.5)));
      text(g, gear, gx, gy - 8, 12, '#ffd93d', 'center');

      // 右下: ニトロ・ダメージ
      panel(g, W - 158, H - 62, 150, 54);
      meter(g, W - 146, H - 44, 126, 8, P.nitro, P.boosting ? '#8fd3ff' : '#4ea3ff', L('ニトロ', 'NITRO') + (P.draft ? L('  スリップ中', '  DRAFT') : ''));
      meter(g, W - 146, H - 18, 126, 8, P.damage, P.damage > 0.6 ? '#e06c75' : '#ffb74d', L('ダメージ', 'DAMAGE') + (P.damage >= 1 ? L('  大破', '  WRECKED') : ''));

      // 制限速度と追跡
      if (mode === 'world') {
        // ウインカー（Q 左 / E 右）
        var bon = Math.floor(t0 * 3) % 2 === 0;
        g.fillStyle = P.blink < 0 && bon ? '#7CFC00' : 'rgba(255,255,255,.18)';
        poly(g, gx - 28, gy - 44, gx - 16, gy - 51, gx - 16, gy - 37, gx - 16, gy - 37, g.fillStyle);
        g.fillStyle = P.blink > 0 && bon ? '#7CFC00' : 'rgba(255,255,255,.18)';
        poly(g, gx + 28, gy - 44, gx + 16, gy - 51, gx + 16, gy - 37, gx + 16, gy - 37, g.fillStyle);
        // ナビ（次の交差点の曲がる方向）
        var nv = cfg.navInfo ? cfg.navInfo() : null;
        var toJ = Math.max(0, Math.round((edgeLen - pz()) / SEG * MPS));
        var ch2 = sess.exitChoice ? sess.exitChoice() : null;
        if (nv || (cfg.exitDirs && cfg.exitDirs.length > 1)) {
          var ny = H - 100, nw2 = nv ? (narrow ? 190 : 250) : 150;
          panel(g, W - nw2 - 8, ny - 30, nw2, 46);
          if (nv) {
            text(g, nv.arrow, W - nw2 + 16, ny + 4, 30, nv.dir === 'goal' ? '#ffd93d' : '#5ccfa0', 'center');
            text(g, nv.text, W - nw2 + 36, ny - 12, 10, '#e8e8f0');
          }
          if (cfg.exitDirs && cfg.exitDirs.length > 1 && ch2 !== null) {
            var dN = cfg.exitDirs[ch2], aw = { left: '←', right: '→', straight: '↑', uturn: '↶' }[dN];
            var ok = !nv || nv.dir === dN || nv.dir === 'any' || nv.dir === 'goal';
            text(g, L('この先 ', 'Ahead ') + toJ + 'm  ' + L('進路 ', 'route ') + aw, nv ? W - nw2 + 36 : W - nw2 + 4, ny + (nv ? 6 : -2), 11, ok ? '#9fe8c8' : '#ff8a80');
          }
        }
        if (limitKmh) {
          circle(g, 112, H - 70, 15, '#d32f2f'); circle(g, 112, H - 70, 12, '#ffffff');
          text(g, String(limitKmh), 112, H - 66, 11, '#1a47a0', 'center');
          if (kmh(P.speed) > limitKmh + 20) text(g, L('速度超過', 'SPEEDING'), 112, H - 46, 9, '#ff5252', 'center');
        }
        if (spec.stopSeg && spec.junction.signal && pz() < spec.stopSeg * SEG && spec.stopSeg * SEG - pz() < SEG * 160) {
          var sc3 = { green: '#00e0a0', yellow: '#ffc400', red: '#ff2a2a' }[sig.phase];
          panel(g, W / 2 - 60, H - 36, 120, 26); circle(g, W / 2 - 44, H - 23, 7, sc3);
          text(g, L('信号 ', 'LIGHT ') + Math.round((spec.stopSeg * SEG - pz()) / SEG * MPS) + 'm', W / 2 + 6, H - 19, 11, '#fff', 'center');
        }
        if (cops.length) {
          var cg = Math.round((pz() - cops[0].total) / SEG * MPS);
          var blink = Math.floor(t0 * 4) % 2;
          panel(g, W / 2 - 110, 92 + (cfg.hud ? 50 : 0), 220, 26);
          text(g, (blink ? '■ ' : '　 ') + L('追跡中  ', 'PURSUIT  ') + cg + 'm' + L('  400m 離せば逃げ切り', '  get 400m away'), W / 2, 110 + (cfg.hud ? 50 : 0), 11, blink ? '#ff5252' : '#7fb0ff', 'center');
        }
      }
      // 後ろから迫る車
      racers().concat(traffic).forEach(function (c) {
        var gap = pz() - c.total;
        if (gap > 0 && gap < SEG * 4 && !c.out) {
          var side = c.offset < P.x ? -1 : 1;
          g.fillStyle = 'rgba(255,82,82,.8)';
          var ax = W / 2 + side * 60, ay = H - 8;
          poly(g, ax - 6, ay, ax + 6, ay, ax + 6, ay, ax, ay - 8, g.fillStyle);
        }
      });

      // スタートの信号
      if (state === 'count') {
        var lit = clamp(Math.floor((3.2 - countT) / 0.64) + 1, 0, 5);
        panel(g, cx - 80, H * 0.28, 160, 34);
        for (var i2 = 0; i2 < 5; i2++) circle(g, cx - 56 + i2 * 28, H * 0.28 + 17, 10, i2 < lit ? '#ff3030' : '#3a1515');
      }
      if (msg.t > 0 && state !== 'results') text(g, msg.text, cx, H / 2 - 30, 24, '#ffd93d', 'center');
      if (radio) {
        var rw = Math.min(W - 40, 430), rx = W / 2 - rw / 2, ry = H - 118;
        g.globalAlpha = clamp(radio.t * 2, 0, 1);
        panel(g, rx, ry, rw, 40);
        if (!cache['face_' + radio.who] && R.CHARS[radio.who]) { var fc = document.createElement('canvas'); fc.width = fc.height = 48; R.drawPortrait(fc, R.CHARS[radio.who].face); cache['face_' + radio.who] = fc; }
        if (cache['face_' + radio.who]) g.drawImage(cache['face_' + radio.who], rx + 4, ry + 4, 32, 32);
        text(g, '[無線] ' + radio.name, rx + 42, ry + 15, 9, radio.color);
        text(g, radio.text.length > 34 ? radio.text.slice(0, 34) + '…' : radio.text, rx + 42, ry + 31, 11, '#ffffff');
        g.globalAlpha = 1;
      }
      popups.forEach(function (p, i) {
        g.globalAlpha = clamp(p.t, 0, 1);
        text(g, p.text, cx, H * 0.36 + i * 18 - (1.6 - p.t) * 10, 14, p.color, 'center');
      });
      g.globalAlpha = 1;
      if ((P.x < -1.05 || P.x > 1.05) && state === 'race' && !findSeg(pz()).tunnel) text(g, L('コースアウト', 'OFF ROAD'), cx, H / 2 + 8, 12, '#ffb74d', 'center');
      if (sess.paused) {
        g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, W, H);
      }
    }

    if (cfg.start && cfg.start.copGap && mode === 'world') startPursuit(cfg.start.copGap);

    /* --- 外に見せるもの --- */
    sess.W = W; sess.H = H;
    sess.update = function (dt) { eng.mute(!!sess.paused); if (!sess.paused) update(dt); };
    sess.audio = function () { return eng.info(); };
    sess.render = render;
    sess.renderHud = renderHud;
    /* 3D 描画が読むための情報（参照を渡すだけ。書き換えない） */
    sess.view = function () {
      return { P: P, pz: pz(), playerZ: PLAYER_Z, cars: racers(), traffic: traffic, cops: cops, keys: keys, t: t0, state: state,
               car: car, spec: spec, pal: pal, weather: weather, night: night, geom: geom, trackLen: trackLen, segs: segs, path: T.path,
               cross: spec.crossSeg ? sig.cross : [], crossSeg: spec.crossSeg, signal: sig.phase, dyn: dyn };
    };
    sess.keys = keys;
    sess.state = function () { return state; };
    sess.result = function () { return result; };
    sess.stop = function () { eng.stop(); if (sirenA) { sirenA.stop(); sirenA = null; } };
    sess.track = T;
    sess.cfg = cfg;
    sess.key = function (k, down) {
      var m = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
                ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
                ' ': 'nitro', Shift: 'nitro', n: 'nitro', N: 'nitro', x: 'nitro', X: 'nitro' }[k];
      if (m) keys[m] = down;
      if (down && (k === 'q' || k === 'Q' || k === 'z' || k === 'Z' || k === ',')) { P.blink = P.blink === -1 ? 0 : -1; sfx('click'); return true; }
      if (down && (k === 'e' || k === 'E' || k === 'c' || k === 'C' || k === '.')) { P.blink = P.blink === 1 ? 0 : 1; sfx('click'); return true; }
      if ((k === 'r' || k === 'R') && down && mode === 'world' && !edgeDone && P.speed < MAX * 0.15 && cfg.onEdgeEnd) {
        edgeDone = true;
        cfg.onEdgeEnd({ speed: 0, x: -P.x, nitro: P.nitro, damage: P.damage, reverse: true, frac: clamp(P.total / edgeLen, 0, 1) });
        return true;
      }
      return !!m;
    };
    sess.releaseKeys = function () { for (var k in keys) keys[k] = false; };
    // テスト・見本用に中の値を少しだけ読めるように
    sess.info = function () { return { state: state, lap: P.lap, place: P.finished && P.place ? P.place : rank(), speed: P.speed, x: P.x, damage: P.damage, raceT: raceT, timer: timer, score: score, r0: cars[0] ? { t: Math.round((cars[0].total - pz()) / SEG), v: +(cars[0].speed / MAX).toFixed(2), o: +cars[0].offset.toFixed(2), m: +(cars[0].max / MAX).toFixed(2) } : null, tgap: targetCar ? Math.round((targetCar.total - pz()) / SEG) : null, thp: targetCar ? targetCar.hp : null, tspd: targetCar ? targetCar.speed / MAX : null, pspd: P.speed / MAX }; };
    return sess;
  };

  /* =====================================================================
     メニュー用の小さな絵
     ===================================================================== */

  /** コースの 1 コマを canvas に描く（選択画面の見本） */
  R.drawPreview = function (cv, track, weather, mirror, hideCar) {
    var s = R.Session({ track: track, weather: weather || R.TRACKS[track].weather, mirror: mirror, demo: true, laps: Infinity, field: [], hideCar: hideCar });
    s.W = cv.width; s.H = cv.height;
    var g = cv.getContext('2d');
    s.update(0.016);
    s.render(g);
    s.stop();
  };

  /** 車の見本（ガレージ） */
  R.drawCarCard = function (cv, body, color) {
    var g = cv.getContext('2d');
    var w = cv.width, h = cv.height;
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1b2433'); gr.addColorStop(1, '#0b0f18');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a3346'; g.fillRect(0, h * 0.78, w, h * 0.22);
    g.strokeStyle = 'rgba(255,255,255,.08)';
    for (var i = 0; i < 8; i++) { g.beginPath(); g.moveTo(w / 2, h * 0.78); g.lineTo(i * w / 7, h); g.stroke(); }
    var cw = Math.min(w * 0.6, h * 1.05) / ((BODIES[body] && BODIES[body].wm) || 1);
    drawCar(g, w / 2, h * 0.88, cw, color, body, { t: performance.now() / 1000, siren: body === 'police' });
  };

  /** スマホ用の押しっぱなしボタン */
  R.makePad = function (sess) {
    var pad = document.createElement('div');
    pad.className = 'race-pad';
    [['◀', 'ArrowLeft', 'left'], ['▶', 'ArrowRight', 'right'], ['N₂O', ' ', 'nitro'], ['BRK', 'ArrowDown', 'down'], ['GAS', 'ArrowUp', 'up']].forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = p[0]; b.className = 'rbtn ' + p[2];
      function on(e) { e.preventDefault(); (typeof sess === 'function' ? sess() : sess).key(p[1], true); }
      function off(e) { e.preventDefault(); var s = typeof sess === 'function' ? sess() : sess; if (s) s.key(p[1], false); }
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('pointercancel', off);
      pad.appendChild(b);
    });
    return pad;
  };
})();
