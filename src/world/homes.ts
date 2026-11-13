import * as THREE from 'three';
import { growable } from './surface';
import { GLASS_CELLS, GLASS_COLS, GLASS_LIT, GLASS_ROWS, GLASS_TV, houseGlassTextures } from './textures';

/**
 * Homes: the parts every house in town is built from (glass, windows, roofs,
 * porches, fences, back yards) and the three small project tiers made of them:
 * the shack, the house, and the big house. The unnamed town in fabric.ts uses
 * the same parts in quieter colors.
 *
 * Everything here is plain boxes and prisms in plain materials, so the static
 * bake folds it into the town's few vertex-colored draw calls and weathers it.
 * The one textured material, the window glass, is shared by every house.
 */

export const BOX = new THREE.BoxGeometry(1, 1, 1);

export function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
}

/** Axis-aligned block. */
export function block(
  group: THREE.Object3D,
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
export function gableRoof(width: number, depth: number, peak: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, peak);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, material);
}

/** A hipped roof: four slopes meeting at a short ridge along the longer side, or at a point. */
export function hipRoof(width: number, depth: number, height: number, material: THREE.Material): THREE.Mesh {
  const hw = width / 2;
  const hd = depth / 2;
  const alongZ = depth >= width;
  const run = Math.max(0, alongZ ? hd - hw : hw - hd);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const a = alongZ ? V(0, height, -run) : V(-run, height, 0);
  const b = alongZ ? V(0, height, run) : V(run, height, 0);
  const c = [V(-hw, 0, -hd), V(hw, 0, -hd), V(hw, 0, hd), V(-hw, 0, hd)];
  const faces = alongZ
    ? [[c[1], c[2], b, a], [c[3], c[0], a, b], [c[2], c[3], b], [c[0], c[1], a], [c[0], c[1], c[2], c[3]]]
    : [[c[2], c[3], a, b], [c[0], c[1], b, a], [c[1], c[2], b], [c[3], c[0], a], [c[0], c[1], c[2], c[3]]];
  const inside = V(0, height * 0.3, 0);
  const positions: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const face of faces) {
    for (let i = 1; i < face.length - 1; i += 1) {
      const p = face[0];
      let q = face[i];
      let r = face[i + 1];
      const normal = e1.subVectors(q, p).cross(e2.subVectors(r, p));
      if (normal.lengthSq() < 1e-8) continue;
      // Wind every face outward, whatever order its corners were listed in.
      const centroid = p.clone().add(q).add(r).divideScalar(3).sub(inside);
      if (normal.dot(centroid) < 0) [q, r] = [r, q];
      positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// ---------------------------------------------------------------------------
// Glass and windows.
// ---------------------------------------------------------------------------

let glass: THREE.MeshStandardMaterial | null = null;

/** The one glass every house window shares: curtains by day, lamplight by night. */
export function houseGlass(): THREE.MeshStandardMaterial {
  if (glass) return glass;
  const { map, emissiveMap } = houseGlassTextures();
  glass = growable(
    new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.15, roughness: 0.32, metalness: 0.1 })
  );
  glass.userData.dayDim = 0.95; // nobody leaves the lamps on at noon
  return glass;
}

const panes: THREE.BufferGeometry[] = [];

/** A unit box whose every face shows one cell of the glass atlas. */
function paneGeometry(cell: number): THREE.BufferGeometry {
  let geo = panes[cell];
  if (!geo) {
    geo = new THREE.BoxGeometry(1, 1, 1);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const cx = cell % GLASS_COLS;
    const cy = Math.floor(cell / GLASS_COLS);
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, (cx + 0.03 + uv.getX(i) * 0.94) / GLASS_COLS, 1 - (cy + 0.03 + (1 - uv.getY(i)) * 0.94) / GLASS_ROWS);
    }
    panes[cell] = geo;
  }
  return geo;
}

/** Which pane a window gets: lit with share `lit`, a television now and then, otherwise dark. */
export function windowCell(rand: () => number, lit: number): number {
  const roll = rand();
  const pick = rand();
  if (roll < lit) return Math.floor(pick * GLASS_LIT);
  if (roll < lit + 0.07) return GLASS_LIT + Math.floor(pick * GLASS_TV);
  return GLASS_LIT + GLASS_TV + Math.floor(pick * (GLASS_CELLS - GLASS_LIT - GLASS_TV));
}

export interface Sash {
  /** Casing and sill. */
  frame: THREE.Material;
  shutters?: THREE.Material | null;
  /** A cap over the window head. */
  head?: boolean;
  /** A flower box under the sill: the box's material, then the blooms'. */
  flowers?: THREE.Material[] | null;
}

/** Which way a wall faces: +z, +x, -z, -x. */
export type Facing = 0 | 1 | 2 | 3;

const LEAVES = mat(0x41703a, { roughness: 1 });
const BLOOM = new THREE.IcosahedronGeometry(0.085, 0);

/** A window set in the wall at (x, y, z), facing out of it: casing, glass, sill, and whatever `sash` adds. */
export function glazing(
  group: THREE.Object3D,
  sash: Sash,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  facing: Facing,
  cell: number
): void {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = (facing * Math.PI) / 2;
  g.userData.prunable = true; // empty once baked
  block(g, sash.frame, w + 0.16, h + 0.16, 0.05, 0, 0, 0.025);
  const pane = new THREE.Mesh(paneGeometry(cell), houseGlass());
  pane.scale.set(w, h, 0.04);
  pane.position.z = 0.05;
  pane.userData.noCast = true;
  g.add(pane);
  block(g, sash.frame, w + 0.28, 0.07, 0.15, 0, -h / 2 - 0.1, 0.075);
  if (sash.head) block(g, sash.frame, w + 0.3, 0.09, 0.1, 0, h / 2 + 0.12, 0.05);
  if (sash.shutters) {
    const sw = Math.min(0.4, w * 0.42);
    for (const s of [-1, 1]) block(g, sash.shutters, sw, h + 0.04, 0.04, s * (w / 2 + 0.1 + sw / 2), 0, 0.03);
  }
  if (sash.flowers && sash.flowers.length > 1) {
    const [box, ...blooms] = sash.flowers;
    block(g, box, w + 0.12, 0.17, 0.2, 0, -h / 2 - 0.27, 0.15);
    block(g, LEAVES, w + 0.04, 0.09, 0.16, 0, -h / 2 - 0.15, 0.15);
    const n = Math.max(3, Math.round(w / 0.19));
    for (let i = 0; i < n; i += 1) {
      const bloom = new THREE.Mesh(BLOOM, blooms[i % blooms.length]);
      bloom.position.set((i / (n - 1) - 0.5) * w * 0.9, -h / 2 - 0.11 + (i % 2) * 0.03, 0.18 + (i % 2) * 0.03);
      bloom.rotation.set(i, i * 2, 0);
      g.add(bloom);
    }
  }
  group.add(g);
}

