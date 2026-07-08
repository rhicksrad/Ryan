import * as THREE from 'three';
import type { Project, District } from '../data';
import { tierOf, isUnderConstruction } from '../data';
import { rngFor } from './rng';
import { windowTexture, houseWindowTexture, billboardTexture, labelSprite } from './textures';

export interface BuildingHandle {
  project: Project;
  group: THREE.Group;
  /** Meshes that participate in raycast picking. */
  pickMeshes: THREE.Mesh[];
  /** Materials whose emissive pulses when hovered/selected (the curb outline). */
  glowMaterials: THREE.MeshStandardMaterial[];
  baseEmissive: number[];
  /** Floating name label, faded by camera distance. */
  label: THREE.Sprite;
  /** Billboard materials that flicker at night. */
  billboards: THREE.MeshStandardMaterial[];
  /** Rotating crane jib + blinking warning beacon, when under construction. */
  craneJib: THREE.Group | null;
  craneBeacon: THREE.MeshStandardMaterial | null;
  height: number;
  footprint: number;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

// ---------------------------------------------------------------------------
// Shared material factories. Fresh instances per building so hover/day-night
// tweaks never bleed between neighbors.
// ---------------------------------------------------------------------------

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
}

function trimMaterial(accent: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(accent),
    emissive: new THREE.Color(accent),
    emissiveIntensity: 1.4,
    roughness: 0.4,
    metalness: 0.1
  });
}

function warmGlass(intensity = 1.3): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffcf87,
    emissive: 0xffb85e,
    emissiveIntensity: intensity,
    roughness: 0.5
  });
}

// ---------------------------------------------------------------------------
// Reusable geometry helpers.
// ---------------------------------------------------------------------------

/** Axis-aligned block. */
function block(
  group: THREE.Group,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

/** A pitched gable roof (triangular prism); ridge runs along the depth axis. */
function gableRoof(
  width: number,
  depth: number,
  peak: number,
  material: THREE.Material
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, peak);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, material);
}

/** Framed, lit window with optional shutters. Returns a small group facing +Z. */
function window(
  frameMat: THREE.Material,
  glassMat: THREE.Material,
  w: number,
  h: number,
  shutters: THREE.Material | null
): THREE.Group {
  const g = new THREE.Group();
  block(g, frameMat, w + 0.14, h + 0.14, 0.08, 0, 0, 0);
  block(g, glassMat, w, h, 0.06, 0, 0, 0.04);
  // muntin cross
  block(g, frameMat, w, 0.05, 0.09, 0, 0, 0.05);
  block(g, frameMat, 0.05, h, 0.09, 0, 0, 0.05);
  if (shutters) {
    block(g, shutters, 0.12, h + 0.1, 0.06, -(w / 2 + 0.12), 0, 0.02);
    block(g, shutters, 0.12, h + 0.1, 0.06, w / 2 + 0.12, 0, 0.02);
  }
  return g;
}

/** Rounded shrub. */
function shrub(group: THREE.Group, x: number, z: number, s: number, rand: () => number): void {
  const bush = new THREE.Mesh(
    new THREE.IcosahedronGeometry(s, 0),
    mat(0x1f4b30, { roughness: 1, flatShading: true })
  );
  bush.position.set(x, s * 0.7, z);
  bush.rotation.set(rand(), rand(), rand());
  group.add(bush);
}

// ---------------------------------------------------------------------------
// TIER 0 — dilapidated wooden shack.
// ---------------------------------------------------------------------------

