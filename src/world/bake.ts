import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching. The city is modelled the readable way — thousands of little
 * boxes, each with its own material — and then baked: every plain-colored mesh
 * is folded into a handful of vertex-colored meshes, and meshes that share a
 * special material (textured, tinted, transparent) are merged per material.
 * A scene of ~3,000 draw calls becomes a couple of hundred, with identical pixels.
 *
 * Emissive color survives the bake as a per-vertex `glow` attribute, scaled by
 * one shared uniform so the whole town's lights can dim at sunrise.
 *
 * Opt out per object with `userData.dynamic` (skips the subtree — anything that
 * moves on its own) or `userData.keep` (leave this one mesh alone).
 */

/** Scales every baked emissive surface at once (1 = night, lower by day). */
export const bakedGlow = { value: 1 };

interface Bucket {
  geometries: THREE.BufferGeometry[];
  flatShading: boolean;
  rough: boolean;
  metal: boolean;
  noCast: boolean;
}

function isPlain(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return (
    material instanceof THREE.MeshStandardMaterial &&
    !material.map &&
    !material.emissiveMap &&
    !material.alphaMap &&
    !material.transparent &&
    material.side === THREE.FrontSide &&
    !material.userData.tinted
  );
}

const plainMaterials = new Map<string, THREE.MeshStandardMaterial>();

function plainMaterial(bucket: Bucket): THREE.MeshStandardMaterial {
  const key = `${bucket.flatShading}|${bucket.rough}|${bucket.metal}`;
  const cached = plainMaterials.get(key);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: bucket.flatShading,
    roughness: bucket.rough ? 0.85 : 0.4,
    metalness: bucket.metal ? 0.5 : 0.05
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = bakedGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 glow;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;\nuniform float uGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * uGlow;'
      );
  };
  material.customProgramCacheKey = () => 'baked-glow';
  plainMaterials.set(key, material);
  return material;
}

/** Position + normal (+ uv) only, un-indexed, moved into the root's space. */
function prepare(mesh: THREE.Mesh, toRoot: THREE.Matrix4, keepUv: boolean): THREE.BufferGeometry | null {
  const source = mesh.geometry;
  if (!source.getAttribute('normal') || (keepUv && !source.getAttribute('uv'))) return null;
  const geo = source.index ? source.toNonIndexed() : source.clone();
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(keepUv && name === 'uv')) geo.deleteAttribute(name);
  }
  geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
  return geo;
}

function fill(geo: THREE.BufferGeometry, name: string, color: THREE.Color): void {
  const count = geo.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) data.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute(name, new THREE.BufferAttribute(data, 3));
}

export function bakeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();

  const meshes: THREE.Mesh[] = [];
  const walk = (node: THREE.Object3D) => {
    if (node.userData.dynamic) return;
    if (
      node instanceof THREE.Mesh &&
      !(node instanceof THREE.InstancedMesh) &&
      !node.userData.keep &&
      !node.userData.skipShadow &&
      node.visible &&
      !Array.isArray(node.material)
    ) {
      meshes.push(node);
    }
    node.children.forEach(walk);
  };
  walk(root);

  const plain = new Map<string, Bucket>();
  const shared = new Map<THREE.Material, { meshes: THREE.Mesh[]; noCast: boolean }>();
  const baked: THREE.Mesh[] = [];

  for (const mesh of meshes) {
    const material = mesh.material as THREE.Material;
    const noCast = Boolean(mesh.userData.noCast);
    if (isPlain(material)) {
      const geo = prepare(mesh, toRoot, false);
      if (!geo) continue;
      fill(geo, 'color', material.color);
      fill(geo, 'glow', material.emissive.clone().multiplyScalar(material.emissiveIntensity));
      const bucket: Bucket = {
        geometries: [],
        flatShading: material.flatShading,
        rough: material.roughness >= 0.6,
        metal: material.metalness >= 0.25,
        noCast
      };
      const key = `${bucket.flatShading}|${bucket.rough}|${bucket.metal}|${bucket.noCast}`;
      if (!plain.has(key)) plain.set(key, bucket);
      plain.get(key)!.geometries.push(geo);
      baked.push(mesh);
    } else {
      const entry = shared.get(material) ?? { meshes: [], noCast };
      entry.meshes.push(mesh);
      entry.noCast = entry.noCast && noCast;
      shared.set(material, entry);
    }
  }

  for (const bucket of plain.values()) {
    const merged = mergeGeometries(bucket.geometries, false);
    bucket.geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, plainMaterial(bucket));
    mesh.userData.noCast = bucket.noCast;
    mesh.userData.keep = true;
    root.add(mesh);
  }

  for (const [material, entry] of shared) {
    if (entry.meshes.length < 2) continue;
    const geometries: THREE.BufferGeometry[] = [];
    const used: THREE.Mesh[] = [];
    for (const mesh of entry.meshes) {
      const geo = prepare(mesh, toRoot, true);
      if (!geo) continue;
      geometries.push(geo);
      used.push(mesh);
    }
    if (used.length < 2) {
      geometries.forEach((g) => g.dispose());
      continue;
    }
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.noCast = entry.noCast;
    mesh.userData.keep = true;
    mesh.renderOrder = used[0].renderOrder;
    root.add(mesh);
    baked.push(...used);
  }

  for (const mesh of baked) mesh.removeFromParent();
}
