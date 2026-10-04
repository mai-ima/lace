/*
 * props.js — 道路の付属物: 電柱と電線、街灯。すべてインスタンス描画（部品ごとに 1 回の描画）。
 * 電柱: 日本の一般的なコンクリート柱（長さ 12m、末口 φ19cm〜元口 φ35cm 程度、地上 10m）、上部に腕金と碍子、ときどき柱上変圧器。
 * 電線: 高圧 3 本（腕金）と低圧・通信の 2〜3 本を、たるみ（径間の約 2%）をつけて隣の柱へ。
 * 街灯: 幹線の歩道に約 35m ごと、高さ 10m の柱と、車道側へ出たアームの先の LED 灯具。
 * 配置の決まり（浜松の写真の調査より）: 駅から半径 1km は電線が少ない（無電柱化・ビル街）。外側の住宅地の道は片側に約 30m ごと。
 */
import * as THREE from 'three';

function walkLine(L, start, step, fn) {   // 折れ線に沿って start から step ごとに fn(x, z, dx, dz, i)
  let acc = 0, next = start, k = 0;
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1], b = L[i], sl = Math.hypot(b[0] - a[0], b[1] - a[1]); if (sl <= 0) continue;
    while (next <= acc + sl) { const u = (next - acc) / sl; fn(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, (b[0] - a[0]) / sl, (b[1] - a[1]) / sl, k++); next += step(k); }
    acc += sl;
  }
}
/**
 * 距離で形を切り替えるインスタンス描画。model: { lod0: parts, lod1: parts }（cars.js の fleetParts の parts）。
 * near より近い物は細かい形（影あり）、far まで粗い形（影なし）、その先は描かない。update(カメラの x, z) を時々呼ぶ
 */
function lodInstancer(scene, model, spots, o) {
  const mk = (parts, shadow) => parts.map(pt => { const im = new THREE.InstancedMesh(pt.geometry, pt.material, spots.length); im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; im.count = 0; scene.add(im); return im; });
  const L0 = mk(model.lod0, true), L1 = mk(model.lod1, false);
  const mats = spots.map(p => new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(1, 1, 1)));
  let lastX = Infinity, lastZ = Infinity;
  return {
    update(cx, cz) {
      if (Math.hypot(cx - lastX, cz - lastZ) < 8) return;   // 8m 動くごとに並べ直す
      lastX = cx; lastZ = cz;
      let n0 = 0, n1 = 0;
      spots.forEach((p, i) => {
        const d = Math.hypot(p.x - cx, p.z - cz);
        if (d < o.near) { L0.forEach(im => im.setMatrixAt(n0, mats[i])); n0++; }
        else if (d < o.far) { L1.forEach(im => im.setMatrixAt(n1, mats[i])); n1++; }
      });
      L0.forEach(im => { im.count = n0; im.visible = n0 > 0; im.instanceMatrix.needsUpdate = true; });
      L1.forEach(im => { im.count = n1; im.visible = n1 > 0; im.instanceMatrix.needsUpdate = true; });
    }
  };
}
const hsh = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/**
 * net: 道路網、at(x,z): 地面の高さ、free(x,z): 置ける場所か（建物・車道・木の上でない）
 * 返り値: { poles: [{x,z}], lights: [{x,z}] }（当たり判定用）
 */