function buildShack(group: THREE.Group, rand: () => number): number {
  const plankTones = [0x5a4a33, 0x4a3d2b, 0x6b5940, 0x3f3526];
  const plankMat = (i: number) =>
    mat(plankTones[i % plankTones.length], { roughness: 1, flatShading: true, emissive: 0x140f08, emissiveIntensity: 0.4 });

  const w = 2.6 + rand() * 0.6;
  const d = 2.2 + rand() * 0.5;
  const h = 1.8 + rand() * 0.4;
  const lean = (rand() - 0.5) * 0.08;

  const shell = new THREE.Group();
  shell.rotation.z = lean; // the whole thing leans

  // Ragged vertical-plank walls: each plank its own height and tiny gap.
  const buildWall = (length: number, facing: 'x' | 'z', doorGap: boolean) => {
    const planks = Math.max(4, Math.round(length / 0.34));
    for (let i = 0; i < planks; i += 1) {
      const t = i / (planks - 1) - 0.5;
      const along = t * length;
      const inDoor = doorGap && Math.abs(along) < 0.4;
      if (inDoor) continue;
      const ph = h * (0.82 + rand() * 0.25); // uneven tops
      const pw = 0.3;
      const m = new THREE.Mesh(BOX, plankMat(i));
      if (facing === 'z') {
        m.scale.set(pw, ph, 0.12);
        m.position.set(along, ph / 2, d / 2);
      } else {
        m.scale.set(0.12, ph, pw);
        m.position.set(w / 2, ph / 2, along);
      }
      m.rotation.z = (rand() - 0.5) * 0.05;
      shell.add(m);
    }
  };
  buildWall(w, 'z', true); // front (with door gap)
  block(shell, plankMat(1), w, h, 0.12, 0, h / 2, -d / 2); // back (solid)
  buildWall(d, 'x', false); // right
  const leftWall = block(shell, plankMat(2), 0.12, h, d, -w / 2, h / 2, 0);
  leftWall.rotation.x = (rand() - 0.5) * 0.04;

  // Dark interior so the plank gaps read as gaps.
  block(shell, mat(0x0a0806, { roughness: 1 }), w - 0.25, h - 0.2, d - 0.25, 0, h / 2, 0);

  // Two mismatched, sagging roof boards leaving a gap.
  const roofMat = mat(0x2a2419, { roughness: 1, flatShading: true });
  const r1 = block(shell, roofMat, w * 0.62, 0.12, d + 0.7, -w * 0.22, h + 0.15, 0);
  r1.rotation.z = 0.12;
  const r2 = block(shell, roofMat, w * 0.55, 0.12, d + 0.5, w * 0.28, h + 0.22, 0);
  r2.rotation.z = -0.16;

  // Crooked stovepipe.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 6), mat(0x1c1c22, { metalness: 0.4 }));
  pipe.position.set(w * 0.2, h + 0.7, -d * 0.2);
  pipe.rotation.z = 0.2;
  shell.add(pipe);

  // Boarded-up window: two planks nailed over a dark hole on the right wall.
  block(shell, mat(0x0a0806), 0.06, 0.5, 0.5, w / 2 + 0.02, h * 0.55, 0);
  const b1 = block(shell, plankMat(0), 0.06, 0.14, 0.7, w / 2 + 0.05, h * 0.6, 0);
  b1.rotation.x = 0.15;
  const b2 = block(shell, plankMat(3), 0.06, 0.14, 0.7, w / 2 + 0.05, h * 0.45, 0);
  b2.rotation.x = -0.1;

  group.add(shell);

  // A leaning support plank propping up the front.
  const prop = new THREE.Mesh(BOX, plankMat(1));
  prop.scale.set(0.1, h * 1.1, 0.1);
  prop.position.set(-w * 0.4, h * 0.5, d / 2 + 0.35);
  prop.rotation.x = 0.32;
  group.add(prop);

  // Junk in the yard.
  if (rand() < 0.9) {
    const crate = block(group, plankMat(2), 0.6, 0.6, 0.6, -w * 0.7, 0.3, d * 0.7);
    crate.rotation.y = rand();
  }
  if (rand() < 0.6) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.7, 8), mat(0x3a3a30, { metalness: 0.3 }));
    barrel.position.set(w * 0.75, 0.35, d * 0.55);
    group.add(barrel);
  }
  if (rand() < 0.5) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.11, 6, 12), mat(0x141414, { roughness: 1 }));
    tire.rotation.x = Math.PI / 2;
    tire.position.set(w * 0.5 + rand() * 0.5, 0.11, -d * 0.6);
    group.add(tire);
  }

  return h + 1.2;
}

// ---------------------------------------------------------------------------
// TIER 1 — modest suburban house with all the trimmings.
// ---------------------------------------------------------------------------

