import * as THREE from 'three';
import { mulberry32 } from './rng';
import { roadTexture, signTexture, vacancyTexture } from './textures';
import { emblemUrl } from '../art';
import { BLOCK, ROAD, RIVER_WIDTH, type CityPlan } from './cityplan';

const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

/**
 * Surfaces whose base color shifts between night and day (ground, pavement,
 * asphalt…). Register once; `applyTints(dayMix)` lerps them all.
 */
const tints: { color: THREE.Color; night: THREE.Color; day: THREE.Color }[] = [];

function tint<T extends THREE.MeshStandardMaterial>(material: T, night: number, day: number): T {
  tints.push({ color: material.color, night: new THREE.Color(night), day: new THREE.Color(day) });
  material.color.setHex(night);
  material.userData.tinted = true; // keeps its own material through the static bake
  return material;
}

export function applyTints(dayMix: number): void {
  for (const t of tints) t.color.lerpColors(t.night, t.day, dayMix);
}

// Asphalt reads as cool charcoal by day and deep navy at night.
const ASPHALT_NIGHT = 0x7078a8;
const ASPHALT_DAY = 0xffffff;

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

/** Vertical-gradient sky dome. Colors are lerped between night and day. */
export function createSkyDome(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x05070f) },
      bottomColor: { value: new THREE.Color(0x10162c) },
      offset: { value: 60 },
      exponent: { value: 0.7 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float f = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0);
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
  mesh.renderOrder = -1;
  return { mesh, material };
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
export function createTerrain(): THREE.Mesh {
  const material = tint(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), 0x16291f, 0x4f8f46);
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(520, 64), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.12;
  return mesh;
}

/** Pavement, lawns, and park greens for every block. */
export function createBlocks(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const sidewalkMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.9 }), 0x474f70, 0xb3b0a7);
  const lotMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.95 }), 0x2c3450, 0x8f8e8a);
  const plazaMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.8 }), 0x38416a, 0xc2bcae);
  const grassMat = tint(new THREE.MeshStandardMaterial({ roughness: 1 }), 0x1f4a32, 0x5fa24e);
  const pathMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.95 }), 0x4a4a5e, 0xd9cdb0);
  const fountainMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.6 }), 0x4a5378, 0xe4e0d6);

  const slab = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(BOX_GEO, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.userData.noCast = true;
    group.add(mesh);
    return mesh;
  };

  for (const block of plan.blocks) {
    slab(sidewalkMat, BLOCK, 0.12, BLOCK, block.x, 0.06, block.z);
    const inner = block.kind === 'park' ? grassMat : block.kind === 'plaza' ? plazaMat : lotMat;
    slab(inner, BLOCK - 2.4, 0.1, BLOCK - 2.4, block.x, 0.13, block.z);
  }

  // Lawns under the houses and on lots still waiting for a project.
  for (const lawn of plan.lawns) {
    slab(grassMat, lawn.size - 0.6, 0.06, lawn.size - 0.6, lawn.x, 0.18, lawn.z);
  }

  // Parks: crossing footpaths; the riverside park gets a fountain.
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x4d8fc4,
    roughness: 0.2,
    metalness: 0.4,
    emissive: 0x1c3c60,
    emissiveIntensity: 0.5
  });
  for (const park of plan.parkBlocks) {
    slab(pathMat, BLOCK - 2.4, 0.04, 1.5, park.x, 0.19, park.z);
    slab(pathMat, 1.5, 0.04, BLOCK - 2.4, park.x, 0.19, park.z);
    const basinR = park.main ? 3.2 : 2.2;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(basinR, basinR, 0.5, 24), fountainMat);
    basin.position.set(park.x, 0.4, park.z);
    group.add(basin);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(basinR - 0.35, basinR - 0.35, 0.06, 24), waterMat);
    pool.position.set(park.x, 0.64, park.z);
    pool.userData.noCast = true;
    group.add(pool);
    if (park.main) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.6, 10), fountainMat);
      column.position.set(park.x, 1.3, park.z);
      group.add(column);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.3, 0.3, 14), fountainMat);
      bowl.position.set(park.x, 2.2, park.z);
      group.add(bowl);
    }
  }
  return group;
}