// ---------------------------------------------------------------------------
// Porches, chimneys, fences.
// ---------------------------------------------------------------------------

export interface PorchSpec {
  /** Centre across the front, width, and how far it stands out from the wall. */
  x: number;
  width: number;
  depth: number;
  /** z of the wall the porch stands against (the porch is built toward +z). */
  wall: number;
  /** Height of the roof where it meets the wall, and how far it falls to the front edge. */
  roofAt: number;
  fall: number;
  posts: number;
  /** Where the steps come down, or null for none. */
  steps: number | null;
  rail: 'spindles' | 'plain' | null;
}

export const DECK_TOP = 0.42;

export function porch(
  group: THREE.Object3D,
  m: { deck: THREE.Material; post: THREE.Material; roof: THREE.Material; trim: THREE.Material },
  p: PorchSpec
): void {
  const front = p.wall + p.depth;
  block(group, m.deck, p.width, 0.22, p.depth, p.x, DECK_TOP - 0.11, p.wall + p.depth / 2);
  if (p.steps !== null) {
    block(group, m.deck, 0.9, 0.14, 0.3, p.steps, 0.21, front + 0.15);
    block(group, m.deck, 0.9, 0.14, 0.3, p.steps, 0.07, front + 0.42);
  }
  const roofFront = p.roofAt - p.fall;
  const postH = roofFront - DECK_TOP;
  const posts: number[] = [];
  for (let i = 0; i < p.posts; i += 1) {
    const px = p.x + (p.posts === 1 ? 0 : (i / (p.posts - 1) - 0.5) * (p.width - 0.16));
    posts.push(px);
    block(group, m.post, 0.11, postH, 0.11, px, DECK_TOP + postH / 2, front - 0.08);
  }
  // A shed roof from the wall down to a beam over the posts.
  const run = p.depth + 0.22;
  const roof = block(group, m.roof, p.width + 0.24, 0.09, Math.hypot(run, p.fall), p.x, p.roofAt - p.fall / 2 + 0.05, p.wall + run / 2);
  roof.rotation.x = Math.atan2(p.fall, run);
  block(group, m.trim, p.width + 0.1, 0.14, 0.1, p.x, roofFront - 0.05, front - 0.08);
  if (!p.rail || posts.length < 2) return;
  const railY = DECK_TOP + 0.55;
  for (let i = 0; i < posts.length - 1; i += 1) {
    const a = posts[i];
    const b = posts[i + 1];
    if (p.steps !== null && p.steps > a && p.steps < b) continue; // the gap the steps come down through
    const len = b - a - 0.1;
    const mid = (a + b) / 2;
    block(group, m.trim, len, 0.06, 0.07, mid, railY, front - 0.08);
    if (p.rail === 'spindles') {
      block(group, m.trim, len, 0.05, 0.06, mid, DECK_TOP + 0.08, front - 0.08);
      const n = Math.max(2, Math.floor(len / 0.15));
      for (let k = 1; k < n; k += 1) block(group, m.trim, 0.035, 0.45, 0.035, a + 0.05 + (k * len) / n, DECK_TOP + 0.31, front - 0.08);
    } else {
      block(group, m.trim, len, 0.3, 0.05, mid, DECK_TOP + 0.3, front - 0.08);
    }
  }
  for (const sx of [posts[0], posts[posts.length - 1]]) block(group, m.trim, 0.07, 0.06, p.depth - 0.12, sx, railY, p.wall + p.depth / 2);
}

const CAP = mat(0x8e8b84, { roughness: 0.9 });
const POT = mat(0x9a5b42, { roughness: 0.9 });

/** A brick stack from `from` to `to` with a stone cap and two clay pots. */
export function chimney(group: THREE.Object3D, brick: THREE.Material, x: number, z: number, from: number, to: number, size = 0.5): void {
  block(group, brick, size, to - from, size * 0.9, x, (from + to) / 2, z);
  block(group, CAP, size + 0.14, 0.1, size * 0.9 + 0.14, x, to + 0.05, z);
  block(group, POT, 0.13, 0.22, 0.13, x - size * 0.2, to + 0.2, z);
  block(group, POT, 0.13, 0.17, 0.13, x + size * 0.18, to + 0.18, z);
}

/** A white picket fence along x at depth z, open where `gaps` say. */
export function picketFence(group: THREE.Object3D, material: THREE.Material, x0: number, x1: number, z: number, gaps: [number, number][]): void {
  const cuts = [...gaps].sort((p, q) => p[0] - q[0]);
  let from = x0;
  const runs: [number, number][] = [];
  for (const [a, b] of cuts) {
    if (a > from) runs.push([from, Math.min(a, x1)]);
    from = Math.max(from, b);
  }
  if (from < x1) runs.push([from, x1]);
  for (const [a, b] of runs) {
    if (b - a < 0.3) continue;
    for (const y of [0.18, 0.5]) block(group, material, b - a, 0.05, 0.04, (a + b) / 2, y, z);
    for (let x = a + 0.05; x <= b - 0.04; x += 0.19) block(group, material, 0.07, 0.62, 0.035, x, 0.31, z + 0.035);
    for (const x of [a + 0.04, b - 0.04]) block(group, material, 0.1, 0.72, 0.1, x, 0.36, z);
  }
}

/** Rounded shrub. */
export function shrub(group: THREE.Object3D, x: number, z: number, s: number, rand: () => number): void {
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat(0x2a5a34, { roughness: 1, flatShading: true }));
  bush.position.set(x, s * 0.7, z);
  bush.rotation.set(rand(), rand(), rand());
  group.add(bush);
}

/** A lamp that is lit after dark, baked like any other glowing trim. */
export function warmGlass(intensity = 1.3): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xffcf87, emissive: 0xffb85e, emissiveIntensity: intensity, roughness: 0.5 });
}

// ---------------------------------------------------------------------------
// Back yards: what people keep behind a house. Each is built facing +z around
// its own origin, inside about 1.8 x 1.3, and placed with `yardSpot`.
// ---------------------------------------------------------------------------

const TIMBER = mat(0x7a5d40, { roughness: 0.95 });
const SOIL = mat(0x4a3826, { roughness: 1 });
const DARK = mat(0x24262a, { roughness: 0.7 });
const STEEL = mat(0x8f969c, { roughness: 0.5, metalness: 0.5 });
const ROPE = mat(0x5a5048, { roughness: 1 });
const PAVERS = mat(0xb4aa98, { roughness: 0.95 });
const CROPS = [0x6fa64a, 0x3f6e3a, 0x86b553].map((c) => mat(c, { roughness: 1 }));
const CLOTHES = [0xc9544a, 0xe9e4d8, 0x4f6f9a, 0xd8b04a, 0x7a9a6a].map((c) => mat(c, { roughness: 0.95 }));
const RING = new THREE.TorusGeometry(0.68, 0.045, 5, 18);
const DISC = new THREE.CylinderGeometry(0.66, 0.66, 0.03, 18);
const TABLE = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10);
const UMBRELLA = new THREE.ConeGeometry(0.85, 0.3, 8);
const LOG = new THREE.CylinderGeometry(0.1, 0.1, 0.55, 6);