export function buildProps(scene, net, at, free, opt) {
  const out = { poles: [], lights: [] };
  const poleSpots = [], spans = [], lightSpots = [];
  net.edges.forEach(e => {
    const pr = e.pr; if (e.internal || e.hidden || e.line.length < 2) return;
    const mid = e.line[Math.floor(e.line.length / 2)], r = Math.hypot(mid[0], mid[1]);
    // 電柱: 住宅地・その他の道（rank 4〜8）。中心部（半径 1km）は 1 割だけ
    if (pr.rank >= 4 && pr.rank <= 8 && (r > 1000 || hsh(mid[0], mid[1]) < 0.1)) {
      const side = hsh(e.id, 3) < 0.5 ? -1 : 1, off = pr.hw + (pr.walk > 0 ? pr.walk - 0.4 : 0.35);
      let prev = null;
      walkLine(e.line, 6, () => 28 + hsh(e.id, prev ? prev.x : 0) * 6, (x, z, dx, dz) => {
        const px = x - dz * off * side, pz = z + dx * off * side;
        if (!free(px, pz)) { prev = null; return; }
        const p = { x: px, z: pz, y: at(px, pz), yaw: Math.atan2(dx, dz), tr: hsh(px, pz) < 0.22, out: [-dz * side, dx * side] };
        poleSpots.push(p); if (prev && Math.hypot(prev.x - px, prev.z - pz) < 45) spans.push([prev, p]); prev = p;
      });
    }
    // 街灯（道路照明）: 歩道のある道（rank ≤ 6）。両側に互い違いに約 32m ごと。柱は歩道の車道側（縁石から 0.6m）
    if (pr.rank <= 6 && pr.walk > 0) {
      walkLine(e.line, 10, () => 32, (x, z, dx, dz, k) => {
        const side = k % 2 ? 1 : -1;
        let off = pr.hw + 0.6;
        if (opt.onWalk) { let o = Math.max(1, pr.hw - 1.5); while (o < pr.hw + 8 && !opt.onWalk(x - dz * o * side, z + dx * o * side)) o += 0.25; if (o >= pr.hw + 8) return; off = o + 0.6; }
        const px = x - dz * off * side, pz = z + dx * off * side;
        if (!free(px, pz)) return;
        lightSpots.push({ x: px, z: pz, y: at(px, pz), yaw: Math.atan2(dx * side, dz * side), reach: off });   // ローカルの +x（アームの向き）が車道を向く
      });
    }
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const conc = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.55, metalness: 0.6 });
  const insul = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.4 });
  const trans = new THREE.MeshStandardMaterial({ color: 0x9aa3a0, roughness: 0.6, metalness: 0.3 });
  function inst(geo, mat, list, place, noShadow) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { place(p, M); m.setMatrixAt(i, M); });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.castShadow = !noShadow; m.receiveShadow = true; scene.add(m); return m;
  }
  const at0 = (p, dy, h) => { Q.setFromAxisAngle(Y, p.yaw); V.set(p.x, p.y + dy, p.z); return M.compose(V, Q, S); };
  // 外部のモデル（tools/world/props_glb.mjs で変換）があれば、距離で細かい形と粗い形を切り替えて描く
  if (opt.models) {
    out.lods = [];
    if (opt.models.pole) out.lods.push(lodInstancer(scene, opt.models.pole, poleSpots, { near: 45, far: 260 }));
    if (opt.models.light) out.lods.push(lodInstancer(scene, opt.models.light, lightSpots, { near: 55, far: 300 }));
    out.update = (cx, cz) => out.lods.forEach(l => l.update(cx, cz));
  }
  const WH = opt.models && opt.models.pole ? opt.models.pole.h : 10;   // 電線をつなぐ高さの基準（電柱の地上高）
  // 電柱（地上 10m、上へ細くなる）
  const poleG = new THREE.CylinderGeometry(0.095, 0.17, 10, 8, 1, true); poleG.translate(0, 5, 0);
  if (!(opt.models && opt.models.pole)) {
  inst(poleG, conc, poleSpots, p => at0(p, 0));
  // 腕金（高圧 9.4m、低圧 8.2m）。道路と直角
  const armG = new THREE.BoxGeometry(1.8, 0.09, 0.09); const armList = [];
  poleSpots.forEach(p => { armList.push({ p, y: 9.4 }); armList.push({ p, y: 8.2, short: true }); });
  inst(armG, steel, armList, a => { at0(a.p, a.y); if (a.short) M.scale(new THREE.Vector3(0.6, 1, 1)); return M; }, true);
  // 碍子（高圧の 3 本ぶん）
  const insG = new THREE.CylinderGeometry(0.05, 0.07, 0.18, 5, 1, true); const insList = [];
  poleSpots.forEach(p => [-0.8, 0, 0.8].forEach(o => insList.push({ p, o })));
  inst(insG, insul, insList, a => { at0(a.p, 9.55); M.multiply(new THREE.Matrix4().makeTranslation(a.o, 0, 0)); return M; }, true);   // 小さい部品は影を落とさない
  // 柱上変圧器（2 割の電柱）
  const trG = new THREE.CylinderGeometry(0.28, 0.28, 0.85, 10); trG.translate(0, 0, 0);
  inst(trG, trans, poleSpots.filter(p => p.tr), p => { at0(p, 7.0); M.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.42)); return M; });
  }
  // 電線（たるみ 2%）: 高圧 3 本 + 低圧 2 本 + 通信 1 本
  const lines = [], wires = [[-0.8, WH * 0.95], [0, WH * 0.95], [0.8, WH * 0.95], [-0.45, WH * 0.82], [0.45, WH * 0.82], [0.3, WH * 0.62]];
  spans.forEach(([a, b]) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z), sag = len * 0.02;
    wires.forEach(([o, h]) => {
      const ax = a.x + Math.cos(a.yaw) * o, az = a.z - Math.sin(a.yaw) * o, bx = b.x + Math.cos(b.yaw) * o, bz = b.z - Math.sin(b.yaw) * o;
      const K = 8; let px = ax, py = a.y + h, pz = az;
      for (let k = 1; k <= K; k++) {
        const u = k / K, x = ax + (bx - ax) * u, z = az + (bz - az) * u, y = a.y + h + (b.y - a.y) * u - 4 * sag * u * (1 - u);
        lines.push(px, py, pz, x, y, z); px = x; py = y; pz = z;
      }
    });
  });
  if (lines.length) {
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const wl = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1c1d20, transparent: true, opacity: 0.85 }));
    scene.add(wl);
  }
  // 街灯（高さ 10m の柱、車道側へ 1.8m のアーム、LED 灯具）。外部のモデルがあればそれを使う
  if (!(opt.models && opt.models.light)) {
  const lpG = new THREE.CylinderGeometry(0.07, 0.11, 10, 8, 1, true); lpG.translate(0, 5, 0);
  inst(lpG, steel, lightSpots, p => at0(p, 0));
  const laG = new THREE.CylinderGeometry(0.045, 0.045, 1.9, 5, 1, true); laG.rotateZ(Math.PI / 2); laG.translate(0.95, 0, 0);
  inst(laG, steel, lightSpots, p => at0(p, 9.8));
  const lhG = new THREE.BoxGeometry(0.75, 0.12, 0.32); lhG.translate(1.9, -0.05, 0);
  const lampM = new THREE.MeshStandardMaterial({ color: 0x55595e, roughness: 0.4, metalness: 0.5, emissive: 0xfff2dc, emissiveIntensity: 0 });
  out.lampMaterial = lampM;
  inst(lhG, lampM, lightSpots, p => at0(p, 9.8));
  }
  // 防犯灯（住宅地の電柱に付く小型の LED 灯）: 中心部の外の電柱の約 6 割に、高さ 5.2m・道路側へ 0.8m の腕
  const secSpots = poleSpots.filter(p => hsh(p.x * 0.7, p.z * 1.3) < 0.6);
  const secArmG = new THREE.CylinderGeometry(0.022, 0.022, 0.75, 5, 1, true); secArmG.rotateX(Math.PI / 2); secArmG.translate(0, 0.08, 0.5); secArmG.rotateX(-0.2);
  const secHeadG = new THREE.BoxGeometry(0.16, 0.07, 0.46); secHeadG.translate(0, 0.17, 0.98);
  const secPlace = p => { Q.setFromAxisAngle(Y, Math.atan2(-p.out[0], -p.out[1])); V.set(p.x, p.y + 5.2, p.z); return M.compose(V, Q, S); };
  inst(secArmG, new THREE.MeshStandardMaterial({ color: 0x9a9c9e, roughness: 0.5, metalness: 0.6 }), secSpots, secPlace, true);
  inst(secHeadG, new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.45 }), secSpots, secPlace, true);
  out.secLamps = secSpots.map(p => ({ x: p.x - p.out[0] * 0.98, y: p.y + 5.2 + 0.13, z: p.z - p.out[1] * 0.98 }));
  // 街灯の灯具の位置（モデルの灯具の位置 head があればそれ、無ければ手続きの形の 1.9m 先）
  const hd = opt.models && opt.models.light && opt.models.light.head ? opt.models.light.head : { x: 1.9, y: 9.75 };
  out.lightHeads = lightSpots.map(p => ({ x: p.x + hd.x * Math.cos(p.yaw), y: p.y + hd.y, z: p.z - hd.x * Math.sin(p.yaw), gy: p.y }));
  out.poles = poleSpots; out.lights = lightSpots; out.wireCount = spans.length;
  return out;
}
