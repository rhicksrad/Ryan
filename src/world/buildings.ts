import * as THREE from 'three';
import type { Project, District } from '../data';
import { tierOf, isUnderConstruction } from '../data';
import { rngFor } from './rng';
import { facadeTextures, houseWindowTexture, billboardTexture, labelSprite, type Facade } from './textures';
import { posterUrl } from '../art';
import { weather } from './surface';

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
  /** Skyscrapers are named even from the opening view. */
  landmark: boolean;
  /** Curtain-wall glass, which mirrors the painted sky. */
  glass: THREE.MeshStandardMaterial[];
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

// ---------------------------------------------------------------------------
// Shared material factories. Fresh instances per building so hover/day-night
// tweaks never bleed between neighbors.
// ---------------------------------------------------------------------------

export function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
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

/** Building skin: daytime glass/masonry plus a night-only window glow. */
export function facadeMaterial(
  facade: Facade,
  opts: { roughness: number; metalness: number; glow: number }
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: facade.map,
    emissiveMap: facade.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: opts.glow,
    roughness: opts.roughness,
    metalness: opts.metalness
  });
  material.userData.dayDim = 0.97; // office lights go off in the morning
  // Streaks of weather down the wall and a darker base where it meets the street.
  return weather(material, { blotch: 0.12, blotchSize: 19, grain: 0, ground: 0.22 });
}

// ---------------------------------------------------------------------------
// Reusable geometry helpers.
// ---------------------------------------------------------------------------

/** Multiply a geometry's UVs so a texture tiles a whole number of times. */
function scaleUv(geo: THREE.BufferGeometry, su: number, sv: number, from = 0, to = Infinity): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const end = Math.min(to, uv.count);
  for (let i = from; i < end; i += 1) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}

/**
 * A box skinned with a facade. Each side's UVs are counted in whole windows, so
 * panes keep their proportions whatever the box's shape; the top and bottom get
 * a plain roof material.
 */
