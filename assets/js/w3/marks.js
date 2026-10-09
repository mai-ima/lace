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
  let nItems = 0;
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
        nItems++;
      } else {
        const nr = body[p++], rings = [];
        for (let r = 0; r < nr; r++) { const n = body[p++], R = []; for (let k = 0; k < n; k++) { R.push(new V2(ox + body[p] / 100, oz + body[p + 1] / 100)); p += 2; } rings.push(R); }
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
    tris, items: nItems, chunks: chunks.length,
    update(cx, cz) { chunks.forEach(c => { const d = Math.max(0, Math.hypot(c.cx - cx, c.cz - cz) - CS * 0.71); c.m.visible = d < R; }); }
  };
}
