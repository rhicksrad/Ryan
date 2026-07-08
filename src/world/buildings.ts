import * as THREE from 'three';
import type { Project, District } from '../data';
import { tierOf } from '../data';
import { rngFor } from './rng';
import { windowTexture, houseWindowTexture, billboardTexture, labelSprite } from './textures';

export interface BuildingHandle {
  project: Project;
  group: THREE.Group;
  /** Meshes that participate in raycast picking. */
  pickMeshes: THREE.Mesh[];
  /** Materials whose emissive pulses when hovered/selected. */
  glowMaterials: THREE.MeshStandardMaterial[];
  baseEmissive: number[];
  /** Floating name label, faded by camera distance. */
  label: THREE.Sprite;
  /** Billboard materials that flicker at night. */
  billboards: THREE.MeshStandardMaterial[];
  height: number;
  footprint: number;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

function trimMaterial(accent: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(accent),
    emissive: new THREE.Color(accent),
    emissiveIntensity: 1.4,
    roughness: 0.4,
    metalness: 0.1
  });
}

const WOOD = () =>
  new THREE.MeshStandardMaterial({
    color: 0x6b5a42,
    roughness: 0.95,
    metalness: 0,
    emissive: 0x1a1610,
    emissiveIntensity: 0.5
  });
const SIDING = (tone: number) =>
  new THREE.MeshStandardMaterial({
    color: tone,
    roughness: 0.85,
    metalness: 0.05,
    emissive: new THREE.Color(tone).multiplyScalar(0.22),
    emissiveIntensity: 1
  });
const ROOF_MAT = () =>
  new THREE.MeshStandardMaterial({ color: 0x2e3244, roughness: 0.9, metalness: 0.05 });

/** Tiny glowing window pane stuck on a wall. */
function windowPane(w: number, h: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      color: 0xffcf87,
      emissive: 0xffb85e,
      emissiveIntensity: 1.3,
      roughness: 0.5
    })
  );
}

/** Tier 0 — a couple of commits gets you a leaning shack. */
function buildShack(group: THREE.Group, rand: () => number): number {
  const w = 2.4 + rand() * 0.6;
  const d = 2 + rand() * 0.5;
  const h = 1.9 + rand() * 0.3;

  const body = new THREE.Mesh(BOX.clone(), WOOD());
  body.scale.set(w, h, d);
  body.position.y = h / 2;
  body.rotation.z = (rand() - 0.5) * 0.06; // a little structural honesty
  group.add(body);

  const roof = new THREE.Mesh(BOX.clone(), ROOF_MAT());
  roof.scale.set(w + 0.5, 0.16, d + 0.6);
  roof.position.y = h + 0.05;
  roof.rotation.z = 0.09 + (rand() - 0.5) * 0.04;
  group.add(roof);

  const pane = windowPane(0.5, 0.5);
  pane.position.set(w * 0.2, h * 0.55, d / 2 + 0.01);
  group.add(pane);

  // junk out front: a crate or barrel
  if (rand() < 0.8) {
    const crate = new THREE.Mesh(BOX.clone(), WOOD());
    const s = 0.5 + rand() * 0.25;
    crate.scale.set(s, s, s);
    crate.position.set(-w * 0.7, s / 2, d * 0.7);
    crate.rotation.y = rand();
    group.add(crate);
  }
  return h + 0.3;
}

/** Tier 1 — a modest little house with a pitched roof. */
function buildHouse(group: THREE.Group, rand: () => number): number {
  const w = 3.4 + rand() * 0.7;
  const d = 2.9 + rand() * 0.5;
  const h = 2.6 + rand() * 0.4;
  const tones = [0x8a8270, 0x76809c, 0x8c7684, 0x6e8a7e];

  const body = new THREE.Mesh(BOX.clone(), SIDING(tones[Math.floor(rand() * tones.length)]));
  body.scale.set(w, h, d);
  body.position.y = h / 2;
  group.add(body);

  const roofH = 1.4 + rand() * 0.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, roofH, 4), ROOF_MAT());
  roof.position.y = h + roofH / 2;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  const chimney = new THREE.Mesh(BOX.clone(), SIDING(0x3c3a44));
  chimney.scale.set(0.4, 1, 0.4);
  chimney.position.set(w * 0.25, h + roofH * 0.7, -d * 0.15);
  group.add(chimney);

  const tex = houseWindowTexture(rand);
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.85, h * 0.6),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 1,
      transparent: true,
      roughness: 0.8
    })
  );
  front.position.set(0, h * 0.5, d / 2 + 0.02);
  group.add(front);

  return h + roofH;
}