export function facadeBox(
  group: THREE.Group,
  skin: THREE.Material,
  roof: THREE.Material,
  facade: Facade,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  bay: number,
  floor: number
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const sv = Math.max(1, Math.round(h / floor)) / facade.rows;
  const across = (span: number) => Math.max(1, Math.round(span / bay)) / facade.cols;
  // BoxGeometry lays out 4 vertices per face in the order +x, -x, +y, -y, +z, -z.
  scaleUv(geo, across(d), sv, 0, 8);
  scaleUv(geo, across(w), sv, 16, 24);
  const mesh = new THREE.Mesh(geo, [skin, skin, roof, roof, skin, skin]);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

/** Axis-aligned block. */
export function block(
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
export function gableRoof(
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
  const sidings = [0xd8cfbb, 0xa9bdd0, 0xd3b3a4, 0xa9c9b0, 0xd9cc9c, 0xc7b8d0, 0xe3dccb, 0x9fb7b4];
  const siding = mat(sidings[Math.floor(rand() * sidings.length)]);
  const trimWhite = mat(0xf1efe6);
  const roofs = [0x6a4338, 0x4c5560, 0x7a4f3a, 0x3f5148, 0x5a4a50];
  const roofMat = mat(roofs[Math.floor(rand() * roofs.length)]);
  const doorColors = [0x8a3b32, 0x2f5a44, 0x334a7a, 0x5a3c66];

  const w = 3.6 + rand() * 0.6;
  const d = 3 + rand() * 0.5;
  const h = 2.5 + rand() * 0.3;

  // Main body + foundation strip.
  block(group, mat(0x6a6258), w + 0.2, 0.3, d + 0.2, 0, 0.15, 0);
  block(group, siding, w, h, d, 0, h / 2 + 0.2, 0);

  // Gable roof with overhang.
  const peak = 1.5 + rand() * 0.3;
  // Three roof plans, so a street of houses is not one model repeated: gable end
  // to the street, ridge along the street, or ridge along the street with a dormer.
  const plan = Math.floor(rand() * 3);
  const roof = plan === 0 ? gableRoof(w + 0.6, d + 0.6, peak, roofMat) : gableRoof(d + 0.6, w + 0.6, peak, roofMat);
  if (plan !== 0) roof.rotation.y = Math.PI / 2;
  roof.position.y = h + 0.2;
  group.add(roof);
  if (plan === 2) {
    const dormer = gableRoof(1.5, d * 0.5 + 0.5, 0.9, roofMat);
    dormer.position.set(-w * 0.18, h + 0.45, d * 0.25);
    group.add(dormer);
    block(group, trimWhite, 1.1, 0.7, 0.08, -w * 0.18, h + 0.6, d * 0.5 + 0.22);
  }
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
  const sidings = [0xd6ccb4, 0xb6c4d8, 0xdcc0b2, 0xc0d4be, 0xe4dcc8, 0xcfc1a0];
  const siding = mat(sidings[Math.floor(rand() * sidings.length)]);
  const bricks = [0xa06a52, 0x8c5a48, 0xb07c5e, 0x8a7468];
  const brick = mat(bricks[Math.floor(rand() * bricks.length)]);
  const trimWhite = mat(0xf3f1e8);
  const roofs = [0x4f3a34, 0x444c58, 0x5c4638, 0x3c4a44];
  const roofMat = mat(roofs[Math.floor(rand() * roofs.length)]);

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
  // The front gable sits over the door, off to one side, or is doubled.
  const gables = [[0], [-w * 0.24], [-w * 0.26, w * 0.26]][Math.floor(rand() * 3)];
  for (const gx of gables) {
    const dormer = gableRoof(w * (gables.length > 1 ? 0.3 : 0.42), d * 0.6, peak * (gables.length > 1 ? 0.62 : 0.8), roofMat);
    dormer.rotation.y = Math.PI / 2;
    dormer.position.set(gx, bodyTop, d * 0.28);
    group.add(dormer);
  }

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

  // Upper floors: a masonry wall with punched windows that light up at night.
  const facade = facadeTextures(
    {
      kind: 'punched',
      glass: '#4a5d78',
      frame: `#${new THREE.Color(brickTone).getHexString()}`,
      accent: district.color,
      lit: 0.38
    },
    rand
  );
  const upperMat = facadeMaterial(facade, { roughness: 0.75, metalness: 0.1, glow: 1.1 });
  facadeBox(group, upperMat, mat(0x3a3f4c), facade, w, floors * floorH, d, 0, groundH + (floors * floorH) / 2, 0, 1.5, floorH);

  // Brick pilasters at the corners to frame the window wall.
  for (const cx of [-w / 2, w / 2]) {
    for (const cz of [-d / 2, d / 2]) {
      block(group, brick, 0.5, floors * floorH, 0.5, cx, groundH + (floors * floorH) / 2, cz);
    }
  }

  // Ground-floor storefront: dark base, big glowing glass, awning, blade sign.
  block(group, brick, w, groundH, d, 0, groundH / 2, 0);
  const storefront = new THREE.MeshStandardMaterial({
    color: 0x1a2438,
    emissive: new THREE.Color('#ffd9a0').lerp(new THREE.Color(district.color), 0.35),
    emissiveIntensity: 1.3,
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
  const awning = block(group, mat(new THREE.Color(district.color).lerp(new THREE.Color(0x3a3a3a), 0.25).getHex(), { roughness: 0.8 }), w * 0.85, 0.14, 1.1, 0, groundH * 0.72, d / 2 + 0.55);
  awning.rotation.x = -0.18;
  // projecting blade sign
  const bladeTex = billboardTexture(project.title, project.lang, district.color, `${project.commits} commits`);
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

const TOWER_GLASS = ['#86a9c4', '#6fa0a6', '#98a9bd', '#6488b2', '#8ea6ad'];
const TOWER_FRAME = ['#2a3242', '#35414a', '#2e323b', '#232c40', '#3b4049'];
const TOWER_FLOOR = 1.5;
const TOWER_BAY = 1.25;

/** A right-angled wedge: full height along one edge, falling to nothing at the other. */
function wedge(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(-w / 2, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return new THREE.Mesh(geo, material);
}

function buildSkyscraper(
  group: THREE.Group,
  project: Project,
  district: District,
  rand: () => number,
  billboards: THREE.MeshStandardMaterial[],
  variant: number,
  glassOut: THREE.MeshStandardMaterial[]
): { top: number; footprint: number; roof: number } {
  const height = 20 + (Math.log10(project.commits) - 2.176) * 46 + rand() * 3;
  const footprint = 7.5 + rand() * 2;
  const archetype = ((variant % 5) + 5) % 5;

  // Glass leans a little toward the district color so each skyline has a family look.
  const glass = new THREE.Color(TOWER_GLASS[archetype]).lerp(new THREE.Color(district.color), 0.12);
  const facade = facadeTextures(
    { kind: 'curtain', glass: `#${glass.getHexString()}`, frame: TOWER_FRAME[archetype], accent: district.color, lit: 0.2 },
    rand
  );
  // Mostly mirror: the wall shows the sky more than its own color, as real glass does.
  const skin = facadeMaterial(facade, { roughness: 0.14, metalness: 0.72, glow: 1.25 });
  glassOut.push(skin);
  const roof = mat(0x4b4f58, { roughness: 0.9 });
  const steel = mat(0x8d939c, { metalness: 0.6, roughness: 0.4 });
  const stone = mat(archetype % 2 ? 0xcbc5b6 : 0xd6d0c2, { roughness: 0.9 });
  const dark = mat(0x2c313c, { roughness: 0.6, metalness: 0.3 });
  const trim = trimMaterial(district.color);

  // --- Podium: a stone base with a glazed ground floor, a canopy, and a planted terrace. ---
  const podW = Math.min(footprint * 1.18, 10.6);
  const podH = 3.4;
  block(group, stone, podW, podH, podW, 0, podH / 2, 0);
  const lobby = new THREE.MeshStandardMaterial({
    color: 0x24303f,
    emissive: 0xffd9a0,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.5
  });
  for (const s of [-1, 1]) {
    block(group, lobby, podW * 0.86, podH * 0.56, 0.1, 0, podH * 0.4, s * (podW / 2 + 0.01));
    block(group, lobby, 0.1, podH * 0.56, podW * 0.86, s * (podW / 2 + 0.01), podH * 0.4, 0);
    for (let i = -2; i <= 2; i += 1) {
      block(group, stone, 0.22, podH * 0.6, 0.2, (i * podW * 0.86) / 5, podH * 0.4, s * (podW / 2 + 0.04));
      block(group, stone, 0.2, podH * 0.6, 0.22, s * (podW / 2 + 0.04), podH * 0.4, (i * podW * 0.86) / 5);
    }
  }
  block(group, stone, podW + 0.24, 0.3, podW + 0.24, 0, podH + 0.15, 0);
  block(group, dark, 3.4, 0.14, 1.5, 0, podH * 0.74, podW / 2 + 0.75);
  block(group, trim, 3.4, 0.06, 0.06, 0, podH * 0.74 - 0.08, podW / 2 + 1.48);
  const planter = mat(0x44703c, { roughness: 1 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      block(group, planter, 1.1, 0.5, 1.1, sx * (podW / 2 - 0.75), podH + 0.55, sz * (podW / 2 - 0.75));
    }
  }

  const base = podH + 0.3;
  const shaft = height - base;
  let topY = height;
  let mastBase = height;
  let mastX = 0;
  let mast = true;

  /** A glass box with stone piers up its corners and a thin cap. */
  const tier = (w: number, d: number, h: number, x: number, y: number, z: number, cap: THREE.Material = stone) => {
    facadeBox(group, skin, roof, facade, w, h, d, x, y + h / 2, z, TOWER_BAY, TOWER_FLOOR);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) block(group, stone, 0.3, h, 0.3, x + sx * (w / 2), y + h / 2, z + sz * (d / 2));
    }
    block(group, cap, w + 0.4, 0.28, d + 0.4, x, y + h + 0.14, z);
    // Depth on the wall: slim fins standing proud of the glass every second bay,
    // and a ledge every eighth floor, so the tower catches light and shadow.
    const fin = (span: number, place: (t: number, s: number) => [number, number, number, number]) => {
      const bays = Math.max(1, Math.round(span / TOWER_BAY));
      for (let i = 2; i < bays; i += 2) {
        const t = (i / bays - 0.5) * span;
        for (const s of [-1, 1]) {
          const [fx, fz, fw, fd] = place(t, s);
          block(group, steel, fw, h, fd, x + fx, y + h / 2, z + fz);
        }
      }
    };
    fin(w, (t, s) => [t, s * (d / 2 + 0.07), 0.09, 0.16]);
    fin(d, (t, s) => [s * (w / 2 + 0.07), t, 0.16, 0.09]);
    for (let ly = TOWER_FLOOR * 8; ly < h - TOWER_FLOOR * 3; ly += TOWER_FLOOR * 8) {
      block(group, steel, w + 0.26, 0.14, d + 0.26, x, y + ly, z);
    }
  };
  /** Cooling units and a bulkhead, so no roof is a blank lid. */
  const plant = (w: number, d: number, x: number, y: number, z: number) => {
    block(group, steel, w * 0.34, 0.9, d * 0.3, x - w * 0.2, y + 0.45, z - d * 0.16);
    block(group, dark, w * 0.22, 0.6, d * 0.22, x + w * 0.2, y + 0.3, z + d * 0.18);
    block(group, steel, w * 0.16, 0.5, d * 0.34, x + w * 0.24, y + 0.25, z - d * 0.2);
  };

  if (archetype === 0) {
    // Stepped setback tower under a copper pyramid.
    const widths = [1, 0.8, 0.6, 0.42];
    const shares = [0.5, 0.26, 0.16, 0.08];
    let y = base;
    widths.forEach((k, i) => {
      const w = footprint * k;
      const h = shaft * shares[i];
      tier(w, w, h, 0, y, 0);
      y += h + 0.28;
    });
    const capR = footprint * 0.42 * 0.72;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(capR, 3.2, 4), mat(0x5f9a88, { roughness: 0.6, metalness: 0.3 }));
    cap.rotation.y = Math.PI / 4;
    cap.position.y = y + 1.6;
    group.add(cap);
    block(group, trim, footprint * 0.42 + 0.5, 0.1, footprint * 0.42 + 0.5, 0, y + 0.05, 0);
    topY = y + 3.2;
    mastBase = topY - 0.4;
  } else if (archetype === 1) {
    // Slab tower beside a taller concrete service core.
    const bw = footprint * 1.02;
    const bd = footprint * 0.76;
    const coreW = footprint * 0.28;
    const slabX = -coreW / 2;
    const coreX = bw / 2;
    tier(bw, bd, shaft, slabX, base, 0, steel);
    const coreH = shaft + 2.6;
    block(group, stone, coreW, coreH, bd * 0.84, coreX, base + coreH / 2, 0);
    for (const s of [-1, 1]) block(group, dark, 0.08, coreH - 2, 0.5, coreX + coreW / 2 + 0.01, base + coreH / 2, s * bd * 0.2);
    block(group, trim, coreW + 0.1, 0.12, bd * 0.84 + 0.1, coreX, base + coreH + 0.06, 0);
    plant(bw, bd, slabX, height + 0.28, 0);
    topY = base + coreH;
    mastBase = topY;
    mastX = coreX;
  } else if (archetype === 2) {
    // Round glass tower, belted every few floors, under a floating ring.
    const radius = footprint * 0.5;
    const geo = new THREE.CylinderGeometry(radius, radius, shaft, 40, 1);
    scaleUv(geo, Math.round((Math.PI * 2 * radius) / TOWER_BAY) / facade.cols, Math.round(shaft / TOWER_FLOOR) / facade.rows);
    const tower = new THREE.Mesh(geo, [skin, roof, roof]);
    tower.position.y = base + shaft / 2;
    group.add(tower);
    const beltGeo = new THREE.CylinderGeometry(radius + 0.14, radius + 0.14, 0.22, 40);
    const belts = Math.max(2, Math.round(shaft / 9));
    for (let i = 1; i <= belts; i += 1) {
      const belt = new THREE.Mesh(beltGeo, i === belts ? stone : steel);
      belt.position.y = base + (shaft * i) / belts - (i === belts ? 0.1 : 0);
      group.add(belt);
    }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.56, 1.2, 24), steel);
    drum.position.y = height + 0.6;
    group.add(drum);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, 0.1, 8, 48), trim);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = height + 1.5;
    group.add(halo);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      block(group, steel, 0.09, 1.5, 0.09, Math.cos(a) * radius * 0.86, height + 0.75, Math.sin(a) * radius * 0.86);
    }
    topY = height + 1.6;
    mast = false;
  } else if (archetype === 3) {
    // Twin shafts of unequal height joined by a glazed sky bridge.
    const aw = footprint * 0.5;
    const bwid = footprint * 0.42;
    const gap = footprint * 0.16;
    const ax = -(gap / 2 + aw / 2);
    const bx = gap / 2 + bwid / 2;
    const bh = shaft * 0.76;
    tier(aw, footprint, shaft, ax, base, 0, steel);
    tier(bwid, footprint * 0.84, bh, bx, base, 0, steel);
    block(group, dark, gap + 0.4, 1.5, footprint * 0.3, 0, base + bh * 0.62, 0);
    block(group, trim, gap + 0.3, 0.08, footprint * 0.3 + 0.1, 0, base + bh * 0.62 + 0.8, 0);
    plant(aw * 1.6, footprint * 0.8, ax, height + 0.28, 0);
    plant(bwid * 1.6, footprint * 0.7, bx, base + bh + 0.28, 0);
    topY = height + 1.2;
    mastBase = height + 0.28;
    mastX = ax;
  } else {
    // A square shaft sliced off at an angle, with a stone fin up one side.
    const w = footprint * 0.9;
    const body = shaft * 0.86;
    tier(w, w, body, 0, base, 0, steel);
    const slice = wedge(w, shaft * 0.14, w, steel);
    slice.position.y = base + body + 0.28;
    group.add(slice);
    const finH = shaft + 2.2;
    block(group, stone, 0.5, finH, w * 0.36, -w / 2 - 0.25, base + finH / 2, 0);
    block(group, trim, 0.1, finH * 0.5, 0.1, -w / 2 - 0.52, base + finH * 0.72, 0);
    topY = base + finH;
    mastBase = topY;
    mastX = -w / 2 - 0.25;
  }

  // Antenna mast with an aircraft beacon.
  let top = topY;
  if (mast) {
    const mastH = 3.5 + rand() * 3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, mastH, 6), steel);
    pole.position.set(mastX, mastBase + mastH / 2, 0);
    group.add(pole);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff5a48, emissive: 0xff3a28, emissiveIntensity: 1.6, roughness: 0.4 })
    );
    beacon.position.set(mastX, mastBase + mastH, 0);
    group.add(beacon);
    top = mastBase + mastH;
  }

  // Posters stand on the podium roof like rooftop hoardings, big enough to read
  // from the opening view. The busier the project, the more faces it buys.
  const lines = [project.blurb.split(/[.!—]/)[0].trim(), ...project.quotes];
  const count = project.commits >= 500 ? 3 : project.commits >= 250 ? 2 : 1;
  const sides: [number, number][] = [[0, 1], [-1, 0], [1, 0]];
  const boardW = podW * 0.94;
  const boardH = boardW / 2;
  for (let i = 0; i < count; i += 1) {
    const texture = billboardTexture(
      project.title,
      (lines[i % lines.length] ?? '').slice(0, 44),
      district.color,
      `${project.commits.toLocaleString()} commits and counting`,
      posterUrl(project.id)
    );
    const bmat = new THREE.MeshStandardMaterial({
      map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1.25, roughness: 0.6
    });
    bmat.userData.poster = Boolean(posterUrl(project.id));
    if (bmat.userData.poster) {
      // Matte paper: no sheen from the sky or the lights next door.
      bmat.roughness = 1;
      bmat.envMapIntensity = 0;
    }
    billboards.push(bmat);
    const [sx, sz] = sides[i];
    const offset = podW / 2 - 0.12;
    const y = podH + 0.75 + boardH / 2;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), bmat);
    board.position.set(sx * offset, y, sz * offset);
    board.rotation.y = Math.atan2(sx, sz);
    group.add(board);
    // A real backing frame on two legs, never a floating quad.
    const frame = block(group, dark, boardW + 0.3, boardH + 0.3, 0.24, sx * (offset - 0.14), y, sz * (offset - 0.14));
    frame.rotation.y = board.rotation.y;
    for (const leg of [-1, 1]) {
      const along = leg * boardW * 0.36;
      block(group, steel, 0.16, 0.9, 0.16, sx * (offset - 0.2) + (sz !== 0 ? along : 0), podH + 0.5, sz * (offset - 0.2) + (sx !== 0 ? along : 0));
    }
  }

  return { top, footprint: podW, roof: topY };
}
// ---------------------------------------------------------------------------
// Assembly.
// ---------------------------------------------------------------------------

