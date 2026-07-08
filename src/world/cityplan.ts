import type { Project, District, WorldData } from '../data';
import { tierOf } from '../data';
import { rngFor } from './rng';

/**
 * The town plan. A grid of city blocks separated by roads, with a river
 * running north–south between the mainland and the east bank. Every project
 * is assigned a lot; leftover lots become trees and pocket parks.
 */

export const BLOCK = 23; // block edge length
export const ROAD = 7; // road width
export const PITCH = BLOCK + ROAD; // block center spacing
export const RIVER_EXTRA = 12; // extra gap where the river runs
export const RIVER_COL = 1; // river sits between col 1 and col 2

const COLS = [-2, -1, 0, 1, 2, 3];
const ROWS = [-2, -1, 0, 1, 2];

export function colX(c: number): number {
  return c * PITCH + (c >= RIVER_COL + 1 ? RIVER_EXTRA : 0);
}

export function rowZ(r: number): number {
  return r * PITCH;
}

/** Center of the whole plan so the camera can orbit the true middle. */
export function planCenterX(): number {
  return (colX(COLS[0]) + colX(COLS[COLS.length - 1])) / 2;
}

export const RIVER_CENTER_X = (colX(RIVER_COL) + colX(RIVER_COL + 1)) / 2;
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
}

export interface RoadStrip {
  x: number;
  z: number;
  length: number;
  horizontal: boolean;
}

export interface CityPlan {
  placements: Placement[];
  roads: RoadStrip[];
  bridges: { z: number }[];
  trees: { x: number; z: number; kind: 'pine' | 'round' }[];
  lamps: { x: number; z: number }[];
  signs: { x: number; z: number; district: District; rotationY: number }[];
  parkBlocks: { x: number; z: number }[];
  plaza: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Which blocks belong to which district. Plaza and park are reserved. */
const DISTRICT_BLOCKS: Record<string, [number, number][]> = {
  arcade: [
    [-1, 0], [-1, -1], [-2, -1], [-2, 0], [-1, 1], [-2, 1],
    [-1, -2], [-2, -2], [-1, 2], [-2, 2]
  ],
  data: [
    [2, 0], [2, -1], [2, 1], [3, 0], [3, -1], [3, 1], [2, -2], [3, -2], [2, 2], [3, 2]
  ],
  creative: [
    [0, 1], [0, 2], [1, 2], [1, 1]
  ],
  web: [
    [0, -1], [0, -2], [1, -1], [1, -2]
  ]
};

const PLAZA_BLOCK: [number, number] = [0, 0];
const PARK_BLOCK: [number, number] = [1, 0];

/** Quarter-lot offsets within a block. */
const QUARTERS: [number, number][] = [
  [-BLOCK / 4, -BLOCK / 4],
  [BLOCK / 4, -BLOCK / 4],
  [-BLOCK / 4, BLOCK / 4],
  [BLOCK / 4, BLOCK / 4]
];

export function buildCityPlan(data: WorldData): CityPlan {
  const rand = rngFor('city-plan');
  const placements: Placement[] = [];
  const trees: CityPlan['trees'] = [];
  const lamps: CityPlan['lamps'] = [];

  // --- Assign lots district by district, biggest projects first. ---
  for (const district of data.districts) {
    const blocks = DISTRICT_BLOCKS[district.id] ?? [];
    const projects = data.projects
      .filter((p) => p.district === district.id)
      .sort((a, b) => b.commits - a.commits);

    // Big projects (tier 4) claim whole blocks; the rest pack into quarter lots.
    const fullBlockQueue = blocks.slice();
    const quarterQueue: Lot[] = [];

    for (const project of projects) {
      const tier = tierOf(project.commits);
      if (tier === 4 && fullBlockQueue.length > 0) {
        const [c, r] = fullBlockQueue.shift()!;
        placements.push({
          project,
          district,
          lot: { x: colX(c), z: rowZ(r), size: BLOCK * 0.8 }
        });
        continue;
      }
      if (quarterQueue.length === 0) {
        const next = fullBlockQueue.shift();
        if (next) {
          const [c, r] = next;
          for (const [qx, qz] of QUARTERS) {
            quarterQueue.push({ x: colX(c) + qx, z: rowZ(r) + qz, size: BLOCK / 2 - 2 });
          }
        }
      }
      const lot = quarterQueue.shift();
      if (lot) {
        placements.push({ project, district, lot });
      }
    }

    // Leftover quarter lots and untouched blocks become greenery.
    for (const lot of quarterQueue) {
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i += 1) {
        trees.push({
          x: lot.x + (rand() - 0.5) * lot.size,
          z: lot.z + (rand() - 0.5) * lot.size,
          kind: rand() < 0.5 ? 'pine' : 'round'
        });
      }
    }
    for (const [c, r] of fullBlockQueue) {
      const count = 4 + Math.floor(rand() * 4);
      for (let i = 0; i < count; i += 1) {
        trees.push({
          x: colX(c) + (rand() - 0.5) * BLOCK * 0.8,
          z: rowZ(r) + (rand() - 0.5) * BLOCK * 0.8,
          kind: rand() < 0.5 ? 'pine' : 'round'
        });
      }
    }
  }

