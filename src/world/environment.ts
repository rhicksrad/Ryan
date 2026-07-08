import * as THREE from 'three';
import { mulberry32 } from './rng';
import { roadTexture, signTexture } from './textures';
import {
  BLOCK,
  ROAD,
  RIVER_CENTER_X,
  RIVER_WIDTH,
  allBlocks,
  type CityPlan
} from './cityplan';

/** Star dome as a point cloud. */
export function createStars(): THREE.Points {
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
  return new THREE.Points(geo, mat);
}

/** Night grass beneath and beyond the city. */
export function createTerrain(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(420, 64),
    new THREE.MeshStandardMaterial({ color: 0x11201a, roughness: 1, metalness: 0 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.12;
  return mesh;
}

/** Pavement slab + sidewalk for every block. */
export function createBlocks(): THREE.Group {
  const group = new THREE.Group();
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x3a4160, roughness: 0.9 });
  const lotMat = new THREE.MeshStandardMaterial({ color: 0x232a44, roughness: 0.95 });
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0x2c3556, roughness: 0.85 });
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x1e4630, roughness: 1 });

  for (const block of allBlocks()) {
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.12, BLOCK), sidewalkMat);
    sidewalk.position.set(block.x, 0.06, block.z);
    group.add(sidewalk);

    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(BLOCK - 2.4, 0.1, BLOCK - 2.4),
      block.isPark ? parkMat : block.isPlaza ? plazaMat : lotMat
    );
    inner.position.set(block.x, 0.13, block.z);
    group.add(inner);
  }
  return group;
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
export function createRiver(plan: CityPlan): { group: THREE.Group; update: (t: number) => void } {
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

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(RIVER_WIDTH, length),
    new THREE.MeshStandardMaterial({
      map: water,
      color: 0xb8d2f0,
      roughness: 0.3,
      metalness: 0.35,
      emissive: 0x1c3c60,
      emissiveIntensity: 0.9
    })
  );
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

/** Street lamps: pole, arm, warm bulb, additive glow — no extra lights needed. */
export function createLamps(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
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
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glow.scale.set(2.6, 2.6, 1);
    glow.position.set(lamp.x, 3.7, lamp.z);
    group.add(glow);
  }
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