/**
 * Projects pushed to in the last 30 days are building sites. Anything mid-rise
 * or taller gets a tower crane; houses make do with scaffolding and cones.
 */
function buildConstructionSite(
  group: THREE.Group,
  buildingTop: number,
  footprint: number,
  withCrane: boolean,
  rand: () => number
): { jib: THREE.Group | null; beacon: THREE.MeshStandardMaterial | null } {
  const steel = mat(0xd9a441, { roughness: 0.7, metalness: 0.2 });
  const dark = mat(0x54432a, { roughness: 0.8 });
  const cx = footprint * 0.62 + 1;
  const cz = -(footprint * 0.5 + 1);
  let jib: THREE.Group | null = null;
  let beaconMat: THREE.MeshStandardMaterial | null = null;

  if (withCrane) {
    const mastHeight = buildingTop + 3.5;
    block(group, steel, 0.42, mastHeight, 0.42, cx, mastHeight / 2, cz);
    for (let y = 1.4; y < mastHeight - 1; y += 2.4) {
      const brace = block(group, dark, 0.6, 0.1, 0.6, cx, y, cz);
      brace.rotation.y = Math.PI / 4;
    }

    jib = new THREE.Group();
    jib.userData.dynamic = true; // it swings, so it stays out of the static bake
    jib.position.set(cx, mastHeight, cz);
    const jibLength = footprint * 0.95 + 3;
    block(jib, steel, jibLength, 0.24, 0.24, jibLength / 2 - 1.2, 0, 0);
    block(jib, dark, 1.1, 0.8, 0.9, -2, 0, 0);
    block(jib, dark, 0.8, 0.8, 0.8, 0, -0.4, 0);
    const cableDrop = Math.min(mastHeight * 0.3, 7);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, cableDrop, 4), dark);
    cable.position.set(jibLength * 0.62, -cableDrop / 2, 0);
    jib.add(cable);
    block(jib, dark, 0.9, 0.7, 0.9, jibLength * 0.62, -cableDrop - 0.35, 0);
    group.add(jib);

    beaconMat = new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff3020, emissiveIntensity: 2, roughness: 0.4 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), beaconMat);
    beacon.position.set(cx, mastHeight + 0.5, cz);
    beacon.userData.keep = true; // blinks on its own material
    group.add(beacon);
  }

  // Scaffolding up one side wall: poles, a few decks, cross rails.
  const scaffH = Math.min(buildingTop * 0.8, 9);
  const scaffD = footprint * 0.8;
  const sx = -(footprint * 0.5 + 0.55);
  const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, scaffH, 4);
  for (const pz of [-scaffD / 2, 0, scaffD / 2]) {
    for (const px of [sx, sx - 0.7]) {
      const pole = new THREE.Mesh(poleGeo, steel);
      pole.position.set(px, scaffH / 2, pz);
      group.add(pole);
    }
  }
  for (let y = 2; y < scaffH; y += 2.3) {
    block(group, dark, 0.8, 0.07, scaffD + 0.3, sx - 0.35, y, 0);
    block(group, steel, 0.05, 0.05, scaffD + 0.3, sx - 0.7, y + 0.8, 0);
  }

  const coneMat = mat(0xff7038, { emissive: 0xb03010, emissiveIntensity: 0.5, roughness: 0.7 });
  for (let i = 0; i < 3; i += 1) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), coneMat);
    cone.position.set(sx - 1.4 - rand() * 0.4, 0.31, -scaffD / 2 + i * (scaffD / 2) + rand() * 0.3);
    group.add(cone);
  }

  return { jib, beacon: beaconMat };
}