type Prop = (g: THREE.Group, rand: () => number, accent: THREE.Material) => void;

const swingSet: Prop = (g) => {
  for (const end of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const leg = block(g, TIMBER, 0.08, 1.55, 0.08, end * 0.82, 0.75, lean * 0.3);
      leg.rotation.x = -lean * 0.38;
    }
  }
  block(g, TIMBER, 1.82, 0.09, 0.09, 0, 1.46, 0);
  for (const sx of [-0.38, 0.38]) {
    for (const r of [-0.13, 0.13]) block(g, ROPE, 0.02, 1.02, 0.02, sx + r, 0.93, 0);
    block(g, DARK, 0.34, 0.05, 0.16, sx, 0.4, 0);
  }
};

const gardenBeds: Prop = (g) => {
  for (const bz of [-0.34, 0.34]) {
    block(g, TIMBER, 1.5, 0.22, 0.5, 0, 0.11, bz);
    block(g, SOIL, 1.4, 0.05, 0.4, 0, 0.23, bz);
    for (const [i, r] of [-0.1, 0.1].entries()) block(g, CROPS[(i + (bz > 0 ? 1 : 0)) % CROPS.length], 1.25, 0.13, 0.11, 0, 0.3, bz + r);
  }
};

const shed: Prop = (g, rand, accent) => {
  const walls = rand() < 0.5 ? accent : TIMBER;
  block(g, walls, 1.3, 1.2, 0.95, 0, 0.6, 0);
  const roof = gableRoof(1.15, 1.55, 0.45, DARK);
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 1.2;
  g.add(roof);
  block(g, DARK, 0.52, 0.92, 0.04, 0.18, 0.48, 0.48);
  block(g, TIMBER, 1.32, 0.12, 0.97, 0, 0.06, 0);
};

const patio: Prop = (g, rand, accent) => {
  block(g, PAVERS, 1.8, 0.05, 1.3, 0, 0.03, 0);
  const table = new THREE.Mesh(TABLE, STEEL);
  table.position.set(-0.25, 0.62, 0);
  g.add(table);
  block(g, STEEL, 0.04, 1.5, 0.04, -0.25, 0.8, 0);
  const shade = new THREE.Mesh(UMBRELLA, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
  shade.position.set(-0.25, 1.6, 0);
  g.add(shade);
  for (const cx of [-0.75, 0.25]) block(g, accent, 0.3, 0.42, 0.3, cx, 0.24, 0.05);
  // The barbecue.
  block(g, DARK, 0.42, 0.26, 0.3, 0.6, 0.78, -0.35);
  block(g, DARK, 0.05, 0.62, 0.05, 0.6, 0.34, -0.35);
};

const trampoline: Prop = (g) => {
  const ring = new THREE.Mesh(RING, STEEL);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.52;
  g.add(ring);
  const bed = new THREE.Mesh(DISC, DARK);
  bed.position.y = 0.5;
  g.add(bed);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    block(g, STEEL, 0.05, 0.5, 0.05, Math.cos(a) * 0.66, 0.25, Math.sin(a) * 0.66);
  }
};

const clothesline: Prop = (g, rand) => {
  for (const x of [-0.95, 0.95]) {
    block(g, STEEL, 0.06, 1.5, 0.06, x, 0.75, 0);
    block(g, STEEL, 0.06, 0.06, 0.5, x, 1.45, 0);
  }
  for (const z of [-0.2, 0.2]) block(g, ROPE, 1.9, 0.015, 0.015, 0, 1.43, z);
  // Pegged out between the posts; nothing hangs past the end of the rope.
  for (let x = -0.8; ; ) {
    const w = 0.24 + rand() * 0.2;
    if (x + w > 0.82) break;
    const cloth = block(g, CLOTHES[Math.floor(rand() * CLOTHES.length)], w, 0.32 + rand() * 0.18, 0.02, x + w / 2, 1.22, rand() < 0.5 ? -0.2 : 0.2);
    cloth.rotation.y = (rand() - 0.5) * 0.3;
    x += w + 0.08 + rand() * 0.12;
  }
};

const doghouse: Prop = (g, _rand, accent) => {
  block(g, accent, 0.7, 0.55, 0.85, 0, 0.28, 0);
  const roof = gableRoof(0.9, 1.0, 0.36, DARK);
  roof.position.y = 0.55;
  g.add(roof);
  block(g, DARK, 0.28, 0.36, 0.03, 0, 0.2, 0.43);
  block(g, mat(0xb0402e), 0.16, 0.05, 0.16, 0.32, 0.03, 0.62);
};

export const YARD_PROPS: Prop[] = [swingSet, gardenBeds, shed, patio, trampoline, clothesline, doghouse];

/** Put two different back-yard things behind a house, left and right. */
export function backYard(group: THREE.Object3D, rand: () => number, accent: THREE.Material, spots: [number, number, number][]): void {
  const order = YARD_PROPS.map((prop) => ({ prop, key: rand() })).sort((p, q) => p.key - q.key);
  spots.forEach(([x, z, turn], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0.05, z);
    g.rotation.y = turn;
    order[i % order.length].prop(g, rand, accent);
    group.add(g);
  });
}

/** Clipped hedges across the back of the garden and down the sides it names (-1 left, 1 right). */
export function gardenHedges(group: THREE.Object3D, yard: number, sides: number[]): void {
  const hedge = mat(0x3d6b38, { roughness: 1 });
  const reach = yard - 0.35;
  block(group, hedge, yard * 2 - 0.7, 0.55, 0.4, 0, 0.3, -reach);
  for (const side of sides) block(group, hedge, 0.4, 0.55, yard * 1.24, side * reach, 0.3, -yard * 0.32);
}

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)];
}

const FLOWER_COLORS = [0xd8475b, 0xf0c04c, 0xf4efe4, 0xb366a6, 0xe98a58, 0x6f8fd8];
const PATH = mat(0x9c968b, { roughness: 0.95 });
const DRIVE = mat(0x6c7076, { roughness: 0.9 });

// ---------------------------------------------------------------------------
// TIER 0: the shack. A repo with a commit or two: tin roof, a porch chair,
// the woodpile, the outhouse, the washing out. Somebody lives here.
// ---------------------------------------------------------------------------

