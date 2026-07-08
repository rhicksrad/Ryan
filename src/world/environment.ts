import * as THREE from 'three';
import { mulberry32 } from './rng';
import { roadTexture, signTexture } from './textures';
import {
  BLOCK,
  ROAD,
  RIVER_CENTER_X,
  RIVER_WIDTH,
  planCenterX,
  allBlocks,
  type CityPlan
} from './cityplan';

const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

// Shared wind clock; trees read it in their vertex shaders. Updated each frame.
const windUniform = { value: 0 };

/** Set the global wind time (drives tree sway). */
export function setWindTime(t: number): void {
  windUniform.value = t;
}

/** Inject a gentle height-weighted sway into a canopy material. */
function applyWind(material: THREE.MeshStandardMaterial, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.uniforms.uWindStrength = { value: strength };
    shader.vertexShader =
      'uniform float uWindTime;\nuniform float uWindStrength;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         float wPhase = instanceMatrix[3][0] * 0.12 + instanceMatrix[3][2] * 0.12;
       #else
         float wPhase = (modelMatrix[3][0] + modelMatrix[3][2]) * 0.12;
       #endif
       float wH = max(transformed.y + 0.5, 0.0);
       transformed.x += sin(uWindTime * 1.3 + wPhase) * uWindStrength * wH;
       transformed.z += cos(uWindTime * 1.0 + wPhase * 1.3) * uWindStrength * 0.7 * wH;`
    );
  };
  material.customProgramCacheKey = () => `wind${strength}`;
  material.needsUpdate = true;
}

/** Star dome as a point cloud. */
export function createStars(): { points: THREE.Points; material: THREE.PointsMaterial } {
  const rand = mulberry32(1337);
  const count = 1600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tints = [new THREE.Color('#cdd8ff'), new THREE.Color('#ffffff'), new THREE.Color('#ffd9c0')];
  for (let i = 0; i < count; i += 1) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand() * 0.9); // bias toward the upper dome
    const r = 380 + rand() * 140;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) - 10;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const tint = tints[Math.floor(rand() * tints.length)].clone().multiplyScalar(0.5 + rand() * 0.5);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.4,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    sizeAttenuation: true,
    depthWrite: false,
    fog: false
  });
  return { points: new THREE.Points(geo, mat), material: mat };
}

/** Night grass beneath and beyond the city. */
export function createTerrain(): { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial } {
  const material = new THREE.MeshStandardMaterial({ color: 0x11201a, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(420, 64), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.12;
  return { mesh, material };
}

export interface BlockMaterials {
  sidewalk: THREE.MeshStandardMaterial;
  lot: THREE.MeshStandardMaterial;
  plaza: THREE.MeshStandardMaterial;
  park: THREE.MeshStandardMaterial;
}

/** Pavement slab + sidewalk for every block. */
export function createBlocks(): { group: THREE.Group; materials: BlockMaterials } {
  const group = new THREE.Group();
  const materials: BlockMaterials = {
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x3a4160, roughness: 0.9 }),
    lot: new THREE.MeshStandardMaterial({ color: 0x232a44, roughness: 0.95 }),
    plaza: new THREE.MeshStandardMaterial({ color: 0x2c3556, roughness: 0.85 }),
    park: new THREE.MeshStandardMaterial({ color: 0x1e4630, roughness: 1 })
  };

  for (const block of allBlocks()) {
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.12, BLOCK), materials.sidewalk);
    sidewalk.position.set(block.x, 0.06, block.z);
    group.add(sidewalk);

    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(BLOCK - 2.4, 0.1, BLOCK - 2.4),
      block.isPark ? materials.park : block.isPlaza ? materials.plaza : materials.lot
    );
    inner.position.set(block.x, 0.13, block.z);
    group.add(inner);
  }
  return { group, materials };
}

/** Roads with dashed centerlines. */
export function createRoads(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  for (const road of plan.roads) {
    const texture = roadTexture();
    texture.repeat.set(1, road.length / ROAD);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD, road.length),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 })
    );
    mesh.rotation.x = -Math.PI / 2;
    if (road.horizontal) mesh.rotation.z = Math.PI / 2;
    mesh.position.set(road.x, 0.02, road.z);
    group.add(mesh);
  }
  return group;
}

/** The river: animated water, banks, and bridges where roads cross. */
export function createRiver(plan: CityPlan): {
  group: THREE.Group;
  waterMaterial: THREE.MeshStandardMaterial;
  update: (t: number) => void;
} {
  const group = new THREE.Group();
  // Runs the full width of the world so it flows off past the forest into the fog.
  const length = 780;
  const centerZ = (plan.bounds.minZ + plan.bounds.maxZ) / 2;

  // Water with drifting highlight streaks.
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d2136';
  ctx.fillRect(0, 0, 64, 256);
  const rand = mulberry32(777);
  for (let i = 0; i < 46; i += 1) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(90, 150, 210, 0.16)' : 'rgba(50, 100, 160, 0.2)';
    ctx.fillRect(rand() * 64, rand() * 256, 8 + rand() * 22, 1.6);
  }
  const water = new THREE.CanvasTexture(canvas);
  water.wrapS = THREE.RepeatWrapping;
  water.wrapT = THREE.RepeatWrapping;
  water.repeat.set(1, length / 40);
  water.colorSpace = THREE.SRGBColorSpace;

  const waterMaterial = new THREE.MeshStandardMaterial({
    map: water,
    color: 0xb8d2f0,
    roughness: 0.3,
    metalness: 0.35,
    emissive: 0x1c3c60,
    emissiveIntensity: 0.9
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_WIDTH, length), waterMaterial);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(RIVER_CENTER_X, -0.04, centerZ);
  group.add(surface);

  // Banks.
  const bankMat = new THREE.MeshStandardMaterial({ color: 0x252c44, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const bank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, length), bankMat);
    bank.position.set(RIVER_CENTER_X + side * (RIVER_WIDTH / 2 + 0.7), 0.1, centerZ);
    group.add(bank);
  }

  // Bridges with railings.
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x323a5c, roughness: 0.8 });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x8fa7ff,
    emissive: 0x5a72d8,
    emissiveIntensity: 0.9,
    roughness: 0.5
  });
  for (const bridge of plan.bridges) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(RIVER_WIDTH + 5, 0.5, ROAD + 1), deckMat);
    deck.position.set(RIVER_CENTER_X, 0.28, bridge.z);
    group.add(deck);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(RIVER_WIDTH + 5, 0.16, 0.16), railMat);
      rail.position.set(RIVER_CENTER_X, 1, bridge.z + side * (ROAD / 2 + 0.3));
      group.add(rail);
      for (let px = -2; px <= 2; px += 1) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), deckMat);
        post.position.set(RIVER_CENTER_X + px * (RIVER_WIDTH / 4.4), 0.7, bridge.z + side * (ROAD / 2 + 0.3));
        group.add(post);
      }
    }
  }

  return {
    group,
    waterMaterial,
    update: (t: number) => {
      water.offset.y = t * 0.035;
    }
  };
}

/** Low-poly street trees: pines and rounded canopies. */
export function createTrees(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(4242);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d3226, roughness: 1 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x1a3f2c, roughness: 1 });
  const roundMat = new THREE.MeshStandardMaterial({ color: 0x24503a, roughness: 1 });
  applyWind(pineMat, 0.05);
  applyWind(roundMat, 0.05);

  for (const tree of plan.trees) {
    const s = 0.8 + rand() * 0.7;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, s, 5), trunkMat);
    trunk.position.set(tree.x, s / 2, tree.z);
    group.add(trunk);
    if (tree.kind === 'pine') {
      for (let layer = 0; layer < 3; layer += 1) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry((1.1 - layer * 0.28) * s, 1.1 * s, 6),
          pineMat
        );
        cone.position.set(tree.x, s + layer * 0.7 * s + 0.4 * s, tree.z);
        group.add(cone);
      }
    } else {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95 * s, 0), roundMat);
      blob.position.set(tree.x, s + 0.7 * s, tree.z);
      blob.rotation.set(rand(), rand(), rand());
      group.add(blob);
    }
  }
  return group;
}

/**
 * The countryside around the city: a ring road (beltway) circling town that the
 * four main highways connect to — so no road dead-ends — plus roadside tree rows,
 * a surrounding forest, low hills, ponds, and street lamps out along the roads.
 * Placed in plan coordinates and added to the city group.
 */
export function createOutskirts(
  plan: CityPlan,
  kit: LampKit
): { group: THREE.Group; update: (t: number) => void } {
  const group = new THREE.Group();
  const rand = mulberry32(9091);

  const centerX = planCenterX();
  const centerZ = (plan.bounds.minZ + plan.bounds.maxZ) / 2;
  const { minX, maxX, minZ, maxZ } = plan.bounds;
  const halfX = (maxX - minX) / 2;
  const halfZ = (maxZ - minZ) / 2;
  const REACH = 340; // how far the forest extends from the city center
  const R_RING = 200; // radius of the beltway loop

  const HW_WIDTH = 11;
  const HW_Z = -15; // east/west highway follows a city cross-street
  const HW_X = -15; // north/south highway follows a city avenue
  const roadMat = (length: number) => {
    const tex = roadTexture();
    tex.repeat.set(1, length / HW_WIDTH);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  };
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.95 });
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1c2138, roughness: 0.95 });

  // Where each highway meets the ring (circle centered on the city).
  const ewCross = Math.sqrt(R_RING * R_RING - (HW_Z - centerZ) ** 2);
  const nsCross = Math.sqrt(R_RING * R_RING - (HW_X - centerX) ** 2);
  const eastX = centerX + ewCross;
  const westX = centerX - ewCross;
  const southZ = centerZ + nsCross;
  const northZ = centerZ - nsCross;

  interface HighwayDef { cx: number; cz: number; length: number; horizontal: boolean; from: number; to: number }
  const highways: HighwayDef[] = [
    { horizontal: true, cz: HW_Z, cx: (maxX + eastX) / 2, length: eastX - maxX, from: maxX, to: eastX },
    { horizontal: true, cz: HW_Z, cx: (minX + westX) / 2, length: minX - westX, from: westX, to: minX },
    { horizontal: false, cx: HW_X, cz: (maxZ + southZ) / 2, length: southZ - maxZ, from: maxZ, to: southZ },
    { horizontal: false, cx: HW_X, cz: (minZ + northZ) / 2, length: northZ - minZ, from: northZ, to: minZ }
  ];

  for (const hw of highways) {
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(HW_WIDTH, hw.length), roadMat(hw.length));
    asphalt.rotation.x = -Math.PI / 2;
    if (hw.horizontal) asphalt.rotation.z = Math.PI / 2;
    asphalt.position.set(hw.cx, 0.0, hw.cz);
    group.add(asphalt);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(1.6, hw.length), shoulderMat);
      shoulder.rotation.x = -Math.PI / 2;
      if (hw.horizontal) shoulder.rotation.z = Math.PI / 2;
      if (hw.horizontal) shoulder.position.set(hw.cx, -0.01, hw.cz + side * (HW_WIDTH / 2 + 0.8));
      else shoulder.position.set(hw.cx + side * (HW_WIDTH / 2 + 0.8), -0.01, hw.cz);
      group.add(shoulder);
    }
  }

  // --- Ring road: a flat asphalt annulus with a painted centerline. ---
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(R_RING - HW_WIDTH / 2, R_RING + HW_WIDTH / 2, 140),
    asphaltMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(centerX, 0.0, centerZ);
  group.add(ring);
  const ringLine = new THREE.Mesh(
    new THREE.RingGeometry(R_RING - 0.2, R_RING + 0.2, 140),
    new THREE.MeshStandardMaterial({ color: 0x9098b8, emissive: 0x6b74a0, emissiveIntensity: 0.5, roughness: 0.6 })
  );
  ringLine.rotation.x = -Math.PI / 2;
  ringLine.position.set(centerX, 0.02, centerZ);
  group.add(ringLine);

  // --- Rejection tests so nothing lands on a road, ring, or the river's mouth. ---
  const inCity = (x: number, z: number, pad: number) =>
    x > minX - pad && x < maxX + pad && z > minZ - pad && z < maxZ + pad;
  const onHighway = (x: number, z: number) => {
    const rad = Math.hypot(x - centerX, z - centerZ);
    if (rad > R_RING + HW_WIDTH) return false; // highways only run city -> ring
    return (
      (Math.abs(z - HW_Z) < HW_WIDTH / 2 + 5 && (x < minX || x > maxX)) ||
      (Math.abs(x - HW_X) < HW_WIDTH / 2 + 5 && (z < minZ || z > maxZ))
    );
  };
  const onRing = (x: number, z: number) => {
    const rad = Math.hypot(x - centerX, z - centerZ);
    return Math.abs(rad - R_RING) < HW_WIDTH / 2 + 4;
  };
  const onRiverMouth = (x: number, z: number) =>
    Math.abs(x - RIVER_CENTER_X) < RIVER_WIDTH / 2 + 4 && (z < minZ || z > maxZ);
  const blocked = (x: number, z: number, pad: number) =>
    inCity(x, z, pad) || onHighway(x, z) || onRing(x, z) || onRiverMouth(x, z);

  // --- Forest + roadside tree rows, built as instanced meshes. ---
  interface T { x: number; z: number; s: number; pine: boolean; autumn: boolean }
  const trees: T[] = [];
  const belt = 10;
  for (let c = 0; c < 180; c += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.max(halfX, halfZ) + belt + Math.pow(rand(), 0.6) * (REACH - Math.max(halfX, halfZ) - belt);
    const cxp = centerX + Math.cos(angle) * radius;
    const czp = centerZ + Math.sin(angle) * radius * 0.92;
    const clusterSize = 3 + Math.floor(rand() * 7);
    for (let i = 0; i < clusterSize; i += 1) {
      const x = cxp + (rand() - 0.5) * 14;
      const z = czp + (rand() - 0.5) * 14;
      if (blocked(x, z, belt)) continue;
      trees.push({ x, z, s: 1.3 + rand() * 1.7, pine: rand() < 0.55, autumn: rand() < 0.12 });
    }
  }
  for (const hw of highways) {
    const lo = Math.min(hw.from, hw.to);
    const hi = Math.max(hw.from, hw.to);
    for (let d = lo + 5; d < hi - 5; d += 9) {
      for (const side of [-1, 1]) {
        const offset = side * (HW_WIDTH / 2 + 3.5);
        const x = hw.horizontal ? d + (rand() - 0.5) * 2 : hw.cx + offset;
        const z = hw.horizontal ? hw.cz + offset : d + (rand() - 0.5) * 2;
        if (inCity(x, z, 2) || onRing(x, z)) continue;
        trees.push({ x, z, s: 1.1 + rand() * 0.6, pine: rand() < 0.4, autumn: false });
      }
    }
  }
  buildForest(group, trees);

  // --- Street lamps out along the highways and around the ring. ---
  for (const hw of highways) {
    const lo = Math.min(hw.from, hw.to);
    const hi = Math.max(hw.from, hw.to);
    for (let d = lo + 6; d < hi - 4; d += 26) {
      const x = hw.horizontal ? d : hw.cx + HW_WIDTH / 2 + 1.4;
      const z = hw.horizontal ? hw.cz + HW_WIDTH / 2 + 1.4 : d;
      addLamp(group, kit, x, z, 5.5, 5);
    }
  }
  const ringLamps = 30;
  for (let i = 0; i < ringLamps; i += 1) {
    const a = (i / ringLamps) * Math.PI * 2;
    const r = R_RING + HW_WIDTH / 2 + 1.6;
    addLamp(group, kit, centerX + Math.cos(a) * r, centerZ + Math.sin(a) * r, 5.5, 5);
  }

  // --- Low hills on the horizon for a valley silhouette. ---
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x1a2c1e, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const radius = REACH - 20 + rand() * 55;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(20 + rand() * 26, 0), hillMat);
    hill.scale.y = 0.28 + rand() * 0.14;
    hill.position.set(centerX + Math.cos(angle) * radius, -2 - rand() * 3, centerZ + Math.sin(angle) * radius);
    hill.rotation.y = rand() * Math.PI;
    group.add(hill);
  }

  // --- Ponds nestled in the forest (kept clear of the ring). ---
  const pondMat = new THREE.MeshStandardMaterial({
    color: 0x2d5878,
    roughness: 0.25,
    metalness: 0.5,
    emissive: 0x14304a,
    emissiveIntensity: 0.4
  });
  for (const [px, pz, r] of [
    [centerX - 120, centerZ + 70, 20],
    [centerX + 108, centerZ - 96, 17]
  ] as const) {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(r, 24), pondMat);
    pond.rotation.x = -Math.PI / 2;
    pond.scale.x = 1.3;
    pond.position.set(px, -0.08, pz);
    group.add(pond);
  }

  return {
    group,
    update: (t: number) => setWindTime(t)
  };
}

/** Build a list of trees as three InstancedMeshes (trunks, pine + round canopies). */
function buildForest(group: THREE.Group, trees: { x: number; z: number; s: number; pine: boolean; autumn: boolean }[]): void {
  const rand = mulberry32(555);
  const dummy = new THREE.Object3D();
  const pines = trees.filter((t) => t.pine);
  const rounds = trees.filter((t) => !t.pine);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 1, 5);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  trees.forEach((t, i) => {
    const h = t.s * 1.3;
    dummy.position.set(t.x, h / 2, t.z);
    dummy.scale.set(t.s, h, t.s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  group.add(trunks);

  const pineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  applyWind(pineMat, 0.045);
  const pineGeo = new THREE.ConeGeometry(1, 1, 6);
  const pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, pines.length);
  const pineBase = new THREE.Color(0x1c4630);
  pines.forEach((t, i) => {
    const h = t.s * 1.3;
    const coneH = t.s * 3.2;
    const coneR = t.s * 1.25;
    dummy.position.set(t.x, h + coneH / 2 - 0.3, t.z);
    dummy.scale.set(coneR, coneH, coneR);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pineMesh.setMatrixAt(i, dummy.matrix);
    pineMesh.setColorAt(i, pineBase.clone().multiplyScalar(0.75 + rand() * 0.4));
  });
  pineMesh.instanceMatrix.needsUpdate = true;
  if (pineMesh.instanceColor) pineMesh.instanceColor.needsUpdate = true;
  group.add(pineMesh);

  const roundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  applyWind(roundMat, 0.05);
  const roundGeo = new THREE.IcosahedronGeometry(1, 0);
  const roundMesh = new THREE.InstancedMesh(roundGeo, roundMat, rounds.length);
  const green = new THREE.Color(0x27553c);
  const autumn = new THREE.Color(0xa8642c);
  rounds.forEach((t, i) => {
    const h = t.s * 1.3;
    const r = t.s * 1.5;
    dummy.position.set(t.x, h + r * 0.65, t.z);
    dummy.scale.set(r, r * 0.95, r);
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    dummy.updateMatrix();
    roundMesh.setMatrixAt(i, dummy.matrix);
    const base = t.autumn ? autumn : green;
    roundMesh.setColorAt(i, base.clone().multiplyScalar(0.8 + rand() * 0.35));
  });
  roundMesh.instanceMatrix.needsUpdate = true;
  if (roundMesh.instanceColor) roundMesh.instanceColor.needsUpdate = true;
  group.add(roundMesh);
}

export interface LampKit {
  poleMat: THREE.MeshStandardMaterial;
  bulbMaterial: THREE.MeshStandardMaterial;
  glowMaterial: THREE.SpriteMaterial;
  poleGeo: THREE.CylinderGeometry;
  bulbGeo: THREE.SphereGeometry;
}

/** Shared lamp materials so day/night only has to tweak one bulb + one glow. */
export function createLampKit(): LampKit {
  const glowTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 208, 130, 0.7)');
    g.addColorStop(0.5, 'rgba(255, 190, 110, 0.32)');
    g.addColorStop(1, 'rgba(255, 190, 110, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  return {
    poleMat: new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: 0.7, metalness: 0.4 }),
    bulbMaterial: new THREE.MeshStandardMaterial({
      color: 0xffe1b0,
      emissive: 0xffc472,
      emissiveIntensity: 3.4,
      roughness: 0.3
    }),
    glowMaterial: new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }),
    poleGeo: new THREE.CylinderGeometry(0.09, 0.13, 1, 6),
    bulbGeo: new THREE.SphereGeometry(0.26, 10, 10)
  };
}

/** Place one lamp: tall pole, warm bulb, big additive glow. */
export function addLamp(group: THREE.Group, kit: LampKit, x: number, z: number, height = 5, glowScale = 4.6): void {
  const pole = new THREE.Mesh(kit.poleGeo, kit.poleMat);
  pole.scale.y = height;
  pole.position.set(x, height / 2, z);
  group.add(pole);
  // little arm + head shroud
  const head = new THREE.Mesh(BOX_GEO, kit.poleMat);
  head.scale.set(0.5, 0.16, 0.5);
  head.position.set(x, height + 0.05, z);
  group.add(head);
  const bulb = new THREE.Mesh(kit.bulbGeo, kit.bulbMaterial);
  bulb.position.set(x, height - 0.08, z);
  group.add(bulb);
  const glow = new THREE.Sprite(kit.glowMaterial);
  glow.scale.set(glowScale, glowScale, 1);
  glow.position.set(x, height - 0.08, z);
  group.add(glow);
}

/** City street lamps at the positions the plan chose. */
export function createLamps(plan: CityPlan, kit: LampKit): THREE.Group {
  const group = new THREE.Group();
  for (const lamp of plan.lamps) addLamp(group, kit, lamp.x, lamp.z);
  return group;
}

/** District entrance signs. */
export function createSigns(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x39415e, roughness: 0.6, metalness: 0.3 });
  for (const sign of plan.signs) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 6), poleMat);
    pole.position.set(sign.x, 2.1, sign.z);
    group.add(pole);
    const texture = signTexture(sign.district.name, sign.district.color);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.3),
      new THREE.MeshStandardMaterial({
        map: texture,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0.55,
        roughness: 0.7,
        side: THREE.DoubleSide
      })
    );
    board.position.set(sign.x, 3.6, sign.z);
    board.rotation.y = sign.rotationY;
    group.add(board);
  }
  return group;
}

/** The central spire representing this site / Ryan himself. */
export function createSpire(): { group: THREE.Group; rings: THREE.Mesh[]; pickMeshes: THREE.Mesh[] } {
  const group = new THREE.Group();
  const pickMeshes: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1a2340,
    roughness: 0.35,
    metalness: 0.6,
    emissive: 0x3346a0,
    emissiveIntensity: 0.35
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 22, 8), bodyMat);
  body.position.y = 11;
  group.add(body);
  pickMeshes.push(body);

  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xdfe8ff,
    emissive: 0xaac4ff,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.2
  });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 8), tipMat);
  tip.position.y = 24.2;
  group.add(tip);
  pickMeshes.push(tip);

  const rings: THREE.Mesh[] = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9db4ff, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4 + i * 1.15, 0.06, 8, 64), ringMat);
    ring.position.y = 14 + i * 3.2;
    ring.rotation.x = Math.PI / 2 + (i - 1) * 0.18;
    group.add(ring);
    rings.push(ring);
  }

  const glow = new THREE.PointLight(0x88a2ff, 420, 90, 2);
  glow.position.y = 24;
  group.add(glow);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 5.4, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x10162c, roughness: 0.8 })
  );
  base.position.y = 0.6;
  group.add(base);
  pickMeshes.push(base);

  for (const mesh of pickMeshes) mesh.userData.projectId = '__about__';

  return { group, rings, pickMeshes };
}

/**
 * The living sky: soft clouds drifting on the wind and a few flocks of birds
 * wheeling overhead. `update(t, dayMix, moving)` drifts them and fades clouds
 * between a bright daytime and a dim night.
 */
export function createSky(): {
  group: THREE.Group;
  update: (t: number, dayMix: number, moving: boolean) => void;
} {
  const group = new THREE.Group();
  const rand = mulberry32(31337);

  // Soft round cloud texture.
  const cloudTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  interface Cloud { container: THREE.Group; speed: number; spanX: number }
  const clouds: Cloud[] = [];
  const cloudMats: THREE.SpriteMaterial[] = [];
  const SPAN = 900;
  for (let i = 0; i < 16; i += 1) {
    // Each cloud is a clump of 3–5 overlapping puffs sharing one material.
    const container = new THREE.Group();
    const cmat = new THREE.SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      fog: false
    });
    cloudMats.push(cmat);
    const puffs = 3 + Math.floor(rand() * 3);
    const scale = 40 + rand() * 60;
    for (let p = 0; p < puffs; p += 1) {
      const s = new THREE.Sprite(cmat);
      const w = scale * (0.7 + rand() * 0.6);
      s.scale.set(w, w * (0.5 + rand() * 0.2), 1);
      s.position.set((rand() - 0.5) * scale * 1.4, (rand() - 0.5) * scale * 0.25, 0);
      container.add(s);
    }
    container.position.set(
      (rand() - 0.5) * SPAN,
      95 + rand() * 70,
      (rand() - 0.5) * SPAN
    );
    group.add(container);
    clouds.push({ container, speed: 3 + rand() * 4, spanX: SPAN });
  }

  // Birds: small dark chevrons that flap, gathered into flocks on circular paths.
  const birdMat = new THREE.MeshStandardMaterial({
    color: 0x11131c,
    roughness: 1,
    metalness: 0,
    emissive: 0x0a0c14,
    emissiveIntensity: 0.3
  });
  const wingGeo = new THREE.BoxGeometry(1, 0.06, 0.34);
  interface Flock { group: THREE.Group; wings: THREE.Mesh[]; radius: number; speed: number; phase: number; y: number; flap: number }
  const flocks: Flock[] = [];
  for (let f = 0; f < 4; f += 1) {
    const flock = new THREE.Group();
    const wings: THREE.Mesh[] = [];
    const n = 5 + Math.floor(rand() * 4);
    for (let b = 0; b < n; b += 1) {
      const bird = new THREE.Group();
      const scale = 1.4 + rand() * 1;
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(wingGeo, birdMat);
        wing.scale.setScalar(scale);
        wing.position.x = side * 0.5 * scale;
        wing.rotation.z = side * 0.4;
        bird.add(wing);
        wings.push(wing);
      }
      bird.position.set((rand() - 0.5) * 22, (rand() - 0.5) * 6, (rand() - 0.5) * 22);
      flock.add(bird);
    }
    group.add(flock);
    flocks.push({
      group: flock,
      wings,
      radius: 120 + rand() * 120,
      speed: (0.05 + rand() * 0.05) * (rand() < 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      y: 70 + rand() * 45,
      flap: 5 + rand() * 3
    });
  }

  const update = (t: number, dayMix: number, moving: boolean) => {
    // Clouds bright and white by day, dim and sparse-feeling by night.
    const cloudOpacity = 0.28 + dayMix * 0.55;
    for (const cmat of cloudMats) cmat.opacity = cloudOpacity;

    if (!moving) return;
    for (const cloud of clouds) {
      cloud.container.position.x += cloud.speed * 0.016;
      if (cloud.container.position.x > cloud.spanX / 2) cloud.container.position.x -= cloud.spanX;
    }
    for (const flock of flocks) {
      const a = flock.phase + t * flock.speed;
      flock.group.position.set(Math.cos(a) * flock.radius, flock.y, Math.sin(a) * flock.radius);
      flock.group.rotation.y = -a + (flock.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      const flap = Math.sin(t * flock.flap) * 0.55;
      flock.wings.forEach((wing, i) => {
        wing.rotation.z = (i % 2 === 0 ? -1 : 1) * (0.35 + flap);
      });
    }
  };

  return { group, update };
}
