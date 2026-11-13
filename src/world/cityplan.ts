import type { Project, District, WorldData } from '../data';
import { tierOf } from '../data';
import { rngFor } from './rng';

/**
 * The town plan. A grid of city blocks separated by roads, with a river
 * running north–south between the mainland and the east bank.
 *
 * Nothing here is hard-coded to a project count: the grid is sized to fit
 * however many projects exist, districts are dealt out as wedges around the
 * central plaza, and whatever is left over becomes parkland. Add a repo and
 * the town re-plans itself.
 */

export const BLOCK = 23; // block edge length
export const ROAD = 6; // road width
export const PITCH = BLOCK + ROAD; // block center spacing
export const RIVER_EXTRA = 12; // extra gap where the river runs
export const RIVER_WIDTH = PITCH + RIVER_EXTRA - BLOCK; // open water span

export interface Lot {
  x: number;
  z: number;
  /** Usable square footprint of the lot. */
  size: number;
}

export interface Placement {
  project: Project;
  district: District;
  lot: Lot;
  /** Rank among the city's skyscrapers (tallest first); -1 for everything else. */
  towerRank: number;
  /** Which way the front door faces: toward the street the lot sits on. */
  rotationY: number;
}

/**
 * A building that is not a project: the ordinary town that grew up around the
 * named ones. Drawn quieter, never labelled, never clickable.
 */
export interface Filler {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rotationY: number;
  kind: 'house' | 'walkup' | 'office';
  /** Picks a finish from that kind's small palette. */
  style: number;
  /** Houses: how far the lawn runs from the house's center to the pavement in front. */
  yard?: number;
}

export interface RoadStrip {
  x: number;
  z: number;
  length: number;
  horizontal: boolean;
}

export type BlockKind = 'plaza' | 'park' | 'district' | 'fabric';

export interface PlanBlock {
  col: number;
  row: number;
  x: number;
  z: number;
  kind: BlockKind;
  districtId: string | null;
  /** Downtown lots are paved; everything else is grass. */
  paved: boolean;
}

export interface CityPlan {
  placements: Placement[];
  /** The unnamed town around the projects. */
  fillers: Filler[];
  /** Cars parked at the kerb. `along` is true when the car points down the x axis. */
  parked: { x: number; z: number; along: boolean }[];
  blocks: PlanBlock[];
  /** Grass patches: house lawns and unbuilt lots. */
  lawns: Lot[];
  roads: RoadStrip[];
  intersections: { x: number; z: number }[];
  bridges: { z: number }[];
  trees: { x: number; z: number; kind: 'pine' | 'round'; street?: boolean }[];
  lamps: { x: number; z: number }[];
  signs: { x: number; z: number; district: District; rotationY: number }[];
  /** Unbuilt lots, each advertising for the next project. */
  vacancies: { x: number; z: number; rotationY: number }[];
  parkBlocks: { x: number; z: number; main: boolean }[];
  plaza: { x: number; z: number };
  riverX: number;
  /** The cross-streets that continue out of town as highways. */
  mainStreetZ: number;
  mainAvenueX: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The project grid alone, without the outer ring of neighbourhood blocks. */
  core: { minX: number; maxX: number; minZ: number; maxZ: number };
  center: { x: number; z: number };
}

/** Quarter-lot offsets within a block. */
const QUARTERS: [number, number][] = [
  [-BLOCK / 4, -BLOCK / 4],
  [BLOCK / 4, -BLOCK / 4],
  [-BLOCK / 4, BLOCK / 4],
  [BLOCK / 4, BLOCK / 4]
];

/** How many whole blocks a district needs: one per tower, four smaller lots per block. */
function blocksNeeded(projects: Project[]): number {
  const towers = projects.filter((p) => tierOf(p.commits) === 4).length;
  return towers + Math.ceil((projects.length - towers) / 4);
}

/** Pick the tidiest grid that fits `needed` blocks: little waste, wider than deep. */
function chooseGrid(needed: number): { cols: number; rows: number } {
  let best = { cols: 4, rows: 3 };
  let bestScore = Infinity;
  for (let rows = 3; rows <= 8; rows += 1) {
    const cols = Math.max(4, Math.ceil(needed / rows));
    const waste = cols * rows - needed;
    const score = waste + Math.abs(cols / rows - 1.4) * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows };
    }
  }
  return best;
}