/** Procedurally build one project's home. Everything derives from real repo stats. */
export function createBuilding(project: Project, district: District, towerRank = 0, rotationY = 0): BuildingHandle {
  const rand = rngFor(project.repo);
  const group = new THREE.Group();
  const billboards: THREE.MeshStandardMaterial[] = [];
  const glass: THREE.MeshStandardMaterial[] = [];
  const tier = tierOf(project.commits);

  let top = 0;
  let roof = 0;
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
    const result = buildSkyscraper(group, project, district, rand, billboards, towerRank, glass);
    top = result.top;
    roof = result.roof;
    footprint = result.footprint;
  }

  // A painted kerb in the district color marks every project lot. It only lights
  // up when the lot is hovered or selected.
  const curbMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(district.color).lerp(new THREE.Color(0xb8b4aa), 0.35),
    emissive: new THREE.Color(district.color),
    emissiveIntensity: 0.12,
    roughness: 0.7
  });
  const curbSize = tier === 4 ? footprint + 1.1 : footprint * 1.2 + 1;
  if (tier === 1 || tier === 2) {
    // Clipped hedges down the sides and across the back of the garden.
    const hedge = mat(0x3d6b38, { roughness: 1 });
    const reach = curbSize / 2 - 0.35;
    block(group, hedge, curbSize - 0.7, 0.55, 0.4, 0, 0.3, -reach);
    for (const side of [-1, 1]) block(group, hedge, 0.4, 0.55, curbSize * 0.62, side * reach, 0.3, -curbSize * 0.16);
  }
  for (const [dx, dz, cw, cd] of [
    [0, -curbSize / 2, curbSize, 0.14],
    [0, curbSize / 2, curbSize, 0.14],
    [-curbSize / 2, 0, 0.14, curbSize],
    [curbSize / 2, 0, 0.14, curbSize]
  ] as const) {
    block(group, curbMat, cw, 0.08, cd, dx, 0.05, dz).userData.noCast = true;
  }

  // Recently pushed projects are visibly under construction.
  let craneJib: THREE.Group | null = null;
  let craneBeacon: THREE.MeshStandardMaterial | null = null;
  if (isUnderConstruction(project)) {
    const site = buildConstructionSite(group, top, footprint, tier >= 3, rand);
    craneJib = site.jib;
    craneBeacon = site.beacon;
  }

  // Floating name label.
  const label = labelSprite(project.title, district.color);
  if (tier === 4) {
    // A tower's plate is a sign on a post bolted to its roof, not a tag floating over the mast.
    label.position.y = roof + 1.5;
    block(group, mat(0x2a2d33, { roughness: 0.6, metalness: 0.4 }), 0.16, 1.5, 0.16, 0, roof + 0.75, 0);
  } else {
    label.position.y = (craneJib ? top + 3.5 : top) + 0.9;
  }
  group.add(label);

  group.rotation.y = rotationY;

  // One invisible box stands in for the whole building when picking — far
  // cheaper to raycast than its parts, and it survives the static bake.
  const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial());
  const hitHeight = tier === 4 ? top - 3 : top;
  hit.scale.set(footprint + 0.6, hitHeight, footprint + 0.6);
  hit.position.y = hitHeight / 2;
  hit.visible = false;
  hit.userData.keep = true;
  hit.userData.projectId = project.id;
  group.add(hit);
  const pickMeshes: THREE.Mesh[] = [hit];

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
    footprint,
    landmark: tier === 4,
    glass
  };
}
