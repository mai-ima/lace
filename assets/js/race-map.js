/*
 * race-map.js — 浜松市の実地図（OpenStreetMap + 国土地理院の標高）を走るための部品。
 *
 *   R.Map.load(cb)        … 地図データ（race-map-data.js, 約 1MB）を必要なときだけ読み込む
 *   R.Map.route(a, b)     … 交差点 a から b までの最短経路（一方通行も守る）
 *   R.Map.exits(h)        … 半辺 h の終点の交差点から出られる道（左→右の順）
 *   R.Map.edgeSpec(h, o)  … 半辺 h（交差点〜交差点）を 1 本のコースにする
 *   R.Map.polySpec(pts,o) … 任意の折れ線（実在の峠・サーキット）をコースにする
 *
 * 座標はゲーム全体で共通: 原点 = 浜松駅、x = 東、z = 南、y = 上（m）。
 * 疑似 3D の区間（1 区間 ≒ 1.3 m）にも、3D の世界にも、同じ座標を持たせてずれないようにする。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var R = TB.Race;
  var M = R.Map = { ready: false };

  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var IDX = {};
  for (var ai = 0; ai < 64; ai++) IDX[ALPHA.charCodeAt(ai)] = ai;
  function dec(s) {
    var out = [], z = 0, sh = 0;
    for (var i = 0; i < s.length; i++) {
      var c = IDX[s.charCodeAt(i)];
      z += (c & 31) * Math.pow(2, sh); sh += 5;
      if (c < 32) { out.push(z % 2 ? -(z - 1) / 2 - 1 : z / 2); z = 0; sh = 0; }
    }
    return out;
  }
  function cum(a) { var s = 0; return a.map(function (v) { s += v; return s; }); }
  function unrle(a) { var o = []; for (var i = 0; i < a.length; i += 2) for (var k = 0; k < a[i + 1]; k++) o.push(a[i]); return o; }

  /* ---------- 読み込み ---------- */
  var waiting = [];
  M.load = function (cb) {
    if (M.ready) { cb(true); return; }
    if (TB.RaceMapData) { init(); cb(true); return; }
    waiting.push(cb);
    if (waiting.length > 1) return;
    var sc = document.createElement('script');
    sc.src = 'assets/js/race-map-data.js';
    sc.onload = function () { var ok = false; try { init(); ok = true; } catch (e) { if (window.console) console.error(e); } var w = waiting; waiting = []; w.forEach(function (f) { f(ok); }); };
    sc.onerror = function () { var w = waiting; waiting = []; w.forEach(function (f) { f(false); }); };
    document.head.appendChild(sc);
  };

  // 道路の種類: 0 高速 1 国道(幹線) 2 主要道 3 二級 4 一般 5〜8 ランプ
  var CLS = [
    { k: 'motorway', hw: 5.4, kmh: 100, lanes: 2, one: true },
    { k: 'trunk', hw: 7.0, kmh: 60, lanes: 4 },
    { k: 'primary', hw: 6.2, kmh: 50, lanes: 4 },
    { k: 'secondary', hw: 4.4, kmh: 50, lanes: 2 },
    { k: 'tertiary', hw: 3.6, kmh: 40, lanes: 2 },
    { k: 'mlink', hw: 3.6, kmh: 60, lanes: 1, one: true },
    { k: 'tlink', hw: 3.4, kmh: 40, lanes: 1 },
    { k: 'plink', hw: 3.4, kmh: 40, lanes: 1 },
    { k: 'slink', hw: 3.4, kmh: 40, lanes: 1 }
  ];
  M.CLS = CLS;

  function init() {
    var D = TB.RaceMapData, r = D.road;
    var nx = cum(dec(r.nx)), nz = cum(dec(r.nz)), ny = cum(dec(r.ny)), nf = unrle(dec(r.nf));
    var N = nx.length;
    M.nodes = [];
    for (var i = 0; i < N; i++) M.nodes.push({ id: i, x: nx[i], z: nz[i], y: ny[i] / 10, sig: !!nf[i], out: [] });
    var ea = cum(dec(r.ea)), ebd = dec(r.eb), ec = dec(r.ec), eo = unrle(dec(r.eo)), en = dec(r.en), er = dec(r.er), el = dec(r.el), em = dec(r.em), ep = dec(r.ep);
    var px = dec(r.px), pz = dec(r.pz), py = dec(r.py), ps = unrle(dec(r.ps)), es = dec(r.es);
    var q = 0, qs = 0, qe = 0;
    M.names = D.names;
    M.edges = [];
    for (var e = 0; e < ea.length; e++) {
      var a = ea[e], b = a + ebd[e], A = M.nodes[a], B = M.nodes[b];
      var n = ep[e] + 2, pts = new Float32Array(n * 3);
      var x = A.x, z = A.z, yy = Math.round(A.y * 10);
      pts[0] = x; pts[1] = z; pts[2] = A.y;
      for (var k = 1; k < n - 1; k++) {
        x += px[q]; z += pz[q]; yy += py[q]; q++;
        pts[k * 3] = x; pts[k * 3 + 1] = z; pts[k * 3 + 2] = yy / 10;
      }
      pts[(n - 1) * 3] = B.x; pts[(n - 1) * 3 + 1] = B.z; pts[(n - 1) * 3 + 2] = B.y;
      var st = new Uint8Array(n - 1);
      for (k = 0; k < n - 1; k++) st[k] = ps[qs++];
      var ns = es[qe++], sig = [];
      for (k = 0; k < ns; k++) sig.push(es[qe++]);
      var len = 0;
      for (k = 1; k < n; k++) len += Math.hypot(pts[k * 3] - pts[k * 3 - 3], pts[k * 3 + 1] - pts[k * 3 - 2]);
      var E = { id: e, a: a, b: b, c: ec[e], one: !!eo[e], name: D.names[en[e]] || '', ref: D.names[er[e]] || '', lanes: el[e], ms: em[e] * 10, pts: pts, st: st, sig: sig, len: len };
      M.edges.push(E);
      A.out.push(e * 2);
      if (!E.one) B.out.push(e * 2 + 1);
    }
    // 見た目用の細い道
    var mn = dec(D.minor.n), mx = cum(dec(D.minor.x)), mz = cum(dec(D.minor.z));
    M.minor = []; q = 0;
    mn.forEach(function (c) { var p = []; for (var k2 = 0; k2 < c; k2++, q++) p.push(mx[q], mz[q]); M.minor.push(p); });
    // 鉄道
    var rn = dec(D.rail.n), rk = dec(D.rail.k), rs = dec(D.rail.s), rx = cum(dec(D.rail.x)), rz = cum(dec(D.rail.z)), ry = cum(dec(D.rail.y));
    M.rail = []; q = 0;
    rn.forEach(function (c, j) { var p = []; for (var k2 = 0; k2 < c; k2++, q++) p.push(rx[q], rz[q], ry[q] / 10); M.rail.push({ k: rk[j], st: rs[j], p: p }); });
    // 水域
    var wn = dec(D.water.n), wx = cum(dec(D.water.x)), wz = cum(dec(D.water.z)), wy = dec(D.water.y);
    M.water = []; q = 0;
    wn.forEach(function (c, j) { var p = []; for (var k2 = 0; k2 < c; k2++, q++) p.push(wx[q], wz[q]); M.water.push({ y: wy[j] / 10, p: p }); });
    // 格子（土地利用 100m・標高 200m）
    var g = D.grid;
    M.grid = { x0: g.x0, z0: g.z0, cell: g.cell, w: g.w, h: g.h, lu: new Uint8Array(unrle(dec(g.lu))), dc: g.dc, dw: g.dw, dh: g.dh };
    var dm = dec(g.dem), dem = new Float32Array(g.dw * g.dh);
    for (var j2 = 0; j2 < g.dh; j2++) { var s = 0; for (var i2 = 0; i2 < g.dw; i2++) { s += dm[j2 * g.dw + i2]; dem[j2 * g.dw + i2] = s; } }
    M.grid.dem = dem;
    // 建物
    var B2 = D.bld, bx = cum(dec(B2.x)), bz = cum(dec(B2.z)), bw = dec(B2.w), bd = dec(B2.d), ba = dec(B2.a), bl = dec(B2.l), bk = dec(B2.k);
    M.bld = { n: bx.length, x: bx, z: bz, w: bw, d: bd, a: ba.map(function (v) { return v * 2 * Math.PI / 180; }), l: bl, k: bk };
    M.bgrid = {};
    for (i = 0; i < bx.length; i++) { var key = Math.floor(bx[i] / 100) + ',' + Math.floor(bz[i] / 100); (M.bgrid[key] = M.bgrid[key] || []).push(i); }
    M.bcov = D.bcov || [];
    M.places = D.places; M.stations = D.stations; M.ics = D.ics; M.lms = D.lms;
    M.credit = D.credit;
    // 道の空間索引（200m 格子、辺の番号）
    M.egrid = {};
    M.edges.forEach(function (E2) {
      var seen = {};
      for (var k3 = 0; k3 < E2.pts.length / 3; k3++) {
        var kk = Math.floor(E2.pts[k3 * 3] / 200) + ',' + Math.floor(E2.pts[k3 * 3 + 1] / 200);
        if (!seen[kk]) { seen[kk] = 1; (M.egrid[kk] = M.egrid[kk] || []).push(E2.id); }
      }
    });
    M.ready = true;
  }

  /* ---------- 地形 ---------- */
  M.height = function (x, z) {
    var g = M.grid, fx = (x - g.x0) / g.dc, fz = (z - g.z0) / g.dc;
    var i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= g.dw - 1 || j >= g.dh - 1) return 0;
    var tx = fx - i, tz = fz - j, d = g.dem, w = g.dw;
    var a = d[j * w + i], b = d[j * w + i + 1], c = d[(j + 1) * w + i], e = d[(j + 1) * w + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
  };
  // 0 不明 1 住宅 2 商業 3 工業 4 田畑 5 果樹・茶 6 森 7 公園・草地 8 砂浜 9 水 10 温室 11 墓地 12 競技場
  M.landuse = function (x, z) {
    var g = M.grid, i = Math.floor((x - g.x0) / g.cell), j = Math.floor((z - g.z0) / g.cell);
    if (i < 0 || j < 0 || i >= g.w || j >= g.h) return 9;
    var v = g.lu[j * g.w + i];
    if (!v || v === 4 || v === 7) {   // 土地利用の記録がなくても建物が多ければ住宅地
      var bl = M.bgrid[Math.floor(x / 100) + ',' + Math.floor(z / 100)];
      if (bl && bl.length >= 6) return bl.length > 25 ? 2 : 1;
    }
    if (!v) v = M.height(x, z) > 90 ? 6 : 4;
    return v;
  };
  M.covered = function (x, z) { return M.bcov.some(function (c) { return Math.hypot(x - c[0], z - c[1]) < c[2]; }); };

  /* ---------- 半辺（向きのある道） ---------- */
  function edgeOf(h) { return M.edges[h >> 1]; }
  M.edgeOf = edgeOf;
  M.from = function (h) { var e = edgeOf(h); return h & 1 ? e.b : e.a; };
  M.to = function (h) { var e = edgeOf(h); return h & 1 ? e.a : e.b; };
  M.rev = function (h) { var e = edgeOf(h); if (e.one) return -1; return h ^ 1; };
  /** 半辺の点列 [x,z,y, …]（向きどおり） */
  M.pts = function (h) {
    var e = edgeOf(h);
    if (!(h & 1)) return e.pts;
    if (!e.rpts) {
      var n = e.pts.length / 3, o = new Float32Array(e.pts.length);
      for (var i = 0; i < n; i++) { o[i * 3] = e.pts[(n - 1 - i) * 3]; o[i * 3 + 1] = e.pts[(n - 1 - i) * 3 + 1]; o[i * 3 + 2] = e.pts[(n - 1 - i) * 3 + 2]; }
      e.rpts = o;
    }
    return e.rpts;
  };
  // 端の向き（最初・最後の 18m くらいの平均）
  function headAt(p, fromEnd) {
    var n = p.length / 3, i0, i1, d = 0;
    if (!fromEnd) {
      i0 = 0; i1 = 1;
      while (i1 < n - 1 && d < 18) { d += Math.hypot(p[i1 * 3 + 3] - p[i1 * 3], p[i1 * 3 + 4] - p[i1 * 3 + 1]); if (d < 18) i1++; else break; }
      i1 = Math.min(n - 1, Math.max(1, i1));
    } else {
      i1 = n - 1; i0 = n - 2;
      while (i0 > 0 && d < 18) { d += Math.hypot(p[i0 * 3] - p[i0 * 3 - 3], p[i0 * 3 + 1] - p[i0 * 3 - 2]); if (d < 18) i0--; else break; }
      i0 = Math.max(0, Math.min(n - 2, i0));
    }
    return Math.atan2(p[i1 * 3] - p[i0 * 3], p[i1 * 3 + 1] - p[i0 * 3 + 1]);
  }
  M.headIn = function (h) { return headAt(M.pts(h), true); };
  M.headOut = function (h) { return headAt(M.pts(h), false); };
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  M.wrap = wrap;
  M.roadName = function (h) {
    var e = edgeOf(h);
    var nm = e.name || e.ref;
    if (!nm) nm = { 0: '高速道路', 1: '国道', 2: '県道', 3: '県道', 4: '市道', 5: 'ランプ', 6: '連絡路', 7: '連絡路', 8: '連絡路' }[e.c] || '市道';
    if (/^\d+$/.test(nm)) nm = (e.c <= 1 ? '国道 ' : '県道 ') + nm + ' 号';
    return nm;
  };

  /** 交差点で選べる道。左から右の順で最大 3 本（{h, ang, dir}） */
  M.exits = function (hIn) {
    var node = M.nodes[M.to(hIn)], back = M.rev(hIn), hin = M.headIn(hIn);
    var c = node.out.filter(function (h) { return h !== back; });
    if (!c.length) c = node.out.slice();
    var ex = c.map(function (h) { return { h: h, ang: wrap(M.headOut(h) - hin) }; });
    ex.sort(function (a, b) { return b.ang - a.ang; });   // 左（向きが増える）から
    if (ex.length > 3) {
      var mid = ex.slice(1, -1).reduce(function (a, b) { return Math.abs(b.ang) < Math.abs(a.ang) ? b : a; });
      ex = [ex[0], mid, ex[ex.length - 1]];
    }
    ex.forEach(function (x) {
      x.dir = Math.abs(x.ang) < 0.6 ? 'straight' : x.ang > 0 ? (x.ang > 2.5 ? 'uturn' : 'left') : (x.ang < -2.5 ? 'uturn' : 'right');
    });
    // 同じ向きが重なったら、いちばん真っすぐに近いものを「直進（斜め）」に
    if (ex.length > 1 && !ex.some(function (x) { return x.dir === 'straight'; })) {
      var dup = ex.filter(function (x) { return ex.filter(function (y) { return y.dir === x.dir; }).length > 1; });
      if (dup.length) { var sx = dup.reduce(function (a, b) { return Math.abs(b.ang) < Math.abs(a.ang) ? b : a; }); if (Math.abs(sx.ang) < 1.4) sx.dir = 'straight'; }
    }
    return ex;
  };

  /* ---------- 経路 ---------- */
  function cost(h) { var e = edgeOf(h); return e.len / (e.ms || CLS[e.c].kmh); }
  M.route = function (from, to, avoidHw) {
    var n = M.nodes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    var heap = [[0, from]]; dist[from] = 0;
    function push(it) { heap.push(it); var i = heap.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
    function pop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = i * 2 + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } }
      return top;
    }
    while (heap.length) {
      var it = pop(), u = it[1];
      if (done[u]) continue; done[u] = 1;
      if (u === to) break;
      M.nodes[u].out.forEach(function (h) {
        if (avoidHw && edgeOf(h).c === 0) return;
        var v = M.to(h), d = dist[u] + cost(h);
        if (d < dist[v]) { dist[v] = d; prev[v] = h; push([d, v]); }
      });
    }
    if (dist[to] === Infinity) return null;
    var hs = [], v2 = to, len = 0;
    while (v2 !== from) { var h2 = prev[v2]; hs.unshift(h2); len += edgeOf(h2).len; v2 = M.from(h2); }
    return { hs: hs, len: len, time: dist[to] * 3.6 };
  };
  /** いちばん近い交差点 */
  M.nearestNode = function (x, z, filter) {
    var best = -1, bd = Infinity;
    M.nodes.forEach(function (N) { if (filter && !filter(N)) return; var d = (N.x - x) * (N.x - x) + (N.z - z) * (N.z - z); if (d < bd) { bd = d; best = N.id; } });
    return best;
  };
  /** 近くの地名（駅・名所・場所） */
  M.nearName = function (x, z, maxD) {
    var best = null, bd = maxD || 400;
    (M.stations || []).forEach(function (s) { var d = Math.hypot(s[1] - x, s[2] - z); if (d < bd) { bd = d; best = s[0] + '駅'; } });
    (M.lms || []).forEach(function (s) { if (!/castle|shrine|attraction|museum|zoo|park|university|stadium|theme_park/.test(s[1])) return; var d = Math.hypot(s[2] - x, s[3] - z) * 1.3; if (d < bd) { bd = d; best = s[0]; } });
    return best;
  };

  /* =====================================================================
     折れ線 → 疑似 3D の区間
     ===================================================================== */
  var SEG_M = 1.296;
  M.SEG_M = SEG_M;

  /** 折れ線（x,z,y の平坦配列）を約 1.3m ごとに区切る。st は区間ごとの構造（1 橋 2 トンネル） */
  function resample(p, st, startTurn) {
    var n = p.length / 3, cumd = [0];
    for (var i = 1; i < n; i++) cumd.push(cumd[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]));
    var L = cumd[n - 1], ns = Math.max(6, Math.round(L / SEG_M)), step = L / ns;
    var X = new Float64Array(ns + 1), Z = new Float64Array(ns + 1), Y = new Float64Array(ns + 1), S = new Uint8Array(ns + 1);
    var k = 0;
    for (i = 0; i <= ns; i++) {
      var d = i * step;
      while (k < n - 2 && cumd[k + 1] < d) k++;
      var f = (d - cumd[k]) / Math.max(1e-6, cumd[k + 1] - cumd[k]);
      f = Math.max(0, Math.min(1, f));
      X[i] = p[k * 3] + (p[k * 3 + 3] - p[k * 3]) * f;
      Z[i] = p[k * 3 + 1] + (p[k * 3 + 4] - p[k * 3 + 1]) * f;
      Y[i] = p[k * 3 + 2] + (p[k * 3 + 5] - p[k * 3 + 2]) * f;
      S[i] = st ? st[Math.min(k, st.length - 1)] : 0;
    }
    return { n: ns, step: step, x: X, z: Z, y: Y, st: S, len: L };
  }

  /**
   * 区間の並びを作る。turn = 交差点での曲がり角（ラジアン、左が +）。
   * 最初の数 m は交差点の中を曲がる弧にして、実際の道の線へなめらかにつなぐ。
   */
  /**
   * 点列をガウスでなめらかにする（OpenStreetMap の細かな折れ・小さな蛇行を消す）。
   * sigma（m）。loop なら両端をつなげて、そうでなければ両端の位置は動かさない。
   */
  function smoothLine(r, sigma, loop) {
    var n = r.n, sg = Math.max(1, sigma / r.step), R2 = Math.ceil(sg * 2.5);
    var W = [], i, k;
    for (k = -R2; k <= R2; k++) W.push(Math.exp(-(k * k) / (2 * sg * sg)));
    function pass(A) {
      var out = new Float64Array(A.length);
      for (i = 0; i <= n; i++) {
        var s0 = 0, ws = 0;
        for (k = -R2; k <= R2; k++) {
          var j = i + k;
          if (loop) j = ((j % n) + n) % n;
          else if (j < 0 || j > n) continue;
          s0 += A[j] * W[k + R2]; ws += W[k + R2];
        }
        out[i] = s0 / ws;
      }
      if (loop) out[n] = out[0];
      else {   // 端は元の位置へ（交差点の中心で道がつながるように）
        var fade = Math.min(n / 2, Math.ceil(R2 * 1.5));
        for (i = 0; i <= fade; i++) { var f = i / fade, s1 = f * f * (3 - 2 * f); out[i] = A[i] + (out[i] - A[i]) * s1; out[n - i] = A[n - i] + (out[n - i] - A[n - i]) * s1; }
      }
      return out;
    }
    r.x = pass(r.x); r.z = pass(r.z); r.y = pass(r.y);
    return r;
  }
  M.smoothLine = smoothLine;

  /**
   * 急すぎる角（半径 rmin m 未満）だけを、そのまわりで重ねてなめらかにする。
   * 市街地の直角の交差点で、道の内側の縁が折り返して重なるのを防ぐ。
   */
  function limitCurv(r, rmin, loop) {
    var n = r.n, d = Math.max(1, Math.round(3 / r.step)), sp = Math.max(2, Math.round(10 / r.step));
    var keep = loop ? 0 : Math.min(Math.floor(n / 2), Math.round(14 / r.step));
    function P(A, j) { if (loop) j = ((j % n) + n) % n; else j = Math.max(0, Math.min(n, j)); return A[j]; }
    for (var it = 0; it < 8; it++) {
      var mark = new Uint8Array(n + 1), any = false, i, k;
      for (i = keep; i <= n - keep; i++) {
        var ax = r.x[i] - P(r.x, i - d), az = r.z[i] - P(r.z, i - d), bx = P(r.x, i + d) - r.x[i], bz = P(r.z, i + d) - r.z[i];
        var la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
        if (la < 1e-6 || lb < 1e-6) continue;
        var ang = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
        if (ang / ((la + lb) / 2) > 1 / rmin) {
          // ヘアピン（向きが大きく変わる所）は、ならすと逆に縮むので触らない
          var tx = r.x[i] - P(r.x, i - sp), tz = r.z[i] - P(r.z, i - sp), ux = P(r.x, i + sp) - r.x[i], uz = P(r.z, i + sp) - r.z[i];
          if (Math.abs(Math.atan2(tx * uz - tz * ux, tx * ux + tz * uz)) > 2.0) continue;
          any = true; for (k = -sp; k <= sp; k++) { var j = i + k; if (loop) j = ((j % n) + n) % n; if (j >= keep && j <= n - keep) mark[j] = 1; } }
      }
      if (!any) break;
      ['x', 'z'].forEach(function (key) {
        var A = r[key], out = Float64Array.from(A);
        for (i = 0; i <= n; i++) {
          if (!mark[i]) continue;
          var s0 = 0, ws = 0;
          for (k = -sp; k <= sp; k++) { var w = Math.exp(-(k * k) / (2 * (sp / 2) * (sp / 2))); s0 += P(A, i + k) * w; ws += w; }
          out[i] = s0 / ws;
        }
        if (loop) out[n] = out[0];
        r[key] = out;
      });
    }
    return r;
  }

  // なめらかにした後、区間の長さをそろえ直す
  function reflow(r) {
    var p = new Float32Array((r.n + 1) * 3);
    for (var i = 0; i <= r.n; i++) { p[i * 3] = r.x[i]; p[i * 3 + 1] = r.z[i]; p[i * 3 + 2] = r.y[i]; }
    return resample(p, r.st);
  }

  function lineOf(p, st, turn, loop, rmin) {
    var r = resample(p, st);
    if (r.n > 20) { smoothLine(r, 9, !!loop); limitCurv(r, rmin || 10, !!loop); r = reflow(r); }
    var n = r.n, H = new Float64Array(n + 1), w = 3;
    // 向き（前後 3 区間で平均して角ばりを消す）
    for (var i = 0; i <= n; i++) {
      var a = Math.max(0, i - w), b = Math.min(n, i + w);
      H[i] = Math.atan2(r.x[b] - r.x[a], r.z[b] - r.z[a]);
    }
    for (i = 1; i <= n; i++) H[i] = H[i - 1] + wrap(H[i] - H[i - 1]);
    // 交差点の弧（曲がる前の向きから、道の向きへ）
    if (turn) {
      var arc = Math.min(n - 2, Math.round(Math.min(22, 8 + Math.abs(turn) * 8) / SEG_M));
      var h0 = H[0] - turn, x = r.x[0], z = r.z[0];
      var ax = [x], az = [z], ah = [h0];
      for (i = 1; i <= arc; i++) {
        var t = i / arc, hh = h0 + turn * (t * t * (3 - 2 * t));
        x += Math.sin(hh) * r.step; z += Math.cos(hh) * r.step;
        ax.push(x); az.push(z); ah.push(hh);
      }
      // 弧のあとは実際の線へ寄せる
      var blend = Math.min(n - arc, Math.round(18 / SEG_M));
      var dx = ax[arc] - r.x[arc], dz = az[arc] - r.z[arc];
      for (i = 0; i <= arc; i++) { r.x[i] = ax[i]; r.z[i] = az[i]; H[i] = ah[i]; }
      for (i = arc + 1; i <= arc + blend; i++) {
        var f = 1 - (i - arc) / blend, s = f * f * (3 - 2 * f);
        r.x[i] += dx * s; r.z[i] += dz * s;
      }
      for (i = arc + 1; i <= Math.min(n, arc + blend + w); i++) {
        var a2 = Math.max(0, i - w), b2 = Math.min(n, i + w);
        H[i] = Math.atan2(r.x[b2] - r.x[a2], r.z[b2] - r.z[a2]);
        H[i] = H[i - 1] + wrap(H[i] - H[i - 1]);
      }
    }
    r.h = H;
    return r;
  }
  M.lineOf = lineOf;

  var UNITS = 200 / SEG_M;   // エンジンの 1 m
  var CURVE_K = 290;         // 向きの変化（ラジアン/区間）→ カーブの強さ

  /** エンジンの区間へ（curve / 高さ / 世界座標 wp） */
  function pushSegs(b, r, y0, loop) {
    var n = r.n, segs = b.segs;
    // 向きを前後 4 区間（約 10m）でならしてから差を取る。測量データの細かいガタつきが
    // 「かくかくした道」にならないようにする（合計の曲がりは変わらない）。
    var hs = new Float64Array(n + 1), kk = 4;
    for (var q = 0; q <= n; q++) {
      var s0 = 0, c0 = 0;
      for (var d = -kk; d <= kk; d++) { var j = q + d; if (j < 0) j = 0; if (j > n) j = n; var wgt = kk + 1 - Math.abs(d); s0 += r.h[j] * wgt; c0 += wgt; }
      hs[q] = s0 / c0;
    }
    hs[0] = r.h[0]; hs[n] = r.h[n];
    for (var i = 0; i < n; i++) {
      var dh = hs[i + 1] - hs[i];
      var c = -dh * CURVE_K;
      var cv = Math.max(-12, Math.min(12, c * 0.8));   // 見た目のカーブの上限（もとのコースの最大は 9 前後。きついカーブは phys が速度制限で表す）
      b.add(cv, (r.y[i + 1] - y0) * UNITS);
      var s = segs[segs.length - 1];
      s.phys = (c < 0 ? -1 : 1) * Math.min(16, 3.2 * Math.sqrt(Math.abs(c)));   // 曲率半径に合った限界速度（約 1G）
      s.wp = { x: r.x[i], z: r.z[i], y: r.y[i], h: r.h[i] };
      if (r.st[i] === 2) s.tunnel = true;
      if (r.st[i] === 1) s.bridge = true;
    }
    if (segs.length) segs[0].p1.world.y = (r.y[0] - y0) * UNITS;
    b.wpEnd = { x: r.x[n], z: r.z[n], y: r.y[n], h: r.h[n] };
  }

  /* =====================================================================
     沿道（実在の建物・土地利用から）
     ===================================================================== */
  function hash2(x, z) { var h = (Math.floor(x) * 73856093) ^ (Math.floor(z) * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  M.hash2 = hash2;
  var WALL = ['#d9d4c7', '#e8e4da', '#cfd4d8', '#bfb8aa', '#f0ece2', '#c9c3b6', '#a9b0b8', '#dcd0bc', '#e2ddd3', '#b8b2a6'];
  var OFFICE = ['#8f9aa6', '#a7b1bb', '#6f7b87', '#b9c2c9', '#c8ccd0', '#7d8a96', '#9fa7ad'];
  var ROOF = ['#4a4f57', '#5b4a3e', '#3f4a55', '#6b5a4a', '#2f3a44', '#5d6670', '#7a3f2e'];
  M.WALL = WALL; M.OFFICE = OFFICE; M.ROOF = ROOF;

  function bldStyle(k, lv, seed) {
    if (k === 2 || lv >= 5) return { c: OFFICE[Math.floor(seed * OFFICE.length)], win: 'grid', roof: 'flat' };
    if (k === 1) return { c: WALL[Math.floor(seed * WALL.length)], win: 'apt', roof: 'flat' };
    if (k === 3) return { c: ['#c7ccd1', '#b4bcc2', '#d6d6cf', '#9aa6ad'][Math.floor(seed * 4)], win: 'factory', roof: 'flat' };
    if (k === 4) return { c: '#8a6a4a', win: 'none', roof: 'temple' };
    if (k === 5) return { c: '#e9e6dd', win: 'grid', roof: 'flat' };
    return { c: WALL[Math.floor(seed * WALL.length)], win: 'house', roof: seed < 0.75 ? 'gable' : 'flat', rc: ROOF[Math.floor(seed * 97) % ROOF.length] };
  }
  M.bldStyle = bldStyle;

  /**
   * 区間の並び（segs に wp があること）に沿道の物を置く。
   * hw = 道幅の半分（m）。opt.cls = 道路の種類、opt.hwy = 高速道路。
   */
  function decorate(segs, hw, opt) {
    var n = segs.length, hwy = !!opt.hwy, cls = opt.cls, rural = 0;
    if (!n) return;
    // 区間の位置の索引（20m 格子）
    var sgrid = {};
    for (var i = 0; i < n; i += 2) { var w = segs[i].wp, key = Math.floor(w.x / 20) + ',' + Math.floor(w.z / 20); (sgrid[key] = sgrid[key] || []).push(i); }
    function nearestSeg(x, z) {
      var cx = Math.floor(x / 20), cz = Math.floor(z / 20), best = -1, bd = Infinity;
      for (var dx = -7; dx <= 7; dx++) for (var dz = -7; dz <= 7; dz++) {
        var l = sgrid[(cx + dx) + ',' + (cz + dz)];
        if (l) l.forEach(function (j) { var w2 = segs[j].wp, d = (w2.x - x) * (w2.x - x) + (w2.z - z) * (w2.z - z); if (d < bd) { bd = d; best = j; } });
      }
      return best;
    }
    function frame(j) { var w2 = segs[j].wp; return { x: w2.x, z: w2.z, fx: Math.sin(w2.h), fz: Math.cos(w2.h), rx: -Math.cos(w2.h), rz: Math.sin(w2.h) }; }
    var used = {};
    // 実在の建物
    if (!hwy || opt.city) {
      var cand = {};
      for (i = 0; i < n; i += 30) {
        var w3 = segs[i].wp, bx = Math.floor(w3.x / 100), bz = Math.floor(w3.z / 100);
        for (var ox = -2; ox <= 2; ox++) for (var oz = -2; oz <= 2; oz++) (M.bgrid[(bx + ox) + ',' + (bz + oz)] || []).forEach(function (b) { cand[b] = 1; });
      }
      var B = M.bld;
      Object.keys(cand).forEach(function (bs) {
        var b = +bs, j = nearestSeg(B.x[b], B.z[b]);
        if (j < 0) return;
        var F = frame(j), vx = B.x[b] - F.x, vz = B.z[b] - F.z;
        var along = vx * F.fx + vz * F.fz, lat = vx * F.rx + vz * F.rz;
        // 建物の四隅を道の向きで測る
        var ca = Math.cos(B.a[b]), sa = Math.sin(B.a[b]), hwB = B.w[b] / 2, hdB = B.d[b] / 2;
        var amin = Infinity, amax = -Infinity, lmin = Infinity, lmax = -Infinity;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
          var cx2 = q[0] * hwB * ca - q[1] * hdB * sa, cz2 = q[0] * hwB * sa + q[1] * hdB * ca;
          var aa = along + cx2 * F.fx + cz2 * F.fz, ll = lat + cx2 * F.rx + cz2 * F.rz;
          amin = Math.min(amin, aa); amax = Math.max(amax, aa); lmin = Math.min(lmin, ll); lmax = Math.max(lmax, ll);
        });
        var near = lat > 0 ? lmin : -lmax, far = lat > 0 ? lmax : -lmin;
        if (near < hw + 1.2 || near > 150) return;
        if (amax - amin > 90) return;
        var j0 = Math.max(0, Math.min(n - 1, j + Math.round(amin / SEG_M)));
        var depth = Math.max(1, Math.round((amax - amin) / SEG_M));
        var seed = hash2(B.x[b], B.z[b]), lv = B.l[b], st = bldStyle(B.k[b], lv, seed);
        var sd = lat > 0 ? 1 : -1;
        segs[j0].sprites.push({ kind: 'bldg', offset: sd * near / hw, off2: sd * Math.min(far, near + 60) / hw, len: depth, hm: lv * 3.1 + (st.roof === 'gable' ? 0.4 : 0.8), c: st.c, win: st.win, roof: st.roof, rc: st.rc, seed: Math.floor(seed * 1000), city: true });
        used[j0 + ':' + sd] = 1;
      });
    }
    // 土地利用からの飾り（建物データのない場所は家を生成）
    var poleSide = hash2(segs[0].wp.x, segs[0].wp.z) < 0.5 ? -1 : 1;
    var lastPole = -999, lastLamp = -999;
    var wl = 0, wr = 0, groundL = [], groundR = [];
    for (i = 0; i < n; i++) {
      var s = segs[i], F2 = frame(i);
      if (i % 8 === 0) {
        var luL = M.landuse(F2.x - F2.rx * (hw + 16), F2.z - F2.rz * (hw + 16)), luR = M.landuse(F2.x + F2.rx * (hw + 16), F2.z + F2.rz * (hw + 16));
        var luL2 = M.landuse(F2.x - F2.rx * (hw + 45), F2.z - F2.rz * (hw + 45)), luR2 = M.landuse(F2.x + F2.rx * (hw + 45), F2.z + F2.rz * (hw + 45));
        wl = luL === 9 || (luL2 === 9 && s.bridge) ? 1 : 0; wr = luR === 9 || (luR2 === 9 && s.bridge) ? 1 : 0;
        groundL = [luL, luL2]; groundR = [luR, luR2];
        if (luL !== 1 && luL !== 2 && luL !== 3 && luR !== 1 && luR !== 2 && luR !== 3) rural++; else rural = 0;
      }
      s.waterSide = wl && wr ? 'both' : wl ? 'left' : wr ? 'right' : null;
      s.luL = groundL[0]; s.luR = groundR[0];
      s.urban = (s.luL === 1 || s.luL === 2 || s.luL === 3 || s.luR === 1 || s.luR === 2 || s.luR === 3);
      if (s.tunnel) { if (i % 12 === 0) s.sprites.push({ kind: 'tlight', offset: 0 }); continue; }
      if (hwy) {
        if (i % 3 === 0 && !s.bridge) s.rails = true;
        if (s.bridge) s.rails = true;
        if (i % 36 === 0) s.sprites.push({ kind: 'hwlamp', offset: -1.18, city: true });
        if (s.urban && i % 4 === 0 && !s.bridge) { s.sprites.push({ kind: 'noisewall', offset: -1.45, len: 4, city: true }); s.sprites.push({ kind: 'noisewall', offset: 1.45, len: 4, city: true }); }
        continue;
      }
      // 電柱と電線（片側）
      if (!s.bridge && i - lastPole >= 24 && !s.waterSide) {
        lastPole = i;
        s.sprites.push({ kind: 'pole', offset: poleSide * (1 + 1.1 / hw), city: true, id: i });
      }
      // 街灯（幹線）
      if ((cls === 1 || cls === 2) && s.urban && i - lastLamp >= 30) { lastLamp = i; s.sprites.push({ kind: 'streetlamp', offset: -poleSide * (1 + 0.8 / hw), city: true }); }
      if (s.bridge) { s.rails = true; continue; }
      // 生成する物（両側）
      [-1, 1].forEach(function (sd) {
        var lu = sd < 0 ? groundL[0] : groundR[0], lu2 = sd < 0 ? groundL[1] : groundR[1];
        var px2 = F2.x + F2.rx * sd * (hw + 10), pz2 = F2.z + F2.rz * sd * (hw + 10);
        var hs = hash2(px2 * 0.37 + i, pz2 * 0.41 - sd * 7);
        if ((lu === 1 || lu === 2 || lu === 3 || lu === 10) && !M.covered(px2, pz2)) {
          if (i % 9 === 0 && hs < 0.8 && !used[i + ':' + sd]) {
            var big = lu === 2 || lu === 3, dep = big ? 14 + hs * 20 : 7 + hs * 5;
            var st2 = bldStyle(lu === 2 ? 2 : lu === 3 ? 3 : 0, big ? 2 + Math.floor(hs * 3) : 2, hs);
            var nearM = hw + 2.5 + hs * 5;
            s.sprites.push({ kind: 'bldg', offset: sd * nearM / hw, off2: sd * (nearM + dep) / hw, len: Math.round((big ? 14 : 8) / SEG_M), hm: (big ? 2 + Math.floor(hs * 3) : 2) * 3.1 + 0.4, c: st2.c, win: st2.win, roof: lu === 10 ? 'flat' : st2.roof, rc: st2.rc, seed: Math.floor(hs * 1000), city: true, gen: true });
          }
        } else if (lu === 6 || (lu === 7 && hs < 0.5)) {
          if (i % 5 === 0 && hs < 0.85) s.sprites.push({ kind: hs < 0.55 ? 'cedar' : 'broadleaf', offset: sd * (1.25 + 3 / hw + hs * 18 / hw), seed: Math.floor(hs * 1000), city: true, gen: true });
          if (i % 5 === 2 && hs < 0.6) s.sprites.push({ kind: hs < 0.3 ? 'cedar' : 'broadleaf', offset: sd * (1.25 + 14 / hw + hs * 30 / hw), seed: Math.floor(hs * 999), city: true, gen: true });
        } else if (lu === 5) {
          if (i % 6 === 0) s.sprites.push({ kind: F2.x < -9000 ? 'mikan' : 'tea', offset: sd * (1.4 + 3 / hw + hs * 12 / hw), seed: Math.floor(hs * 1000), city: true, gen: true });
        } else if (lu === 4) {
          if (i % 40 === 0 && hs < 0.25) {
            s.sprites.push({ kind: 'bldg', offset: sd * (hw + 15 + hs * 60) / hw, off2: sd * (hw + 27 + hs * 60) / hw, len: 8, hm: 6.6, c: WALL[Math.floor(hs * 40) % WALL.length], win: 'house', roof: 'gable', rc: ROOF[Math.floor(hs * 70) % ROOF.length], seed: Math.floor(hs * 1000), city: true, gen: true });
          } else if (i % 23 === 0 && hs < 0.3) s.sprites.push({ kind: 'broadleaf', offset: sd * (1.3 + hs * 40 / hw), seed: Math.floor(hs * 1000), city: true, gen: true });
        } else if (lu === 8 && i % 30 === 0) s.sprites.push({ kind: 'pine', offset: sd * (1.4 + hs * 10 / hw), seed: 3, city: true, gen: true });
      });
      // 山道のガードレール・矢印板
      if (rural > 2 && Math.abs(s.phys || 0) > 4) {
        s.rails = true;
        if (i % 14 === 0) s.sprites.push({ kind: 'chevron', offset: (s.curve > 0 ? -1 : 1) * (1 + 1.5 / hw), dir: s.curve > 0 ? 1 : -1, city: true });
      }
      if (rural > 2 && segs[i].wp && i > 2) {
        var sl = segs[i].p2.world.y - segs[i].p1.world.y;
        if (Math.abs(sl) > 12 && i % 3 === 0) s.rails = true;
      }
    }
  }
  M.decorate = decorate;

  /* =====================================================================
     コースの仕様（Session に渡す track）
     ===================================================================== */
  var PALS = {
    city: { sky: ['#6fa7d8', '#a9cbe8', '#dfe8ee'], grass: ['#7a7d74', '#72756c'], road: ['#5d6166', '#595d62'], rumble: ['#b8b8b2', '#aeaea8'], lane: '#f2f2f2', fog: '#d6dde3', far: '#8ea2b3', hill: '#6f8a73', water: '#3c6f96', wall: '#5a5f66' },
    rural: { sky: ['#5f9bd6', '#a6c9ea', '#e2ecf2'], grass: ['#6f8f4e', '#688848'], road: ['#5e6268', '#5a5e64'], rumble: ['#9aa08f', '#939988'], lane: '#f2f2f2', fog: '#d8e2e8', far: '#7890a8', hill: '#56744f', water: '#3b6f98', wall: '#5a5f66' },
    mount: { sky: ['#5a92cc', '#a2c4e4', '#dde8ef'], grass: ['#3f5f38', '#3a5934'], road: ['#5a5e63', '#56595e'], rumble: ['#7f8a73', '#77826c'], lane: '#f2f2f2', fog: '#cfdad8', far: '#6c8298', hill: '#3e5a3c', water: '#3f7291', wall: '#555a60' },
    hwy: { sky: ['#5e9bd8', '#a8caea', '#e0eaf1'], grass: ['#708a55', '#6a844f'], road: ['#55595e', '#52565b'], rumble: ['#8d9196', '#878b90'], lane: '#f4f4f4', fog: '#d3dde5', far: '#7b93ab', hill: '#5c7a58', water: '#3d6f97', wall: '#5a5f66' },
    coast: { sky: ['#5c9ee0', '#a7cdf0', '#e6f0f5'], grass: ['#cdbb8e', '#c6b487'], road: ['#5f6368', '#5b5f64'], rumble: ['#b9b09a', '#b2a993'], lane: '#f2f2f2', fog: '#dde7ee', far: '#8aa3bb', hill: '#6b8a64', water: '#2f6fa3', wall: '#5a5f66' }
  };
  M.PALS = PALS;
  // 土地利用ごとの地面の色
  var GROUND = { 1: '#7c7f78', 2: '#7a7a78', 3: '#8a8d88', 4: '#7fa052', 5: '#5f8f3e', 6: '#3f6036', 7: '#6f9a55', 8: '#d8c79a', 9: '#3c6f96', 10: '#9aa39a', 11: '#7d8a70', 12: '#6f9a55', 0: '#6f8f4e' };
  M.GROUND = GROUND;

  /** 実在の道の幅など */
  function geomFor(c, lanes, hwy) {
    var d = CLS[c] || CLS[4];
    var hw = d.hw;
    if (lanes) hw = hwy ? Math.max(3.6, lanes * 1.75 + 1.6) : Math.max(3.0, lanes * 1.65 + 0.4);
    hw = Math.max(5.2, hw * 1.55);   // ゲームとして走りやすい幅に（実際の約 1.5 倍）
    return { hw: hw, lanes: hwy ? Math.max(2, lanes || d.lanes) : Math.max(2, lanes || d.lanes) };
  }
  M.geomFor = geomFor;

  /**
   * 1 本の半辺をコースに。
   * opt: { turn: 交差点で曲がる角度, junction: {signal}, fork: [...], name, limit }
   */
  M.edgeSpec = function (h, opt) {
    opt = opt || {};
    var e = edgeOf(h), hwy = e.c === 0 || e.c === 5, g = geomFor(e.c, e.lanes, hwy);
    var p = M.pts(h), st = e.st;
    if (h & 1) { st = new Uint8Array(e.st.length); for (var i = 0; i < st.length; i++) st[i] = e.st[st.length - 1 - i]; }
    var jDist = e.len;
    if (opt.tail !== undefined && opt.tail >= 0) {
      // 交差点の先（次に進みそうな道）を少しつなげて、道が途切れて見えないようにする
      var j2 = joinTail(p, st, M.pts(opt.tail), M.edgeOf(opt.tail), 220);
      p = j2.p; st = j2.st; jDist = j2.jd;
    }
    var r = lineOf(p, st, opt.turn || 0);
    var jEnd = Math.max(4, Math.min(r.n, Math.round(jDist / r.step)));
    var hwv = g.hw, cw = 0.9 / hwv;
    var lu0 = M.landuse(p[0], p[1]), mid = Math.floor(p.length / 6) * 3;
    var y0 = r.y[0];
    var kind = hwy ? 'hwy' : (lu0 === 1 || lu0 === 2 || lu0 === 3) ? 'city' : M.height(p[mid], p[mid + 1]) > 120 ? 'mount' : (lu0 === 8 || lu0 === 9) ? 'coast' : 'rural';
    var limit = e.ms || (hwy ? 100 : e.c <= 2 ? 50 : e.c <= 4 ? 40 : 40);
    var spec = {
      id: 'map-' + h, name: { ja: M.roadName(h), en: M.roadName(h) }, pal: PALS[kind], weather: 'clear',
      custom: true, noFinish: true, wpY0: y0,
      geom: { rw: Math.max(2000, Math.round(hwv * UNITS * 2)), cw: cw, lanes: Math.min(4, g.lanes), hw: hwv },
      twoWay: !e.one && !hwy, limit: limit, police: hwy ? 1 : (kind === 'city' ? 1 : 0), orbis: hwy && r.len > 1200,
      banner: opt.banner, fork: opt.fork, junction: opt.junction || null, startMark: null, endMark: null,
      mapEdge: h, mapLen: e.len, kind: kind, hwy: hwy, jEnd: jEnd, line: r,
      build: function (b) { pushSegs(b, r, y0); },
      after: function (segs) {
        decorate(segs, hwv, { cls: e.c, hwy: hwy });
        // 途中の信号（横断歩道）
        (e.sig || []).forEach(function (d) {
          var dd = h & 1 ? e.len - d : d, j = Math.round(dd / r.step);
          if (j > 30 && j < jEnd - 60) {
            segs[j].crosswalk = segs[j + 1].crosswalk = true; segs[j - 3].stopLine = true;
            segs[j - 3].sprites.push({ kind: 'signal', offset: 1 + 0.9 / hwv, city: true, mid: true });
          }
        });
        if (limit && segs[30]) segs[30].sprites.push({ kind: 'limitsign', offset: -(1 + 1.2 / hwv), n: limit });
      }
    };
    return spec;
  };

  /** 半辺の点列 p の後ろに、次の道 q の最初 maxLen m を角を丸めてつなぐ */
  function joinTail(p, st, q, eq, maxLen) {
    var n = p.length / 3, R2 = 9;
    function backPt(dist) {   // p の終わりから dist 戻った点
      var d = 0;
      for (var i = n - 1; i > 0; i--) {
        var dd = Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]);
        if (d + dd >= dist) { var f = (dist - d) / dd; return { i: i, x: p[i * 3] + (p[i * 3 - 3] - p[i * 3]) * f, z: p[i * 3 + 1] + (p[i * 3 - 2] - p[i * 3 + 1]) * f, y: p[i * 3 + 2] + (p[i * 3 - 1] - p[i * 3 + 2]) * f }; }
        d += dd;
      }
      return { i: 1, x: p[0], z: p[1], y: p[2] };
    }
    var m = q.length / 3;
    function fwdPt(dist) {
      var d = 0;
      for (var i = 1; i < m; i++) {
        var dd = Math.hypot(q[i * 3] - q[i * 3 - 3], q[i * 3 + 1] - q[i * 3 - 2]);
        if (d + dd >= dist) { var f = (dist - d) / dd; return { i: i, x: q[i * 3 - 3] + (q[i * 3] - q[i * 3 - 3]) * f, z: q[i * 3 - 2] + (q[i * 3 + 1] - q[i * 3 - 2]) * f, y: q[i * 3 - 1] + (q[i * 3 + 2] - q[i * 3 - 1]) * f }; }
        d += dd;
      }
      return { i: m - 1, x: q[(m - 1) * 3], z: q[(m - 1) * 3 + 1], y: q[(m - 1) * 3 + 2] };
    }
    var a = backPt(Math.min(R2, 0.3 * lenOf(p))), b = fwdPt(Math.min(R2, 0.3 * lenOf(q)));
    var out = [], ost = [];
    for (var i = 0; i < a.i; i++) { out.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); if (i < a.i - 1) ost.push(st[i] || 0); }
    out.push(a.x, a.z, a.y); ost.push(st[a.i - 1] || 0);
    var N = { x: p[(n - 1) * 3], z: p[(n - 1) * 3 + 1], y: p[(n - 1) * 3 + 2] };
    var jd = 0;
    for (var k = 1; k <= 8; k++) {
      var t = k / 8, u = 1 - t;
      out.push(u * u * a.x + 2 * u * t * N.x + t * t * b.x, u * u * a.z + 2 * u * t * N.z + t * t * b.z, u * u * a.y + 2 * u * t * N.y + t * t * b.y);
      ost.push(0);
    }
    // 交差点（弧の真ん中）までの距離
    var lenA = lenOf(new Float32Array(out.slice(0, out.length - 8 * 3 + 3)));
    jd = lenA + Math.hypot(N.x - a.x, N.z - a.z) * 0.9;
    var d2 = 0;
    for (var j = b.i; j < m && d2 < maxLen; j++) {
      d2 += Math.hypot(q[j * 3] - q[j * 3 - 3], q[j * 3 + 1] - q[j * 3 - 2]);
      out.push(q[j * 3], q[j * 3 + 1], q[j * 3 + 2]); ost.push(eq.st[Math.min(j - 1, eq.st.length - 1)] || 0);
    }
    return { p: new Float32Array(out), st: new Uint8Array(ost), jd: jd };
  }
  function lenOf(p) { var L2 = 0; for (var i = 3; i < p.length; i += 3) L2 += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]); return L2; }

  /** 任意の折れ線（x,z,y の平坦配列）からコース（峠・サーキット・実在の道） */
  M.polySpec = function (p, opt) {
    opt = opt || {};
    var r = lineOf(p, null, 0, !!opt.loop);
    var hwv = opt.hw || 5.2, y0 = r.y[0];
    return {
      r: r, hw: hwv,
      geom: { rw: Math.max(2000, Math.round(hwv * UNITS * 2)), cw: 0.9 / hwv, lanes: opt.lanes || 2, hw: hwv },   // 道幅は、もとのコースの標準（2000）より狭くしない
      build: function (b) { pushSegs(b, r, y0); }
    };
  };
  M.pushSegs = pushSegs;
  M.UNITS = UNITS;
})();

