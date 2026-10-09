/*
 * marks.js — 写真から読み取った路面表示（road_marks.bin。tools/world/road_marks.py）を描く。
 * 区画線・停止線・横断歩道・導流帯・矢印・文字などを、実際の位置と形のまま置く。
 * 100m のまとまりを 200m ごとに 1 つの形にまとめ、カメラから R より遠いまとまりは描かない（遠くの線は 1 画素に満たない）。
 */
import * as THREE from 'three';

/** road_marks.bin を読む（無ければ null） */
export async function loadPhotoMarks(url) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const buf = await r.arrayBuffer(), dv = new DataView(buf), hl = dv.getUint32(0, true);
    const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
    const off = 4 + hl + ((4 + hl) % 2);   // ヘッダーの後ろの詰め物（2 バイト境界にそろえる 1 バイト）を飛ばす
    return { hdr, body: new Int16Array(buf, off, (buf.byteLength - off) >> 1) };
  } catch (e) { return null; }
}

/**
 * data: loadPhotoMarks の結果、o: { group, hAt(x, z), mat（頂点色を使う材質）, white, yellow（色 [r, g, b]）, R（描く距離 m）, keep(x, z)（置いてよい所か） }
 * 返り値: { update(cx, cz), tris（三角形の数）, chunks }
 */
export function buildPhotoMarks(data, o) {
  const { hdr, body } = data, T = hdr.tile, CS = 200, CH = new Map();
  const chunkOf = (x, z) => { const k = Math.floor(x / CS) + ',' + Math.floor(z / CS); let c = CH.get(k); if (!c) CH.set(k, c = { P: [], C: [], I: [], x0: Math.floor(x / CS) * CS, z0: Math.floor(z / CS) * CS }); return c; };
  const V2 = THREE.Vector2;
  // 長い辺は 3m ごとに点を足す（路面の高さの変化に沿わせる）
  const dens = ring => { const out = []; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], n = Math.max(1, Math.ceil(a.distanceTo(b) / 3)); for (let k = 0; k < n; k++) out.push(new V2(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n)); } return out; };
  // 色: 0 白、1 黄、2 赤の色付き舗装、3 緑の色付き舗装（写真の色に近い、くすんだ色）
  const PAL = [o.white, o.yellow, [0.52, 0.2, 0.17], [0.24, 0.42, 0.27]];
  let nItems = 0; const segs = [];   // 縦の線（[x0, z0, x1, z1]）
  for (const [ti, tj, st, len] of hdr.tiles) {
    const ox = ti * T, oz = tj * T; let p = st; const end = st + len;
    while (p < end) {
      const kind = body[p++], ci = body[p++], col = PAL[ci] || o.white, dy = ci >= 2 ? -0.004 : 0;   // 色付き舗装は白・黄の表示の 4mm 下
      if (kind === 0) {
        const w = body[p++] / 100, n = body[p++], P = [];
        for (let k = 0; k < n; k++) { P.push([ox + body[p] / 100, oz + body[p + 1] / 100]); p += 2; }
        // 細かく区切る（3m ごと）
        const Q = [P[0]]; for (let k = 1; k < P.length; k++) { const a = P[k - 1], b = P[k], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3)); for (let s = 1; s <= m; s++) Q.push([a[0] + (b[0] - a[0]) * s / m, a[1] + (b[1] - a[1]) * s / m]); }
        const mx = Q.reduce((s, q) => s + q[0], 0) / Q.length, mz = Q.reduce((s, q) => s + q[1], 0) / Q.length;
        if (o.keep && !o.keep(mx, mz)) continue;
        const c = chunkOf(mx, mz), b0 = c.P.length / 3;
        Q.forEach((q, k) => {   // 折れ目では前後の向きの平均で横に広げる
          const a = Q[Math.max(0, k - 1)], b = Q[Math.min(Q.length - 1, k + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
          c.P.push(q[0] + nx, o.hAt(q[0] + nx, q[1] + nz) + dy, q[1] + nz, q[0] - nx, o.hAt(q[0] - nx, q[1] - nz) + dy, q[1] - nz); c.C.push(...col, ...col);
        });
        for (let k = 0; k + 1 < Q.length; k++) { const a = b0 + k * 2; c.I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        if (ci < 2) for (let k = 1; k < P.length; k++) segs.push([P[k - 1][0], P[k - 1][1], P[k][0], P[k][1]]);   // 車線の位置を測るための縦の線
        nItems++;
      } else {
        const nr = body[p++], rings = [];
        for (let r = 0; r < nr; r++) { const n = body[p++], R = []; for (let k = 0; k < n; k++) { R.push(new V2(ox + body[p] / 100, oz + body[p + 1] / 100)); p += 2; } rings.push(R); }
        if (ci < 2 && nr === 1 && rings[0].length >= 4) {   // 細長い形（破線の 1 本・実線の一部）は、主軸を縦の線として使う
          const r = rings[0], n2 = r.length; let mx = 0, mz = 0; r.forEach(v => { mx += v.x; mz += v.y; }); mx /= n2; mz /= n2;
          let sxx = 0, szz = 0, sxz = 0; r.forEach(v => { const a = v.x - mx, b = v.y - mz; sxx += a * a; szz += b * b; sxz += a * b; });
          const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(th), uz = Math.sin(th);
          let t0 = 1e9, t1 = -1e9, w0 = 1e9, w1 = -1e9; r.forEach(v => { const t = (v.x - mx) * ux + (v.y - mz) * uz, w = -(v.x - mx) * uz + (v.y - mz) * ux; t0 = Math.min(t0, t); t1 = Math.max(t1, t); w0 = Math.min(w0, w); w1 = Math.max(w1, w); });
          if (t1 - t0 > 4 * (w1 - w0) && w1 - w0 < 0.26 && t1 - t0 > 1) segs.push(   // 幅 0.3m の矢印の軸（車線の中央にある）は数えない
            [mx + ux * t0, mz + uz * t0, mx + ux * t1, mz + uz * t1]);
        }
        const outer = dens(rings[0]), holes = rings.slice(1).map(dens);
        const mx = outer.reduce((s, q) => s + q.x, 0) / outer.length, mz = outer.reduce((s, q) => s + q.y, 0) / outer.length;
        if (o.keep && !o.keep(mx, mz)) continue;
        let tris; try { tris = THREE.ShapeUtils.triangulateShape(outer, holes); } catch (e) { continue; }
        const all = outer.concat(...holes), c = chunkOf(mx, mz), b0 = c.P.length / 3;
        all.forEach(v => { c.P.push(v.x, o.hAt(v.x, v.y) + dy, v.y); c.C.push(...col); });
        tris.forEach(t => c.I.push(b0 + t[0], b0 + t[2], b0 + t[1]));   // 上から見て反時計回り（法線が上）
        nItems++;
      }
    }
  }
  const chunks = []; let tris = 0;
  CH.forEach(c => {
    if (!c.I.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c.C, 3));
    const nrm = new Float32Array(c.P.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(c.I); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, o.mat); m.receiveShadow = true; o.group.add(m);
    chunks.push({ m, cx: c.x0 + CS / 2, cz: c.z0 + CS / 2 }); tris += c.I.length / 3;
  });
  const R = o.R || 1e9;
  return {
    tris, items: nItems, chunks: chunks.length, segs,
    update(cx, cz) { chunks.forEach(c => { const d = Math.max(0, Math.hypot(c.cx - cx, c.cz - cz) - CS * 0.71); c.m.visible = d < R; }); }
  };
}

