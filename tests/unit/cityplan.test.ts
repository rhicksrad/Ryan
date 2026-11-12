import { describe, expect, it } from 'vitest';
import raw from '../../content/projects.json';
import { buildCityPlan, BLOCK } from '../../src/world/cityplan';
import { tierOf, type Project, type WorldData } from '../../src/data';

const data = raw as WorldData;

/** A synthetic town of `n` projects spread across the real districts. */
function townOf(n: number): WorldData {
  const projects: Project[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    title: `Project ${i}`,
    repo: `repo-${i}`,
    district: data.districts[i % data.districts.length].id,
    lang: 'TypeScript',
    commits: [1, 4, 12, 30, 80, 200, 900][i % 7],
    blurb: '',
    demo: null,
    quotes: [],
    pushedAt: '2025-01-01'
  }));
  return { ...data, projects };
}

describe.each([
  ['the real town', data],
  ['a hamlet of 3', townOf(3)],
  ['a town of 25', townOf(25)],
  ['a metropolis of 150', townOf(150)]
])('city plan for %s', (_name, world) => {
  const plan = buildCityPlan(world);

  it('gives every project exactly one lot', () => {
    expect(plan.placements.map((p) => p.project.id).sort()).toEqual(world.projects.map((p) => p.id).sort());
  });

  it('never puts two buildings on the same ground', () => {
    const lots = plan.placements.map((p) => p.lot);
    for (let i = 0; i < lots.length; i += 1) {
      for (let j = i + 1; j < lots.length; j += 1) {
        const gap = Math.max(Math.abs(lots[i].x - lots[j].x), Math.abs(lots[i].z - lots[j].z));
        expect(gap).toBeGreaterThanOrEqual(BLOCK / 2 - 0.01);
      }
    }
  });

  it('keeps every lot inside the town limits and out of the river', () => {
    const { minX, maxX, minZ, maxZ } = plan.bounds;
    for (const { lot } of plan.placements) {
      expect(lot.x).toBeGreaterThan(minX);
      expect(lot.x).toBeLessThan(maxX);
      expect(lot.z).toBeGreaterThan(minZ);
      expect(lot.z).toBeLessThan(maxZ);
      expect(Math.abs(lot.x - plan.riverX)).toBeGreaterThan(BLOCK / 2);
    }
  });

  it('builds on district blocks only, never the plaza or a park', () => {
    for (const { lot, district } of plan.placements) {
      const home = plan.blocks.find((b) => Math.abs(b.x - lot.x) < BLOCK / 2 && Math.abs(b.z - lot.z) < BLOCK / 2);
      expect(home?.kind).toBe('district');
      expect(home?.districtId).toBe(district.id);
    }
  });

  it('wastes little land', () => {
    // The project grid, not counting the ring of neighbourhood blocks around it.
    const grid = plan.blocks.filter((b) => b.kind !== 'fabric');
    const parks = grid.filter((b) => b.kind === 'park').length;
    expect(parks).toBeGreaterThanOrEqual(1);
    // The smallest grid is 4×3, so a hamlet is mostly park; past that, land is tight.
    if (grid.length > 12) expect(parks).toBeLessThanOrEqual(Math.max(4, grid.length * 0.25));
  });

  it('rings the project grid with neighbourhood blocks that hold no projects', () => {
    const ring = plan.blocks.filter((b) => b.kind === 'fabric');
    expect(ring.length).toBeGreaterThan(0);
    for (const { lot } of plan.placements) {
      const home = ring.find((b) => Math.abs(b.x - lot.x) < BLOCK / 2 && Math.abs(b.z - lot.z) < BLOCK / 2);
      expect(home).toBeUndefined();
    }
    const { core, bounds } = plan;
    expect(core.minX).toBeGreaterThan(bounds.minX);
    expect(core.maxX).toBeLessThan(bounds.maxX);
    expect(core.minZ).toBeGreaterThan(bounds.minZ);
    expect(core.maxZ).toBeLessThan(bounds.maxZ);
  });

  it('keeps unnamed buildings off project lots, off the river, and inside town', () => {
    const { minX, maxX, minZ, maxZ } = plan.bounds;
    for (const f of plan.fillers) {
      const half = Math.max(f.w, f.d) / 2;
      expect(f.x - half).toBeGreaterThan(minX);
      expect(f.x + half).toBeLessThan(maxX);
      expect(f.z - half).toBeGreaterThan(minZ);
      expect(f.z + half).toBeLessThan(maxZ);
      expect(Math.abs(f.x - plan.riverX) - half).toBeGreaterThan(0);
      for (const { lot, project } of plan.placements) {
        // A tower's podium is about 10.6 wide; everything else stays within its quarter lot.
        const reach = tierOf(project.commits) === 4 ? 5.3 : 3.6;
        const gap = Math.max(Math.abs(f.x - lot.x) - f.w / 2, Math.abs(f.z - lot.z) - f.d / 2);
        expect(gap).toBeGreaterThanOrEqual(reach);
      }
    }
  });

  it('ranks towers so neighbours can differ', () => {
    const ranks = plan.placements.filter((p) => tierOf(p.project.commits) === 4).map((p) => p.towerRank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(ranks.every((r) => r >= 0)).toBe(true);
  });
});

describe('content/projects.json', () => {
  it('has unique ids and repos, known districts, and no ignored repo', () => {
    const ids = data.projects.map((p) => p.id);
    const repos = data.projects.map((p) => p.repo.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(repos).size).toBe(repos.length);
    const districts = new Set(data.districts.map((d) => d.id));
    for (const project of data.projects) {
      expect(districts.has(project.district)).toBe(true);
      expect(project.commits).toBeGreaterThan(0);
      expect(project.quotes.length).toBeGreaterThan(0);
      expect(project.pushedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