function buildHouse(group: THREE.Group, rand: () => number): number {
  const sidings = [0xb7b0a0, 0x9fb0c4, 0xc4a99f, 0x9ec0a8, 0xcabf9a];
  const siding = mat(sidings[Math.floor(rand() * sidings.length)]);
  const trimWhite = mat(0xecebe4);
  const roofMat = mat(0x53342c, { flatShading: true });
  const doorColors = [0x8a3b32, 0x2f5a44, 0x334a7a, 0x5a3c66];

  const w = 3.6 + rand() * 0.6;
  const d = 3 + rand() * 0.5;
  const h = 2.5 + rand() * 0.3;

  // Main body + foundation strip.
  block(group, mat(0x6a6258), w + 0.2, 0.3, d + 0.2, 0, 0.15, 0);
  block(group, siding, w, h, d, 0, h / 2 + 0.2, 0);

  // Gable roof with overhang.
  const peak = 1.5 + rand() * 0.3;
  const roof = gableRoof(w + 0.6, d + 0.6, peak, roofMat);
  roof.position.y = h + 0.2;
  group.add(roof);
  // fascia trim under the eaves
  block(group, trimWhite, w + 0.6, 0.12, d + 0.6, 0, h + 0.22, 0);

  // Brick chimney.
  const chimney = block(group, mat(0x6e4038), 0.5, 1.3, 0.5, w * 0.28, h + 0.9, -d * 0.1);
  block(group, mat(0x2a2a2a), 0.6, 0.12, 0.6, w * 0.28, h + 1.55, -d * 0.1);

  // Front door with stoop + a warm porch light.
  const door = block(group, mat(doorColors[Math.floor(rand() * doorColors.length)]), 0.7, 1.3, 0.1, 0, 0.85, d / 2 + 0.02);
  door.userData.noLabel = true;
  block(group, trimWhite, 0.9, 1.5, 0.06, 0, 0.95, d / 2 + 0.005); // door frame
  block(group, mat(0x8a8378), 1.1, 0.12, 0.6, 0, 0.26, d / 2 + 0.3); // stoop
  block(group, warmGlass(1.6), 0.12, 0.12, 0.12, 0.55, 1.5, d / 2 + 0.1); // porch light

  // Little porch roof on two posts.
  block(group, mat(0x8a8378), 0.1, 1.1, 0.1, -0.55, 0.75, d / 2 + 0.55);
  block(group, mat(0x8a8378), 0.1, 1.1, 0.1, 0.55, 0.75, d / 2 + 0.55);
  const porchRoof = block(group, roofMat, 1.6, 0.12, 0.8, 0, 1.35, d / 2 + 0.4);
  porchRoof.rotation.x = -0.12;

  // Windows with shutters (warm-lit), front + sides.
  const glass = houseWindowTexture(rand);
  const glassMat = new THREE.MeshStandardMaterial({
    map: glass,
    emissiveMap: glass,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    roughness: 0.6
  });
  const shutterMat = mat(0x3a4a5a);
  const frameMat = trimWhite;
  for (const wx of [-w * 0.3, w * 0.3]) {
    const win = window(frameMat, glassMat, 0.7, 0.85, shutterMat);
    win.position.set(wx, h * 0.62 + 0.2, d / 2 + 0.03);
    group.add(win);
  }
  for (const side of [-1, 1]) {
    const win = window(frameMat, glassMat, 0.6, 0.8, shutterMat);
    win.rotation.y = side * Math.PI / 2;
    win.position.set(side * (w / 2 + 0.03), h * 0.62 + 0.2, 0);
    group.add(win);
  }

  // Attached single-car garage.
  if (rand() < 0.6) {
    const gw = 1.9;
    const gh = 1.7;
    const gd = 2.4;
    const gx = w / 2 + gw / 2 - 0.1;
    block(group, siding, gw, gh, gd, gx, gh / 2 + 0.2, d * 0.1);
    const garageRoof = gableRoof(gw + 0.4, gd + 0.4, 0.8, roofMat);
    garageRoof.position.set(gx, gh + 0.2, d * 0.1);
    garageRoof.rotation.y = Math.PI / 2;
    group.add(garageRoof);
    // garage door with panel lines
    block(group, mat(0xd8d4c8), gw * 0.85, gh * 0.75, 0.08, gx, gh * 0.42 + 0.2, d * 0.1 + gd / 2 + 0.02);
    for (let i = 1; i < 3; i += 1) {
      block(group, mat(0xb0aca0), gw * 0.85, 0.04, 0.1, gx, 0.2 + (gh * 0.75) * (i / 3), d * 0.1 + gd / 2 + 0.05);
    }
  }

  // Yard: path, hedges, mailbox.
  block(group, mat(0x8a8378), 0.7, 0.06, 1.6, 0, 0.24, d / 2 + 1.2); // path
  shrub(group, -w * 0.45, d / 2 + 0.5, 0.35, rand);
  shrub(group, w * 0.45, d / 2 + 0.5, 0.3, rand);
  const mailPost = block(group, mat(0x4a3d2b), 0.08, 0.7, 0.08, -0.7, 0.35, d / 2 + 1.5);
  void mailPost;
  block(group, mat(0x3a4a5a), 0.3, 0.16, 0.18, -0.7, 0.72, d / 2 + 1.5);

  return h + peak + 0.4;
}

