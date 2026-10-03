/*
 * trees.js — 街路樹（インポスター）。tools/world/impostor.js で 8 方向から焼き付けた色と法線の画像を使い、
 * 板ポリゴンをカメラに向け（縦軸まわり）、見る向きに近い絵を選んで描く。影も同じ形で落とす。
 * 1 回の描画で数千本を出せる（InstancedMesh）。
 */
import * as THREE from 'three';

export async function loadImpostor(base, name) {
  const meta = await fetch(base + name + '.json').then(r => r.json());
  const L = new THREE.TextureLoader();
  const [alb, nor] = await Promise.all([L.loadAsync(base + name + '_albedo.webp'), L.loadAsync(base + name + '_normal.webp')]);
  alb.colorSpace = THREE.SRGBColorSpace; alb.anisotropy = 4;
  nor.colorSpace = THREE.NoColorSpace;
  return { meta, alb, nor };
}

/** 頂点シェーダーに入れる共通部分: 縦軸まわりにカメラへ向け、見る向きから絵の番号を決める */
function inject(sh, N) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float aYaw;
      varying float vFrame;
      vec3 bbRotate(vec3 p, float a) { return vec3(p.x * cos(a), p.y, -p.x * sin(a)); }
      float bbAngle() { vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); vec3 d = cameraPosition - c.xyz; return atan(d.x, d.z); }`)
    .replace('#include <beginnormal_vertex>', `
      float bbPhi = bbAngle();
      vec3 objectNormal = vec3(sin(bbPhi), 0.0, cos(bbPhi));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(cos(bbPhi), 0.0, -sin(bbPhi));
      #endif`)
    .replace('#include <begin_vertex>', `float bbPhi2 = bbAngle(); vec3 transformed = bbRotate(position, bbPhi2);
      float bbRel = bbPhi2 - aYaw;
      vFrame = mod(floor(bbRel / (6.2831853 / ${N}.0) + 0.5), ${N}.0);
      // 絵の番号が決まってから UV を選ぶ（uv_vertex はこれより前にあるので、ここで上書きする）
      #ifdef USE_MAP
        vMapUv = vec2((vFrame + uv.x) / ${N}.0, uv.y);
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = vec2((vFrame + uv.x) / ${N}.0, uv.y);
      #endif`);
  // 法線の計算で instanceMatrix の回転を使わないよう、defaultnormal は objectNormal をそのまま使う（回転なしの行列なので問題ない）
}

/**
 * 木を並べる。spots: [{x, y, z, h(高さ m), yaw}]
 */
export function plantTrees(scene, imp, spots, opt) {
  const { meta, alb, nor } = imp, N = meta.n, s = 2 * meta.half;
  const geo = new THREE.PlaneGeometry(s, s); geo.translate(0, meta.centerY, 0);
  const mat = new THREE.MeshStandardMaterial({ map: alb, normalMap: nor, alphaTest: 0.5, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  mat.normalScale.set(1, 1);
  mat.onBeforeCompile = sh => inject(sh, N);
  mat.customProgramCacheKey = () => 'impostor' + N;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: alb, alphaTest: 0.5, side: THREE.DoubleSide });
  depth.onBeforeCompile = sh => inject(sh, N);
  depth.customProgramCacheKey = () => 'impostorDepth' + N;
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  mesh.customDepthMaterial = depth;
  const yaw = new Float32Array(spots.length), M = new THREE.Matrix4();
  spots.forEach((p, i) => { const k = p.h / meta.height; M.makeScale(k, k, k).setPosition(p.x, p.y, p.z); mesh.setMatrixAt(i, M); yaw[i] = p.yaw; });
  geo.setAttribute('aYaw', new THREE.InstancedBufferAttribute(yaw, 1));
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  mesh.castShadow = opt.shadows !== false; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