/** Tier 2 — a townhouse / small office. */
function buildTownhouse(group: THREE.Group, district: District, rand: () => number): number {
  const w = 4.4 + rand() * 1;
  const d = 4 + rand() * 0.8;
  const h = 5.5 + rand() * 2.5;

  const tex = windowTexture(district.color, rand);
  const body = new THREE.Mesh(
    BOX.clone(),
    new THREE.MeshStandardMaterial({
      color: 0x1c2338,
      roughness: 0.75,
      metalness: 0.2,
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1
    })
  );
  body.scale.set(w, h, d);
  body.position.y = h / 2;
  group.add(body);

  const parapet = new THREE.Mesh(BOX.clone(), SIDING(0x333a52));
  parapet.scale.set(w + 0.3, 0.35, d + 0.3);
  parapet.position.y = h + 0.17;
  group.add(parapet);

  const awning = new THREE.Mesh(BOX.clone(), trimMaterial(district.color));
  awning.scale.set(w * 0.7, 0.12, 0.8);
  awning.position.set(0, 2, d / 2 + 0.4);
  group.add(awning);

  return h + 0.4;
}

/** Tier 3 — congratulations, it's a McMansion. */
function buildMcMansion(group: THREE.Group, rand: () => number): number {
  const w = 6.5 + rand() * 1;
  const d = 5 + rand() * 0.6;
  const h = 3.4;
  const tone = rand() < 0.5 ? 0x9a9078 : 0x8e96ac;

  const base = new THREE.Mesh(BOX.clone(), SIDING(tone));
  base.scale.set(w, h, d);
  base.position.y = h / 2;
  group.add(base);

  const upper = new THREE.Mesh(BOX.clone(), SIDING(tone));
  upper.scale.set(w * 0.68, h * 0.8, d * 0.85);
  upper.position.y = h + (h * 0.8) / 2;
  group.add(upper);

  const roofH = 1.7;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.52, roofH, 4), ROOF_MAT());
  roof.position.y = h * 1.8 + roofH / 2;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  // wing with its own little roof
  const wing = new THREE.Mesh(BOX.clone(), SIDING(tone));
  wing.scale.set(w * 0.45, h * 0.75, d * 0.7);
  wing.position.set(w * 0.55, (h * 0.75) / 2, d * 0.1);
  group.add(wing);
  const wingRoof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.32, 1.1, 4), ROOF_MAT());
  wingRoof.position.set(w * 0.55, h * 0.75 + 0.55, d * 0.1);
  wingRoof.rotation.y = Math.PI / 4;
  group.add(wingRoof);

  // portico columns, obviously
  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 })
    );
    column.position.set(side * 0.9, 1.2, d / 2 + 0.9);
    group.add(column);
  }
  const porch = new THREE.Mesh(BOX.clone(), ROOF_MAT());
  porch.scale.set(2.6, 0.18, 1.4);
  porch.position.set(0, 2.5, d / 2 + 0.75);
  group.add(porch);

  // manicured hedges
  for (const side of [-1, 1]) {
    const hedge = new THREE.Mesh(
      BOX.clone(),
      new THREE.MeshStandardMaterial({ color: 0x1c3b28, roughness: 1 })
    );
    hedge.scale.set(1.6, 0.6, 0.6);
    hedge.position.set(side * w * 0.42, 0.3, d / 2 + 1.4);
    group.add(hedge);
  }

  const tex = houseWindowTexture(rand);
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.8, h * 0.55),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 1.1,
      transparent: true,
      roughness: 0.8
    })
  );
  front.position.set(0, h * 0.5, d / 2 + 0.02);
  group.add(front);

  return h * 1.8 + roofH;
}