  // --- Roads: strips between block rows/cols (skipping the river gap). ---
  const roads: RoadStrip[] = [];
  const minBlockX = colX(COLS[0]) - BLOCK / 2 - ROAD;
  const maxBlockX = colX(COLS[COLS.length - 1]) + BLOCK / 2 + ROAD;
  const minBlockZ = rowZ(ROWS[0]) - BLOCK / 2 - ROAD;
  const maxBlockZ = rowZ(ROWS[ROWS.length - 1]) + BLOCK / 2 + ROAD;

  for (let i = 0; i < ROWS.length - 1; i += 1) {
    const z = (rowZ(ROWS[i]) + rowZ(ROWS[i + 1])) / 2;
    roads.push({
      x: (minBlockX + maxBlockX) / 2,
      z,
      length: maxBlockX - minBlockX,
      horizontal: true
    });
  }
  for (let i = 0; i < COLS.length - 1; i += 1) {
    if (COLS[i] === RIVER_COL) continue; // the river replaces this road
    const x = (colX(COLS[i]) + colX(COLS[i + 1])) / 2;
    roads.push({
      x,
      z: (minBlockZ + maxBlockZ) / 2,
      length: maxBlockZ - minBlockZ,
      horizontal: false
    });
  }

  // --- Bridges wherever a horizontal road crosses the river. ---
  const bridges = roads.filter((r) => r.horizontal).map((r) => ({ z: r.z }));

  // --- Street lamps at every block corner, plus mid-edge lamps along the grid. ---
  const off = BLOCK / 2 + 1.2;
  for (const c of COLS) {
    for (const r of ROWS) {
      for (const dx of [-off, off]) {
        for (const dz of [-off, off]) {
          lamps.push({ x: colX(c) + dx, z: rowZ(r) + dz });
        }
      }
      // one lamp mid-way along each block edge
      lamps.push({ x: colX(c), z: rowZ(r) + off });
      lamps.push({ x: colX(c) + off, z: rowZ(r) });
    }
  }

  // --- Riverbank trees. ---
  for (let i = 0; i < 14; i += 1) {
    const side = rand() < 0.5 ? -1 : 1;
    trees.push({
      x: RIVER_CENTER_X + side * (RIVER_WIDTH / 2 + 2 + rand() * 2.5),
      z: minBlockZ + rand() * (maxBlockZ - minBlockZ),
      kind: rand() < 0.7 ? 'round' : 'pine'
    });
  }

  // --- Park trees. ---
  const parkBlocks = [{ x: colX(PARK_BLOCK[0]), z: rowZ(PARK_BLOCK[1]) }];
  for (const park of parkBlocks) {
    for (let i = 0; i < 12; i += 1) {
      trees.push({
        x: park.x + (rand() - 0.5) * BLOCK * 0.85,
        z: park.z + (rand() - 0.5) * BLOCK * 0.85,
        kind: rand() < 0.5 ? 'pine' : 'round'
      });
    }
  }

  // --- District entrance signs facing the plaza. ---
  const signs: CityPlan['signs'] = [];
  const signSpots: Record<string, { x: number; z: number; rotationY: number }> = {
    arcade: { x: colX(-1) + BLOCK / 2 + ROAD / 2, z: rowZ(0) - BLOCK / 2 - 1.5, rotationY: Math.PI / 2 },
    data: { x: colX(2) - BLOCK / 2 - 2, z: rowZ(0) - BLOCK / 2 - 1.5, rotationY: -Math.PI / 2 },
    creative: { x: colX(0) - BLOCK / 2 - 1.5, z: rowZ(1) - BLOCK / 2 - ROAD / 2, rotationY: 0 },
    web: { x: colX(0) - BLOCK / 2 - 1.5, z: rowZ(-1) + BLOCK / 2 + ROAD / 2, rotationY: Math.PI }
  };
  for (const district of data.districts) {
    const spot = signSpots[district.id];
    if (spot) signs.push({ ...spot, district });
  }

  return {
    placements,
    roads,
    bridges,
    trees,
    lamps,
    signs,
    parkBlocks,
    plaza: { x: colX(PLAZA_BLOCK[0]), z: rowZ(PLAZA_BLOCK[1]) },
    bounds: { minX: minBlockX, maxX: maxBlockX, minZ: minBlockZ, maxZ: maxBlockZ }
  };
}

/** All block centers, for laying pavement. */
export function allBlocks(): { x: number; z: number; isPlaza: boolean; isPark: boolean }[] {
  const blocks: { x: number; z: number; isPlaza: boolean; isPark: boolean }[] = [];
  for (const c of COLS) {
    for (const r of ROWS) {
      blocks.push({
        x: colX(c),
        z: rowZ(r),
        isPlaza: c === PLAZA_BLOCK[0] && r === PLAZA_BLOCK[1],
        isPark: c === PARK_BLOCK[0] && r === PARK_BLOCK[1]
      });
    }
  }
  return blocks;
}