// ---------------------------------------------------------------------------
// TIER 2 — large two-story suburban house (the McMansion).
// ---------------------------------------------------------------------------

function buildLargeHouse(group: THREE.Group, rand: () => number): number {
  const sidings = [0xc9c0ac, 0xb0bcd0, 0xd0b6ac, 0xb8ccb6];
  const siding = mat(sidings[Math.floor(rand() * sidings.length)]);
  const brick = mat(0x9a6a54);
  const trimWhite = mat(0xf0efe8);
  const roofMat = mat(0x45322c, { flatShading: true });

  const w = 5.4 + rand() * 0.8;
  const d = 4.2 + rand() * 0.6;
  const floor1 = 2.4;
  const floor2 = 2.2;

  block(group, mat(0x5f574d), w + 0.3, 0.3, d + 0.3, 0, 0.15, 0);
  // Brick first floor, sided second floor.
  block(group, brick, w, floor1, d, 0, floor1 / 2 + 0.2, 0);
  block(group, siding, w * 0.96, floor2, d * 0.96, 0, floor1 + floor2 / 2 + 0.2, 0);

  const bodyTop = floor1 + floor2 + 0.2;

  // Main cross-gable roof + a front-facing gable dormer.
  const peak = 1.8;
  const mainRoof = gableRoof(w + 0.7, d + 0.7, peak, roofMat);
  mainRoof.position.y = bodyTop;
  group.add(mainRoof);
  block(group, trimWhite, w + 0.7, 0.12, d + 0.7, 0, bodyTop + 0.02, 0);
  const dormer = gableRoof(w * 0.42, d * 0.6, peak * 0.8, roofMat);
  dormer.rotation.y = Math.PI / 2;
  dormer.position.set(0, bodyTop, d * 0.28);
  group.add(dormer);

  // Two chimneys.
  for (const cx of [-w * 0.35, w * 0.4]) {
    block(group, brick, 0.5, 1.4, 0.5, cx, bodyTop + 0.9, -d * 0.2);
    block(group, mat(0x2a2a2a), 0.6, 0.12, 0.6, cx, bodyTop + 1.6, -d * 0.2);
  }

  // Grand portico: pediment on four columns.
  const colH = floor1 + 0.3;
  for (const cx of [-1.3, -0.5, 0.5, 1.3]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, colH, 10), trimWhite);
    col.position.set(cx, colH / 2 + 0.2, d / 2 + 1.1);
    group.add(col);
  }
  block(group, trimWhite, 3.4, 0.3, 1.4, 0, colH + 0.35, d / 2 + 0.7); // entablature
  const ped = gableRoof(3.4, 1.4, 0.7, trimWhite);
  ped.position.set(0, colH + 0.5, d / 2 + 0.7);
  group.add(ped);
  // Double front door.
  block(group, mat(0x3a2a22), 1.2, 1.8, 0.12, 0, 1.1, d / 2 + 0.02);
  block(group, warmGlass(1.4), 0.16, 0.16, 0.14, 0, 2.1, d / 2 + 0.12); // entry lantern

  // Bay window bumping out the front-left.
  const bay = block(group, siding, 1.4, 1.6, 0.5, -w * 0.28, floor1 * 0.55 + 0.2, d / 2 + 0.25);
  void bay;
  const glass = houseWindowTexture(rand);
  const glassMat = new THREE.MeshStandardMaterial({
    map: glass, emissiveMap: glass, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.6
  });
  const shutterMat = mat(0x2f3a2f);
  // Upper-floor windows across the front.
  for (const wx of [-w * 0.28, 0, w * 0.28]) {
    const win = window(trimWhite, glassMat, 0.7, 0.9, shutterMat);
    win.position.set(wx, floor1 + floor2 * 0.55 + 0.2, d / 2 + 0.02);
    group.add(win);
  }
  // Side windows.
  for (const side of [-1, 1]) {
    for (const wy of [floor1 * 0.55 + 0.2, floor1 + floor2 * 0.55 + 0.2]) {
      const win = window(trimWhite, glassMat, 0.6, 0.8, shutterMat);
      win.rotation.y = side * Math.PI / 2;
      win.position.set(side * (w / 2 + 0.02), wy, d * 0.15);
      group.add(win);
    }
  }

  // Two-car garage wing.
  const gw = 3.2;
  const gh = 2.1;
  const gd = 3.4;
  const gx = w / 2 + gw / 2 - 0.2;
  block(group, siding, gw, gh, gd, gx, gh / 2 + 0.2, -d * 0.05);
  const garageRoof = gableRoof(gw + 0.4, gd + 0.4, 1, roofMat);
  garageRoof.position.set(gx, gh + 0.2, -d * 0.05);
  garageRoof.rotation.y = Math.PI / 2;
  group.add(garageRoof);
  for (const doorX of [gx - gw * 0.24, gx + gw * 0.24]) {
    block(group, mat(0xdad6ca), gw * 0.4, gh * 0.7, 0.08, doorX, gh * 0.4 + 0.2, -d * 0.05 + gd / 2 + 0.02);
  }

  // Landscaping: driveway, hedges, lawn shrubs.
  block(group, mat(0x555a63), 3, 0.06, 2.4, gx, 0.24, -d * 0.05 + gd / 2 + 1.2); // driveway
  for (const hx of [-w * 0.4, -w * 0.15, w * 0.15]) {
    shrub(group, hx, d / 2 + 0.6, 0.4, rand);
  }
  block(group, mat(0x9a948a), 1, 0.06, 2, 0, 0.24, d / 2 + 1.6); // walkway

  return bodyTop + peak + 0.4;
}