/** Zebra crossings on all four sides of a plain asphalt square. */
function intersectionTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#343946';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#c9ccd6';
  const band = 14; // crossing depth
  for (let i = 0; i < 7; i += 1) {
    const p = 24 + i * 12.5;
    ctx.fillRect(p, 3, 6, band);
    ctx.fillRect(p, size - band - 3, 6, band);
    ctx.fillRect(3, p, band, 6);
    ctx.fillRect(size - band - 3, p, band, 6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Roads with lane markings, plus crosswalk squares where they meet. */
export function createRoads(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  for (const road of plan.roads) {
    const texture = roadTexture();
    texture.repeat.set(1, road.length / ROAD);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD, road.length),
      tint(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }), ASPHALT_NIGHT, ASPHALT_DAY)
    );
    mesh.rotation.x = -Math.PI / 2;
    if (road.horizontal) mesh.rotation.z = Math.PI / 2;
    // Streets sit a hair above avenues so the two never z-fight where they cross.
    mesh.position.set(road.x, road.horizontal ? 0.03 : 0.02, road.z);
    mesh.userData.noCast = true;
    group.add(mesh);
  }

  const crossMat = tint(
    new THREE.MeshStandardMaterial({ map: intersectionTexture(), roughness: 0.95 }),
    ASPHALT_NIGHT,
    ASPHALT_DAY
  );
  const crossGeo = new THREE.PlaneGeometry(ROAD, ROAD);
  crossGeo.rotateX(-Math.PI / 2);
  const crossings = new THREE.InstancedMesh(crossGeo, crossMat, plan.intersections.length);
  const dummy = new THREE.Object3D();
  plan.intersections.forEach((spot, i) => {
    dummy.position.set(spot.x, 0.04, spot.z);
    dummy.updateMatrix();
    crossings.setMatrixAt(i, dummy.matrix);
  });
  crossings.userData.noCast = true;
  group.add(crossings);
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
  const length = 980;
  const centerZ = plan.center.z;
  const riverX = plan.riverX;

  // Water with drifting highlight streaks.
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2f6d9e';
  ctx.fillRect(0, 0, 64, 256);
  const rand = mulberry32(777);
  for (let i = 0; i < 46; i += 1) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(120, 180, 235, 0.2)' : 'rgba(60, 120, 185, 0.24)';
    ctx.fillRect(rand() * 64, rand() * 256, 8 + rand() * 22, 1.6);
  }
  const water = new THREE.CanvasTexture(canvas);
  water.wrapS = THREE.RepeatWrapping;
  water.wrapT = THREE.RepeatWrapping;
  water.repeat.set(1, length / 40);
  water.colorSpace = THREE.SRGBColorSpace;
  water.anisotropy = 8;

  const waterMaterial = new THREE.MeshStandardMaterial({
    map: water,
    color: 0xb8d2f0,
    roughness: 0.42,
    metalness: 0.25,
    emissive: 0x1c3c60,
    emissiveIntensity: 0.9
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_WIDTH, length), waterMaterial);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(riverX, -0.04, centerZ);
  surface.userData.noCast = true;
  group.add(surface);

  // Stone embankments.
  const bankMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.9 }), 0x2c3350, 0xb3b0a6);
  for (const side of [-1, 1]) {
    const bank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, length), bankMat);
    bank.position.set(riverX + side * (RIVER_WIDTH / 2 + 0.7), 0.1, centerZ);
    group.add(bank);
  }

  // Bridges with lit railings.
  const deckMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.8 }), 0x3a4266, 0x8e9098);
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x8fa7ff,
    emissive: 0x5a72d8,
    emissiveIntensity: 0.9,
    roughness: 0.5
  });
  for (const bridge of plan.bridges) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(RIVER_WIDTH + 5, 0.5, ROAD + 1), deckMat);
    deck.position.set(riverX, 0.28, bridge.z);
    group.add(deck);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(RIVER_WIDTH + 5, 0.16, 0.16), railMat);
      rail.position.set(riverX, 1, bridge.z + side * (ROAD / 2 + 0.3));
      group.add(rail);
      for (let px = -2; px <= 2; px += 1) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), deckMat);
        post.position.set(riverX + px * (RIVER_WIDTH / 4.4), 0.7, bridge.z + side * (ROAD / 2 + 0.3));
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

/** Low-poly street and park trees, instanced. */
export function createTrees(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(4242);
  buildForest(
    group,
    plan.trees.map((tree) => ({
      x: tree.x,
      z: tree.z,
      s: 0.55 + rand() * 0.4,
      pine: tree.kind === 'pine',
      autumn: rand() < 0.08
    }))
  );
  return group;
}