/**
 * 写真の縦の線（buildPhotoMarks の segs）から、道ごとの実際の車線の位置を求める。
 * 道の 15〜85% の区間にある、道と同じ向き（16 度以内）の線を道に投げ、横のずれを線の長さで重みを付けて集める。
 * 区間の長さの 8% 以上を占める位置（車線の中の矢印の軸は数えない）（破線は約半分、実線はほぼすべて）を車線の境目とし、間が 2.4〜4.3m の所を車線にする。
 * 返り値の数: 車線の位置を決めた道の数。e.lanes = { f: [a→b の車線の中心（左から）], b: [b→a の車線の中心（左から）] }（e.line からの横のずれ、roadnet の + 側が正）
 */
export function fitLanes(edges, segs, dbg) {
  const G = new Map(), C = 10, key = (i, j) => i + ',' + j;
  segs.forEach(sg => {
    const i0 = Math.floor(Math.min(sg[0], sg[2]) / C), i1 = Math.floor(Math.max(sg[0], sg[2]) / C), j0 = Math.floor(Math.min(sg[1], sg[3]) / C), j1 = Math.floor(Math.max(sg[1], sg[3]) / C);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!G.has(k)) G.set(k, []); G.get(k).push(sg); }
  });
  let n = 0;
  edges.forEach(e => {
    const pr = e.pr, L = e.line; if (!L || L.length < 2 || e.hidden || e.internal || pr.rank > 6) return;
    const cum = [0]; for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));
    const Lt = cum[cum.length - 1]; if (Lt < 30) return;
    // 道の近くの縦の線を、道の線に投げて（横のずれ・道に沿った位置）、長さで重みを付けて集める
    const W = pr.hw + 2, offs = [], wts = [];
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; L.forEach(q => { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[1]); });
    const cand = new Set();
    for (let i = Math.floor((x0 - W) / C); i <= Math.floor((x1 + W) / C); i++) for (let j = Math.floor((z0 - W) / C); j <= Math.floor((z1 + W) / C); j++) (G.get(key(i, j)) || []).forEach(sg => cand.add(sg));
    cand.forEach(sg => {
      const mx = (sg[0] + sg[2]) / 2, mz = (sg[1] + sg[3]) / 2, sx = sg[2] - sg[0], sz = sg[3] - sg[1], sl2 = Math.hypot(sx, sz); if (sl2 < 0.3) return;
      let best = null;
      for (let i = 1; i < L.length; i++) {
        const a = L[i - 1], b = L[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; if (l2 < 1e-6) continue;
        const u = Math.max(0, Math.min(1, ((mx - a[0]) * dx + (mz - a[1]) * dz) / l2)), px = a[0] + dx * u - mx, pz = a[1] + dz * u - mz, d2 = px * px + pz * pz;
        if (!best || d2 < best.d2) { const l = Math.sqrt(l2); best = { d2, s: cum[i - 1] + u * l, dx: dx / l, dz: dz / l, t: ((mx - a[0]) * -dz + (mz - a[1]) * dx) / l }; }
      }
      if (!best || best.s < Lt * 0.15 || best.s > Lt * 0.85 || Math.abs(best.t) > W) return;
      if (Math.abs((sx * best.dx + sz * best.dz) / sl2) < 0.96) return;   // 道と同じ向きの線だけ
      offs.push(best.t); wts.push(sl2);
    });
    const span = Lt * 0.7, nst = span / 4;   // 調べた長さ（4m を 1 として数える）
    // 0.2m ごとの度数（前後 1 つずつ足してならす）→ 山
    const B = 0.2, nb = Math.ceil(2 * W / B) + 1, h = new Float32Array(nb);
    offs.forEach((t, q) => { const k = Math.round((t + W) / B); if (k >= 0 && k < nb) h[k] += wts[q] / 4; });   // 4m の線で 1
    const hs = h.map((v, k) => v + (h[k - 1] || 0) * 0.5 + (h[k + 1] || 0) * 0.5);
    const peaks = [];
    for (let k = 1; k < nb - 1; k++) if (hs[k] >= hs[k - 1] && hs[k] > hs[k + 1] && hs[k] >= Math.max(2.2, nst * 0.08)) {   // 破線は長さの約半分、実線はほぼ全部（車や影で隠れる分を見込む）
      let sw = 0, sx2 = 0; for (let q = k - 2; q <= k + 2; q++) if (q >= 0 && q < nb) { sw += h[q]; sx2 += h[q] * (q * B - W); }
      const pos = sx2 / (sw || 1); if (!peaks.length || pos - peaks[peaks.length - 1] > 0.6) peaks.push(pos);
    }
    if (dbg) dbg.peaks = peaks.map(v => +v.toFixed(2));
    if (dbg) dbg.hist = Array.from(hs).map((v, k) => [+(k * B - W).toFixed(1), +v.toFixed(1)]).filter(q => q[1] > 0.5); if (dbg) dbg.nst = +nst.toFixed(1);
    if (peaks.length < 2) return;
    const lanes = []; for (let k = 1; k < peaks.length; k++) { const g = peaks[k] - peaks[k - 1]; if (g >= 2.4 && g <= 4.3) lanes.push((peaks[k] + peaks[k - 1]) / 2); }
    if (!lanes.length) return;
    let f, bk;
    if (pr.one) { if (pr.rev) { f = []; bk = lanes.slice().reverse(); } else { f = lanes.slice(); bk = []; } }
    else {
      if (lanes.length < 2) return;
      // 向きの分かれ目: 車線の数が OSM と同じならその通り、違えば中心線（0）にいちばん近い境目
      let split = pr.fw;
      if (lanes.length !== pr.fw + pr.bw) { split = 1; let best = 1e9; for (let k = 1; k < lanes.length; k++) { const m = Math.abs((lanes[k - 1] + lanes[k]) / 2); if (m < best) { best = m; split = k; } } }
      f = lanes.slice(0, split); bk = lanes.slice(split).reverse();
      if (!f.length || !bk.length) return;
    }
    e.lanes = { f, b: bk }; n++;
  });
  return n;
}