// ---------------------------------------------------------------------------
// TIER 3 — commercial mid-rise (brick, storefront, fire escape, rooftop units).
// ---------------------------------------------------------------------------

function buildCommercial(
  group: THREE.Group,
  project: Project,
  district: District,
  rand: () => number
): number {
  const w = 6 + rand() * 1;
  const d = 5.5 + rand() * 0.8;
  const floors = 3 + Math.floor((project.commits - 60) / 30); // 3–5 storeys
  const floorH = 2.6;
  const groundH = 3;
  const bodyH = groundH + floors * floorH;

  const brickTone = rand() < 0.5 ? 0x8a5a44 : 0x6a6470;
  const brick = mat(brickTone, { roughness: 0.9 });

  // Upper floors: emissive district-tinted window bands wrapped on a box.
  const winTex = windowTexture(district.color, rand);
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  winTex.repeat.set(3, floors);
  const upperMat = new THREE.MeshStandardMaterial({
    color: 0x1c2338,
    roughness: 0.7,
    metalness: 0.2,
    map: winTex,
    emissive: 0xffffff,
    emissiveMap: winTex,
    emissiveIntensity: 1
  });
  block(group, upperMat, w, floors * floorH, d, 0, groundH + (floors * floorH) / 2, 0);

  // Brick pilasters at the corners to frame the window wall.
  for (const cx of [-w / 2, w / 2]) {
    for (const cz of [-d / 2, d / 2]) {
      block(group, brick, 0.5, floors * floorH, 0.5, cx, groundH + (floors * floorH) / 2, cz);
    }
  }

  // Ground-floor storefront: dark base, big glowing glass, awning, blade sign.
  block(group, brick, w, groundH, d, 0, groundH / 2, 0);
  const storefront = new THREE.MeshStandardMaterial({
    color: 0x0c1020,
    emissive: new THREE.Color(district.color),
    emissiveIntensity: 0.9,
    roughness: 0.3,
    metalness: 0.5
  });
  block(group, storefront, w * 0.8, groundH * 0.6, 0.1, 0, groundH * 0.45, d / 2 + 0.02);
  // mullions
  for (let i = -2; i <= 2; i += 1) {
    block(group, brick, 0.12, groundH * 0.6, 0.14, i * (w * 0.8) / 5, groundH * 0.45, d / 2 + 0.05);
  }
  // entrance
  block(group, mat(0x14161f, { metalness: 0.4 }), 1, groundH * 0.55, 0.12, 0, groundH * 0.3, d / 2 + 0.08);
  // striped awning
  const awning = block(group, trimMaterial(district.color), w * 0.85, 0.14, 1.1, 0, groundH * 0.72, d / 2 + 0.55);
  awning.rotation.x = -0.18;
  // projecting blade sign
  const bladeTex = billboardTexture(project.title, project.lang, district.color);
  const blade = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 2.2),
    new THREE.MeshStandardMaterial({ map: bladeTex, emissive: 0xffffff, emissiveMap: bladeTex, emissiveIntensity: 1.2, side: THREE.DoubleSide, roughness: 0.6 })
  );
  blade.rotation.y = Math.PI / 2;
  blade.position.set(w / 2 + 0.15, groundH + floorH, d / 2 - 1);
  group.add(blade);

  // Cornice + parapet.
  block(group, brick, w + 0.5, 0.5, d + 0.5, 0, bodyH + 0.05, 0); // cornice overhang
  block(group, brick, w, 0.7, d, 0, bodyH + 0.35, 0); // parapet

  // Rooftop clutter: HVAC units, a water tower, a stair bulkhead.
  const roofMat = mat(0x3a3f4c, { metalness: 0.3 });
  for (let i = 0; i < 3; i += 1) {
    block(group, roofMat, 0.9 + rand() * 0.5, 0.6, 0.9 + rand() * 0.4, (rand() - 0.5) * w * 0.6, bodyH + 0.7, (rand() - 0.5) * d * 0.6);
  }
  // water tower on legs
  const tankX = w * 0.28;
  const tankZ = -d * 0.25;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 10), mat(0x4a3d2b, { roughness: 1 }));
  tank.position.set(tankX, bodyH + 1.7, tankZ);
  group.add(tank);
  const tankRoof = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.6, 10), mat(0x3a2f22));
  tankRoof.position.set(tankX, bodyH + 2.5, tankZ);
  group.add(tankRoof);
  for (const lx of [-0.4, 0.4]) {
    for (const lz of [-0.4, 0.4]) {
      block(group, roofMat, 0.08, 1.2, 0.08, tankX + lx, bodyH + 0.9, tankZ + lz);
    }
  }
  block(group, roofMat, 1.4, 1, 1.4, -w * 0.25, bodyH + 0.85, d * 0.2); // stair bulkhead

  // Fire escape zigzagging down one side.
  const feMat = mat(0x20242e, { metalness: 0.5, roughness: 0.6 });
  const fz = d / 2 + 0.15;
  for (let f = 1; f <= floors; f += 1) {
    const y = groundH + f * floorH - floorH * 0.35;
    block(group, feMat, 2.2, 0.08, 0.9, -w * 0.2, y, fz + 0.3); // platform
    block(group, feMat, 2.2, 0.5, 0.05, -w * 0.2, y + 0.28, fz + 0.72); // railing
    const ladder = block(group, feMat, 0.5, 0.06, floorH * 0.9, -w * 0.2 + (f % 2 ? 0.7 : -0.7), y - floorH * 0.5, fz + 0.3);
    ladder.rotation.x = 0.5;
  }

  return bodyH + 0.7;
}