/**
 * The countryside around the city: a ring road (beltway) circling town that the
 * four main highways connect to — so no road dead-ends — plus roadside tree rows,
 * a surrounding forest, low hills, ponds, and street lamps out along the roads.
 * Placed in plan coordinates and added to the city group.
 */
export function createOutskirts(plan: CityPlan): {
  group: THREE.Group;
  lamps: LampSpec[];
  update: (t: number) => void;
} {
  const group = new THREE.Group();
  const lamps: LampSpec[] = [];
  const rand = mulberry32(9091);

  const centerX = plan.center.x;
  const centerZ = plan.center.z;
  const { minX, maxX, minZ, maxZ } = plan.bounds;
  const halfX = (maxX - minX) / 2;
  const halfZ = (maxZ - minZ) / 2;
  // The beltway and forest scale with the town so a growing city never outruns them.
  const R_RING = Math.max(200, Math.hypot(halfX, halfZ) + 55); // radius of the beltway loop
  const REACH = R_RING + 140; // how far the forest extends from the city center

  const HW_WIDTH = 11;
  const HW_Z = plan.mainStreetZ; // east/west highway follows a city cross-street
  const HW_X = plan.mainAvenueX; // north/south highway follows a city avenue
  const roadMat = (length: number) => {
    const tex = roadTexture();
    tex.repeat.set(1, length / HW_WIDTH);
    return tint(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), ASPHALT_NIGHT, ASPHALT_DAY);
  };
  const shoulderMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.95 }), 0x2b3040, 0x6d6f76);
  const asphaltMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.95 }), 0x171b2e, 0x343946);

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
    asphalt.userData.noCast = true;
    group.add(asphalt);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(1.6, hw.length), shoulderMat);
      shoulder.rotation.x = -Math.PI / 2;
      if (hw.horizontal) shoulder.rotation.z = Math.PI / 2;
      if (hw.horizontal) shoulder.position.set(hw.cx, -0.01, hw.cz + side * (HW_WIDTH / 2 + 0.8));
      else shoulder.position.set(hw.cx + side * (HW_WIDTH / 2 + 0.8), -0.01, hw.cz);
      shoulder.userData.noCast = true;
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
  ring.userData.noCast = true;
  group.add(ring);
  const ringLine = new THREE.Mesh(
    new THREE.RingGeometry(R_RING - 0.2, R_RING + 0.2, 140),
    new THREE.MeshStandardMaterial({ color: 0x9098b8, emissive: 0x6b74a0, emissiveIntensity: 0.5, roughness: 0.6 })
  );
  ringLine.rotation.x = -Math.PI / 2;
  ringLine.position.set(centerX, 0.02, centerZ);
  ringLine.userData.noCast = true;
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
    Math.abs(x - plan.riverX) < RIVER_WIDTH / 2 + 4 && (z < minZ || z > maxZ);
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
      lamps.push({ x, z, height: 5.5 });
    }
  }
  const ringLamps = 30;
  for (let i = 0; i < ringLamps; i += 1) {
    const a = (i / ringLamps) * Math.PI * 2;
    const r = R_RING + HW_WIDTH / 2 + 1.6;
    lamps.push({ x: centerX + Math.cos(a) * r, z: centerZ + Math.sin(a) * r, height: 5.5 });
  }

  // --- Low hills on the horizon for a valley silhouette. ---
  const hillMat = tint(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 0x1a2c1e, 0x4f8650);
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
    pond.position.set(px, -0.03, pz);
    pond.userData.noCast = true;
    group.add(pond);
  }

  return {
    group,
    lamps,
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

export interface LampSpec {
  x: number;
  z: number;
  height?: number;
}

export interface LampField {
  group: THREE.Group;
  bulbMaterial: THREE.MeshStandardMaterial;
  /** Halo + ground-pool materials; opacity follows the night. */
  glowMaterials: { material: THREE.Material; base: number }[];
}

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Every street lamp in the world as a handful of instanced meshes: poles,
 * heads, bulbs, a tight halo, and a warm pool of light on the pavement.
 */
export function createLampField(specs: LampSpec[]): LampField {
  const group = new THREE.Group();
  const n = specs.length;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: 0.7, metalness: 0.4 });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe1b0,
    emissive: 0xffc472,
    emissiveIntensity: 3.4,
    roughness: 0.3
  });

  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 1, 6), poleMat, n);
  const heads = new THREE.InstancedMesh(BOX_GEO, poleMat, n);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 8), bulbMaterial, n);
  bulbs.userData.noCast = true;

  const poolGeo = new THREE.CircleGeometry(1, 20);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: radialTexture([
      [0, 'rgba(255, 205, 135, 0.55)'],
      [0.45, 'rgba(255, 190, 110, 0.2)'],
      [1, 'rgba(255, 190, 110, 0)']
    ]),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
  pools.userData.skipShadow = true;
  pools.renderOrder = 2;

  const haloPositions = new Float32Array(n * 3);
  const dummy = new THREE.Object3D();
  specs.forEach((spec, i) => {
    const height = spec.height ?? 4.2;
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(spec.x, height / 2, spec.z);
    dummy.scale.set(1, height, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spec.x, height + 0.05, spec.z);
    dummy.scale.set(0.46, 0.14, 0.46);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spec.x, height - 0.1, spec.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    const reach = height * 0.8;
    dummy.position.set(spec.x, 0.24, spec.z);
    dummy.scale.set(reach, 1, reach);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
    haloPositions.set([spec.x, height - 0.1, spec.z], i * 3);
  });
  group.add(poles, heads, bulbs, pools);

  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPositions, 3));
  const haloMat = new THREE.PointsMaterial({
    map: radialTexture([
      [0, 'rgba(255, 214, 150, 0.9)'],
      [0.35, 'rgba(255, 190, 110, 0.28)'],
      [1, 'rgba(255, 190, 110, 0)']
    ]),
    size: 1.9,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  group.add(halos);

  return {
    group,
    bulbMaterial,
    glowMaterials: [
      { material: poolMat, base: 0.6 },
      { material: haloMat, base: 0.85 }
    ]
  };
}

/** District entrance signs. */
export function createSigns(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x39415e, roughness: 0.6, metalness: 0.3 });
  for (const sign of plan.signs) {
    const post = new THREE.Group();
    post.position.set(sign.x, 0, sign.z);
    post.rotation.y = sign.rotationY;
    group.add(post);
    for (const px of [-2.2, 2.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.2, 6), poleMat);
      pole.position.set(px, 2.1, 0);
      post.add(pole);
    }
    const texture = signTexture(sign.district.name, sign.district.color, emblemUrl(sign.district.id));
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
    board.position.set(0, 3.6, 0);
    post.add(board);
  }

  // "Lot for sale" boards on unbuilt lots — room for whatever gets built next.
  if (plan.vacancies.length > 0) {
    const texture = vacancyTexture();
    const boardMat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.35,
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    const stakeMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.9 });
    for (const lot of plan.vacancies) {
      const stand = new THREE.Group();
      stand.position.set(lot.x, 0.2, lot.z);
      stand.rotation.y = lot.rotationY;
      for (const px of [-0.7, 0.7]) {
        const stake = new THREE.Mesh(BOX_GEO, stakeMat);
        stake.scale.set(0.1, 1.9, 0.1);
        stake.position.set(px, 0.95, 0);
        stand.add(stake);
      }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.25), boardMat);
      board.position.y = 1.4;
      stand.add(board);
      group.add(stand);
    }
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
    ring.userData.dynamic = true;
    ring.rotation.x = Math.PI / 2 + (i - 1) * 0.18;
    group.add(ring);
    rings.push(ring);
  }

  const glow = new THREE.PointLight(0x88a2ff, 420, 90, 2);
  glow.position.y = 24;
  group.add(glow);

  // One invisible hit volume stands in for the whole monument.
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.4, 27, 8), new THREE.MeshBasicMaterial());
  hit.position.y = 13.5;
  hit.visible = false;
  hit.userData.keep = true;
  group.add(hit);
  pickMeshes.length = 0;
  pickMeshes.push(hit);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 5.4, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x10162c, roughness: 0.8 })
  );
  base.position.y = 0.6;
  group.add(base);

  for (const mesh of pickMeshes) mesh.userData.projectId = '__about__';

  return { group, rings, pickMeshes };
}

const CLOUD_NIGHT = new THREE.Color(0x232c48);
const CLOUD_DAY = new THREE.Color(0xffffff);

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
    const cmat = cloudMats[0] ?? new THREE.SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      fog: false
    });
    if (cloudMats.length === 0) cloudMats.push(cmat);
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
        wing.userData.skipShadow = true; // no bird-shaped blots on the plaza
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
    for (const cmat of cloudMats) {
      cmat.opacity = cloudOpacity;
      cmat.color.lerpColors(CLOUD_NIGHT, CLOUD_DAY, dayMix);
    }

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