export function buildShack(group: THREE.Group, rand: () => number, yard: number): number {
  // Sun-bleached boards, not creosote: a shack should read as weathered wood from above, not as a dark hole.
  const plankTones = [0x9a8468, 0x86725a, 0xa89274, 0x7a6850];
  const plankMat = (i: number) => mat(plankTones[i % plankTones.length], { roughness: 1, flatShading: true });
  const tins = [0x9aa1a8, 0x80878d, 0x8a5234, 0xa3a7aa, 0x77634e].map((c) => mat(c, { roughness: 0.6, metalness: 0.35 }));

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
      if (doorGap && Math.abs(along) < 0.4) continue;
      const ph = h * (0.82 + rand() * 0.25); // uneven tops
      const m = new THREE.Mesh(BOX, plankMat(i));
      if (facing === 'z') {
        m.scale.set(0.3, ph, 0.12);
        m.position.set(along, ph / 2, d / 2);
      } else {
        m.scale.set(0.12, ph, 0.3);
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
  // Someone is home: a stove's glow shows through the gaps after dark, and a lantern hangs by the door.
  block(shell, mat(0x0a0806, { roughness: 1, emissive: 0xff9a3c, emissiveIntensity: 0.2 }), w - 0.25, h - 0.2, d - 0.25, 0, h / 2, 0);
  block(shell, warmGlass(2.2), 0.16, 0.2, 0.16, 0.62, h * 0.72, d / 2 + 0.14);
  block(shell, mat(0x2a2620, { roughness: 0.8 }), 0.04, 0.04, 0.3, 0.62, h * 0.86, d / 2 + 0.06);

  // A shed roof of corrugated tin, high at the front, the sheets not quite
  // matching, one rusted patch over a leak, and a tire to hold it all down.
  const roof = new THREE.Group();
  roof.position.set(0, h + 0.16, 0);
  roof.rotation.x = -0.13;
  shell.add(roof);
  const sheets = 3;
  const sheetW = (w + 0.5) / sheets;
  for (let i = 0; i < sheets; i += 1) {
    const sheet = new THREE.Group();
    sheet.position.set((i - (sheets - 1) / 2) * (sheetW - 0.04), i * 0.025, (rand() - 0.5) * 0.12);
    sheet.rotation.y = (rand() - 0.5) * 0.05;
    const tin = tins[Math.floor(rand() * tins.length)];
    block(sheet, tin, sheetW, 0.035, d + 0.7, 0, 0, 0);
    for (let k = 0; k < 4; k += 1) block(sheet, tin, 0.05, 0.035, d + 0.7, (k / 3 - 0.5) * (sheetW - 0.12), 0.03, 0);
    roof.add(sheet);
  }
  const patch = block(roof, tins[2], 0.8, 0.04, 0.7, (rand() - 0.5) * w * 0.4, 0.1, (rand() - 0.5) * d * 0.4);
  patch.rotation.y = 0.35;
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.09, 6, 12), mat(0x161616, { roughness: 1 }));
  tire.rotation.x = Math.PI / 2;
  tire.position.set(-w * 0.22, 0.13, -d * 0.18);
  roof.add(tire);

  // Crooked stovepipe with a rain hat.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 6), mat(0x1c1c22, { metalness: 0.4 }));
  pipe.position.set(w * 0.2, h + 0.7, -d * 0.2);
  pipe.rotation.z = 0.2;
  shell.add(pipe);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 6), mat(0x1c1c22, { metalness: 0.4 }));
  hat.position.set(w * 0.2 - 0.11, h + 1.3, -d * 0.2);
  shell.add(hat);

  // Boarded-up window: two planks nailed over a dark hole on the right wall.
  block(shell, mat(0x0a0806), 0.06, 0.5, 0.5, w / 2 + 0.02, h * 0.55, 0);
  const b1 = block(shell, plankMat(0), 0.06, 0.14, 0.7, w / 2 + 0.05, h * 0.6, 0);
  b1.rotation.x = 0.15;
  const b2 = block(shell, plankMat(3), 0.06, 0.14, 0.7, w / 2 + 0.05, h * 0.45, 0);
  b2.rotation.x = -0.1;

  group.add(shell);

  // The front porch: a plank deck, two crooked posts, a tin awning, and the chair.
  block(group, plankMat(3), w + 0.2, 0.12, 0.95, 0, 0.1, d / 2 + 0.52);
  for (const side of [-1, 1]) {
    const post = block(group, plankMat(side < 0 ? 0 : 2), 0.11, h * 0.86, 0.11, side * (w / 2 - 0.05), h * 0.43, d / 2 + 0.92);
    post.rotation.z = side * 0.04 + (rand() - 0.5) * 0.06;
  }
  const awning = block(group, tins[Math.floor(rand() * 2)], w + 0.4, 0.035, 1.15, 0, h * 0.92 + 0.02, d / 2 + 0.52);
  awning.rotation.x = 0.24;
  const chair = new THREE.Group();
  chair.position.set(-w * 0.27, 0.16, d / 2 + 0.5);
  chair.rotation.y = 0.35;
  const upholstery = mat(pick(rand, [0x6f5a4a, 0x5c6a58, 0x7a4a44, 0x55607a]), { roughness: 1 });
  block(chair, upholstery, 0.62, 0.24, 0.56, 0, 0.14, 0);
  block(chair, upholstery, 0.62, 0.5, 0.14, 0, 0.4, -0.22);
  for (const s of [-1, 1]) block(chair, upholstery, 0.12, 0.2, 0.56, s * 0.31, 0.3, 0);
  group.add(chair);

  // The woodpile against the left wall, a chopping block, and the axe left in it.
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 5 - row; i += 1) {
      const log = new THREE.Mesh(LOG, TIMBER);
      log.rotation.z = Math.PI / 2;
      log.position.set(-w / 2 - 0.35, 0.1 + row * 0.18, (i - (4 - row) / 2) * 0.21);
      group.add(log);
    }
  }
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.36, 8), TIMBER);
  stump.position.set(-w / 2 - 0.85, 0.18, d * 0.5);
  group.add(stump);
  const handle = block(group, mat(0x9a7a50), 0.04, 0.55, 0.04, -w / 2 - 0.8, 0.58, d * 0.5);
  handle.rotation.z = 0.35;
  block(group, STEEL, 0.05, 0.1, 0.16, -w / 2 - 0.88, 0.4, d * 0.5);

  // Out back: the outhouse, its door facing the yard, a crescent moon cut in it.
  const outhouse = new THREE.Group();
  outhouse.position.set(-w / 2 - 0.55, 0, -d / 2 - 1.05); // clear of the shack's eaves
  outhouse.rotation.y = 0.5;
  block(outhouse, plankMat(1), 0.85, 1.7, 0.85, 0, 0.85, 0);
  const lid = block(outhouse, tins[0], 1.05, 0.04, 1.1, 0, 1.76, 0);
  lid.rotation.x = -0.15;
  block(outhouse, plankMat(2), 0.6, 1.45, 0.04, 0, 0.76, 0.44);
  const moon = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.025, 4, 10, Math.PI * 1.15), mat(0x0a0806));
  moon.position.set(0, 1.27, 0.47);
  moon.rotation.z = 0.9;
  outhouse.add(moon);
  group.add(outhouse);

  // The washing, strung from the back corner to a post.
  const line = new THREE.Group();
  line.position.set(w / 2 + 0.75, 0, -d * 0.3);
  line.rotation.y = Math.PI / 2;
  clothesline(line, rand, TIMBER);
  group.add(line);

  // Junk in the yard: a crate, a rain barrel under the eave by the front corner, a tire.
  if (rand() < 0.9) {
    const crate = block(group, plankMat(2), 0.6, 0.6, 0.6, -w * 0.72, 0.3, d * 0.78 + 0.4);
    crate.rotation.y = rand();
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.7, 8), mat(0x3a3a30, { metalness: 0.3 }));
  barrel.position.set(w / 2 + 0.42, 0.35, d / 2 - 0.35);
  group.add(barrel);
  if (rand() < 0.5) {
    const old = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.11, 6, 12), mat(0x141414, { roughness: 1 }));
    old.rotation.x = Math.PI / 2;
    old.position.set(Math.min(w * 0.4 + rand() * 0.5, yard - 0.5), 0.11, -d / 2 - 0.55);
    group.add(old);
  }

  return h + 1.2;
}