/* ---------- 地図を描く（メニューの大きな地図・北が上） ---------- */
(function () {
  'use strict';
  var R = window.TB.Race, M = R.Map;
  var LUC = { 0: [52, 74, 52], 1: [96, 92, 90], 2: [118, 100, 100], 3: [92, 96, 116], 4: [104, 128, 72], 5: [128, 128, 60], 6: [40, 72, 46], 7: [70, 120, 70], 8: [196, 180, 132], 9: [42, 86, 140], 10: [140, 146, 140], 11: [90, 96, 84], 12: [80, 120, 80] };
  var luCanvas = null;
  function landCanvas() {
    if (luCanvas) return luCanvas;
    var g = M.grid, c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
    var cx = c.getContext('2d'), im = cx.createImageData(g.w, g.h);
    for (var j = 0; j < g.h; j++) for (var i = 0; i < g.w; i++) {
      var v = g.lu[j * g.w + i], k = (j * g.w + i) * 4;
      if (!v) { var y = M.height(g.x0 + (i + 0.5) * g.cell, g.z0 + (j + 0.5) * g.cell); v = y > 90 ? 6 : 0; }
      var col = LUC[v] || LUC[0];
      var sh = v === 9 ? 1 : 0.85 + Math.min(0.3, M.height(g.x0 + i * g.cell, g.z0 + j * g.cell) / 3000);
      im.data[k] = col[0] * sh; im.data[k + 1] = col[1] * sh; im.data[k + 2] = col[2] * sh; im.data[k + 3] = 255;
    }
    cx.putImageData(im, 0, 0);
    luCanvas = c;
    return c;
  }
  /**
   * view = { cx, cz, scale(px/m) }。opts = { places, sel, dest, route:[h…], label }
   * 返り値: 画面座標 ⇔ 地図座標の変換
   */
  M.drawMap = function (cv, view, opts) {
    opts = opts || {};
    var g2 = cv.getContext('2d'), Wc = cv.width, Hc = cv.height, sc = view.scale;
    function P(x, z) { return [Wc / 2 + (x - view.cx) * sc, Hc / 2 + (z - view.cz) * sc]; }
    g2.fillStyle = '#2a3f5c'; g2.fillRect(0, 0, Wc, Hc);   // 海
    var G = M.grid, a = P(G.x0, G.z0);
    g2.imageSmoothingEnabled = sc * G.cell < 3;
    g2.drawImage(landCanvas(), a[0], a[1], G.w * G.cell * sc, G.h * G.cell * sc);
    g2.imageSmoothingEnabled = true;
    // 水域
    g2.fillStyle = '#2f6a9e';
    M.water.forEach(function (wp) {
      g2.beginPath();
      for (var i = 0; i < wp.p.length; i += 2) { var q = P(wp.p[i], wp.p[i + 1]); if (i) g2.lineTo(q[0], q[1]); else g2.moveTo(q[0], q[1]); }
      g2.fill();
    });
    var x0 = view.cx - Wc / 2 / sc, x1 = view.cx + Wc / 2 / sc, z0 = view.cz - Hc / 2 / sc, z1 = view.cz + Hc / 2 / sc;
    function vis(pts, step) { for (var i = 0; i < pts.length; i += step) if (pts[i] > x0 - 500 && pts[i] < x1 + 500 && pts[i + 1] > z0 - 500 && pts[i + 1] < z1 + 500) return true; return false; }
    function stroke(pts, step, color, wd) {
      g2.strokeStyle = color; g2.lineWidth = wd; g2.beginPath();
      for (var i = 0; i < pts.length; i += step) { var q = P(pts[i], pts[i + 1]); if (i) g2.lineTo(q[0], q[1]); else g2.moveTo(q[0], q[1]); }
      g2.stroke();
    }
    if (sc > 0.02) M.minor.forEach(function (p) { if (vis(p, 2)) stroke(p, 2, 'rgba(230,230,230,.35)', 0.8); });
    // 鉄道
    M.rail.forEach(function (r) {
      if (!vis(r.p, 3)) return;
      var c = { 0: '#f5f5f5', 1: '#8ecbff', 2: '#ef5350', 3: '#ffb74d', 4: '#ce93d8' }[r.k];
      g2.setLineDash([4, 3]); stroke(r.p, 3, c, 1.4); g2.setLineDash([]);
    });
    // 道路（細い順に）
    var order = [4, 8, 7, 6, 3, 2, 1, 5, 0];
    var col = { 0: '#4dd0e1', 5: '#4dd0e1', 1: '#ff8a65', 2: '#ffcc80', 3: '#fff59d', 4: '#eceff1', 6: '#ff8a65', 7: '#ffcc80', 8: '#fff59d' };
    var wid = { 0: 3.2, 5: 1.6, 1: 2.6, 2: 2.2, 3: 1.6, 4: sc > 0.01 ? 1.1 : 0.6, 6: 1.3, 7: 1.3, 8: 1.2 };
    order.forEach(function (c) {
      M.edges.forEach(function (E) {
        if (E.c !== c || !vis(E.pts, 3)) return;
        stroke(E.pts, 3, col[c], wid[c] * Math.max(1, Math.min(2.4, sc * 30)));
      });
    });
    if (opts.route) {
      g2.strokeStyle = '#5ccfa0'; g2.lineWidth = 4; g2.beginPath();
      opts.route.forEach(function (h, j) { var q = M.pts(h); for (var i = 0; i < q.length; i += 3) { var s = P(q[i], q[i + 1]); if (!j && !i) g2.moveTo(s[0], s[1]); else g2.lineTo(s[0], s[1]); } });
      g2.stroke();
    }
    // 場所
    var pl = opts.places || {};
    Object.keys(pl).forEach(function (k) {
      var p = pl[k], q = P(p.x, p.z), on = k === opts.sel, ds = k === opts.dest;
      if (q[0] < -20 || q[1] < -20 || q[0] > Wc + 20 || q[1] > Hc + 20) return;
      g2.fillStyle = on ? '#5ccfa0' : ds ? '#ff5252' : '#fff';
      g2.beginPath(); g2.arc(q[0], q[1], on || ds ? 6 : 3.5, 0, Math.PI * 2); g2.fill();
      g2.strokeStyle = '#111'; g2.lineWidth = 1; g2.stroke();
      if (opts.label) {
        var nm = opts.label(k);
        g2.font = (on || ds ? 'bold 12px' : '10px') + ' sans-serif';
        var tw = g2.measureText(nm).width;
        g2.fillStyle = 'rgba(0,0,0,.55)'; g2.fillRect(q[0] + 6, q[1] - 7, tw + 4, 13);
        g2.fillStyle = on ? '#5ccfa0' : ds ? '#ff8a80' : '#e8eef2'; g2.textAlign = 'left'; g2.fillText(nm, q[0] + 8, q[1] + 3);
      }
    });
    // 方位と縮尺
    g2.fillStyle = 'rgba(0,0,0,.5)'; g2.fillRect(Wc - 40, 8, 32, 40);
    g2.fillStyle = '#fff'; g2.font = 'bold 13px sans-serif'; g2.textAlign = 'center'; g2.fillText('N', Wc - 24, 24);
    g2.beginPath(); g2.moveTo(Wc - 24, 28); g2.lineTo(Wc - 29, 42); g2.lineTo(Wc - 19, 42); g2.closePath(); g2.fill();
    var km = [0.5, 1, 2, 5, 10, 20].filter(function (v) { return v * 1000 * sc < 160; }).pop() || 0.5;
    g2.fillRect(12, Hc - 16, km * 1000 * sc, 3); g2.textAlign = 'left'; g2.font = '11px sans-serif'; g2.fillText(km + ' km', 12, Hc - 22);
    g2.fillStyle = 'rgba(255,255,255,.6)'; g2.font = '9px sans-serif'; g2.textAlign = 'right'; g2.fillText('© OpenStreetMap contributors / 国土地理院', Wc - 8, Hc - 6);
    return {
      toMap: function (px, py) { return { x: view.cx + (px - Wc / 2) / sc, z: view.cz + (py - Hc / 2) / sc }; },
      toScreen: P
    };
  };
})();