/** Tier 4 — a real skyscraper, earned one commit at a time. */
function buildTower(
  group: THREE.Group,
  project: Project,
  district: District,
  rand: () => number,
  billboards: THREE.MeshStandardMaterial[]
): { top: number; footprint: number } {
  const height = 13 + (Math.log10(project.commits) - 2) * 26 + rand() * 2;
  const footprint = 7.5 + rand() * 2;
  const archetype = Math.floor(rand() * 3);

  const tex = windowTexture(district.color, rand);
  const material = new THREE.MeshStandardMaterial({
    color: 0x131a2e,
    roughness: 0.72,
    metalness: 0.25,
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 1.05
  });
  const trim = trimMaterial(district.color);

  let topY = 0;
  if (archetype === 0) {
    const tiers = 2 + Math.floor(rand() * 2);
    let width = footprint;
    let y = 0;
    for (let t = 0; t < tiers; t += 1) {
      const tierHeight = (height / tiers) * (t === 0 ? 1.25 : 1);
      const mesh = new THREE.Mesh(BOX.clone(), material);
      mesh.scale.set(width, tierHeight, width);
      mesh.position.y = y + tierHeight / 2;
      group.add(mesh);
      y += tierHeight;
      width *= 0.72;
    }
    topY = y;
  } else if (archetype === 1) {
    const mesh = new THREE.Mesh(BOX.clone(), material);
    mesh.scale.set(footprint * 1.25, height, footprint * 0.8);
    mesh.position.y = height / 2;
    group.add(mesh);
    topY = height;
  } else {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(footprint * 0.52, footprint * 0.62, height, 10),
      material
    );
    mesh.position.y = height / 2;
    group.add(mesh);
    topY = height;
  }

  // Neon crown.
  const crown = new THREE.Mesh(BOX.clone(), trim);
  crown.scale.set(footprint * 0.7, 0.25, footprint * 0.7);
  crown.position.y = topY + 0.12;
  group.add(crown);

  // Antenna with beacon.
  const mastHeight = 2 + rand() * 2.5;
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.1, mastHeight, 5),
    new THREE.MeshStandardMaterial({ color: 0x39415e, roughness: 0.6 })
  );
  mast.position.y = topY + mastHeight / 2;
  group.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), trim);
  beacon.position.y = topY + mastHeight + 0.1;
  group.add(beacon);

  // Billboards — the flashier the project, the more ads it runs.
  const lines = [project.blurb.split(/[.!—]/)[0].trim(), ...project.quotes];
  const count = project.commits >= 500 ? 3 : project.commits >= 250 ? 2 : 1;
  const sides: [number, number][] = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0]
  ];
  for (let i = 0; i < count; i += 1) {
    const boardW = footprint * 1.15;
    const boardH = boardW / 2;
    const texture = billboardTexture(
      project.title,
      (lines[i % lines.length] ?? '').slice(0, 44),
      district.color
    );
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 1.25,
      roughness: 0.6
    });
    billboards.push(mat);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), mat);
    const [sx, sz] = sides[(i * 2 + (rand() < 0.5 ? 1 : 0)) % 4];
    const offset = footprint * (archetype === 1 ? 0.68 : 0.55) + 0.35;
    const y = topY * (0.62 + i * 0.16);
    board.position.set(sx * offset, y, sz * offset);
    board.rotation.y = Math.atan2(sx, sz);
    group.add(board);

    const frame = new THREE.Mesh(BOX.clone(), new THREE.MeshStandardMaterial({ color: 0x2a3050, roughness: 0.7 }));
    frame.scale.set(sx === 0 ? boardW + 0.3 : 0.25, boardH + 0.3, sz === 0 ? boardW + 0.3 : 0.25);
    frame.position.set(sx * (offset - 0.15), y, sz * (offset - 0.15));
    group.add(frame);
  }

  return { top: topY + mastHeight, footprint };
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
    footprint = 3;
  } else if (tier === 1) {
    top = buildHouse(group, rand);
    footprint = 4;
  } else if (tier === 2) {
    top = buildTownhouse(group, district, rand);
    footprint = 5;
  } else if (tier === 3) {
    top = buildMcMansion(group, rand);
    footprint = 8;
  } else {
    const result = buildTower(group, project, district, rand, billboards);
    top = result.top;
    footprint = result.footprint;
  }

  // Soft glowing curb marks every project lot — a border, not a stage.
  const trim = trimMaterial(district.color);
  const curbMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(district.color),
    emissive: new THREE.Color(district.color),
    emissiveIntensity: 0.55,
    roughness: 0.6,
    transparent: true,
    opacity: 0.8
  });
  const curbSize = footprint * 1.2 + 1;
  for (const [dx, dz, w, d] of [
    [0, -curbSize / 2, curbSize, 0.22],
    [0, curbSize / 2, curbSize, 0.22],
    [-curbSize / 2, 0, 0.22, curbSize],
    [curbSize / 2, 0, 0.22, curbSize]
  ] as const) {
    const curb = new THREE.Mesh(BOX.clone(), curbMat);
    curb.scale.set(w, 0.09, d);
    curb.position.set(dx, 0.05, dz);
    group.add(curb);
  }

  // Floating name label.
  const label = labelSprite(project.title, district.color);
  label.position.y = top + 1.6;
  group.add(label);

  group.rotation.y = tier === 4 ? 0 : (rand() - 0.5) * 0.5;

  const pickMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.userData.projectId = project.id;
      pickMeshes.push(obj);
    }
  });

  const glowMaterials = [trim];

  return {
    project,
    group,
    pickMeshes,
    glowMaterials,
    baseEmissive: glowMaterials.map((m) => m.emissiveIntensity),
    label,
    billboards,
    height: top,
    footprint
  };
}