export function buildCityPlan(data: WorldData): CityPlan {
  const rand = rngFor('city-plan');

  const byDistrict = data.districts.map((district) => ({
    district,
    projects: data.projects
      .filter((p) => p.district === district.id)
      .sort((a, b) => b.commits - a.commits)
  }));
  const needed = byDistrict.reduce((sum, d) => sum + blocksNeeded(d.projects), 0) + 2; // + plaza + park
  const { cols, rows } = chooseGrid(needed);

  // The plaza sits mid-grid; the river runs just east of the riverside park.
  const plazaCol = Math.floor((cols - 1) / 2);
  const plazaRow = Math.floor((rows - 1) / 2);
  const riverCol = Math.min(plazaCol + 1, cols - 2); // river flows between riverCol and riverCol + 1
  const colX = (c: number) => (c - plazaCol) * PITCH + (c > riverCol ? RIVER_EXTRA : 0);
  const rowZ = (r: number) => (r - plazaRow) * PITCH;
  const riverX = (colX(riverCol) + colX(riverCol + 1)) / 2;

  // The project grid, wrapped in one ring of ordinary neighbourhood blocks so the
  // town thins out into the countryside instead of stopping at a hard edge.
  const blocks: PlanBlock[] = [];
  for (let c = -1; c <= cols; c += 1) {
    for (let r = -1; r <= rows; r += 1) {
      const ring = c < 0 || c >= cols || r < 0 || r >= rows;
      blocks.push({ col: c, row: r, x: colX(c), z: rowZ(r), kind: ring ? 'fabric' : 'district', districtId: null, paved: false });
    }
  }
  const blockAt = (c: number, r: number) => blocks.find((b) => b.col === c && b.row === r)!;
  const plazaBlock = blockAt(plazaCol, plazaRow);
  plazaBlock.kind = 'plaza';
  const parkBlock = blockAt(Math.min(plazaCol + 1, cols - 1), plazaRow);
  parkBlock.kind = 'park';

  // Spare blocks become parkland, starting from the far corners.
  const distance = (b: PlanBlock) => Math.hypot(b.x - plazaBlock.x, b.z - plazaBlock.z);
  const free = blocks.filter((b) => b.kind === 'district');
  const spare = free.length - (needed - 2);
  free
    .slice()
    .sort((a, b) => distance(b) - distance(a) || a.col - b.col || a.row - b.row)
    .slice(0, Math.max(spare, 0))
    .forEach((b) => {
      b.kind = 'park';
    });

  // Deal the remaining blocks out as wedges around the plaza, starting due west.
  const angleOf = (b: PlanBlock) => {
    const a = Math.atan2(b.z - plazaBlock.z, b.x - plazaBlock.x) - Math.PI; // west = 0
    return (a + Math.PI * 4) % (Math.PI * 2);
  };
  const ring = blocks
    .filter((b) => b.kind === 'district')
    .sort((a, b) => angleOf(a) - angleOf(b) || distance(a) - distance(b));
  // Rotate the deal so the first district straddles due west rather than starting there.
  const firstNeed = byDistrict.length > 0 ? blocksNeeded(byDistrict[0].projects) : 0;
  const shift = Math.floor(firstNeed / 2);
  const dealt = ring.slice(ring.length - shift).concat(ring.slice(0, ring.length - shift));

  const placements: Placement[] = [];
  const lawns: Lot[] = [];
  const trees: CityPlan['trees'] = [];
  const signs: CityPlan['signs'] = [];
  const vacancies: CityPlan['vacancies'] = [];
  const lotBlock = new Map<Lot, PlanBlock>();
  const towerBlocks: PlanBlock[] = [];
  const fillers: Filler[] = [];

  let cursor = 0;
  for (const { district, projects } of byDistrict) {
    const count = blocksNeeded(projects);
    const mine = dealt.slice(cursor, cursor + count).sort((a, b) => distance(a) - distance(b));
    cursor += count;
    mine.forEach((b) => {
      b.districtId = district.id;
    });
    if (mine.length === 0) continue;

    // Towers claim whole blocks nearest the plaza; everything else packs into
    // quarter lots, biggest first, working outward — downtown in, suburbs out.
    const blockQueue = mine.slice();
    const lotQueue: Lot[] = [];
    for (const project of projects) {
      if (tierOf(project.commits) === 4) {
        const b = blockQueue.shift()!;
        b.paved = true;
        placements.push({ project, district, lot: { x: b.x, z: b.z, size: BLOCK * 0.8 }, towerRank: -1, rotationY: 0 });
        towerBlocks.push(b);
        continue;
      }
      if (lotQueue.length === 0) {
        const b = blockQueue.shift()!;
        // Fill the corners nearest the plaza first.
        const quarters = QUARTERS.map(([qx, qz]) => ({ x: b.x + qx, z: b.z + qz, size: BLOCK / 2 - 2 })).sort(
          (p, q) =>
            Math.hypot(p.x - plazaBlock.x, p.z - plazaBlock.z) - Math.hypot(q.x - plazaBlock.x, q.z - plazaBlock.z)
        );
        quarters.forEach((q) => lotBlock.set(q, b));
        lotQueue.push(...quarters);
      }
      const lot = lotQueue.shift()!;
      const home = lotBlock.get(lot)!;
      // Front doors face the street along the block's north or south edge.
      const south = lot.z > home.z;
      placements.push({ project, district, lot, towerRank: -1, rotationY: south ? 0 : Math.PI });
      if (tierOf(project.commits) === 3) home.paved = true;
      else {
        lawns.push(lot);
        // A couple of garden trees behind each house.
        for (const side of [-1, 1]) {
          if (rand() < 0.25) continue;
          trees.push({
            x: lot.x + side * (lot.size * 0.36 + rand() * 0.6),
            z: lot.z - (south ? 1 : -1) * (lot.size * 0.3 + rand() * 0.8),
            kind: rand() < 0.25 ? 'pine' : 'round'
          });
        }
      }
    }

    // Unbuilt lots wait under grass and a few trees for the next project.
    for (const lot of lotQueue) {
      lawns.push(lot);
      const home = lotBlock.get(lot)!;
      const ox = Math.sign(lot.x - home.x);
      const oz = Math.sign(lot.z - home.z);
      vacancies.push({ x: lot.x + ox * 2.6, z: lot.z + oz * 2.6, rotationY: Math.atan2(ox, oz) });
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i += 1) {
        trees.push({
          x: lot.x - Math.sign(lot.x - home.x) * rand() * lot.size * 0.4,
          z: lot.z - Math.sign(lot.z - home.z) * rand() * lot.size * 0.4,
          kind: rand() < 0.5 ? 'pine' : 'round'
        });
      }
    }

    // Entrance sign on the corner of the district's innermost block, facing the plaza.
    const gate = mine[0];
    const dx = Math.sign(plazaBlock.x - gate.x) || 1;
    const dz = Math.sign(plazaBlock.z - gate.z) || 1;
    const sx = gate.x + dx * (BLOCK / 2 - 0.7);
    const sz = gate.z + dz * (BLOCK / 2 - 0.7);
    signs.push({ x: sx, z: sz, district, rotationY: Math.atan2(plazaBlock.x - sx, plazaBlock.z - sz) });
  }

  // Skyline variety: rank the towers so neighbours get different silhouettes.
  placements
    .filter((p) => tierOf(p.project.commits) === 4)
    .sort((a, b) => b.project.commits - a.project.commits)
    .forEach((p, i) => {
      p.towerRank = i;
    });

  // --- Roads: strips between block rows/cols (the river replaces one). ---
  const roads: RoadStrip[] = [];
  const minX = colX(-1) - BLOCK / 2 - ROAD;
  const maxX = colX(cols) + BLOCK / 2 + ROAD;
  const minZ = rowZ(-1) - BLOCK / 2 - ROAD;
  const maxZ = rowZ(rows) + BLOCK / 2 + ROAD;
  const core = {
    minX: colX(0) - BLOCK / 2,
    maxX: colX(cols - 1) + BLOCK / 2,
    minZ: rowZ(0) - BLOCK / 2,
    maxZ: rowZ(rows - 1) + BLOCK / 2
  };

  const streetZs: number[] = [];
  for (let r = -1; r < rows; r += 1) streetZs.push((rowZ(r) + rowZ(r + 1)) / 2);
  const avenueXs: number[] = [];
  for (let c = -1; c < cols; c += 1) {
    if (c === riverCol) continue;
    avenueXs.push((colX(c) + colX(c + 1)) / 2);
  }
  for (const z of streetZs) {
    roads.push({ x: (minX + maxX) / 2, z, length: maxX - minX, horizontal: true });
  }
  for (const x of avenueXs) {
    roads.push({ x, z: (minZ + maxZ) / 2, length: maxZ - minZ, horizontal: false });
  }
  const intersections = avenueXs.flatMap((x) => streetZs.map((z) => ({ x, z })));
  const bridges = streetZs.map((z) => ({ z }));

  const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const nearest = (values: number[], target: number) =>
    values.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), values[0]);
  const mainStreetZ = nearest(streetZs, center.z);
  const mainAvenueX = nearest(avenueXs, center.x);

  // --- Street lamps at every block corner. ---
  const lamps: CityPlan['lamps'] = [];
  const off = BLOCK / 2 - 0.8;
  for (const b of blocks) {
    for (const dx of [-off, off]) {
      for (const dz of [-off, off]) {
        lamps.push({ x: b.x + dx, z: b.z + dz });
      }
    }
  }

  // --- Street trees along every sidewalk, three to a side. ---
  for (const b of blocks) {
    if (b.kind === 'plaza') continue;
    const edge = BLOCK / 2 - 0.85;
    for (const t of [-6.3, 0, 6.3]) {
      for (const side of [-1, 1]) {
        if (rand() < 0.12) continue;
        trees.push({ x: b.x + t + (rand() - 0.5), z: b.z + side * edge, kind: 'round', street: true });
        trees.push({ x: b.x + side * edge, z: b.z + t + (rand() - 0.5), kind: 'round', street: true });
      }
    }
  }

  // --- Parked cars: kerbs fill up downtown and thin out in the neighbourhoods. ---
  const parked: CityPlan['parked'] = [];
  for (const b of blocks) {
    if (b.kind === 'plaza') continue;
    const kerb = BLOCK / 2 + 0.62;
    for (const t of [-6, -2.2, 2.2, 6]) {
      for (const side of [-1, 1]) {
        const busy = b.paved ? 0.5 : b.kind === 'park' ? 0.3 : 0.14;
        if (rand() < busy) parked.push({ x: b.x + t + (rand() - 0.5) * 0.8, z: b.z + side * kerb, along: true });
        if (rand() < busy) parked.push({ x: b.x + side * kerb, z: b.z + t + (rand() - 0.5) * 0.8, along: false });
      }
    }
  }

  // --- The unnamed town. Downtown towers get neighbours at their back corners. ---
  for (const b of towerBlocks) {
    for (const side of [-1, 1]) {
      const w = 4 + rand() * 0.6;
      fillers.push({
        x: b.x + side * (BLOCK / 2 - 1.6 - w / 2),
        z: b.z - (BLOCK / 2 - 1.6 - w / 2),
        w,
        d: w,
        h: 7 + Math.floor(rand() * 5) * 1.5,
        rotationY: 0,
        kind: 'office',
        style: Math.floor(rand() * 8)
      });
    }
  }
  // Ring blocks: walk-ups and small offices next to downtown, houses farther out.
  const coreMidX = (core.minX + core.maxX) / 2;
  const coreMidZ = (core.minZ + core.maxZ) / 2;
  for (const b of blocks) {
    if (b.kind !== 'fabric') continue;
    const nearDowntown = Math.hypot(b.x - plazaBlock.x, b.z - plazaBlock.z) < PITCH * 2.3;
    const outX = b.col < 0 || b.col >= cols ? Math.sign(b.x - coreMidX) : 0;
    const outZ = b.row < 0 || b.row >= rows ? Math.sign(b.z - coreMidZ) : 0;
    if (nearDowntown) {
      b.paved = true;
      for (const [qx, qz] of QUARTERS) {
        if (rand() < 0.12) continue;
        const w = 6.4 + rand() * 2;
        const d = 6.4 + rand() * 2;
        const office = rand() < 0.3;
        fillers.push({
          x: b.x + qx * 0.94,
          z: b.z + qz * 0.94,
          w,
          d,
          // Kept lower than the project mid-rises so the named buildings own the skyline.
          h: office ? 7.2 + Math.floor(rand() * 3) * 1.5 : 4.5 + Math.floor(rand() * 3) * 1.4,
          rotationY: 0,
          kind: office ? 'office' : 'walkup',
          style: Math.floor(rand() * 8)
        });
      }
      continue;
    }
    // The four corners of the ring are left as woodlots, so the town's outline
    // is a ragged cross that melts into the countryside, not a ruled rectangle.
    if (outX !== 0 && outZ !== 0) {
      for (let i = 0; i < 16; i += 1) {
        trees.push({
          x: b.x + (rand() - 0.5) * (BLOCK - 5),
          z: b.z + (rand() - 0.5) * (BLOCK - 5),
          kind: rand() < 0.45 ? 'pine' : 'round'
        });
      }
      continue;
    }
    // Houses face the streets on all four sides; fewer along the edge that looks out at the fields.
    const sites: [number, number, number][] = [
      [-5.3, -6.9, Math.PI],
      [5.3, -6.9, Math.PI],
      [-5.3, 6.9, 0],
      [5.3, 6.9, 0],
      [-7.2, 0, -Math.PI / 2],
      [7.2, 0, Math.PI / 2]
    ];
    for (const [sx, sz, rotationY] of sites) {
      const outward = (outX !== 0 && Math.sign(sx) === outX && Math.abs(sx) > 6) || (outZ !== 0 && Math.sign(sz) === outZ);
      if (rand() < (outward ? 0.55 : 0.1)) {
        if (rand() < 0.7) trees.push({ x: b.x + sx, z: b.z + sz, kind: rand() < 0.3 ? 'pine' : 'round' });
        continue;
      }
      fillers.push({
        x: b.x + sx,
        z: b.z + sz,
        w: 3.6 + rand() * 1.2,
        d: 3.2 + rand() * 0.8,
        h: rand() < 0.3 ? 4.6 : 2.6,
        rotationY,
        kind: 'house',
        style: Math.floor(rand() * 8),
        // The lawn inside the pavement runs to (BLOCK - 3) / 2 either side of the block's center.
        yard: (BLOCK - 3) / 2 - (Math.abs(Math.sin(rotationY)) > 0.5 ? Math.abs(sx) : Math.abs(sz))
      });
    }
    // Back gardens.
    for (let i = 0; i < 3; i += 1) {
      trees.push({ x: b.x + (rand() - 0.5) * 6, z: b.z + (rand() - 0.5) * 5, kind: rand() < 0.3 ? 'pine' : 'round' });
    }
  }

  // --- Riverbank trees. ---
  for (let i = 0; i < rows * 4; i += 1) {
    const side = rand() < 0.5 ? -1 : 1;
    trees.push({
      x: riverX + side * (RIVER_WIDTH / 2 + 2 + rand() * 2.5),
      z: minZ + rand() * (maxZ - minZ),
      kind: rand() < 0.7 ? 'round' : 'pine'
    });
  }

  // --- Parks: a ring of trees around an open green. ---
  const parkBlocks = blocks
    .filter((b) => b.kind === 'park')
    .map((b) => ({ x: b.x, z: b.z, main: b === parkBlock }));
  for (const park of parkBlocks) {
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
      const r = BLOCK * (0.3 + rand() * 0.14);
      trees.push({
        x: park.x + Math.cos(a) * r,
        z: park.z + Math.sin(a) * r,
        kind: rand() < 0.4 ? 'pine' : 'round'
      });
    }
  }

  return {
    placements,
    fillers,
    parked: parked.filter((c) => Math.abs(c.x - riverX) > RIVER_WIDTH / 2 + 4),
    blocks,
    lawns,
    roads,
    intersections,
    bridges,
    trees,
    lamps,
    signs,
    vacancies,
    parkBlocks,
    plaza: { x: plazaBlock.x, z: plazaBlock.z },
    riverX,
    mainStreetZ,
    mainAvenueX,
    bounds: { minX, maxX, minZ, maxZ },
    core,
    center
  };
}
