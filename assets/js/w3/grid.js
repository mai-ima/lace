/*
 * grid.js — 平面の格子（1 マス 1 ビット）。建物の外形や歩道の範囲を三角形から塗り、当たり判定と接地の高さに使う。
 */
export function makeGrid(x0, z0, size, cell) {
  const n = Math.ceil(size / cell), bits = new Uint32Array(Math.ceil(n * n / 32));
  const idx = (i, j) => j * n + i;
  const g = {
    x0, z0, n, cell, bits,
    clear: false,   // true の間は、tri と line が塗る代わりに消す
    set(i, j) { if (i < 0 || j < 0 || i >= n || j >= n) return; const k = idx(i, j); if (g.clear) bits[k >> 5] &= ~(1 << (k & 31)); else bits[k >> 5] |= 1 << (k & 31); },
    get(i, j) { if (i < 0 || j < 0 || i >= n || j >= n) return 0; const k = idx(i, j); return (bits[k >> 5] >>> (k & 31)) & 1; },
    at(x, z) { return g.get(Math.floor((x - x0) / cell), Math.floor((z - z0) / cell)); },
    /** xz 平面の三角形を塗る（マスの中心が中に入るもの。細い三角形は辺の上の点も塗る） */
    tri(ax, az, bx, bz, cx, cz) {
      const i0 = Math.floor((Math.min(ax, bx, cx) - x0) / cell), i1 = Math.floor((Math.max(ax, bx, cx) - x0) / cell);
      const j0 = Math.floor((Math.min(az, bz, cz) - z0) / cell), j1 = Math.floor((Math.max(az, bz, cz) - z0) / cell);
      const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (Math.abs(d) < 1e-6) { g.line(ax, az, bx, bz); g.line(bx, bz, cx, cz); return; }
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * cell, pz = z0 + (j + 0.5) * cell;
        const w0 = ((bx - px) * (cz - pz) - (bz - pz) * (cx - px)) / d, w1 = ((cx - px) * (az - pz) - (cz - pz) * (ax - px)) / d, w2 = 1 - w0 - w1;
        if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) g.set(i, j);
      }
    },
    line(ax, az, bx, bz) {
      const l = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(l / (cell * 0.5)));
      for (let s = 0; s <= k; s++) g.set(Math.floor((ax + (bx - ax) * s / k - x0) / cell), Math.floor((az + (bz - az) * s / k - z0) / cell));
    },
    /** (x,z) から一番近い空きマスへの押し出し（最大 r m まで探す）。空きなら null */
    escape(x, z, r) {
      const ci = Math.floor((x - x0) / cell), cj = Math.floor((z - z0) / cell);
      if (!g.get(ci, cj)) return null;
      const R = Math.ceil(r / cell);
      let best = null, bd = Infinity;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const dd = di * di + dj * dj; if (dd >= bd || dd > R * R) continue;
        if (!g.get(ci + di, cj + dj)) { bd = dd; best = [di, dj]; }
      }
      if (!best) return null;
      const tx = x0 + (ci + best[0] + 0.5) * cell, tz = z0 + (cj + best[1] + 0.5) * cell, dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
      return { dx, dz, nx: dx / l, nz: dz / l, d: l };
    }
  };
  return g;
}
