/*
 * race-3d.js — TUI RACING の 3D 描画（WebGL / three.js）。
 *
 * 物理は race-engine.js の Session のまま。ここでは Session の区間データから
 *   ・道路（路面・路肩・白線・芝・水面・トンネル・ガードレール・交差点）
 *   ・沿道の木や建物（インスタンス描画でまとめて描く）
 *   ・車（車種ごとの形の立体）
 * を本物の 3D に組み立て、自車の後ろからのカメラで描く。
 * three.js は 3D 表示を選んだときだけ読み込む（assets/vendor/three.min.js）。
 */
(function () {
  'use strict';

  var TB = window.TB;
  var R = TB.Race;

  var M_SEG = 1.3;          // 1 区間 = 1.3 m
  var Y_SCALE = 0.35;       // 起伏は現実的な勾配に縮める

  /** three.js を必要なときだけ読み込む */
  function loadScript(src, cb) {
    var sc = document.createElement('script');
    sc.src = src; sc.onload = function () { cb(true); }; sc.onerror = function () { cb(false); };
    document.head.appendChild(sc);
  }
  R.load3D = function (cb) {
    if (window.THREE && TB.RaceTex && TB.RaceLowPoly) { cb(true); return; }
    loadScript('assets/vendor/three.min.js', function (ok) {
      if (!ok || !window.THREE) { cb(false); return; }
      if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;   // 色を sRGB として正しく扱う
      // 写真テクスチャ（Poly Haven, CC0）。読めなくても 3D は動く
      loadScript('assets/vendor/race-tex.js', function () {
        loadScript('assets/vendor/kenney-cars.js', function () { cb(true); });   // ローポリ車両（Kenney, CC0）
      });
    });
  };
  /** 写真テクスチャ（data URL なので file:// でも使える） */
  var texStore = {};
  R.tex3D = function (name, rep) {
    if (!window.THREE || !TB.RaceTex || !TB.RaceTex[name]) return null;
    var key = name + (rep || '');
    if (texStore[key]) return texStore[key];
    var img = new Image(), t = new THREE.Texture(img);
    img.onload = function () { t.needsUpdate = true; };
    img.src = TB.RaceTex[name];
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    if (name === 'sky') { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
    t.userData.keep = true;
    texStore[key] = t;
    return t;
  };
  R.can3D = function () {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  };

  /* ---------- 道の中心線（区間ごとの位置と向き） ---------- */
  function centerline(v, mirror) {
    return v.path || R.trackPath(v.segs, v.spec, mirror);   // エンジンが計算した形（ミニマップと同じ）
  }

  function at(cl, sIdx) {
    var n = cl.n;
    if (cl.loop) sIdx = ((sIdx % n) + n) % n; else sIdx = Math.max(0, Math.min(n - 0.001, sIdx));
    var i = Math.floor(sIdx), f = sIdx - i, j = i + 1;
    return {
      x: cl.x[i] + (cl.x[j] - cl.x[i]) * f, z: cl.z[i] + (cl.z[j] - cl.z[i]) * f,
      y: cl.y[i] + (cl.y[j] - cl.y[i]) * f, h: cl.h[i] + (cl.h[j] - cl.h[i]) * f
    };
  }
  // 向き h の「右」ベクトル
  function rightOf(h) { return { x: -Math.cos(h), z: Math.sin(h) }; }

  /* ---------- 色 ---------- */
  var colCache = {};
  function col(c) {
    if (!colCache[c]) colCache[c] = new THREE.Color(c);
    return colCache[c];
  }

  /**
   * 横にどこまで面を張ってよいか（右 = +、左 = −、m）。
   *   ・急カーブの内側: 回転の中心を越えると面が裏返って重なるので、半径より手前まで
   *   ・ヘアピンの隣の道・近くを通る別の区間: 間の半分まで（地面が別の道を覆わない）
   */
  function clearance(cl, RS) {
    if (cl.CL && cl.CL.RS === RS) return cl.CL;
    var n = cl.n, lp = new Float32Array(n + 1), ln = new Float32Array(n + 1), i, k;
    var yp = new Float32Array(n + 1), yn = new Float32Array(n + 1), np_ = new Uint8Array(n + 1), nn = new Uint8Array(n + 1);   // 隣の道との間の地面の高さ
    for (i = 0; i <= n; i++) { lp[i] = 1e4; ln[i] = 1e4; }
    // カーブの内側
    for (i = 1; i < n; i++) {
      var dh = (cl.h[i + 1] - cl.h[i - 1]) / (2 * M_SEG);
      if (Math.abs(dh) < 1e-4) continue;
      var rad = 0.9 / Math.abs(dh);
      for (k = -4; k <= 4; k++) { var j = i + k; if (j < 0 || j > n) continue; if (dh < 0) lp[j] = Math.min(lp[j], rad); else ln[j] = Math.min(ln[j], rad); }
    }
    // 近くを通る別の区間
    var C = 25, grid = {};
    for (i = 0; i <= n; i += 2) { var key = Math.floor(cl.x[i] / C) + ',' + Math.floor(cl.z[i] / C); (grid[key] = grid[key] || []).push(i); }
    for (i = 0; i <= n; i++) {
      var gx = Math.floor(cl.x[i] / C), gz = Math.floor(cl.z[i] / C), rt = rightOf(cl.h[i]);
      for (var ax = -4; ax <= 4; ax++) for (var az = -4; az <= 4; az++) {
        var L = grid[(gx + ax) + ',' + (gz + az)]; if (!L) continue;
        for (k = 0; k < L.length; k++) {
          var j2 = L[k], dj = Math.abs(j2 - i); if (cl.loop) dj = Math.min(dj, n - dj);
          if (dj < 8) continue;
          var ddx = cl.x[j2] - cl.x[i], ddz = cl.z[j2] - cl.z[i], d = Math.hypot(ddx, ddz);
          // 道なりの距離に比べて近い = 折り返して戻ってきた別の区間
          if (d > 100 || d > dj * M_SEG * 0.6) continue;
          var side = ddx * rt.x + ddz * rt.z, lim = Math.max(RS, d / 2), my = (cl.y[j2] - cl.y[i]) / 2;
          if (side > 0) { if (lim < lp[i]) { lp[i] = lim; yp[i] = my; np_[i] = 1; } }
          else if (lim < ln[i]) { ln[i] = lim; yn[i] = my; nn[i] = 1; }
        }
      }
    }
    cl.CL = { lp: lp, ln: ln, yp: yp, yn: yn, np: np_, nn: nn, RS: RS };
    return cl.CL;
  }

  /* ---------- 道路のメッシュ ---------- */
  function buildRoad(v, cl, RW) {
    var THREE_ = THREE, segs = v.segs, n = cl.n, pal = v.pal;
    var pos = [], cols = [], tpos = [], tcol = [], tuv = [];
    var asph = R.tex3D('asphalt');
    var CL = clearance(cl, RW * 1.2);
    function lim(i, a) { return a > 0 ? Math.min(a, CL.lp[i]) : Math.max(a, -CL.ln[i]); }
    function quadT(i, a0, a1, c) {   // 写真の路面（アスファルト）
      if (!asph) { quad(i, a0, a1, 0, 0, c); return; }
      var j = cl.loop ? (i + 1) : Math.min(i + 1, n);
      var A = rightOf(cl.h[i]), B = rightOf(cl.h[j]);
      var a0i = lim(i, a0), a1i = lim(i, a1), a0j = lim(j, a0), a1j = lim(j, a1);
      var p = [[cl.x[i] + A.x * a0i, cl.y[i], cl.z[i] + A.z * a0i], [cl.x[i] + A.x * a1i, cl.y[i], cl.z[i] + A.z * a1i],
               [cl.x[j] + B.x * a1j, cl.y[j], cl.z[j] + B.z * a1j], [cl.x[j] + B.x * a0j, cl.y[j], cl.z[j] + B.z * a0j]];
      var uv = [[a0 / 3.5, i * M_SEG / 3.5], [a1 / 3.5, i * M_SEG / 3.5], [a1 / 3.5, (i + 1) * M_SEG / 3.5], [a0 / 3.5, (i + 1) * M_SEG / 3.5]];
      var k2 = 2.35;
      [0, 2, 1, 0, 3, 2].forEach(function (k) { tpos.push(p[k][0], p[k][1], p[k][2]); tcol.push(Math.min(1, c.r * k2), Math.min(1, c.g * k2), Math.min(1, c.b * k2)); tuv.push(uv[k][0], uv[k][1]); });
    }
    function quad(i, a0, a1, y0, y1, c, lift) {
      var j = cl.loop ? (i + 1) : Math.min(i + 1, n);
      var A = rightOf(cl.h[i]), B = rightOf(cl.h[j]);
      var a0i = lim(i, a0), a1i = lim(i, a1), a0j = lim(j, a0), a1j = lim(j, a1);
      if (a0i === a1i && a0j === a1j) return;   // 全部が詰められて面がない
      // 地面の傾き（端の高さ）は、詰めた幅に合わせて比例で
      var f0i = a0 ? a0i / a0 : 1, f1i = a1 ? a1i / a1 : 1, f0j = a0 ? a0j / a0 : 1, f1j = a1 ? a1j / a1 : 1;
      var yy0i = Math.abs(a0) > Math.abs(a1) ? y0 * f0i : y0, yy1i = Math.abs(a1) > Math.abs(a0) ? y1 * f1i : y1;
      var yy0j = Math.abs(a0) > Math.abs(a1) ? y0 * f0j : y0, yy1j = Math.abs(a1) > Math.abs(a0) ? y1 * f1j : y1;
      var p = [
        [cl.x[i] + A.x * a0i, cl.y[i] + yy0i + (lift || 0), cl.z[i] + A.z * a0i],
        [cl.x[i] + A.x * a1i, cl.y[i] + yy1i + (lift || 0), cl.z[i] + A.z * a1i],
        [cl.x[j] + B.x * a1j, cl.y[j] + yy1j + (lift || 0), cl.z[j] + B.z * a1j],
        [cl.x[j] + B.x * a0j, cl.y[j] + yy0j + (lift || 0), cl.z[j] + B.z * a0j]
      ];
      [0, 2, 1, 0, 3, 2].forEach(function (k) { pos.push(p[k][0], p[k][1], p[k][2]); cols.push(c.r, c.g, c.b); });
    }
    function wall(i, a, y0, y1, c) {   // 縦の面（トンネルの壁・ガードレール）
      var j = cl.loop ? (i + 1) : Math.min(i + 1, n);
      var A = rightOf(cl.h[i]), B = rightOf(cl.h[j]), ai = lim(i, a), aj = lim(j, a);
      var p = [[cl.x[i] + A.x * ai, cl.y[i] + y0, cl.z[i] + A.z * ai], [cl.x[i] + A.x * ai, cl.y[i] + y1, cl.z[i] + A.z * ai],
               [cl.x[j] + B.x * aj, cl.y[j] + y1, cl.z[j] + B.z * aj], [cl.x[j] + B.x * aj, cl.y[j] + y0, cl.z[j] + B.z * aj]];
      [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2].forEach(function (k) { pos.push(p[k][0], p[k][1], p[k][2]); cols.push(c.r, c.g, c.b); });
    }
    // 道の横の地面。隣の道が近ければ、間の高さで向こうの地面とつながる。
    // 遠くまで何もなければ、端から下へ斜面を下ろす（山の上の道が宙に浮いて見えないように）
    function ground(i, sd, c) {
      var j = cl.loop ? (i + 1) : Math.min(i + 1, n), pts = [];
      [i, j].forEach(function (q) {
        var A = rightOf(cl.h[q]), L = sd > 0 ? CL.lp[q] : CL.ln[q], nb = sd > 0 ? CL.np[q] : CL.nn[q];
        var a0 = Math.min(RS, L), a1 = Math.min(RS + G, L), y1 = nb ? (sd > 0 ? CL.yp[q] : CL.yn[q]) : -1.5 * (a1 - a0) / G;
        var a2 = nb ? a1 : Math.min(RS + G + 45, L), y2 = nb ? y1 : y1 - 70 * (a2 - a1) / 45;
        pts.push([cl.x[q] + A.x * a0 * sd, cl.y[q], cl.z[q] + A.z * a0 * sd], [cl.x[q] + A.x * a1 * sd, cl.y[q] + y1, cl.z[q] + A.z * a1 * sd],
                 [cl.x[q] + A.x * a2 * sd, cl.y[q] + y2, cl.z[q] + A.z * a2 * sd]);
      });
      var dark = { r: c.r * 0.8, g: c.g * 0.8, b: c.b * 0.8 };
      [[0, 1, 4, 3, c], [1, 2, 5, 4, dark]].forEach(function (f) {
        var P = pts, a = P[f[0]], b = P[f[1]], cc = P[f[2]], d = P[f[3]], cf = f[4];
        var tri = sd > 0 ? [a, cc, b, a, d, cc] : [a, b, cc, a, cc, d];
        tri.forEach(function (v) { pos.push(v[0], v[1], v[2]); cols.push(cf.r, cf.g, cf.b); });
      });
    }
    var RS = RW * 1.17, G = 90, lanes = v.geom.lanes, real = !!cl.real && !!v.spec.custom, cityG = !!v.cityOn;
    var white = col('#f2f2f2'), laneC = col(pal.lane), water = col(pal.water || '#2f7fc1'), black = col('#111111');
    for (var i = 0; i < n; i++) {
      var s = segs[i];
      var road = col(s.stopZone ? '#b71c1c' : s.cRoad), rum = col(s.cRumble), grass = col(s.cross ? s.cRoad : s.cGrass);
      if (s.finishLine) {
        for (var k = 0; k < 8; k++) quad(i, -RW + k * RW / 4, -RW + (k + 1) * RW / 4, 0, 0, (k + i) % 2 ? black : white);
      } else if (s.stopZone || s.tunnel) quad(i, -RW, RW, 0, 0, road); else quadT(i, -RW, RW, road);
      var RS2 = real ? RW * (1 + (s.rumW || 0.15)) : RS;
      quad(i, -RS2, -RW, s.curb ? 0.15 : 0, s.curb ? 0.15 : 0, rum); quad(i, RW, RS2, s.curb ? 0.15 : 0, s.curb ? 0.15 : 0, rum);
      if (s.curb) { wall(i, -RW, 0, 0.15, col('#8a8a86')); wall(i, RW, 0, 0.15, col('#8a8a86')); }
      var wl = s.waterSide && s.waterSide !== 'right', wr = s.waterSide && s.waterSide !== 'left';
      if (s.tunnel) { quad(i, -RS - 2, -RS, 0, 0, grass); quad(i, RS, RS + 2, 0, 0, grass); }
      else if (cityG) { /* 周りの地面・水面は 3D の街（City3D）が描く */ }
      else {
        if (wl) quad(i, -RS - G, -RS, -40, 0, grass); else ground(i, -1, grass);
        if (wr) quad(i, RS, RS + G, 0, -40, grass); else ground(i, 1, grass);
        if (wl) quad(i, -RW * 1.7 - 400, -RW * 1.7, -0.6, -0.6, water);
        if (wr) quad(i, RW * 1.7, RW * 1.7 + 400, -0.6, -0.6, water);
        if (s.cross) { quad(i, -RS - 60, -RS, 0.01, 0.01, road); quad(i, RS, RS + 60, 0.01, 0.01, road); }
      }
      // 白線
      if (!s.finishLine) {
        for (var l = 1; l < lanes; l++) {
          var lx = -RW + 2 * RW * l / lanes, ctr = v.spec.twoWay && l * 2 === lanes;
          if (s.cross || (!s.alt && !(ctr && lanes >= 4))) continue;
          quad(i, lx - 0.08, lx + 0.08, 0, 0, ctr && lanes >= 4 && real ? col('#f0c030') : laneC, 0.02);
        }
        quad(i, -RW * 0.97, -RW * 0.94, 0, 0, white, 0.02); quad(i, RW * 0.94, RW * 0.97, 0, 0, white, 0.02);
        if (s.crosswalk) for (var c2 = 0; c2 < 10; c2 += 2) quad(i, -RW + c2 * RW / 5, -RW + (c2 + 1) * RW / 5, 0, 0, white, 0.02);
        if (s.stopLine) quad(i, -RW, 0, 0, 0, white, 0.03);
      }
      if (s.tunnel) {
        var wc = col(pal.wall || '#444');
        wall(i, -RW * 1.2, 0, 6.5, wc); wall(i, RW * 1.2, 0, 6.5, wc);
        quad(i, -RW * 1.2, RW * 1.2, 6.5, 6.5, col('#1d1f25'));
      }
      if (s.rails) { var rc = col('#c9ced4'), ro = real ? RW + 0.8 : RW * 1.1; wall(i, -ro, 0.35, 0.8, rc); wall(i, ro, 0.35, 0.8, rc); }
      if (s.bridge && real) { var bc2 = col('#9ea3a8'); wall(i, -RS2 - 0.2, -0.8, 1.0, bc2); wall(i, RS2 + 0.2, -0.8, 1.0, bc2); quad(i, -RS2 - 0.2, RS2 + 0.2, -0.8, -0.8, col('#7d8288')); }
    }
    var geo = new THREE_.BufferGeometry();
    geo.setAttribute('position', new THREE_.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE_.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    var rm = new THREE_.Mesh(geo, new THREE_.MeshLambertMaterial({ vertexColors: true, side: THREE_.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    rm.receiveShadow = true;
    var grp = new THREE_.Group(); grp.add(rm);
    if (tpos.length) {
      var tg = new THREE_.BufferGeometry();
      tg.setAttribute('position', new THREE_.Float32BufferAttribute(tpos, 3)); tg.setAttribute('color', new THREE_.Float32BufferAttribute(tcol, 3)); tg.setAttribute('uv', new THREE_.Float32BufferAttribute(tuv, 2));
      tg.computeVertexNormals();
      var tm = new THREE_.Mesh(tg, new THREE_.MeshLambertMaterial({ vertexColors: true, map: asph, side: THREE_.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      tm.receiveShadow = true; grp.add(tm);
    }
    return grp;
  }

  /* ---------- 沿道の物（インスタンス描画） ---------- */
  function Props(scene, night) {
    var T = THREE, lists = {};
    var geos = {
      box: new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      cone: new T.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
      cyl: new T.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0),
      ball: new T.IcosahedronGeometry(1, 1),
      roof: new T.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
      ring: new T.TorusGeometry(1, 0.05, 6, 24),
      disc: new T.CylinderGeometry(1, 1, 0.04, 20).rotateX(Math.PI / 2)
    };
    function add(g, x, y, z, sx, sy, sz, rot, color, glow) {
      var key = g + (glow ? ':g' : '');
      (lists[key] = lists[key] || []).push([x, y, z, sx, sy, sz, rot, color]);
    }
    function finish() {
      var dummy = new T.Object3D();
      Object.keys(lists).forEach(function (key) {
        var arr = lists[key], glow = /:g$/.test(key), g = key.replace(/:g$/, '');
        var mat = glow ? new T.MeshBasicMaterial({ color: 0xffffff }) : new T.MeshLambertMaterial({ color: 0xffffff });
        var m = new T.InstancedMesh(geos[g], mat, arr.length);
        arr.forEach(function (a, i) {
          dummy.position.set(a[0], a[1], a[2]); dummy.scale.set(a[3], a[4], a[5]); dummy.rotation.set(0, a[6], 0); dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col(a[7]));
        });
        m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
        scene.add(m);
      });
    }
    return { add: add, finish: finish };
  }

  function placeSprites(v, cl, RW, props) {
    var U = RW * 0.12, night = v.night, dynamic = [];
    var city = !!v.cityOn, CL = clearance(cl, RW * 1.2);
    v.segs.forEach(function (s, i) {
      s.sprites.forEach(function (sp) {
        if (city && (sp.kind === 'bldg' || sp.kind === 'noisewall' || sp.gen)) return;   // 街並みは City3D が描く
        var off0 = sp.offset * RW;
        // 道から離れた木や建物が、カーブの内側・隣の道の上に来るなら置かない
        if (Math.abs(off0) > RW * 1.25 && Math.abs(off0) + 3 > (off0 > 0 ? CL.lp[i] : CL.ln[i])) return;
        var p = at(cl, i), r = rightOf(p.h), off = off0, x = p.x + r.x * off, z = p.z + r.z * off, y = p.y, rot = p.h, seed = sp.seed || i;
        var u = sp.city ? 1.1 : U * (0.9 + (seed % 5) * 0.06);
        var fw = { x: Math.sin(p.h), z: Math.cos(p.h) }, inward = sp.offset > 0 ? -1 : 1;
        function A(g, dy, sx, sy, sz, c, glow, dx, dz) { props.add(g, x + (dx || 0) * r.x, y + dy, z + (dx || 0) * r.z + (dz || 0), sx, sy, sz, rot, c, glow); }
        switch (sp.kind) {
          case 'tree': A('cyl', 0, u * 0.2, u * 2, u * 0.2, '#5b3a1e'); A('cone', u * 1.6, u * 2, u * 4.6, u * 2, '#236b2a'); break;
          case 'pine': case 'cedar': case 'snowpine':
            A('cyl', 0, u * 0.18, u * 1.6, u * 0.18, '#4a2f1a'); A('cone', u * 1.2, u * 1.7, u * 7.5, u * 1.7, sp.kind === 'snowpine' ? '#dfe9ef' : '#1b4d2b'); break;
          case 'palm': A('cyl', 0, u * 0.18, u * 6, u * 0.18, '#8a5a2b'); A('ball', u * 6.2, u * 2.4, u * 0.7, u * 2.4, '#2e9b4f'); break;
          case 'maple': A('cyl', 0, u * 0.2, u * 2.4, u * 0.2, '#4e342e'); A('ball', u * 3.6, u * 1.9, u * 1.7, u * 1.9, ['#d84315', '#ef6c00', '#c62828', '#f9a825'][seed % 4]); break;
          case 'bush': case 'tea': A('ball', u * 0.6, u * 1.4, u * 0.8, u * 1.4, '#2e7d32'); break;
          case 'mikan': A('ball', u * 1.8, u * 1.4, u * 1.3, u * 1.4, '#2e7d32'); A('ball', u * 1.9, u * 0.3, u * 0.3, u * 0.3, '#ff9800', false, u * 0.9); break;
          case 'cactus': A('cyl', 0, u * 0.35, u * 4, u * 0.35, '#2e7d32'); break;
          case 'rock': case 'lavarock': A('ball', u * 0.5, u * 1.5, u * 1.1, u * 1.3, sp.kind === 'lavarock' ? '#2a1a17' : '#8c8c8c'); break;
          case 'mesa': A('box', 0, u * 16, u * 6, u * 10, '#b5562a'); break;
          case 'dune': A('ball', 0, u * 7, u * 2.5, u * 5, '#e8d3a0'); break;
          case 'lamp': A('cyl', 0, u * 0.12, u * 6.5, u * 0.12, '#666'); A('ball', u * 6.3, u * 0.35, u * 0.2, u * 0.35, night ? '#ffe9a3' : '#dddddd', night); break;
          case 'building':
            var bh = u * (10 + (seed % 4) * 5), bw = u * (6 + (seed % 3) * 2);
            A('box', 0, bw, bh, bw, night ? ['#1b1f33', '#242a44', '#161a2c'][seed % 3] : ['#8a93a1', '#6b7280', '#9aa3b1'][seed % 3]);
            if (night) A('box', bh * 0.3, bw * 1.01, bh * 0.08, bw * 1.01, '#ffd76a', true);
            break;
          case 'house': A('box', 0, u * 6, u * 3.6, u * 5, ['#eceff1', '#d7ccc8', '#cfd8dc', '#fff3e0'][seed % 4]); A('roof', u * 3.6, u * 5.5, u * 2, u * 5, ['#455a64', '#6d4c41', '#37474f', '#8d6e63'][seed % 4]); break;
          case 'factory': A('box', 0, u * 12, u * 5, u * 10, '#b0bec5'); A('cyl', 0, u * 0.5, u * 11, u * 0.5, '#78909c', false, u * 4); break;
          case 'container': for (var k = 0; k < 1 + seed % 3; k++) A('box', k * u * 1.9, u * 5.2, u * 1.8, u * 2, ['#c62828', '#1565c0', '#2e7d32', '#ef6c00'][(seed + k) % 4]); break;
          case 'crane': A('box', 0, u * 0.6, u * 14, u * 0.6, '#f9a825', false, -u * 3); A('box', 0, u * 0.6, u * 14, u * 0.6, '#f9a825', false, u * 3); A('box', u * 14, u * 12, u * 0.8, u * 1, '#f9a825'); break;
          case 'barrier': case 'soundwall': A('box', 0, u * 0.3, sp.kind === 'soundwall' ? u * 3 : u * 1.2, u * 6, sp.kind === 'soundwall' ? '#9aa7b3' : '#9e9e9e'); break;
          case 'limitsign':   // 丸い制限速度標識（運転手の方を向く）
            A('cyl', 0, 0.05, 2.6, 0.05, '#777');
            props.add('disc', x, y + 2.9, z, 0.45, 0.45, 0.45, rot, '#d32f2f');
            props.add('disc', x - fw.x * 0.02, y + 2.9, z - fw.z * 0.02, 0.36, 0.36, 0.36, rot, '#ffffff');
            break;
          case 'billboard': case 'sign': case 'greensign': case 'unagi': case 'gyoza': case 'piano':
            A('cyl', 0, u * 0.12, u * 3, u * 0.12, '#555');
            A('box', u * 3, u * 3.5, u * 2, u * 0.2, { billboard: '#fafafa', sign: '#f2f2f2', greensign: '#1b7a3e', unagi: '#1a237e', gyoza: '#c62828', piano: '#222' }[sp.kind]);
            break;
          case 'pole':   // 電柱
            A('cyl', 0, 0.17, 11, 0.17, '#a3a6a5'); A('box', 10.4, 1.8, 0.12, 0.12, '#6b6e70'); A('box', 9.6, 1.4, 0.1, 0.1, '#6b6e70');
            if ((sp.id || 0) % 3 === 0) A('cyl', 8, 0.35, 1, 0.35, '#8d9499', false, inward * 0.5);
            dynamic.push({ kind: 'pole', x: x, y: y + 10.4, z: z, side: sp.offset > 0 ? 1 : -1 });
            break;
          case 'streetlamp': case 'hwlamp':
            var lh = sp.kind === 'hwlamp' ? 10.5 : 8.2;
            A('cyl', 0, 0.12, lh, 0.12, '#6c7278'); A('box', lh, 2.6, 0.14, 0.14, '#6c7278', false, inward * 1.3);
            A('box', lh - 0.15, 0.9, 0.18, 0.4, v.night ? '#fff1b8' : '#d7dbe0', v.night, inward * 2.5);
            break;
          case 'bldg':   // 建物（サーキットのピット・ポストなど）
            var c0 = (sp.offset + sp.off2) / 2 * RW, bw0 = Math.abs(sp.off2 - sp.offset) * RW, bd0 = sp.len * M_SEG;
            var pc = at(cl, i + sp.len / 2), rc0 = rightOf(pc.h);
            props.add('box', pc.x + rc0.x * c0, pc.y, pc.z + rc0.z * c0, bw0, sp.hm, bd0, pc.h, sp.c || '#dddddd');
            break;
          case 'broadleaf':
            A('cyl', 0, 0.22, 3.2, 0.22, '#4e3b2c'); A('ball', 4.6, 2.6, 2.3, 2.6, ['#3f6b3a', '#4b7a3f', '#355f33', '#56813f'][seed % 4]); break;
          case 'grandstand': for (k = 0; k < 4; k++) A('box', k * u * 1.6, u * (6 - k * 1.2), u * 1.6, u * 14, k % 2 ? '#78909c' : '#90a4ae', false, u * k * 1.4); break;
          case 'tyrewall': A('box', 0, u * 1, u * 2, u * 4, '#222'); break;
          case 'neon': A('cyl', 0, u * 0.3, u * 9, u * 0.3, seed % 2 ? '#00e5ff' : '#ff00c8', true); break;
          case 'torii': case 'bigtorii':
            var ts = sp.kind === 'bigtorii' ? 2.2 : 1;
            A('cyl', 0, u * 0.3 * ts, u * 5 * ts, u * 0.3 * ts, '#d32f2f', false, 0, -u * 2 * ts); A('cyl', 0, u * 0.3 * ts, u * 5 * ts, u * 0.3 * ts, '#d32f2f', false, 0, u * 2 * ts);
            A('box', u * 5 * ts, u * 0.5 * ts, u * 0.5 * ts, u * 6 * ts, '#222'); break;
          case 'lighthouse': A('cyl', 0, u * 1, u * 9, u * 1, '#f5f5f5'); A('cyl', u * 3, u * 1.02, u * 1.6, u * 1.02, '#e53935'); A('ball', u * 9.4, u * 0.6, u * 0.6, u * 0.6, '#fff59d', true); break;
          case 'acttower': A('box', 0, u * 5, u * 36, u * 4, '#b0bec5'); if (night) A('box', u * 10, u * 5.05, u * 20, u * 4.05, '#ffd76a', true); break;
          case 'twintower': A('box', 0, u * 3.2, u * 30, u * 3.2, '#b3c4d6', false, -u * 3); A('box', 0, u * 3.2, u * 26, u * 3.2, '#b3c4d6', false, u * 3); break;
          case 'tvtower': A('cyl', 0, u * 0.6, u * 22, u * 0.6, '#b0443a'); A('box', u * 15, u * 3, u * 1.4, u * 3, '#cfd8dc'); break;
          case 'castle': A('box', 0, u * 10, u * 3, u * 10, '#8d8d8d'); A('box', u * 3, u * 7, u * 3, u * 7, '#f5f5f0'); A('roof', u * 6, u * 9, u * 2, u * 9, '#37474f'); A('box', u * 7.5, u * 4, u * 2.5, u * 4, '#f5f5f0'); A('roof', u * 10, u * 6, u * 2, u * 6, '#37474f'); break;
          case 'ferris': props.add('ring', x, y + u * 7.5, z, u * 6, u * 6, u * 6, rot + Math.PI / 2, night ? '#80deea' : '#eceff1', night); break;
          case 'station': A('box', 0, u * 12, u * 4.5, u * 6, '#eceff1'); A('box', u * 4.5, u * 13, u * 0.8, u * 7, '#37474f'); break;
          case 'kite': A('box', u * 9, u * 1.5, u * 1.5, u * 0.1, ['#e53935', '#1e88e5', '#fdd835'][seed % 3]); break;
          case 'snowman': A('ball', u * 1.1, u * 1.1, u * 1.1, u * 1.1, '#ffffff'); A('ball', u * 2.7, u * 0.75, u * 0.75, u * 0.75, '#ffffff'); break;
          case 'tollgate': for (k = -2; k <= 2; k++) A('box', 0, u * 0.8, u * 4, u * 0.8, '#607d8b', false, k * u * 2.6); A('box', u * 4, u * 1.2, u * 1, u * 13, '#eceff1'); break;
          case 'gantry': case 'cpgate': case 'arch': case 'banner': case 'fork': case 'orbis':
            // 道をまたぐ門・案内標識（板は道を横切る向き）
            var hw2 = RW * 1.15, cx0 = p.x, cz0 = p.z;
            props.add('cyl', cx0 - r.x * hw2, y, cz0 - r.z * hw2, 0.15, 6.2, 0.15, rot, '#555');
            props.add('cyl', cx0 + r.x * hw2, y, cz0 + r.z * hw2, 0.15, 6.2, 0.15, rot, '#555');
            props.add('box', cx0, y + 5.2, cz0, hw2 * 2, sp.kind === 'fork' ? 2.0 : 1.1, 0.25, rot, { gantry: '#eeeeee', cpgate: '#1565c0', arch: '#00e5ff', banner: '#0d47a1', fork: sp.blue ? '#1d4fa3' : '#1b7a3e', orbis: '#263238' }[sp.kind], sp.kind === 'arch');
            if (sp.kind === 'fork' || sp.kind === 'banner') dynamic.push({ kind: 'signtext', x: cx0 - fw.x * 0.14, y: y + 5.2, z: cz0 - fw.z * 0.14, rot: rot, w: hw2 * 2, h: sp.kind === 'fork' ? 2.0 : 1.1, texts: sp.texts || [sp.text], blue: sp.blue });
            break;
          case 'signal':   // 横型の信号機。柱は道の外、灯器は車線の上で運転手の方を向く
            var sOff = sp.offset * RW, armTo = sp.offset > 0 ? RW * 0.35 : -RW * 0.35;
            props.add('cyl', p.x + r.x * sOff, y, p.z + r.z * sOff, 0.14, 6.2, 0.14, rot, '#5b5f63');
            var ax = (sOff + armTo) / 2;
            props.add('box', p.x + r.x * ax, y + 5.9, p.z + r.z * ax, Math.abs(sOff - armTo), 0.12, 0.12, rot, '#5b5f63');
            props.add('box', p.x + r.x * armTo, y + 5.5, p.z + r.z * armTo, 1.9, 0.55, 0.35, rot, '#2b2f36');
            dynamic.push({ kind: 'signal', x: p.x + r.x * armTo - fw.x * 0.2, y: y + 5.5, z: p.z + r.z * armTo - fw.z * 0.2, r: r, rot: rot });
            break;
          case 'chevron': A('cyl', 0, 0.08, 1.5, 0.08, '#333'); A('box', 1.4, 1.8, 0.9, 0.1, '#ffd93d'); break;
          default: break;
        }
      });
    });
    return dynamic;
  }

  /* =====================================================================
     車の立体（高ポリゴン）
     横から見た輪郭（屋根・ボンネット・トランクの線）と上から見た幅から、
     断面を滑らかにつないで車体を作る。塗装はクリアコート、ガラスと灯火は別の材質。
     ===================================================================== */
  // 形: L 全長, W 全幅, H 全高, 上の線 [t(0=後ろ 1=前), 高さ], belt 窓の下の線, cab [窓の始まり, 終わり], roofW 屋根の幅の比
  var SHAPES = {
    sedan: { L: 4.7, W: 1.8, top: [[0, 0.78], [0.03, 0.9], [0.18, 0.98], [0.3, 1.02], [0.4, 1.4], [0.47, 1.44], [0.63, 1.44], [0.75, 1.05], [0.9, 0.95], [0.985, 0.82], [1, 0.68]], belt: 0.98, cab: [0.3, 0.75], roofW: 0.78 },
    coupe: { L: 4.45, W: 1.75, top: [[0, 0.74], [0.03, 0.86], [0.14, 0.94], [0.25, 0.98], [0.37, 1.3], [0.47, 1.34], [0.6, 1.33], [0.72, 1.0], [0.9, 0.9], [0.985, 0.76], [1, 0.62]], belt: 0.95, cab: [0.25, 0.72], roofW: 0.76 },
    sports: { L: 4.45, W: 1.85, top: [[0, 0.76], [0.03, 0.9], [0.1, 0.95], [0.22, 1.0], [0.38, 1.22], [0.5, 1.26], [0.58, 1.24], [0.7, 0.92], [0.88, 0.8], [0.985, 0.66], [1, 0.52]], belt: 0.9, cab: [0.22, 0.7], roofW: 0.72 },
    super: { L: 4.55, W: 1.98, top: [[0, 0.82], [0.03, 0.95], [0.12, 1.0], [0.3, 1.02], [0.45, 1.13], [0.55, 1.15], [0.62, 1.12], [0.72, 0.84], [0.88, 0.72], [0.985, 0.58], [1, 0.46]], belt: 0.86, cab: [0.34, 0.72], roofW: 0.68 },
    hatch: { L: 4.0, W: 1.72, top: [[0, 0.8], [0.02, 1.02], [0.06, 1.38], [0.12, 1.46], [0.55, 1.47], [0.7, 1.08], [0.9, 0.96], [0.985, 0.82], [1, 0.7]], belt: 0.98, cab: [0.05, 0.7], roofW: 0.8 },
    wagon: { L: 4.7, W: 1.78, top: [[0, 0.8], [0.02, 1.02], [0.05, 1.4], [0.1, 1.47], [0.6, 1.48], [0.74, 1.06], [0.9, 0.95], [0.985, 0.82], [1, 0.68]], belt: 0.98, cab: [0.04, 0.74], roofW: 0.8 },
    kei: { L: 3.4, W: 1.48, top: [[0, 0.85], [0.02, 1.3], [0.05, 1.68], [0.1, 1.75], [0.7, 1.76], [0.8, 1.2], [0.92, 1.0], [0.985, 0.86], [1, 0.72]], belt: 1.0, cab: [0.04, 0.8], roofW: 0.86 },
    suv: { L: 4.6, W: 1.88, top: [[0, 0.95], [0.02, 1.2], [0.05, 1.68], [0.1, 1.75], [0.62, 1.76], [0.74, 1.3], [0.9, 1.16], [0.985, 1.0], [1, 0.86]], belt: 1.18, cab: [0.05, 0.74], roofW: 0.84, clr: 0.36 },
    minivan: { L: 4.8, W: 1.82, top: [[0, 0.9], [0.02, 1.3], [0.05, 1.8], [0.1, 1.86], [0.72, 1.87], [0.85, 1.25], [0.94, 1.02], [0.99, 0.86], [1, 0.72]], belt: 1.08, cab: [0.05, 0.85], roofW: 0.86 },
    pickup: { L: 5.2, W: 1.86, top: [[0, 1.0], [0.02, 1.08], [0.4, 1.08], [0.41, 1.12], [0.43, 1.78], [0.62, 1.8], [0.72, 1.3], [0.9, 1.16], [0.985, 1.0], [1, 0.86]], belt: 1.16, cab: [0.43, 0.72], roofW: 0.84, clr: 0.34, bed: [0.02, 0.4] },
    keitra: { L: 3.4, W: 1.48, top: [[0, 0.95], [0.02, 1.0], [0.55, 1.0], [0.56, 1.05], [0.58, 1.84], [0.9, 1.86], [0.96, 1.4], [0.99, 1.0], [1, 0.8]], belt: 1.08, cab: [0.58, 0.97], roofW: 0.9, bed: [0.02, 0.55] },
    box: { L: 5.4, W: 2.0, top: [[0, 2.5], [0.02, 2.6], [0.8, 2.62], [0.86, 2.5], [0.93, 2.3], [0.99, 1.4], [1, 0.9]], belt: 1.5, cab: [0.82, 0.99], roofW: 0.95, clr: 0.45 },
    bus: { L: 10.5, W: 2.45, top: [[0, 2.9], [0.01, 3.0], [0.97, 3.0], [0.99, 2.9], [1, 0.8]], belt: 1.3, cab: [0.02, 0.995], roofW: 0.94, clr: 0.4 },
    truck: { L: 8.0, W: 2.3, top: [[0, 3.0], [0.01, 3.1], [0.74, 3.1], [0.75, 2.6], [0.76, 2.7], [0.92, 2.75], [0.97, 2.4], [0.99, 1.2], [1, 0.9]], belt: 1.6, cab: [0.77, 0.99], roofW: 0.95, clr: 0.5 }
  };
  // 車種 → 形と寸法の調整
  var MODEL = {
    sedan: ['sedan'], taxi: ['sedan', { L: 4.6 }], police: ['sedan'], limo: ['sedan', { L: 6.2 }], classic: ['sedan', { L: 4.4, W: 1.7 }], gc8: ['sedan', { L: 4.35 }],
    evo: ['sedan', { L: 4.5 }], s13: ['coupe'], r32: ['coupe', { L: 4.55 }], ae86: ['coupe', { L: 4.2, W: 1.63 }], muscle: ['coupe', { L: 4.8, W: 1.95 }],
    fc: ['sports'], fd: ['sports', { L: 4.3 }], zn8: ['sports', { L: 4.3 }], gt: ['sports', { L: 4.7, W: 1.9 }], rr: ['super', { L: 4.5 }], super: ['super'], wedge: ['super', { L: 4.4 }], proto: ['super', { L: 4.8, W: 2.0 }],
    hatch: ['hatch'], rally: ['hatch', { L: 4.1 }], ev: ['hatch', { L: 4.3 }], kei: ['kei'], trike: ['kei', { L: 3.0 }], suv: ['suv'], minivan: ['minivan'], pickup: ['pickup'], keitra: ['keitra'],
    van: ['box', { L: 4.7, W: 1.7 }], camper: ['box', { L: 5.8 }], ambulance: ['box', { L: 5.6 }], fire: ['truck', { L: 7.5 }], truck: ['truck'], bus: ['bus'], train: ['bus', { L: 18, W: 2.9 }]
  };

  function spline(pts, t) {   // 単調な 3 次補間（行き過ぎない）
    var n = pts.length;
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts[n - 1][0]) return pts[n - 1][1];
    var i = 0; while (i < n - 2 && pts[i + 1][0] < t) i++;
    var x0 = pts[i][0], x1 = pts[i + 1][0], y0 = pts[i][1], y1 = pts[i + 1][1], h = x1 - x0, f = (t - x0) / h;
    function slope(k) {
      if (k <= 0 || k >= n - 1) return 0;
      var a = (pts[k][1] - pts[k - 1][1]) / (pts[k][0] - pts[k - 1][0]), b = (pts[k + 1][1] - pts[k][1]) / (pts[k + 1][0] - pts[k][0]);
      return a * b <= 0 ? 0 : 2 / (1 / a + 1 / b);
    }
    var m0 = slope(i) * h, m1 = slope(i + 1) * h, f2 = f * f, f3 = f2 * f;
    return (2 * f3 - 3 * f2 + 1) * y0 + (f3 - 2 * f2 + f) * m0 + (-2 * f3 + 3 * f2) * y1 + (f3 - f2) * m1;
  }

  var ENV = null;
  function envMap(renderer) {
    if (ENV || !renderer) return ENV;
    var T = THREE, sc = new T.Scene();
    var c = document.createElement('canvas'); c.width = 64; c.height = 256;
    var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5f8fc9'); gr.addColorStop(0.45, '#d9e6f2'); gr.addColorStop(0.5, '#f4f1ea'); gr.addColorStop(0.53, '#6b6f68'); gr.addColorStop(1, '#2b2d2a');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    var tex = new T.CanvasTexture(c);
    var sph = new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ map: tex, side: T.BackSide }));
    sc.add(sph);
    var lamp = new T.Mesh(new T.PlaneGeometry(30, 8), new T.MeshBasicMaterial({ color: 0xffffff }));
    lamp.position.set(0, 40, 0); lamp.rotation.x = Math.PI / 2; sc.add(lamp);
    var pm = new T.PMREMGenerator(renderer);
    ENV = pm.fromScene(sc, 0.02).texture;
    pm.dispose();
    return ENV;
  }
  R.carEnv = envMap;

  var geoCache = {}, matCache = {};
  function mat(kind, color) {
    var T = THREE, key = kind + (color || '');
    if (matCache[key]) return matCache[key];
    var m;
    switch (kind) {
      case 'paint': m = new T.MeshPhysicalMaterial({ color: color, metalness: 0.15, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08, envMap: ENV, envMapIntensity: 0.75 }); break;
      case 'glass': m = new T.MeshPhysicalMaterial({ color: 0x0f141c, metalness: 0.1, roughness: 0.04, clearcoat: 1, envMap: ENV, envMapIntensity: 1.4 }); break;
      case 'trim': m = new T.MeshStandardMaterial({ color: 0x17191c, metalness: 0.2, roughness: 0.6 }); break;
      case 'chrome': m = new T.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.12, envMap: ENV }); break;
      case 'rim': m = new T.MeshStandardMaterial({ color: color || 0xb9bec4, metalness: 0.9, roughness: 0.25, envMap: ENV }); break;
      case 'tire': m = new T.MeshStandardMaterial({ color: 0x151515, metalness: 0, roughness: 0.92 }); break;
      case 'head': m = new T.MeshStandardMaterial({ color: 0xf6f2e6, emissive: 0xfff4d0, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.15, envMap: ENV }); break;
      case 'tail': m = new T.MeshStandardMaterial({ color: 0x8a0c0c, emissive: 0xff1a1a, emissiveIntensity: 0.25, roughness: 0.3 }); break;
      case 'plate': m = new T.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.6 }); break;
      case 'amber': m = new T.MeshStandardMaterial({ color: 0xffa000, emissive: 0xff8a00, emissiveIntensity: 0.2 }); break;
      default: m = new T.MeshStandardMaterial({ color: color || 0x888888, roughness: 0.5 });
    }
    m.userData.keep = true;
    matCache[key] = m;
    return m;
  }
  R.carMat = mat;

  /** 車体（塗装とガラスの 2 つのジオメトリ）を作る */
  function bodyGeo(shapeKey, adj) {
    var key = shapeKey + JSON.stringify(adj || {});
    if (geoCache[key]) return geoCache[key];
    var T = THREE, S = SHAPES[shapeKey], L = (adj && adj.L) || S.L, W = (adj && adj.W) || S.W;
    var NT = 72, NS = 18, clr = S.clr || 0.3;
    var pos = [], glassIdx = [], paintIdx = [], rows = [];
    function tAt(k) { var u = k / NT; return 0.5 - 0.5 * Math.cos(u * Math.PI); }   // 端に点を集める
    var hScale = ((adj && adj.H) || 1);
    for (var k = 0; k <= NT; k++) {
      var t = tAt(k), top = spline(S.top, t) * hScale, belt = Math.min(top, S.belt * hScale);
      // 上から見た幅（前後の角を丸める）
      var endR = Math.min(1, Math.min(t, 1 - t) / 0.06), hw = W / 2 * (0.9 + 0.1 * Math.sqrt(Math.max(0, endR))) * (0.97 + 0.03 * Math.sin(t * Math.PI));
      var bot = clr - 0.08 * (1 - endR);
      var inCab = t > S.cab[0] && t < S.cab[1];
      var roofW = hw * (inCab ? S.roofW : 0.96);
      if (S.bed && t > S.bed[0] && t < S.bed[1]) top = Math.min(top, belt);
      var ring = [];
      // 断面（右半分）: 下の中央 → 下の角 → 横 → 窓の下 → 屋根の角 → 屋根の中央
      for (var s = 0; s <= NS; s++) {
        var u = s / NS, x, y;
        if (u < 0.2) { var a = u / 0.2; x = hw * (0.8 + 0.2 * Math.sin(a * Math.PI / 2)) * a + 0.0; y = bot + (0.1 * (1 - Math.cos(a * Math.PI / 2))); x = hw * 0.85 * a + hw * 0.15 * Math.sin(a * Math.PI / 2); }
        else if (u < 0.5) { var b = (u - 0.2) / 0.3; x = hw * (1 - 0.015 * Math.pow(2 * b - 1, 2)); y = bot + 0.1 + (belt - bot - 0.1) * b; }
        else if (u < 0.8) { var c2 = (u - 0.5) / 0.3; x = hw + (roofW - hw) * Math.sin(c2 * Math.PI / 2); y = belt + (top - belt) * (1 - Math.pow(1 - c2, 1.6)); if (top - belt < 0.04) { y = belt + (top - belt) * c2; } }
        else { var d = (u - 0.8) / 0.2; x = roofW * Math.cos(d * Math.PI / 2 * 0.98) * (1 - d * 0.02); y = top + 0.035 * Math.sin(d * Math.PI / 2) * (inCab ? 1 : 0.3); }
        ring.push([x, y]);
      }
      rows.push({ t: t, z: (t - 0.5) * L, ring: ring, inCab: inCab, belt: belt, top: top });
    }
    // 頂点（左右対称）
    var P = [], idx = 0, grid = [];
    rows.forEach(function (r) {
      var line = [];
      for (var s = 0; s < r.ring.length; s++) { P.push(r.ring[s][0], r.ring[s][1], r.z); line.push(idx++); }
      for (s = r.ring.length - 2; s >= 0; s--) { P.push(-r.ring[s][0], r.ring[s][1], r.z); line.push(idx++); }   // 反対側（屋根の中央は共有しない）
      grid.push(line);
    });
    var M2 = grid[0].length;
    for (k = 0; k < rows.length - 1; k++) {
      for (var s2 = 0; s2 < M2 - 1; s2++) {
        var a2 = grid[k][s2], b2 = grid[k + 1][s2], c3 = grid[k + 1][s2 + 1], d2 = grid[k][s2 + 1];
        var sIdx = s2 < NS ? s2 : 2 * NS - 1 - s2;   // 片側での断面の位置
        var uMid = (sIdx + 0.5) / NS, r0 = rows[k], r1 = rows[k + 1];
        // ガラス: 窓の範囲（柱をよけて）で、窓の下の線より上・屋根より下
        var tm = (r0.t + r1.t) / 2, cab = SHAPES[shapeKey].cab, span = cab[1] - cab[0];
        var pillar = Math.min(0.045, span * 0.08);
        var isGlass = uMid > 0.52 && uMid < 0.8 && tm > cab[0] + pillar * 0.3 && tm < cab[1] - pillar * 0.2 && (r0.top - r0.belt) > 0.15 && (r1.top - r1.belt) > 0.15;
        // 横の窓の真ん中の柱（B ピラー）
        if (isGlass && uMid < 0.79 && Math.abs(tm - (cab[0] + span * 0.52)) < 0.012 && span > 0.3) isGlass = false;
        // 前後の窓（フロント・リア）は屋根側まで
        if (!isGlass && uMid >= 0.8 && (r0.top - r0.belt) > 0.15 && ((tm > cab[1] - span * 0.22 && tm < cab[1] - 0.01) || (tm < cab[0] + span * 0.16 && tm > cab[0] + 0.01)) && Math.abs(r1.top - r0.top) > 0.004) isGlass = true;
        (isGlass ? glassIdx : paintIdx).push(a2, c3, b2, a2, d2, c3);
      }
    }
    // 前後のふた
    function cap(line, front) {
      var cx = 0, cy = 0, cz = 0;
      line.forEach(function (i) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; });
      P.push(0, cy / line.length, cz / line.length); var ci = idx++;
      for (var i = 0; i < line.length - 1; i++) { if (front) paintIdx.push(ci, line[i + 1], line[i]); else paintIdx.push(ci, line[i], line[i + 1]); }
    }
    cap(grid[0], false); cap(grid[grid.length - 1], true);
    function mk(ix) {
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
      g.setIndex(ix); g.computeVertexNormals(); g.userData.keep = true;
      return g;
    }
    geoCache[key] = { paint: mk(paintIdx), glass: mk(glassIdx), L: L, W: W, rows: rows };
    return geoCache[key];
  }

  var wheelCache = {};
  function wheelGeo(r, w) {
    var key = r + ':' + w;
    if (wheelCache[key]) return wheelCache[key];
    var T = THREE, prof = [];
    // タイヤの断面（回転体）
    for (var i = 0; i <= 16; i++) {
      var a = i / 16 * Math.PI, rr = r - 0.06 + Math.sin(a) * 0.06;
      prof.push(new T.Vector2(r * 0.7 + (rr - r * 0.7) * (0.2 + 0.8 * Math.sin(a)), (i / 16 - 0.5) * w));
    }
    var tire = new T.LatheGeometry(prof, 32).rotateZ(Math.PI / 2);
    var rim = new T.CylinderGeometry(r * 0.68, r * 0.68, w * 0.9, 28).rotateZ(Math.PI / 2);
    var hub = new T.CylinderGeometry(r * 0.16, r * 0.16, w * 0.96, 12).rotateZ(Math.PI / 2);
    var spokes = [];
    for (var k = 0; k < 5; k++) {
      var sp = new T.BoxGeometry(w * 0.2, r * 0.56, r * 0.12).translate(0, r * 0.3, 0).rotateX(k / 5 * Math.PI * 2);
      spokes.push(sp);
    }
    [tire, rim, hub].concat(spokes).forEach(function (q) { q.userData.keep = true; });
    wheelCache[key] = { tire: tire, rim: rim, hub: hub, spokes: spokes };
    return wheelCache[key];
  }

  function wheel(g, x, y, z, r, w, side, rimColor) {
    var T = THREE, G = wheelGeo(r, w), wg = new T.Group();
    wg.add(new T.Mesh(G.tire, mat('tire')));
    var rim = new T.Mesh(G.rim, mat('trim')); wg.add(rim);
    var face = new T.Group();
    G.spokes.forEach(function (sg) { face.add(new T.Mesh(sg, mat('rim', rimColor))); });
    face.add(new T.Mesh(G.hub, mat('rim', rimColor)));
    face.position.x = side * w * 0.12; wg.add(face);
    wg.position.set(x, y, z);
    wg.userData.wheel = true;
    g.add(wg);
    return wg;
  }

  var carCache = {};
  function carModel(body, color, opts) {
    var T = THREE, key = body + color;
    var B = (R.BODIES && R.BODIES[body]) || { h: 0.56, body: 0.64 };
    if (carCache[key]) return carCache[key].clone();
    if (B.real && R.realModel) { var rm = R.realModel(body, color); if (rm) { carCache[key] = rm; return rm.clone(); } }
    if (B.lowpoly && R.lowPolyModel) { var lp = R.lowPolyModel(body, color); if (lp) { carCache[key] = lp; return lp.clone(); } }
    var g = new T.Group();
    var mdl = MODEL[body];
    if (!mdl || B.kart || B.open || B.buggy || B.tractor || B.monster) { g = oldCarModel(body, color); carCache[key] = g; return g.clone(); }
    var shapeKey = mdl[0], adj = mdl[1] || {}, bg = bodyGeo(shapeKey, adj), L = bg.L, W = bg.W, S = SHAPES[shapeKey];
    var paintCol = body === 'police' ? '#f2f2f2' : color;
    var paint = new T.Mesh(bg.paint, mat('paint', paintCol)), glass = new T.Mesh(bg.glass, mat('glass'));
    g.add(paint); g.add(glass);
    if (body === 'police') {   // 白黒のパトカー: 下半分を黒く
      var lower = new T.Mesh(bg.paint, mat('paint', '#111418'));
      lower.scale.set(1.004, 1, 1.004);
      lower.material = mat('paint', '#111418');
      var clip = new T.Plane(new T.Vector3(0, -1, 0), S.belt - 0.12);
      lower.material = lower.material.clone(); lower.material.clippingPlanes = [clip];
      g.add(lower);
    }
    var clr = S.clr || 0.3, wr = shapeKey === 'bus' || shapeKey === 'truck' ? 0.5 : shapeKey === 'box' ? 0.4 : shapeKey === 'suv' || shapeKey === 'pickup' ? 0.39 : 0.33;
    var wb = shapeKey === 'bus' ? 0.32 : 0.34, tw = W / 2 - 0.12;
    var rimC = B.chrome ? 0xe0e4ea : body === 'ae86' ? 0x2a2a2a : 0xb9bec4;
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (q) { wheel(g, q[0] * tw, wr, q[1] * L * wb, wr, 0.24, q[0], rimC); });
    if (shapeKey === 'truck' || shapeKey === 'bus') [1, -1].forEach(function (sd) { wheel(g, sd * tw, wr, -L * 0.22, wr, 0.24, sd, rimC); });
    // フェンダーの黒い縁（タイヤハウス）
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (q) {
      var arch = new T.Mesh(new T.TorusGeometry(wr + 0.05, 0.035, 6, 20, Math.PI), mat('trim'));
      arch.rotation.y = Math.PI / 2; arch.position.set(q[0] * (W / 2 - 0.01), wr, q[1] * L * wb); g.add(arch);
    });
    // 灯火・グリル・ナンバー
    var front = L / 2, rear = -L / 2;
    var fy = spline(S.top, 0.97) * 0.72, ry = spline(S.top, 0.03) * 0.86;
    function part(geo, m, x, y, z) { var o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; }
    var hl = new T.BoxGeometry(0.34, 0.1, 0.06), tl = new T.BoxGeometry(0.36, 0.1, 0.04);
    [1, -1].forEach(function (sd) {
      part(hl, mat('head'), sd * (W / 2 - 0.3), fy, front - 0.06).rotation.y = sd * 0.25;
      part(tl, mat('tail'), sd * (W / 2 - 0.26), ry, rear + 0.02);
      part(new T.BoxGeometry(0.06, 0.05, 0.16), mat('amber'), sd * (W / 2 - 0.05), fy, front - 0.3);
      // ドアミラー
      if (shapeKey !== 'bus') { var mt = part(new T.BoxGeometry(0.2, 0.12, 0.1), mat('paint', paintCol), sd * (W / 2 + 0.06), S.belt + 0.08, (S.cab[1] - 0.5) * L - 0.2); mt.castShadow = true; }
    });
    part(new T.BoxGeometry(W * 0.36, 0.14, 0.04), mat('trim'), 0, fy - 0.1, front - 0.02);          // グリル
    part(new T.BoxGeometry(0.33, 0.165, 0.02), mat('plate'), 0, clr + 0.2, front + 0.005);             // 前のナンバー
    part(new T.BoxGeometry(0.33, 0.165, 0.02), mat('plate'), 0, ry - 0.2, rear - 0.005);               // 後ろのナンバー
    part(new T.BoxGeometry(W * 0.9, 0.08, 0.1), mat('trim'), 0, clr + 0.05, front - 0.03);            // 前のバンパー下
    part(new T.BoxGeometry(W * 0.9, 0.08, 0.1), mat('trim'), 0, clr + 0.05, rear + 0.03);
    if (B.wing) {   // リアウイング
      var wy = spline(S.top, 0.05) + 0.12 + B.wing * 0.8;
      part(new T.BoxGeometry(W * 0.92, 0.04, 0.3), mat('paint', color), 0, wy, rear + 0.25);
      [1, -1].forEach(function (sd) { part(new T.BoxGeometry(0.05, wy - spline(S.top, 0.05), 0.12), mat('trim'), sd * W * 0.32, (wy + spline(S.top, 0.05)) / 2, rear + 0.25); });
    }
    if (B.taxi) { part(new T.BoxGeometry(0.5, 0.2, 0.22), mat('plate'), 0, spline(S.top, 0.5) + 0.12, 0); }
    if (B.bar) {
      var bar = new T.Group(); bar.position.set(0, spline(S.top, 0.5) + 0.1, 0);
      var rb = new T.Mesh(new T.BoxGeometry(0.55, 0.12, 0.26), new T.MeshBasicMaterial({ color: 0xff2020 })); rb.position.x = -0.3; bar.add(rb);
      var bb = new T.Mesh(new T.BoxGeometry(0.55, 0.12, 0.26), new T.MeshBasicMaterial({ color: 0x2050ff })); bb.position.x = 0.3; bar.add(bb);
      bar.userData.siren = [rb, bb]; g.add(bar);
    }
    if (B.stripes) [0.14, -0.14].forEach(function (x) { part(new T.BoxGeometry(0.12, 0.01, L * 0.96), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), x, spline(S.top, 0.5) + 0.03, 0); });
    if (B.panda) {   // パンダ（白黒）: 下半分を黒く
      var pl = new T.Mesh(bg.paint, mat('paint', '#16181b').clone()); pl.material.clippingPlanes = [new T.Plane(new T.Vector3(0, -1, 0), S.belt - 0.28)]; g.add(pl);
    }
    if (shapeKey === 'truck' || (shapeKey === 'box' && (B.ribs || body === 'camper'))) {   // 荷台の箱
      var cargoL = L * 0.72;
      part(new T.BoxGeometry(W * 1.02, spline(S.top, 0.3) - 0.9, cargoL), mat('paint', body === 'fire' ? color : '#e9ecef'), 0, (spline(S.top, 0.3) + 0.9) / 2, -L / 2 + cargoL / 2 + 0.05);
    }
    if (B.cross) { part(new T.BoxGeometry(0.02, 0.5, 0.14), new T.MeshBasicMaterial({ color: 0xe53935 }), W / 2 + 0.01, 1.4, -0.4); part(new T.BoxGeometry(0.02, 0.14, 0.5), new T.MeshBasicMaterial({ color: 0xe53935 }), W / 2 + 0.01, 1.4, -0.4); }
    if (B.ladder) part(new T.BoxGeometry(0.5, 0.1, L * 0.7), mat('chrome'), 0, spline(S.top, 0.4) + 0.1, -0.3);
    // 影（真下の暗がり）
    var sh = new T.Mesh(new T.PlaneGeometry(W * 1.1, L * 1.02), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; g.add(sh);
    g.traverse(function (o) { if (o.isMesh && o !== sh) { o.castShadow = true; o.receiveShadow = true; } });
    carCache[key] = g;
    return g.clone();
  }

  /* ---------- 車の立体 ---------- */
  var oldCache = {};
  function oldCarModel(body, color, opts) {   // カート・バギーなどの特殊な車
    var T = THREE, key = body + color, carCache = oldCache;
    var B = (R.BODIES && R.BODIES[body]) || { h: 0.56, body: 0.64 };
    var wm = (B.wm || 1) * (B.wide || 1);
    var W = 1.8 * wm, Hh = Math.max(0.9, 1.8 * (B.h || 0.56) * 1.4), Lg = B.box ? (body === 'bus' ? 11 : body === 'truck' || body === 'fire' ? 8 : body === 'train' ? 18 : 5.2) : B.kart ? 1.9 : B.open ? 4.8 : 4.4;
    if (!carCache[key]) {
      var g = new T.Group();
      var paint = new T.MeshPhongMaterial({ color: color, shininess: 90, specular: 0x444444 });
      var dark = new T.MeshLambertMaterial({ color: 0x15171c }), glass = new T.MeshPhongMaterial({ color: 0x1c2433, shininess: 120, specular: 0x8899aa });
      var tail = new T.MeshBasicMaterial({ color: 0xaa1515 }), head = new T.MeshBasicMaterial({ color: 0xfff4c8 });
      function box(w, h, l, x, y, z, m) { var b = new T.Mesh(new T.BoxGeometry(w, h, l), m); b.position.set(x, y, z); g.add(b); return b; }
      var wheelG = new T.CylinderGeometry(0.34, 0.34, 0.26, 12).rotateZ(Math.PI / 2);
      function wheel(x, z, r) { var m = new T.Mesh(wheelG, dark); m.position.set(x, r || 0.34, z); if (r) m.scale.set(1, r / 0.34, r / 0.34); g.add(m); }
      if (B.kart || B.open) {
        box(W * 0.35, 0.35, Lg * 0.9, 0, 0.35, 0, paint);
        box(W * 0.9, 0.08, 0.5, 0, 1.0, -Lg * 0.45, paint);
        var hel = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), new T.MeshPhongMaterial({ color: 0xffd93d })); hel.position.set(0, 0.8, -0.2); g.add(hel);
        wheel(-W * 0.5, Lg * 0.35, 0.36); wheel(W * 0.5, Lg * 0.35, 0.36); wheel(-W * 0.5, -Lg * 0.35, 0.42); wheel(W * 0.5, -Lg * 0.35, 0.42);
      } else if (B.box) {
        box(W, Hh * 0.82, Lg, 0, Hh * 0.52, 0, paint);
        box(W * 0.9, Hh * 0.25, 0.05, 0, Hh * 0.72, Lg / 2 + 0.01, glass);
        box(W * 0.9, Hh * 0.25, 0.05, 0, Hh * 0.72, -Lg / 2 - 0.01, glass);
        box(0.2, 0.15, 0.05, -W * 0.4, Hh * 0.3, -Lg / 2 - 0.03, tail); box(0.2, 0.15, 0.05, W * 0.4, Hh * 0.3, -Lg / 2 - 0.03, tail);
        box(0.25, 0.15, 0.05, -W * 0.35, Hh * 0.3, Lg / 2 + 0.03, head); box(0.25, 0.15, 0.05, W * 0.35, Hh * 0.3, Lg / 2 + 0.03, head);
        wheel(-W * 0.5, Lg * 0.35); wheel(W * 0.5, Lg * 0.35); wheel(-W * 0.5, -Lg * 0.35); wheel(W * 0.5, -Lg * 0.35);
        if (B.bar) { box(W * 0.25, 0.12, 0.3, -W * 0.15, Hh * 0.96, 0, new T.MeshBasicMaterial({ color: 0xff2d2d })); box(W * 0.25, 0.12, 0.3, W * 0.15, Hh * 0.96, 0, new T.MeshBasicMaterial({ color: 0x2d6bff })); }
      } else {
        var lowH = Hh * (B.body || 0.62) * 0.75;
        box(W, lowH, Lg, 0, 0.3 + lowH / 2, 0, paint);
        if (B.panda) box(W * 1.01, lowH * 0.45, Lg * 1.01, 0, 0.3 + lowH * 0.22, 0, dark);
        var cabH = Hh - lowH - 0.3, cabL = Lg * (B.monster ? 0.4 : 0.48);
        var cab = box(W * 0.8, Math.max(0.3, cabH), cabL, 0, 0.3 + lowH + cabH / 2, -Lg * 0.04, body === 'police' ? new T.MeshPhongMaterial({ color: 0xf2f2f2 }) : paint);
        box(W * 0.74, Math.max(0.25, cabH * 0.8), cabL * 1.02, 0, 0.3 + lowH + cabH / 2, -Lg * 0.04, glass);
        box(0.36, 0.14, 0.05, -W * 0.36, 0.3 + lowH * 0.75, -Lg / 2 - 0.02, tail); box(0.36, 0.14, 0.05, W * 0.36, 0.3 + lowH * 0.75, -Lg / 2 - 0.02, tail);
        box(0.34, 0.14, 0.05, -W * 0.34, 0.3 + lowH * 0.7, Lg / 2 + 0.02, head); box(0.34, 0.14, 0.05, W * 0.34, 0.3 + lowH * 0.7, Lg / 2 + 0.02, head);
        if (B.wing) { box(W * 0.95, 0.06, 0.35, 0, 0.3 + lowH + 0.18 + B.wing, -Lg / 2 + 0.2, dark); box(0.06, 0.2 + B.wing, 0.1, -W * 0.3, 0.3 + lowH + (0.2 + B.wing) / 2, -Lg / 2 + 0.2, dark); box(0.06, 0.2 + B.wing, 0.1, W * 0.3, 0.3 + lowH + (0.2 + B.wing) / 2, -Lg / 2 + 0.2, dark); }
        if (B.bar || B.taxi) box(W * 0.45, 0.12, 0.3, 0, 0.3 + lowH + cabH + 0.06, 0, B.taxi ? new T.MeshBasicMaterial({ color: 0xfafafa }) : new T.MeshBasicMaterial({ color: 0xff2d2d }));
        if (B.stripes) { box(0.14, 0.02, Lg * 1.001, -0.12, 0.3 + lowH + 0.005, 0, new T.MeshBasicMaterial({ color: 0xffffff })); box(0.14, 0.02, Lg * 1.001, 0.12, 0.3 + lowH + 0.005, 0, new T.MeshBasicMaterial({ color: 0xffffff })); }
        var wr2 = B.monster ? 0.8 : B.tractor ? 0.7 : 0.34;
        wheel(-W * 0.5, Lg * 0.33, wr2); wheel(W * 0.5, Lg * 0.33, wr2); wheel(-W * 0.5, -Lg * 0.33, wr2); wheel(W * 0.5, -Lg * 0.33, wr2);
        if (B.monster || B.tractor) g.children.forEach(function (c) { if (c.material !== dark) c.position.y += wr2 - 0.34; });
      }
      // 影
      var sh = new T.Mesh(new T.PlaneGeometry(W * 1.15, Lg * 1.05), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; g.add(sh);
      g.traverse(function (o) { if (o.isMesh && o !== sh) o.castShadow = true; });
      carCache[key] = g;
    }
    return carCache[key].clone();
  }

  /* ---------- 遠景（山並みの帯） ---------- */
  function horizon(v) {
    var T = THREE, c = document.createElement('canvas'); c.width = 2048; c.height = 256;
    var g = c.getContext('2d'), pal = v.pal;
    g.clearRect(0, 0, 2048, 256);
    function range(color, base, amp, seed) {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, 256);
      for (var i = 0; i <= 2048; i += 8) { var t = i * 0.006 * Math.PI; g.lineTo(i, base - (Math.sin(t * 2 + seed) * 0.5 + Math.sin(t * 5 + seed * 1.7) * 0.3 + 0.6) * amp); }
      g.lineTo(2048, 256); g.fill();
    }
    if (v.spec.skyline) {
      g.fillStyle = pal.far;
      for (var b = 0; b < 160; b++) { var hh = 30 + (b * 37 % 90); g.fillRect(b * 13, 220 - hh, 12, hh + 40); if (v.night) { g.fillStyle = 'rgba(255,215,106,.7)'; for (var y2 = 230 - hh; y2 < 215; y2 += 7) if ((b + y2) % 3 === 0) g.fillRect(b * 13 + 3, y2, 3, 3); g.fillStyle = pal.far; } }
    } else { range(pal.far, 200, 70, 1.3); range(pal.hill, 236, 36, 4.1); }
    var tex = new T.CanvasTexture(c); tex.wrapS = T.RepeatWrapping; tex.repeat.set(2, 1);
    var m = new T.Mesh(new T.CylinderGeometry(1400, 1400, 500, 48, 1, true), new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.BackSide, fog: false, depthWrite: false }));
    m.position.y = 150;
    return m;
  }
  function skyTexture(v) {
    var c = document.createElement('canvas'); c.width = 4; c.height = 256;
    var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, v.pal.sky[0]); gr.addColorStop(0.55, v.pal.sky[1]); gr.addColorStop(1, v.pal.sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(c);
  }

  /* =====================================================================
     1 セッションぶんの 3D の舞台
     ===================================================================== */
  R.carModel = function (b, c) { return carModel(b, c); };
  R.Render3D = function (canvas, sess) {
    var T = THREE;
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.localClippingEnabled = true;
    envMap(renderer);
    var stage = null, city = null;

    function textPlane(d) {   // 案内標識の文字
      var c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * d.h / d.w) || 64;
      var g = c.getContext('2d');
      g.fillStyle = d.blue ? '#1d4fa3' : '#1b7a3e'; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(6, 6, c.width - 12, c.height - 12);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      var n = d.texts.length, fs = Math.min(c.height * 0.42, 512 / n / Math.max(4, Math.max.apply(null, d.texts.map(function (t) { return t.length; }))) * 1.7);
      g.font = 'bold ' + Math.round(fs) + 'px sans-serif';
      d.texts.forEach(function (t, i) { g.fillText(t, c.width * (i + 0.5) / n, c.height / 2); });
      var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
      var m = new T.Mesh(new T.PlaneGeometry(d.w * 0.98, d.h * 0.94), new T.MeshBasicMaterial({ map: tex }));
      m.position.set(d.x, d.y, d.z); m.rotation.set(0, d.rot + Math.PI, 0);
      return m;
    }

    function build(s) {
      if (stage) dispose();
      var v = s.view(), scene = new T.Scene();
      var world = !!(v.spec.custom && R.Map && R.Map.ready && v.segs[0] && v.segs[0].wp && v.spec.mapEdge !== undefined);
      v.cityOn = world;
      var RW = 0.9 / v.geom.cw;
      var cl = centerline(v, s.cfg.mirror);
      scene.background = skyTexture(v);
      var skyT = !v.night && (v.weather === 'clear' || !v.weather) ? R.tex3D('sky') : null, dome = null;
      if (skyT) {
        dome = new T.Mesh(new T.SphereGeometry(world ? 5000 : 2200, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5625), new T.MeshBasicMaterial({ map: skyT, side: T.BackSide, fog: false, depthWrite: false }));
        dome.renderOrder = -1; scene.add(dome);
      }
      var far = { fog: 170, rain: 380, snow: 320, sand: 400, ash: 350 }[v.weather] || (v.night ? 520 : world ? 2200 : 900);
      scene.fog = new T.Fog(new T.Color(v.pal.fog), far * (world ? 0.18 : 0.25), far);
      var hemi = new T.HemisphereLight(v.night ? 0x445577 : 0xdfeaf5, v.night ? 0x111118 : 0x4a5440, v.night ? 0.5 : 0.75);
      scene.add(hemi);
      var sun = new T.DirectionalLight(v.night ? 0x8899cc : 0xfff0d8, v.night ? 0.3 : 1.15);
      sun.position.set(120, 180, 60); sun.castShadow = !v.night;
      sun.shadow.mapSize.set(2048, 2048);
      var sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 500;
      sun.shadow.bias = -0.0006;
      scene.add(sun); scene.add(sun.target);
      scene.add(buildRoad(v, cl, RW));
      var props = Props(scene, v.night);
      var dyn = placeSprites(v, cl, RW, props);
      props.finish();
      var hz = null;
      if (!world) { hz = horizon(v); scene.add(hz); }
      if (world) {
        if (!city) city = R.City3D(scene, { night: v.night });
        else scene.add(city.group);
        var p0 = at(cl, v.pz / R.SEG);
        city.update(p0.x, p0.z);
      }
      var cam = new T.PerspectiveCamera(62, canvas.width / canvas.height, 0.3, world ? 6000 : 2500);
      var me = carModel(v.car.body, v.car.color); scene.add(me);
      var mbb = new T.Box3().setFromObject(me), msz = mbb.getSize(new T.Vector3());
      me.userData.dim = { L: Math.max(msz.z, msz.x), H: msz.y };
      var head = null;
      if (v.night || v.spec.lava) {
        head = new T.SpotLight(0xfff2cc, 2.2, 90, 0.45, 0.5, 1.2); scene.add(head); scene.add(head.target);
      }
      // 信号の灯り（青・黄・赤。運転手の方を向く）
      var sigMeshes = dyn.filter(function (d) { return d.kind === 'signal'; }).map(function (d) {
        var gg = new T.Group();
        ['#00e0a0', '#ffc400', '#ff2a2a'].forEach(function (c, i) {
          var m = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.06, 14).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0x15181d }));
          var o = (i - 1) * 0.58;
          m.position.set(d.r.x * o, 0, d.r.z * o); m.rotation.set(0, d.rot, 0); m.userData.on = c; gg.add(m);
        });
        gg.position.set(d.x, d.y, d.z); scene.add(gg); return gg;
      });
      // 案内標識の文字
      dyn.filter(function (d) { return d.kind === 'signtext'; }).forEach(function (d) { scene.add(textPlane(d)); });
      // 電線
      var poles = dyn.filter(function (d) { return d.kind === 'pole'; }), wp = [];
      [-1, 1].forEach(function (sd) {
        var ps = poles.filter(function (d) { return d.side === sd; });
        for (var i = 0; i + 1 < ps.length; i++) for (var k = 0; k < 2; k++) {
          var a = ps[i], b = ps[i + 1], dy = k * 0.8;
          for (var q = 0; q < 6; q++) {
            var t1 = q / 6, t2 = (q + 1) / 6, sag1 = Math.sin(t1 * Math.PI) * 0.6, sag2 = Math.sin(t2 * Math.PI) * 0.6;
            wp.push(a.x + (b.x - a.x) * t1, a.y - dy + (b.y - a.y) * t1 - sag1, a.z + (b.z - a.z) * t1, a.x + (b.x - a.x) * t2, a.y - dy + (b.y - a.y) * t2 - sag2, a.z + (b.z - a.z) * t2);
          }
        }
      });
      if (wp.length) { var wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute(wp, 3)); scene.add(new T.LineSegments(wg, new T.LineBasicMaterial({ color: 0x2a2a2e }))); }
      if (dome && hz) hz.material.opacity = 0.55;
      stage = { s: s, v: v, scene: scene, cl: cl, RW: RW, cam: cam, me: me, head: head, hz: hz, pool: {}, sig: sigMeshes, camPos: null, sun: sun, world: world, dome: dome };
    }

    function place(obj, total, offset, yaw, extraY) {
      var st = stage, sIdx = total / R.SEG, p = at(st.cl, sIdx), r = rightOf(p.h);
      obj.position.set(p.x + r.x * offset * st.RW, p.y + (extraY || 0), p.z + r.z * offset * st.RW);
      obj.rotation.set(0, p.h + (yaw || 0), 0);
      return p;
    }

    function render() {
      var st = stage, s = st.s, v = s.view(), P = v.P;
      // 車を置く（出たり消えたりするので使い回す）
      var seen = {};
      function carFor(key, c, front) {
        seen[key] = true;
        if (!st.pool[key]) { st.pool[key] = carModel(c.body, c.color, { front: front }); st.scene.add(st.pool[key]); }
        return st.pool[key];
      }
      v.cars.forEach(function (c, i) { place(carFor('r' + i, c), c.total, c.offset, 0); });
      v.traffic.forEach(function (c, i) { if (Math.abs(c.total - v.pz) < R.SEG * 900) place(carFor('t' + i + c.body + c.color, c, c.dir === -1), c.total, c.offset, c.dir === -1 ? Math.PI : 0); });
      v.cops.forEach(function (c, i) { place(carFor('c' + i, c), c.total, c.offset, 0); });
      if (v.crossSeg) v.cross.forEach(function (c, i) { var m = carFor('x' + i + c.body, c); place(m, v.crossSeg * R.SEG, c.x, c.v > 0 ? -Math.PI / 2 : Math.PI / 2); });
      Object.keys(st.pool).forEach(function (k) { st.pool[k].visible = !!seen[k]; });
      // 自車
      var steer = v.keys.left ? 1 : v.keys.right ? -1 : 0;
      var p = place(st.me, v.pz, P.x, steer * 0.06 + (P.spin > 0 ? Math.sin(v.t * 20) * 0.4 : 0));
      if (P.bump > 0) st.me.position.y += Math.sin(v.t * 60) * 0.05;
      // カメラ（自車の後ろ上から、少し遅れてついていく）
      var f = { x: Math.sin(p.h), z: Math.cos(p.h) };
      var dim = st.me.userData.dim || { L: 4.6, H: 1.4 };
      // 大きな車（消防車・キャンピングカーなど）でも前が見えるよう、車体に合わせて後ろ・上へ引く
      var camBack = 6.8 + Math.max(0, dim.L - 4.6) * 1.1 + Math.max(0, dim.H - 1.6) * 1.8, camUp = 2.3 + Math.max(0, dim.H - 1.6) * 1.6;
      var want = new T.Vector3(st.me.position.x - f.x * camBack, st.me.position.y + camUp, st.me.position.z - f.z * camBack);
      if (!st.camPos) st.camPos = want.clone(); else st.camPos.lerp(want, 0.25);
      st.cam.position.copy(st.camPos);
      var ahead = at(st.cl, v.pz / R.SEG + 12 / 1.3);
      st.cam.lookAt(st.me.position.x * 0.6 + (ahead.x + rightOf(ahead.h).x * P.x * st.RW) * 0.4, st.me.position.y + 1.1, st.me.position.z * 0.6 + (ahead.z + rightOf(ahead.h).z * P.x * st.RW) * 0.4);
      var fov = 62 + (P.boosting ? 8 : 0) + Math.min(6, P.speed / R.MAX * 6);
      if (Math.abs(st.cam.fov - fov) > 0.1) { st.cam.fov += (fov - st.cam.fov) * 0.15; st.cam.updateProjectionMatrix(); }
      if (st.hz) { st.hz.position.x = st.cam.position.x; st.hz.position.z = st.cam.position.z; }
      if (st.dome) st.dome.position.set(st.cam.position.x, st.cam.position.y - 40, st.cam.position.z);
      st.sun.position.set(st.me.position.x + 120, st.me.position.y + 180, st.me.position.z + 60);
      st.sun.target.position.copy(st.me.position);
      if (st.world && city) city.update(st.me.position.x, st.me.position.z);
      if (st.head) { st.head.position.set(st.me.position.x, st.me.position.y + 1, st.me.position.z); st.head.target.position.set(st.me.position.x + f.x * 30, st.me.position.y, st.me.position.z + f.z * 30); }
      st.sig.forEach(function (gg) {
        gg.children.forEach(function (m, i) { var on = ['green', 'yellow', 'red'][i] === v.signal; m.material.color.set(on ? m.userData.on : '#15181d'); });
      });
      renderer.render(st.scene, st.cam);
    }

    function dispose() {
      if (!stage) return;
      if (city) stage.scene.remove(city.group);   // 街は次の道でも使い回す
      stage.scene.traverse(function (o) {
        if (o.geometry && !o.userData.shared && !o.geometry.userData.keep) o.geometry.dispose();
        if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.userData.keep) return; if (m.map && !m.map.userData.keep) m.map.dispose(); m.dispose(); }); }
      });
      stage = null;
      oldCache = {};
    }

    build(sess);
    return {
      render: render,
      rebuild: function (s) { build(s); },
      resize: function (w, h) { renderer.setSize(w, h, false); if (stage) { stage.cam.aspect = w / h; stage.cam.updateProjectionMatrix(); } },
      dispose: function () { dispose(); if (city) { city.dispose(); city = null; } renderer.dispose(); }
    };
  };
})();