// ---------------------------------------------------------------------------
// TIER 4 — downtown skyscraper with billboards.
// ---------------------------------------------------------------------------

function buildSkyscraper(
  group: THREE.Group,
  project: Project,
  district: District,
  rand: () => number,
  billboards: THREE.MeshStandardMaterial[]
): { top: number; footprint: number } {
  const height = 18 + (Math.log10(project.commits) - 2.18) * 32 + rand() * 3;
  const footprint = 7.5 + rand() * 2;
  const archetype = Math.floor(rand() * 3);

  const tex = windowTexture(district.color, rand);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const material = new THREE.MeshStandardMaterial({
    color: 0x131a2e,
    roughness: 0.68,
    metalness: 0.3,
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 1.05
  });

  // Lobby base — brighter, glassier, wider than the shaft.
  const lobbyH = 2.6;
  block(group, new THREE.MeshStandardMaterial({
    color: 0x0c1020, emissive: new THREE.Color(district.color), emissiveIntensity: 1, roughness: 0.3, metalness: 0.5
  }), footprint * 1.15, lobbyH, footprint * 1.15, 0, lobbyH / 2, 0);

  const trim = trimMaterial(district.color);
  const mullion = mat(0x0c1020, { metalness: 0.4 });
  let topY = lobbyH;

  if (archetype === 0) {
    // Stepped setback tower.
    const tiers = 3 + Math.floor(rand() * 2);
    let width = footprint;
    let y = lobbyH;
    const shaft = (height - lobbyH) / tiers;
    for (let t = 0; t < tiers; t += 1) {
      const th = shaft * (t === 0 ? 1.15 : 0.95);
      const rep = tex.clone();
      rep.wrapS = rep.wrapT = THREE.RepeatWrapping;
      rep.repeat.set(Math.max(2, Math.round(width / 2)), Math.max(3, Math.round(th / 2)));
      const m = material.clone();
      m.map = rep;
      m.emissiveMap = rep;
      block(group, m, width, th, width, 0, y + th / 2, 0);
      // vertical mullion ribs
      for (const s of [-1, 1]) {
        block(group, mullion, 0.14, th, width, s * width * 0.34, y + th / 2, 0);
        block(group, mullion, width, th, 0.14, 0, y + th / 2, s * width * 0.34);
      }
      y += th;
      width *= 0.78;
    }
    topY = y;
  } else if (archetype === 1) {
    // Slab tower with a strong vertical grid.
    const bw = footprint * 1.25;
    const bd = footprint * 0.85;
    const sh = height - lobbyH;
    tex.repeat.set(Math.round(bw / 1.6), Math.round(sh / 1.8));
    block(group, material, bw, sh, bd, 0, lobbyH + sh / 2, 0);
    for (let i = -2; i <= 2; i += 1) {
      block(group, mullion, 0.16, sh, bd + 0.02, (i / 2) * bw * 0.5, lobbyH + sh / 2, 0);
    }
    topY = height;
  } else {
    // Cylindrical tower.
    const sh = height - lobbyH;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(footprint * 0.5, footprint * 0.6, sh, 16), material);
    cyl.position.y = lobbyH + sh / 2;
    tex.repeat.set(10, Math.round(sh / 2));
    group.add(cyl);
    topY = height;
  }

  // Glowing crown ring + mechanical cap.
  block(group, mat(0x2a3048, { metalness: 0.5 }), footprint * 0.72, 1, footprint * 0.72, 0, topY + 0.5, 0);
  const crown = new THREE.Mesh(BOX, trim);
  crown.scale.set(footprint * 0.78, 0.35, footprint * 0.78);
  crown.position.y = topY + 1.1;
  group.add(crown);

  // Antenna mast with beacon.
  const mastH = 3 + rand() * 3;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, mastH, 6), mat(0x39415e, { metalness: 0.5 }));
  mast.position.y = topY + 1.2 + mastH / 2;
  group.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), trim);
  beacon.position.y = topY + 1.2 + mastH;
  group.add(beacon);

  // Billboards — the flashier the project, the more it runs.
  const lines = [project.blurb.split(/[.!—]/)[0].trim(), ...project.quotes];
  const count = project.commits >= 500 ? 3 : project.commits >= 250 ? 2 : 1;
  const sides: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (let i = 0; i < count; i += 1) {
    const boardW = footprint * 1.15;
    const boardH = boardW / 2;
    const texture = billboardTexture(project.title, (lines[i % lines.length] ?? '').slice(0, 44), district.color);
    const bmat = new THREE.MeshStandardMaterial({
      map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1.25, roughness: 0.6
    });
    billboards.push(bmat);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), bmat);
    const [sx, sz] = sides[(i * 2 + (rand() < 0.5 ? 1 : 0)) % 4];
    const offset = footprint * (archetype === 1 ? 0.66 : 0.52) + 0.35;
    const y = topY * (0.5 + i * 0.17);
    board.position.set(sx * offset, y, sz * offset);
    board.rotation.y = Math.atan2(sx, sz);
    group.add(board);
    block(group, mat(0x2a3050), sx === 0 ? boardW + 0.3 : 0.25, boardH + 0.3, sz === 0 ? boardW + 0.3 : 0.25, sx * (offset - 0.15), y, sz * (offset - 0.15));
  }

  return { top: topY + 1.2 + mastH, footprint };
}

