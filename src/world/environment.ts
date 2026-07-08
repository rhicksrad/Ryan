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
  const length = plan.bounds.maxZ - plan.bounds.minZ + 90;
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
 * The countryside around the city: highways continuing the main streets out to
 * the horizon, roadside tree rows, a surrounding forest, low hills, and ponds.
 * Everything is placed in plan coordinates and added to the city group.
 */
export function createOutskirts(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(9091);

  const centerX = planCenterX();
  const centerZ = (plan.bounds.minZ + plan.bounds.maxZ) / 2;
  const { minX, maxX, minZ, maxZ } = plan.bounds;
  const halfX = (maxX - minX) / 2;
  const halfZ = (maxZ - minZ) / 2;
  const REACH = 340; // how far countryside extends from the city center

  // --- Highways: extend two through-streets out past the city edge. ---
  const HW_WIDTH = 11;
  const HW_Z = -15; // matches a city cross-street
  const HW_X = -15; // matches a city avenue
  const roadMat = (length: number) => {
    const tex = roadTexture();
    tex.repeat.set(1, length / HW_WIDTH);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  };
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.95 });

  interface HighwayDef {
    cx: number;
    cz: number;
    length: number;
    horizontal: boolean;
    // tree-row axis extent
    from: number;
    to: number;
  }
  const highways: HighwayDef[] = [
    // East / West along z = HW_Z
    { horizontal: true, cz: HW_Z, cx: (maxX + (centerX + REACH)) / 2, length: centerX + REACH - maxX, from: maxX, to: centerX + REACH },
    { horizontal: true, cz: HW_Z, cx: (minX + (centerX - REACH)) / 2, length: minX - (centerX - REACH), from: centerX - REACH, to: minX },
    // North / South along x = HW_X
    { horizontal: false, cx: HW_X, cz: (maxZ + (centerZ + REACH)) / 2, length: centerZ + REACH - maxZ, from: maxZ, to: centerZ + REACH },
    { horizontal: false, cx: HW_X, cz: (minZ + (centerZ - REACH)) / 2, length: minZ - (centerZ - REACH), from: centerZ - REACH, to: minZ }
  ];

  for (const hw of highways) {
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(HW_WIDTH, hw.length), roadMat(hw.length));
    asphalt.rotation.x = -Math.PI / 2;
    if (hw.horizontal) asphalt.rotation.z = Math.PI / 2;
    asphalt.position.set(hw.cx, 0.0, hw.cz);
    group.add(asphalt);

    // Two shoulders flanking the asphalt.
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(1.6, hw.length), shoulderMat);
      shoulder.rotation.x = -Math.PI / 2;
      if (hw.horizontal) shoulder.rotation.z = Math.PI / 2;
      if (hw.horizontal) shoulder.position.set(hw.cx, -0.01, hw.cz + side * (HW_WIDTH / 2 + 0.8));
      else shoulder.position.set(hw.cx + side * (HW_WIDTH / 2 + 0.8), -0.01, hw.cz);
      group.add(shoulder);
    }
  }

  // --- Rejection tests so nothing lands on a road or in the river's mouth. ---
  const inCity = (x: number, z: number, pad: number) =>
    x > minX - pad && x < maxX + pad && z > minZ - pad && z < maxZ + pad;
  const onHighway = (x: number, z: number) =>
    (Math.abs(z - HW_Z) < HW_WIDTH / 2 + 5 && (x < minX || x > maxX)) ||
    (Math.abs(x - HW_X) < HW_WIDTH / 2 + 5 && (z < minZ || z > maxZ));
  const onRiverMouth = (x: number, z: number) =>
    Math.abs(x - RIVER_CENTER_X) < RIVER_WIDTH / 2 + 4 && (z < minZ || z > maxZ);

  // --- Collect forest + roadside trees, then build them as instanced meshes. ---
  interface T { x: number; z: number; s: number; pine: boolean; autumn: boolean }
  const trees: T[] = [];

  // Clustered forest ringing the city.
  const belt = 10;
  for (let c = 0; c < 150; c += 1) {
    const angle = rand() * Math.PI * 2;
    // bias toward the outer ring so the immediate surroundings stay open
    const radius = Math.max(halfX, halfZ) + belt + Math.pow(rand(), 0.6) * (REACH - Math.max(halfX, halfZ) - belt);
    const cxp = centerX + Math.cos(angle) * radius;
    const czp = centerZ + Math.sin(angle) * radius * 0.92;
    const clusterSize = 3 + Math.floor(rand() * 7);
    for (let i = 0; i < clusterSize; i += 1) {
      const x = cxp + (rand() - 0.5) * 14;
      const z = czp + (rand() - 0.5) * 14;
      if (inCity(x, z, belt) || onHighway(x, z) || onRiverMouth(x, z)) continue;
      trees.push({
        x,
        z,
        s: 1.3 + rand() * 1.7,
        pine: rand() < 0.55,
        autumn: rand() < 0.12
      });
    }
  }

  // Neat rows of trees lining both sides of every highway.
  for (const hw of highways) {
    const step = 9;
    for (let d = hw.from + 5; d < hw.to - 5; d += step) {
      for (const side of [-1, 1]) {
        const offset = side * (HW_WIDTH / 2 + 3.5);
        const x = hw.horizontal ? d + (rand() - 0.5) * 2 : hw.cx + offset;
        const z = hw.horizontal ? hw.cz + offset : d + (rand() - 0.5) * 2;
        if (inCity(x, z, 2)) continue;
        trees.push({ x, z, s: 1.1 + rand() * 0.6, pine: rand() < 0.4, autumn: false });
      }
    }
  }

  buildForest(group, trees);

  // --- Low hills on the horizon for a valley silhouette. ---
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x16241a, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const radius = REACH - 20 + rand() * 55;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(20 + rand() * 26, 0), hillMat);
    hill.scale.y = 0.28 + rand() * 0.14;
    hill.position.set(
      centerX + Math.cos(angle) * radius,
      -2 - rand() * 3,
      centerZ + Math.sin(angle) * radius
    );
    hill.rotation.y = rand() * Math.PI;
    group.add(hill);
  }

  // --- A couple of ponds nestled in the forest. ---
  const pondMat = new THREE.MeshStandardMaterial({
    color: 0x2d5878,
    roughness: 0.25,
    metalness: 0.5,
    emissive: 0x14304a,
    emissiveIntensity: 0.4
  });
  for (const [px, pz, r] of [
    [centerX - 150, centerZ + 90, 22],
    [centerX + 140, centerZ - 120, 18]
  ] as const) {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(r, 24), pondMat);
    pond.rotation.x = -Math.PI / 2;
    pond.scale.x = 1.3;
    pond.position.set(px, -0.08, pz);
    group.add(pond);
  }

  return group;
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

/** Street lamps: pole, arm, warm bulb, additive glow — no extra lights needed. */
export function createLamps(plan: CityPlan): {
  group: THREE.Group;
  bulbMaterial: THREE.MeshStandardMaterial;
  glowMaterials: THREE.SpriteMaterial[];
} {
  const group = new THREE.Group();
  const glowMaterials: THREE.SpriteMaterial[] = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: 0.7, metalness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a0,
    emissive: 0xffc070,
    emissiveIntensity: 2.4,
    roughness: 0.3
  });
  const glowTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 200, 120, 0.55)');
    g.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  for (const lamp of plan.lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.6, 6), poleMat);
    pole.position.set(lamp.x, 1.8, lamp.z);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bulbMat);
    bulb.position.set(lamp.x, 3.7, lamp.z);
    group.add(bulb);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    glowMaterials.push(glowMat);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(2.6, 2.6, 1);
    glow.position.set(lamp.x, 3.7, lamp.z);
    group.add(glow);
  }
  return { group, bulbMaterial: bulbMat, glowMaterials };
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
