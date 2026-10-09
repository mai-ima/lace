/*
 * parked.js — 駐車場に止まっている車。区画と止まる割合は street.js（world.street.parked）で決める。
 * 形は一般車のいちばん軽い形（_lod3.glb、約 2 千面。tools/world/car_lod3.mjs）を、車種ごとに 1 つのインスタンス描画で。
 * カメラから R 以内の近い順に、最大 MAX 台だけ並べる（画質ごと）。止まっている車には当たり判定を付ける。
 */
import * as THREE from 'three';

const hsh = (a, b) => { const v = Math.sin(a * 91.17 + b * 47.53) * 43758.5453; return v - Math.floor(v); };
// 色の割合（日本の駐車場: 白・銀・黒が多い）
const COLORS = [[0xf2f2f0, 32], [0xb8bcc2, 20], [0x1a1c20, 16], [0x6b6f75, 8], [0x2a3d66, 6], [0x8c1c1c, 5], [0xd7cfc0, 6], [0x2f4a3a, 3], [0x5a3a24, 4]];
const pickColor = h => { let t = h * 100; for (const [c, w] of COLORS) { if ((t -= w) < 0) return c; } return 0xf2f2f0; };

/**
 * slots: world.street.parked、types: [{ key, weight, parts（fleetParts の parts）, size: { w, l }, colors }]
 * o: { R, MAX, shadows, collide（当たり判定の格子。tri(x0,z0,x1,z1,x2,z2)） }
 */
export function makeParked(scene, slots, types, o) {
  if (!slots || !slots.length || !types.length) return null;
  let wSum = 0; types.forEach(T => { wSum += T.weight; });
  const cars = slots.map(s => {
    let t = hsh(s.x, s.z) * wSum, T = types[0]; for (const U of types) { if ((t -= U.weight) < 0) { T = U; break; } }
    const h2 = hsh(s.z, s.x), color = T.colors ? T.colors[Math.floor(h2 * T.colors.length)] : pickColor(h2);
    return { s, T, color, m: new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y + 0.02, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(1, 1, 1)) };
  });
  // 当たり判定（車の外形の長方形）
  if (o.collide) cars.forEach(c => {
    const hw = (c.T.size.w || 1.7) / 2, hl = (c.T.size.l || 4.4) / 2, fx = Math.sin(c.s.yaw), fz = Math.cos(c.s.yaw), lx = fz, lz = -fx;
    const P = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([a, b]) => [c.s.x + fx * a + lx * b, c.s.z + fz * a + lz * b]);
    o.collide.tri(P[0][0], P[0][1], P[1][0], P[1][1], P[2][0], P[2][1]); o.collide.tri(P[0][0], P[0][1], P[2][0], P[2][1], P[3][0], P[3][1]);
  });
  types.forEach(T => {
    const n = Math.min(o.MAX, cars.filter(c => c.T === T).length);
    T.pIM = n ? T.parts.map(pt => { const im = new THREE.InstancedMesh(pt.geometry, pt.material, n); im.castShadow = !!o.shadows; im.receiveShadow = true; im.frustumCulled = false; im.count = 0; im.visible = false; if (pt.paint) im.setColorAt(0, new THREE.Color()); scene.add(im); return { im, paint: pt.paint, cap: n }; }) : [];
  });
  const col = new THREE.Color(); let lx = Infinity, lz = Infinity;
  return {
    count: cars.length,
    update(cx, cz) {
      if (Math.hypot(cx - lx, cz - lz) < 5) return;   // 5m 動くごとに並べ直す
      lx = cx; lz = cz;
      const near = [];
      for (const c of cars) { const d2 = (c.s.x - cx) ** 2 + (c.s.z - cz) ** 2; if (d2 < o.R * o.R) near.push([d2, c]); }
      near.sort((a, b) => a[0] - b[0]);
      types.forEach(T => { T.pn = 0; });
      let total = 0;
      for (const [, c] of near) {
        if (total >= o.MAX) break; const T = c.T; if (!T.pIM.length || T.pn >= T.pIM[0].cap) continue;
        T.pIM.forEach(p => { p.im.setMatrixAt(T.pn, c.m); if (p.paint) p.im.setColorAt(T.pn, col.setHex(c.color)); });
        T.pn++; total++;
      }
      types.forEach(T => T.pIM.forEach(p => { p.im.count = T.pn; p.im.visible = T.pn > 0; p.im.instanceMatrix.needsUpdate = true; if (p.im.instanceColor) p.im.instanceColor.needsUpdate = true; }));
    }
  };
}
