import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { growDepthMaterial, patchGrow, weather } from './surface';

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

function plainMaterial(bucket: Bucket, weathered: boolean): THREE.MeshStandardMaterial {
  const key = `${bucket.flatShading}|${bucket.rough}|${bucket.metal}|${weathered}`;
  const cached = plainMaterials.get(key);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: bucket.flatShading,
    roughness: bucket.rough ? 0.85 : 0.4,
    metalness: bucket.metal ? 0.5 : 0.05
  });
  const glow = (shader: THREE.WebGLProgramParametersWithUniforms) => {
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
  if (weathered) {
    // The town's flat colors get world-space grain, weathering, darker wall bases, and roof courses.
    weather(material, { blotch: 0.16, blotchSize: 26, grain: 0.1, grainSize: 2.4, ground: 0.24, roofs: true }, glow, 'baked-glow');
  } else {
    material.onBeforeCompile = (shader) => {
      glow(shader);
      patchGrow(shader);
    };
    material.customProgramCacheKey = () => 'baked-glow';
  }
  plainMaterials.set(key, material);
  return material;
}

/** One mesh, or one material group of a multi-material mesh. */
interface Piece {
  mesh: THREE.Mesh;
  material: THREE.Material;
  /** When this piece's building rises (0 = always standing). */
  grow: number;
  /** Vertex range in the un-indexed geometry; null means all of it. */
  range: { start: number; count: number } | null;
}

/** Position + normal (+ uv) only, un-indexed, moved into the root's space. */
function prepare(piece: Piece, toRoot: THREE.Matrix4, keepUv: boolean): THREE.BufferGeometry | null {
  const source = piece.mesh.geometry;
  if (!source.getAttribute('normal') || (keepUv && !source.getAttribute('uv'))) return null;
  const flat = source.index ? source.toNonIndexed() : source.clone();
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', ...(keepUv ? ['uv'] : [])]) {
    const attr = flat.getAttribute(name) as THREE.BufferAttribute;
    const size = attr.itemSize;
    const from = piece.range ? piece.range.start * size : 0;
    const to = piece.range ? (piece.range.start + piece.range.count) * size : attr.array.length;
    geo.setAttribute(name, new THREE.BufferAttribute((attr.array as Float32Array).slice(from, to), size));
  }
  flat.dispose();
  geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, piece.mesh.matrixWorld));
  const count = geo.getAttribute('position').count;
  geo.setAttribute('grow', new THREE.BufferAttribute(new Float32Array(count).fill(piece.grow), 1));
  return geo;
}

function fill(geo: THREE.BufferGeometry, name: string, color: THREE.Color): void {
  const count = geo.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) data.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute(name, new THREE.BufferAttribute(data, 3));
}

/** `weathered` is for things that stay put; world-space grain would crawl across anything that moves. */
export function bakeStatic(root: THREE.Object3D, weathered = false): void {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();

  const pieces: Piece[] = [];
  const walk = (node: THREE.Object3D, inherited = 0) => {
    if (node.userData.dynamic) return;
    const grow = (node.userData.grow as number | undefined) ?? inherited;
    if (
      node instanceof THREE.Mesh &&
      !(node instanceof THREE.InstancedMesh) &&
      !node.userData.keep &&
      !node.userData.skipShadow &&
      node.visible
    ) {
      if (Array.isArray(node.material)) {
        // A box with a facade on its sides and a roof on top: bake each group with its own material.
        for (const group of node.geometry.groups) {
          const material = node.material[group.materialIndex ?? 0];
          if (material) pieces.push({ mesh: node, material, grow, range: { start: group.start, count: group.count } });
        }
      } else {
        pieces.push({ mesh: node, material: node.material, grow, range: null });
      }
    }
    node.children.forEach((child) => walk(child, grow));
  };
  walk(root);

  const plain = new Map<string, Bucket>();
  const shared = new Map<THREE.Material, { meshes: Piece[]; noCast: boolean }>();
  const baked = new Set<THREE.Mesh>();
  const kept = new Set<THREE.Mesh>();

  for (const piece of pieces) {
    const { mesh, material } = piece;
    const noCast = Boolean(mesh.userData.noCast);
    if (isPlain(material)) {
      const geo = prepare(piece, toRoot, false);
      if (!geo) {
        kept.add(mesh);
        continue;
      }
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
      baked.add(mesh);
    } else {
      const entry = shared.get(material) ?? { meshes: [], noCast };
      entry.meshes.push(piece);
      entry.noCast = entry.noCast && noCast;
      shared.set(material, entry);
    }
  }

  for (const bucket of plain.values()) {
    const merged = mergeGeometries(bucket.geometries, false);
    bucket.geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, plainMaterial(bucket, weathered));
    if (weathered) mesh.customDepthMaterial = growDepthMaterial();
    mesh.userData.noCast = bucket.noCast;
    mesh.userData.keep = true;
    root.add(mesh);
  }

  for (const [material, entry] of shared) {
    // A lone single-material mesh is already one draw call: leave it be, unless it
    // belongs to a building that rises, which needs it in root space with `grow`.
    if (entry.meshes.length < 2 && !entry.meshes[0].range && entry.meshes[0].grow === 0) {
      kept.add(entry.meshes[0].mesh);
      continue;
    }
    const geometries: THREE.BufferGeometry[] = [];
    const used: THREE.Mesh[] = [];
    for (const piece of entry.meshes) {
      const geo = prepare(piece, toRoot, true);
      if (!geo) {
        kept.add(piece.mesh);
        continue;
      }
      geometries.push(geo);
      used.push(piece.mesh);
    }
    if (geometries.length === 0) continue;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) {
      used.forEach((m) => kept.add(m));
      continue;
    }
    const mesh = new THREE.Mesh(merged, material);
    if (weathered) mesh.customDepthMaterial = growDepthMaterial();
    mesh.userData.noCast = entry.noCast;
    mesh.userData.keep = true;
    mesh.renderOrder = used[0].renderOrder;
    root.add(mesh);
    used.forEach((m) => baked.add(m));
  }

  // A mesh any of whose pieces could not be merged stays whole (and is drawn twice at worst).
  for (const mesh of baked) if (!kept.has(mesh)) mesh.removeFromParent();
}