// ---------------------------------------------------------------------------
// Assembly.
// ---------------------------------------------------------------------------

/** Tower crane + scaffolding for projects pushed to in the last 30 days. */
function buildConstructionSite(
  group: THREE.Group,
  buildingTop: number,
  footprint: number,
  rand: () => number
): { jib: THREE.Group; beacon: THREE.MeshStandardMaterial } {
  const steel = mat(0xe8a13c, { roughness: 0.6, metalness: 0.35 });
  const dark = mat(0x54432a, { roughness: 0.8 });

  const mastHeight = buildingTop + 4.5;
  const cx = footprint * 0.75 + 1;
  const cz = footprint * 0.55 + 1;

  block(group, steel, 0.55, mastHeight, 0.55, cx, mastHeight / 2, cz);
  for (let y = 1.4; y < mastHeight - 1; y += 2.4) {
    const brace = block(group, dark, 0.75, 0.1, 0.75, cx, y, cz);
    brace.rotation.y = Math.PI / 4;
  }

  const jib = new THREE.Group();
  jib.position.set(cx, mastHeight, cz);
  const jibLength = footprint * 1.4 + 4;
  block(jib, steel, jibLength, 0.32, 0.32, jibLength / 2 - 1.2, 0, 0);
  block(jib, dark, 1.1, 0.8, 0.9, -2, 0, 0);
  block(jib, dark, 0.8, 0.8, 0.8, 0, -0.4, 0);
  const cableDrop = mastHeight * 0.42;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, cableDrop, 4), dark);
  cable.position.set(jibLength * 0.62, -cableDrop / 2, 0);
  jib.add(cable);
  block(jib, dark, 0.9, 0.7, 0.9, jibLength * 0.62, -cableDrop - 0.35, 0);
  group.add(jib);

  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff3020, emissiveIntensity: 2, roughness: 0.4 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), beaconMat);
  beacon.position.set(cx, mastHeight + 0.5, cz);
  group.add(beacon);

  const scaffH = Math.min(buildingTop * 0.85, 10);
  const scaffW = footprint * 1.1;
  const sz = footprint * 0.62 + 0.5;
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, scaffH, 4);
  for (const px of [-scaffW / 2, 0, scaffW / 2]) {
    for (const pz of [sz, sz + 0.8]) {
      const pole = new THREE.Mesh(poleGeo, steel);
      pole.position.set(px, scaffH / 2, pz);
      group.add(pole);
    }
  }
  for (let level = 1; level < scaffH / 2.2 + 1; level += 1) {
    block(group, dark, scaffW + 0.4, 0.09, 1, 0, level * 2.2, sz + 0.4);
  }

  const coneMat = mat(0xff7038, { emissive: 0xb03010, emissiveIntensity: 0.5, roughness: 0.7 });
  for (let i = 0; i < 3; i += 1) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), coneMat);
    cone.position.set(-cx + i * 1.1 + rand() * 0.3, 0.31, cz + rand() * 0.6);
    group.add(cone);
  }

  return { jib, beacon: beaconMat };
}