// ---------------------------------------------------------------------------
// TIER 1: a house on a street of houses. Three kinds, so a street is not one
// model repeated: a front-gabled cottage behind a full porch, a Cape with two
// dormers and a door hood, and an L with a gabled wing and a porch in the crook.
// ---------------------------------------------------------------------------

export function buildHouse(lot: THREE.Group, rand: () => number, yard: number): number {
  const kind = Math.floor(rand() * 3); // 0 front gable and porch, 1 Cape, 2 cross-gabled L
  const garageSide = kind === 2 ? -1 : 1;
  const garage = rand() < 0.55;
  // A house with a garage stands off-center, so the garage and its drive fit inside the lot.
  const shift = garage ? -garageSide * 0.45 : 0;
  const group = new THREE.Group();
  group.position.x = shift;
  lot.add(group);
  const siding = mat(pick(rand, [0xd8cfbb, 0xa9bdd0, 0xd3b3a4, 0xa9c9b0, 0xd9cc9c, 0xc7b8d0, 0xe3dccb, 0x9fb7b4]));
  const trim = mat(rand() < 0.75 ? 0xf1efe6 : 0xe9dfc8);
  const roofMat = mat(pick(rand, [0x6a4338, 0x4c5560, 0x7a4f3a, 0x3f5148, 0x5a4a50]));
  const doorMat = mat(pick(rand, [0x8a3b32, 0x2f5a44, 0x334a7a, 0x5a3c66, 0x3a3430]));
  const shutterTone = pick(rand, [0x2f3d33, 0x36465a, 0x5a3a34, 0x2c2c30, -1]);
  const shutters = shutterTone < 0 ? null : mat(shutterTone);
  const stone = mat(0x6a6258);
  const brick = mat(pick(rand, [0x7a4538, 0x6e4038, 0x8a5a48]));
  const blooms = [trim, mat(pick(rand, FLOWER_COLORS)), mat(pick(rand, FLOWER_COLORS)), mat(pick(rand, FLOWER_COLORS))];

  const w = 3.7 + rand() * 0.5;
  const d = 3.0 + rand() * 0.5;
  const h = 2.5 + rand() * 0.3;
  const base = 0.2;
  const eave = base + h;
  const over = 0.3;
  const cell = () => windowCell(rand, 0.72);
  const sash: Sash = { frame: trim, shutters, head: kind === 1 };
  const boxed: Sash = { ...sash, flowers: blooms };

  // Foundation, walls, corner boards.
  block(group, stone, w + 0.16, 0.26, d + 0.16, 0, 0.13, 0);
  block(group, siding, w, h, d, 0, base + h / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(group, trim, 0.12, h, 0.12, sx * (w / 2 - 0.02), base + h / 2, sz * (d / 2 - 0.02));

  const peak = kind === 1 ? 1.85 + rand() * 0.15 : 1.55 + rand() * 0.2;
  const alongZ = kind === 0; // the cottage shows its gable to the street
  const roof = alongZ ? gableRoof(w + 2 * over, d + 2 * over, peak, roofMat) : gableRoof(d + 2 * over, w + 2 * over, peak, roofMat);
  if (!alongZ) roof.rotation.y = Math.PI / 2;
  roof.position.y = eave;
  group.add(roof);
  block(group, trim, w + 2 * over, 0.1, d + 2 * over, 0, eave + 0.02, 0);
  // Gutters along the eaves, and downspouts down the front corners.
  if (alongZ) for (const s of [-1, 1]) block(group, trim, 0.09, 0.09, d + 2 * over, s * (w / 2 + over - 0.04), eave - 0.02, 0);
  else for (const s of [-1, 1]) block(group, trim, w + 2 * over, 0.09, 0.09, 0, eave - 0.02, s * (d / 2 + over - 0.04));
  for (const s of [-1, 1]) block(group, trim, 0.07, h, 0.07, s * (w / 2 + 0.06), base + h / 2, d / 2 + 0.12);

  // Attic windows in the gables.
  const gableY = eave + peak * 0.34;
  if (alongZ) {
    glazing(group, { frame: trim }, 0.5, 0.55, 0, gableY, d / 2 + over - 0.02, 0, cell());
    glazing(group, { frame: trim }, 0.5, 0.55, 0, gableY, -d / 2 - over + 0.02, 2, cell());
  } else {
    glazing(group, { frame: trim }, 0.45, 0.5, w / 2 + over - 0.02, gableY, 0, 1, cell());
    if (kind !== 1) glazing(group, { frame: trim }, 0.45, 0.5, -w / 2 - over + 0.02, gableY, 0, 3, cell());
  }

  const sillY = base + h * 0.56;
  // Front windows either side of a centered door. With shutters they are narrower
  // and set so each shutter clears both the door casing and the corner board.
  const frontW = shutters ? 0.56 : 0.72;
  const frontX = shutters ? w / 4 + 0.21 : w * 0.3;
  const lamp = warmGlass(1.6);
  let doorX = 0;
  let walkFrom = d / 2 + 0.7;
  if (kind === 0) {
    porch(group, { deck: mat(0x7f7b74), post: trim, roof: roofMat, trim }, {
      x: 0, width: w + 0.1, depth: 1.2, wall: d / 2, roofAt: eave - 0.32, fall: 0.25, posts: 4, steps: 0, rail: 'spindles'
    });
    for (const wx of [-frontX, frontX]) glazing(group, sash, frontW, 0.95, wx, sillY, d / 2, 0, cell());
    // The porch light hangs on a short rod from the sloping porch ceiling, in front of the door.
    const ceiling = eave - 0.32 - 0.25 * (0.55 / 1.2); // underside of the shed roof 0.55 out from the wall
    block(group, lamp, 0.13, 0.17, 0.13, 0, ceiling - 0.145, d / 2 + 0.55);
    block(group, DARK, 0.03, 0.08, 0.03, 0, ceiling - 0.03, d / 2 + 0.55);
    walkFrom = d / 2 + 1.8;
  } else if (kind === 1) {
    // A gabled hood over the door on two brackets, and a stone stoop.
    // The hood spans the door casing and no more, so the shutters beside it stay clear.
    const hood = gableRoof(1.04, 0.62, 0.3, roofMat);
    hood.position.set(0, DECK_TOP + 1.72, d / 2 + 0.28);
    group.add(hood);
    block(group, trim, 1.04, 0.08, 0.62, 0, DECK_TOP + 1.68, d / 2 + 0.28);
    for (const s of [-1, 1]) block(group, trim, 0.07, 0.3, 0.26, s * 0.45, DECK_TOP + 1.52, d / 2 + 0.12);
    // A lantern hangs under the hood.
    block(group, lamp, 0.12, 0.14, 0.12, 0, DECK_TOP + 1.52, d / 2 + 0.34);
    block(group, DARK, 0.03, 0.06, 0.03, 0, DECK_TOP + 1.61, d / 2 + 0.34);
    block(group, stone, 1.2, DECK_TOP, 0.62, 0, DECK_TOP / 2, d / 2 + 0.31);
    block(group, stone, 0.9, 0.2, 0.3, 0, 0.1, d / 2 + 0.77);
    for (const wx of [-frontX, frontX]) glazing(group, boxed, frontW, 0.95, wx, sillY, d / 2, 0, cell());
    // Two dormers on the front slope.
    // Each sits low on the slope, its back buried in the roof behind it.
    const slope = d / 2 + over;
    const faceZ = d / 2 - 0.05;
    const roofAt = (y: number) => slope * (1 - (y - eave) / peak); // z where the slope reaches height y
    const roofY = eave + peak * (1 - faceZ / slope);
    const bodyBack = roofAt(roofY + 1.0);
    const capBack = roofAt(roofY + 1.32) - 0.1;
    for (const dx of [-w * 0.25, w * 0.25]) {
      block(group, siding, 0.95, 1.3, faceZ - bodyBack, dx, roofY + 0.25, (faceZ + bodyBack) / 2);
      const cap = gableRoof(1.2, faceZ + 0.12 - capBack, 0.44, roofMat);
      cap.position.set(dx, roofY + 0.88, (faceZ + 0.12 + capBack) / 2);
      group.add(cap);
      glazing(group, { frame: trim }, 0.5, 0.52, dx, roofY + 0.48, faceZ, 0, cell());
    }
    // The chimney climbs the outside of the left gable end.
    chimney(group, brick, -(w / 2 + 0.25), 0, 0, eave + peak + 0.55, 0.55);
    walkFrom = d / 2 + 0.9;
  } else {
    // An L: a gabled wing stands forward on the right, the door in the crook beside it.
    const ww = w * 0.46;
    const wx = w / 2 - ww / 2;
    const proj = 1.0;
    block(group, stone, ww + 0.16, 0.26, proj + 0.1, wx, 0.13, d / 2 + proj / 2);
    block(group, siding, ww, h, proj + 0.1, wx, base + h / 2, d / 2 + proj / 2 - 0.05);
    for (const s of [-1, 1]) block(group, trim, 0.12, h, 0.12, wx + s * (ww / 2 - 0.02), base + h / 2, d / 2 + proj - 0.02);
    const wingDepth = d / 2 + proj + over;
    const wing = gableRoof(ww + 2 * over, wingDepth, peak * 0.82, roofMat);
    wing.position.set(wx, eave, wingDepth / 2);
    group.add(wing);
    block(group, trim, ww + 2 * over, 0.1, wingDepth, wx, eave + 0.02, wingDepth / 2);
    const planted: Sash = { frame: trim, flowers: blooms };
    for (const s of [-1, 1]) glazing(group, planted, 0.48, 0.92, wx + s * 0.34, sillY, d / 2 + proj, 0, cell());
    glazing(group, { frame: trim }, 0.4, 0.42, wx, eave + peak * 0.82 * 0.33, d / 2 + proj + over - 0.02, 0, cell());
    const crook = w - ww;
    doorX = w / 2 - ww - 0.55;
    porch(group, { deck: mat(0x7f7b74), post: trim, roof: roofMat, trim }, {
      x: -w / 2 + crook / 2, width: crook, depth: proj, wall: d / 2, roofAt: eave - 0.3, fall: 0.22, posts: 2, steps: doorX, rail: null
    });
    // The window in the crook fills the wall between the corner board and the door casing.
    const left = -w / 2 + 0.1;
    const right = doorX - 0.52;
    glazing(group, planted, Math.min(0.68, right - left - 0.26), 0.95, (left + right) / 2, sillY, d / 2, 0, cell());
    block(group, lamp, 0.1, 0.16, 0.12, w / 2 - ww - 0.06, DECK_TOP + 1.45, d / 2 + 0.45);
    chimney(group, brick, -w * 0.28, -d * 0.18, eave, eave + peak * 0.85 + 0.35);
    walkFrom = d / 2 + proj + 0.6;
  }
  if (kind === 0) chimney(group, brick, w * 0.26, -d * 0.2, eave, eave + peak * 0.8 + 0.3);

  // Front door and its frame (each kind hangs its own porch light above).
  block(group, doorMat, 0.72, 1.45, 0.08, doorX, DECK_TOP + 0.72, d / 2 + 0.03);
  block(group, trim, 0.92, 1.6, 0.05, doorX, DECK_TOP + 0.76, d / 2 + 0.01);

  // The flanks (never inside the garage) and the back.
  if (!(garage && garageSide < 0)) {
    const flank: Sash = kind === 1 ? { frame: trim, head: true } : sash; // the Cape's chimney stands between these
    for (const fz of kind === 1 ? [-d * 0.27, d * 0.27] : [0]) glazing(group, flank, 0.66, 0.9, -w / 2, sillY, fz, 3, cell());
  }
  if (!(garage && garageSide > 0)) glazing(group, sash, 0.66, 0.9, w / 2, sillY, 0, 1, cell());
  for (const bx of [-w * 0.28, w * 0.28]) glazing(group, sash, 0.66, 0.9, bx, sillY, -d / 2, 2, cell());

  // Attached garage with a row of windows in its door and a lamp over it, and a driveway out to the street.
  if (garage) {
    const gw = 1.9;
    const gh = 1.75;
    const gd = 2.4;
    const gx = garageSide * (w / 2 + gw / 2 - 0.05);
    const gz = d * 0.1 - 0.15;
    const front = gz + gd / 2;
    block(group, stone, gw + 0.1, 0.26, gd + 0.1, gx, 0.13, gz);
    block(group, siding, gw, gh, gd, gx, base + gh / 2, gz);
    const garageRoof = gableRoof(gd + 0.4, gw + 0.35, 0.75, roofMat);
    garageRoof.rotation.y = Math.PI / 2;
    garageRoof.position.set(gx, base + gh, gz);
    group.add(garageRoof);
    block(group, trim, gw + 0.35, 0.08, gd + 0.4, gx, base + gh + 0.02, gz);
    block(group, mat(0xdcd8cc), gw * 0.82, gh * 0.74, 0.07, gx, base + gh * 0.37, front + 0.02);
    for (let i = 1; i < 4; i += 1) block(group, mat(0xb8b3a6), gw * 0.82, 0.03, 0.09, gx, base + (gh * 0.74 * i) / 4, front + 0.04);
    for (let i = 0; i < 4; i += 1) block(group, DARK, gw * 0.15, 0.13, 0.09, gx + (i - 1.5) * gw * 0.2, base + gh * 0.6, front + 0.04);
    block(group, warmGlass(1.3), 0.1, 0.14, 0.1, gx, base + gh * 0.86, front + 0.08);
    block(group, DRIVE, gw * 0.92, 0.05, yard - front - 0.05, gx, 0.075, (front + yard) / 2);
  }

  // Front walk, foundation planting, the mailbox, and on some streets a picket fence.
  block(group, PATH, 0.7, 0.05, Math.max(0.2, yard - walkFrom), doorX, 0.075, (walkFrom + yard) / 2);
  const plantZ = kind === 0 ? d / 2 + 1.55 : d / 2 + 0.42;
  for (const px of [-w / 2 + 0.35, w / 2 - 0.35]) {
    if (kind === 2) continue; // the wing and the crook porch fill the L's front
    if (Math.abs(px - doorX) > 0.8) shrub(group, px, plantZ, 0.32, rand);
  }
  block(group, mat(0x4a3d2b), 0.08, 0.7, 0.08, doorX - 0.65, 0.35, yard - 0.25);
  block(group, mat(0x3a4a5a), 0.3, 0.17, 0.18, doorX - 0.65, 0.72, yard - 0.25);
  if (rand() < 0.5) {
    const gaps: [number, number][] = [[shift + doorX - 0.45, shift + doorX + 0.45]];
    if (garage) {
      const gx = shift + garageSide * (w / 2 + 0.9);
      gaps.push([gx - 1.0, gx + 1.0]);
    }
    picketFence(lot, trim, -yard + 0.35, yard - 0.35, yard - 0.42, gaps);
  }

  // The back yard, hedged on every side but the drive's.
  gardenHedges(lot, yard, garage ? [-garageSide] : [-1, 1]);
  // Halfway between the back wall and the back hedge, but never into the hedge.
  const backZ = Math.max(-(d / 2 + yard) / 2, -yard + 1.4);
  backYard(lot, rand, siding, [
    [-yard * 0.5, backZ, 0],
    [yard * 0.48, backZ + 0.05, 0]
  ]);

  return eave + peak + 0.25;
}

// ---------------------------------------------------------------------------
// TIER 2: the big house. Brick below, siding above, a hipped roof with front
// gables, a portico, a bay window, a two-car garage, and a pool out back.
// ---------------------------------------------------------------------------

export function buildLargeHouse(group: THREE.Group, rand: () => number, yard: number): number {
  const siding = mat(pick(rand, [0xd6ccb4, 0xb6c4d8, 0xdcc0b2, 0xc0d4be, 0xe4dcc8, 0xcfc1a0]));
  const brick = mat(pick(rand, [0xa06a52, 0x8c5a48, 0xb07c5e, 0x8a7468]));
  const trimWhite = mat(0xf3f1e8);
  const roofMat = mat(pick(rand, [0x4f3a34, 0x444c58, 0x5c4638, 0x3c4a44]));
  const shutterMat = mat(pick(rand, [0x2f3a2f, 0x2c3440, 0x3a2c2a]));
  const blooms = [mat(0x5f4a3a), mat(pick(rand, FLOWER_COLORS)), mat(pick(rand, FLOWER_COLORS))];
  const cell = () => windowCell(rand, 0.7);

  const w = 5.2 + rand() * 0.7;
  const d = 4.2 + rand() * 0.6;
  const floor1 = 2.4;
  const floor2 = 2.2;
  const sash: Sash = { frame: trimWhite, shutters: shutterMat, head: true };

  // The house sits left of the lot's center so its garage wing stays inside the curb.
  const body = new THREE.Group();
  body.position.x = -0.9;
  group.add(body);

  block(body, mat(0x5f574d), w + 0.3, 0.3, d + 0.3, 0, 0.15, 0);
  // Brick first floor, sided second floor, a belt course between.
  block(body, brick, w, floor1, d, 0, floor1 / 2 + 0.2, 0);
  block(body, siding, w * 0.96, floor2, d * 0.96, 0, floor1 + floor2 / 2 + 0.2, 0);
  block(body, trimWhite, w + 0.06, 0.12, d + 0.06, 0, floor1 + 0.22, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) block(body, trimWhite, 0.12, floor2, 0.12, sx * (w * 0.48 - 0.02), floor1 + floor2 / 2 + 0.2, sz * (d * 0.48 - 0.02));
  }

  const bodyTop = floor1 + floor2 + 0.2;

  // A hipped roof with one or two gables to the street.
  const peak = 1.8;
  const over = 0.35;
  const main = hipRoof(w + 2 * over, d + 2 * over, peak, roofMat);
  main.position.y = bodyTop;
  body.add(main);
  block(body, trimWhite, w + 2 * over, 0.12, d + 2 * over, 0, bodyTop + 0.02, 0);
  for (const s of [-1, 1]) block(body, trimWhite, w + 2 * over, 0.09, 0.09, 0, bodyTop - 0.02, s * (d / 2 + over - 0.04));
  block(body, trimWhite, 0.08, bodyTop - 0.2, 0.08, -(w / 2 + 0.06), bodyTop / 2 + 0.1, d / 2 + 0.12);
  const gables = [[0], [-w * 0.24], [-w * 0.26, w * 0.26]][Math.floor(rand() * 3)];
  // Height of the hipped roof over x at z = -0.2, where each gable's ridge runs into it.
  const hipW = w + 2 * over;
  const hipD = d + 2 * over;
  const hipAt = (x: number) =>
    peak * Math.min(1 - 0.2 / (hipD / 2), 1 - Math.max(0, Math.abs(x) - (hipW - hipD) / 2) / (hipD / 2));
  for (const gx of gables) {
    const gw = w * (gables.length > 1 ? 0.3 : 0.42);
    const depth = d / 2 + over + 0.2;
    // Never higher than the hip it meets, so the ridge runs into the roof instead of over it.
    const rise = Math.min(peak * (gables.length > 1 ? 0.6 : gx === 0 ? 0.8 : 0.7), hipAt(gx) - 0.06);
    const gable = gableRoof(gw, depth, rise, roofMat);
    gable.position.set(gx, bodyTop, d / 2 + over - depth / 2);
    body.add(gable);
    block(body, trimWhite, gw, 0.1, depth, gx, bodyTop + 0.02, d / 2 + over - depth / 2);
    glazing(body, { frame: trimWhite }, 0.42, 0.48, gx, bodyTop + rise * 0.36, d / 2 + over - 0.02, 0, cell());
  }

  for (const cx of [-w * 0.35, w * 0.4]) chimney(body, brick, cx, -d * 0.2, bodyTop, bodyTop + 1.6);

  // Grand portico: a low pediment on four columns, its apex under the upper windows' sills.
  const colH = floor1 - 0.1;
  for (const cx of [-1.05, -0.35, 0.35, 1.05]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, colH, 10), trimWhite);
    col.position.set(cx, colH / 2 + 0.2, d / 2 + 1.1);
    body.add(col);
  }
  block(body, trimWhite, 2.7, 0.3, 1.4, 0, colH + 0.35, d / 2 + 0.7); // entablature
  const ped = gableRoof(2.7, 1.4, 0.4, trimWhite);
  ped.position.set(0, colH + 0.5, d / 2 + 0.7);
  body.add(ped);
  block(body, mat(0x8a8378), 2.6, 0.14, 1.5, 0, 0.27, d / 2 + 0.75); // portico floor
  // Double front door with a fanlight, lanterns either side.
  block(body, mat(0x3a2a22), 1.2, 1.8, 0.12, 0, 1.1, d / 2 + 0.02);
  block(body, trimWhite, 1.42, 2.1, 0.06, 0, 1.15, d / 2 + 0.005);
  block(body, warmGlass(1.0), 1.0, 0.26, 0.13, 0, 2.18, d / 2 + 0.03);
  for (const s of [-1, 1]) block(body, warmGlass(1.4), 0.14, 0.2, 0.14, s * 0.78, 1.65, d / 2 + 0.12);

  // A square bay window bumping out the front left, under its own little hipped roof.
  const bx = -(w / 2 - 0.8);
  const bayY = 0.2 + floor1 * 0.48;
  block(body, brick, 1.3, 0.5, 0.62, bx, 0.45, d / 2 + 0.31);
  block(body, trimWhite, 1.3, 1.5, 0.62, bx, 1.45, d / 2 + 0.31); // from the brick base up to the bay's roof
  glazing(body, { frame: trimWhite }, 0.94, 1.0, bx, bayY + 0.2, d / 2 + 0.62, 0, cell());
  for (const s of [-1, 1]) glazing(body, { frame: trimWhite }, 0.32, 1.0, bx + s * 0.65, bayY + 0.2, d / 2 + 0.31, s > 0 ? 1 : 3, cell());
  const bayRoof = hipRoof(1.5, 0.8, 0.4, roofMat);
  bayRoof.position.set(bx, bayY + 0.85, d / 2 + 0.36);
  body.add(bayRoof);

  // Windows: three across the upper floor, one right of the door, and round the sides and back.
  const upperY = floor1 + floor2 * 0.55 + 0.2;
  const lowerY = 0.2 + floor1 * 0.55;
  for (const wx of [-w * 0.3, 0, w * 0.3]) glazing(body, sash, 0.7, 0.92, wx, upperY, d * 0.48, 0, cell());
  glazing(body, { ...sash, flowers: blooms }, 0.74, 1.0, w / 2 - 0.8, lowerY, d / 2, 0, cell());
  for (const wy of [lowerY, upperY]) {
    const inset = wy === upperY ? 0.48 : 0.5;
    glazing(body, sash, 0.62, 0.84, -w * inset, wy, d * 0.12, 3, cell());
    for (const wx of [-w * 0.3, 0, w * 0.3]) glazing(body, sash, 0.66, 0.88, wx, wy, -d * inset, 2, cell());
  }

  // Two-car garage wing: paneled doors with a row of lights, a coach lamp between them.
  const gw = 2.4;
  const gh = 2.1;
  const gd = 3.4;
  const gx = w / 2 + gw / 2 - 0.2;
  const gz = -d * 0.05;
  const garageFront = gz + gd / 2;
  block(body, siding, gw, gh, gd, gx, gh / 2 + 0.2, gz);
  block(body, mat(0x5f574d), gw + 0.1, 0.3, gd + 0.1, gx, 0.15, gz);
  const garageRoof = gableRoof(gd + 0.4, gw + 0.4, 1, roofMat);
  garageRoof.rotation.y = Math.PI / 2;
  garageRoof.position.set(gx, gh + 0.2, gz);
  body.add(garageRoof);
  block(body, trimWhite, gw + 0.4, 0.1, gd + 0.4, gx, gh + 0.22, gz);
  for (const doorX of [gx - gw * 0.24, gx + gw * 0.24]) {
    block(body, mat(0xdad6ca), gw * 0.42, gh * 0.7, 0.08, doorX, gh * 0.37 + 0.2, garageFront + 0.02);
    for (let i = 0; i < 3; i += 1) block(body, DARK, gw * 0.08, 0.13, 0.09, doorX + (i - 1) * gw * 0.12, gh * 0.6 + 0.2, garageFront + 0.04);
  }
  block(body, warmGlass(1.3), 0.12, 0.18, 0.12, gx, gh * 0.82 + 0.2, garageFront + 0.08);

  // Landscaping: driveway, walk with lamp posts, hedges and shrubs along the front.
  const ox = body.position.x;
  block(group, DRIVE, gw + 0.3, 0.05, yard - garageFront - 0.05, ox + gx, 0.075, (garageFront + yard) / 2);
  block(group, PATH, 1, 0.05, yard - d / 2 - 1.5, ox, 0.075, (d / 2 + 1.5 + yard) / 2);
  for (const s of [-1, 1]) {
    block(group, DARK, 0.07, 1.0, 0.07, ox + s * 0.75, 0.5, yard - 0.7);
    block(group, warmGlass(1.5), 0.17, 0.2, 0.17, ox + s * 0.75, 1.08, yard - 0.7);
  }
  // Under the right-hand window, clear of the drive (the bay fills the left).
  shrub(body, w / 2 - 0.75, d / 2 + 0.45, 0.34, rand);

  gardenHedges(group, yard, [-1]);

  // Out back: a lit pool with two loungers, or a patio and a barbecue.
  const backZ = -(d / 2 + yard - 0.55) / 2;
  if (rand() < 0.6) {
    const px = ox - 0.2;
    block(group, PAVERS, 3.8, 0.06, 1.55, px, 0.05, backZ);
    block(group, mat(0x56c1d6, { roughness: 0.2, emissive: 0x1a8fb5, emissiveIntensity: 0.9 }), 2.3, 0.03, 1.0, px - 0.45, 0.09, backZ);
    for (const s of [-1, 1]) {
      const lounger = block(group, trimWhite, 0.38, 0.08, 0.95, px + 1.35 + s * 0.25, 0.2, backZ + 0.05);
      lounger.rotation.x = -0.12;
    }
  } else {
    const g = new THREE.Group();
    g.position.set(ox - 0.6, 0.05, backZ - 0.2); // the umbrella clears the back wall
    patio(g, rand, trimWhite);
    group.add(g);
  }

  return bodyTop + peak + 0.4;
}
