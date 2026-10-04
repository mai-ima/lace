/*
 * lights.js — 夕方・夜の灯り。どれもインスタンス描画で、描画 1 回ずつ。
 * - 光の点（グロー）: カメラの方を向く小さな板。明るさは線形で強く、後処理のブルームで光って見える。
 *   車のライトは車の向きに対して前（ヘッドライト）・後ろ（テールランプ）から見たときだけ明るい。
 * - 光だまり: 街灯・防犯灯の真下の地面を照らす円（中心ほど明るい）。加算で重ねる。
 * 夜の度合い NIGHT.value（0 昼〜1 夜）は、すべての材質が同じ値を参照する。
 */
import * as THREE from 'three';

export const NIGHT = { value: 0 };

/**
 * 車のライト。max 台ぶん。set(i, 車の行列, 配置, ブレーキ) → commit(台数)
 * 配置 lay: { hx, hy, hz, tx, ty, tz }（左右の灯の間隔の半分・高さ・前後の位置。車の中心が原点、前が +z）
 */
export function makeCarGlows(scene, max) {
  const pos = [], corner = [], kind = [], side = [], idx = [];
  for (let k = 0; k < 4; k++) {
    const b = k * 4;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(c => { pos.push(0, 0, 0); corner.push(c[0], c[1]); kind.push(k < 2 ? 0 : 1); side.push(k % 2 ? 1 : -1); });
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  const lay = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), lay2 = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  lay.setUsage(THREE.DynamicDrawUsage); lay2.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aLay', lay); g.setAttribute('aLay2', lay2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: NIGHT }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec2 aCorner; attribute float aKind; attribute float aSide; attribute vec4 aLay; attribute vec4 aLay2;
      uniform float uNight; varying vec2 vC; varying vec3 vCol;
      void main() {
        // aLay = (前の灯の x, 高さ, z, 後ろの灯の x)、aLay2 = (後ろの灯の高さ, z, ブレーキ 0/1, 未使用)
        vec3 c = aKind < 0.5 ? vec3(aSide * aLay.x, aLay.y, aLay.z) : vec3(aSide * aLay.w, aLay2.x, aLay2.y);
        vec4 wc = modelMatrix * instanceMatrix * vec4(c, 1.0);
        vec3 fwd = normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        vec3 toCam = normalize(cameraPosition - wc.xyz);
        float facing = aKind < 0.5 ? dot(fwd, toCam) : -dot(fwd, toCam);
        float vis = smoothstep(-0.15, 0.45, facing);
        float br = aKind < 0.5 ? 1.0 : (0.55 + 0.9 * aLay2.z);
        vCol = (aKind < 0.5 ? vec3(7.0, 6.6, 5.6) : vec3(7.0, 0.35, 0.2)) * vis * br * uNight;
        vec4 mv = viewMatrix * wc;
        float sz = (aKind < 0.5 ? 0.26 : 0.18) * (1.0 + 0.012 * max(0.0, -mv.z));   // 遠くでも見えるよう、距離で少し大きく
        mv.xy += aCorner * sz;
        mv.z += 0.25;   // 車体の面に埋もれないよう、少し手前に
        vC = aCorner;
        gl_Position = projectionMatrix * mv;
        if (uNight < 0.01 || vis < 0.01) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vC; varying vec3 vCol;
      void main() { float r = length(vC); float a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.85, 1.0, r)); gl_FragColor = vec4(vCol * a, a); }`
  });
  const im = new THREE.InstancedMesh(g, mat, max);
  im.frustumCulled = false; im.count = 0; im.renderOrder = 5; scene.add(im);
  return {
    mesh: im,
    set(i, M, L, brake) { im.setMatrixAt(i, M); lay.setXYZW(i, L.hx, L.hy, L.hz, L.tx); lay2.setXYZW(i, L.ty, L.tz, brake ? 1 : 0, 0); },
    commit(n) { im.count = n; im.visible = n > 0 && NIGHT.value > 0.01; im.instanceMatrix.needsUpdate = true; lay.needsUpdate = true; lay2.needsUpdate = true; }
  };
}

/** 車の大きさから、ライトのおおよその配置を決める（日本の乗用車の一般的な位置） */
export function lampLayout(size) {
  const w = size.x, h = size.y, l = size.z;
  return { hx: w / 2 - 0.26, hy: Math.min(0.95, h * 0.44), hz: l / 2 - 0.12, tx: w / 2 - 0.2, ty: Math.min(1.15, h * 0.58), tz: -(l / 2 - 0.08) };
}

/** 固定の光の点（街灯・防犯灯の灯具）。list: [{x, y, z}]、color: 線形の明るさ、size: 半径（m） */
export function makeGlowPoints(scene, list, color, size) {
  if (!list.length) return null;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
  list.forEach((p, i) => at.setXYZ(i, p.x, p.y, p.z)); g.setAttribute('aAt', at);
  g.instanceCount = list.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: NIGHT, uCol: { value: new THREE.Color(color[0], color[1], color[2]) }, uSize: { value: size } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec2 aCorner; attribute vec3 aAt; uniform float uNight; uniform float uSize; varying vec2 vC;
      void main() { vec4 mv = viewMatrix * vec4(aAt, 1.0); mv.xy += aCorner * uSize * (1.0 + 0.008 * max(0.0, -mv.z)); mv.z += 0.3; vC = aCorner; gl_Position = projectionMatrix * mv; if (uNight < 0.01) gl_Position = vec4(0.0, 0.0, -2.0, 1.0); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uNight; varying vec2 vC;
      void main() { float r = length(vC); float a = exp(-r * r * 6.0) * (1.0 - smoothstep(0.85, 1.0, r)); gl_FragColor = vec4(uCol * a * uNight, a); }`
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 5; scene.add(m);
  return m;
}

/**
 * 光だまり（灯の真下の地面が照らされた円）。list: [{x, y, z, r}]（y は地面の高さ）、color: 線形の明るさ
 * 地面・歩道・車道の上に、少し浮かせて加算で重ねる（深度は書かない）
 */
export function makeLightPools(scene, list, color) {
  if (!list.length) return null;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  const at = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
  list.forEach((p, i) => at.setXYZW(i, p.x, p.y, p.z, p.r)); g.setAttribute('aAt', at);
  g.instanceCount = list.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: NIGHT, uCol: { value: new THREE.Color(color[0], color[1], color[2]) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: `attribute vec4 aAt; uniform float uNight; varying vec2 vP;
      void main() { vP = position.xz; vec3 w = vec3(aAt.x + position.x * aAt.w, aAt.y + 0.19, aAt.z + position.z * aAt.w); gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); if (uNight < 0.01) gl_Position = vec4(0.0, 0.0, -2.0, 1.0); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uNight; varying vec2 vP;
      void main() { float r = length(vP); float a = pow(max(0.0, 1.0 - r), 1.6); gl_FragColor = vec4(uCol * a * uNight, 1.0); }`
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 4; scene.add(m);
  return m;
}