/** Procedurally build one project's home. Everything derives from real repo stats. */
export function createBuilding(project: Project, district: District): BuildingHandle {
  const rand = rngFor(project.repo);
  const group = new THREE.Group();
  const billboards: THREE.MeshStandardMaterial[] = [];
  const tier = tierOf(project.commits);

  let top = 0;
  let footprint = 4;
  if (tier === 0) {
    top = buildShack(group, rand);
    footprint = 3.2;
  } else if (tier === 1) {
    top = buildHouse(group, rand);
    footprint = 4.8;
  } else if (tier === 2) {
    top = buildLargeHouse(group, rand);
    footprint = 6.4;
  } else if (tier === 3) {
    top = buildCommercial(group, project, district, rand);
    footprint = 6.8;
  } else {
    const result = buildSkyscraper(group, project, district, rand, billboards);
    top = result.top;
    footprint = result.footprint;
  }

  // Soft glowing curb marks every project lot — a district-colored border.
  const curbMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(district.color),
    emissive: new THREE.Color(district.color),
    emissiveIntensity: 0.55,
    roughness: 0.6,
    transparent: true,
    opacity: 0.8
  });
  const curbSize = footprint * 1.2 + 1;
  for (const [dx, dz, cw, cd] of [
    [0, -curbSize / 2, curbSize, 0.22],
    [0, curbSize / 2, curbSize, 0.22],
    [-curbSize / 2, 0, 0.22, curbSize],
    [curbSize / 2, 0, 0.22, curbSize]
  ] as const) {
    block(group, curbMat, cw, 0.09, cd, dx, 0.05, dz);
  }

  // Recently pushed projects are visibly under construction.
  let craneJib: THREE.Group | null = null;
  let craneBeacon: THREE.MeshStandardMaterial | null = null;
  if (isUnderConstruction(project)) {
    const site = buildConstructionSite(group, top, footprint, rand);
    craneJib = site.jib;
    craneBeacon = site.beacon;
  }

  // Floating name label.
  const label = labelSprite(project.title, district.color);
  label.position.y = (craneJib ? top + 4.5 : top) + 1.6;
  group.add(label);

  group.rotation.y = tier === 4 ? 0 : (rand() - 0.5) * 0.5;

  const pickMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.userData.projectId = project.id;
      pickMeshes.push(obj);
    }
  });

  const glowMaterials = [curbMat];

  return {
    project,
    group,
    pickMeshes,
    glowMaterials,
    baseEmissive: glowMaterials.map((m) => m.emissiveIntensity),
    label,
    billboards,
    craneJib,
    craneBeacon,
    height: top,
    footprint
  };
}
