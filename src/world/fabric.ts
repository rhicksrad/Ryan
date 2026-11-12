import * as THREE from 'three';
import { BLOCK, type CityPlan, type Filler } from './cityplan';
import { tierOf } from '../data';
import { mulberry32 } from './rng';
import { facadeTextures, type Facade } from './textures';
import { block, facadeBox, facadeMaterial, gableRoof, mat } from './buildings';

/**
 * The unnamed town: houses, walk-ups, and small offices that are nobody's
 * project. They exist to make the named buildings sit in a real city, so they
 * are drawn in quiet stone, brick, and concrete with no accent color, no sign,
 * and no label. Everything here shares a handful of materials and is folded
 * into a few draw calls by the static bake.
 */

const HOUSE_WALLS = [0xd9d3c5, 0xcbc6ba, 0xc2c8cc, 0xd6cab6, 0xc5bbab, 0xbcc5b7, 0xd1cbc2, 0xdbd2c2];
const HOUSE_ROOFS = [0x6e564b, 0x5c6168, 0x7a5c4d, 0x525862];

interface Skin {
  facade: Facade;
  material: THREE.MeshStandardMaterial;
  trim: number;
  floor: number;
  bay: number;
}

export function createFabric(plan: CityPlan): { group: THREE.Group; windowMaterials: THREE.MeshStandardMaterial[] } {
  const group = new THREE.Group();
  const rand = mulberry32(8128);

  // Four shared skins. `lit` is low: the ordinary town goes to bed early.
  const skin = (kind: 'punched' | 'curtain', glass: string, frame: string, trim: number, lit: number, floor: number, bay: number): Skin => {
    const facade = facadeTextures({ kind, glass, frame, accent: '#ffd9a0', lit }, rand);
    const material = facadeMaterial(facade, { roughness: kind === 'curtain' ? 0.35 : 0.85, metalness: kind === 'curtain' ? 0.4 : 0.05, glow: 0.9 });
    return { facade, material, trim, floor, bay };
  };
  const walkups = [
    skin('punched', '#52647a', '#a3775e', 0x7d5846, 0.22, 1.4, 1.3), // red brick
    skin('punched', '#566a80', '#cfc6b3', 0xa59c8a, 0.2, 1.4, 1.3), // limestone
    skin('punched', '#4d5f74', '#8f8a86', 0x6f6b68, 0.2, 1.4, 1.3), // grey brick
    skin('punched', '#4f6276', '#b9a084', 0x8f7a62, 0.22, 1.4, 1.3), // buff brick
    skin('punched', '#50606c', '#7c5a50', 0x5e443c, 0.2, 1.4, 1.3) // dark brick
  ];
  const offices = [
    skin('curtain', '#7f9cb4', '#465060', 0x535d6c, 0.12, 1.5, 1.25),
    skin('punched', '#5a7088', '#c4beb0', 0x9a9488, 0.16, 1.5, 1.2),
    skin('curtain', '#8fa7a5', '#59605c', 0x5f6763, 0.12, 1.5, 1.25),
    skin('curtain', '#9aa8b4', '#6a6f78', 0x6f747c, 0.12, 1.5, 1.25)
  ];

  const roofMat = mat(0x5d5f64, { roughness: 0.9 });
  const unitMat = mat(0x9a9da2, { roughness: 0.6, metalness: 0.3 });
  const baseMat = mat(0x3d4148, { roughness: 0.7 });
  const shopGlass = new THREE.MeshStandardMaterial({ color: 0x2a3644, emissive: 0xffd49a, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4 });
  const houseGlass = new THREE.MeshStandardMaterial({ color: 0x3a4854, emissive: 0xffc77a, emissiveIntensity: 0.7, roughness: 0.4 });
  const doorMat = mat(0x3a2f2a, { roughness: 0.7 });
  const porchMat = mat(0xe9e5da, { roughness: 0.9 });
  const awnings = [0x8f3b34, 0x2f5d4a, 0x2f4668, 0xb08a3a, 0x6a3d5a, 0xd8d2c0].map((c) => mat(c, { roughness: 0.85 }));
  const wallMats = HOUSE_WALLS.map((c) => mat(c, { roughness: 0.9 }));
  const roofMats = HOUSE_ROOFS.map((c) => mat(c, { roughness: 0.9 }));
  const trimMats = new Map<number, THREE.MeshStandardMaterial>();
  const trimMat = (color: number) => {
    if (!trimMats.has(color)) trimMats.set(color, mat(color, { roughness: 0.85 }));
    return trimMats.get(color)!;
  };

  const tall = (site: Filler, g: THREE.Group) => {
    let f = site;
    const set = f.kind === 'office' ? offices : walkups;
    const s = set[f.style % set.length];
    const groundH = 1.7;
    const upper = Math.max(s.floor * 2, f.h - groundH);
    // Shopfront base, slightly proud of the wall above.
    block(g, baseMat, f.w + 0.16, groundH, f.d + 0.16, 0, groundH / 2, 0);
    // Walk-ups keep a shop on the ground floor under a canvas awning.
    if (f.kind === 'walkup') {
      const canvas = awnings[f.style % awnings.length];
      for (const side of [-1, 1]) {
        const awning = block(g, canvas, f.w * 0.82, 0.08, 0.95, 0, groundH * 0.9, side * (f.d / 2 + 0.52));
        awning.rotation.x = side * 0.3;
      }
    }
    for (const side of [-1, 1]) {
      block(g, shopGlass, f.w * 0.78, groundH * 0.58, 0.06, 0, groundH * 0.5, side * (f.d / 2 + 0.1));
      block(g, shopGlass, 0.06, groundH * 0.58, f.d * 0.78, side * (f.w / 2 + 0.1), groundH * 0.5, 0);
    }
    // Every third building steps back for its top floors, so the street is not a row of plain boxes.
    const stepped = f.style % 3 === 0 && upper > s.floor * 4;
    const lower = stepped ? Math.round((upper * 0.68) / s.floor) * s.floor : upper;
    facadeBox(g, s.material, roofMat, s.facade, f.w, lower, f.d, 0, groundH + lower / 2, 0, s.bay, s.floor);
    let top = groundH + lower;
    let w = f.w;
    let d = f.d;
    const parapet = () => {
      for (const side of [-1, 1]) {
        block(g, trimMat(s.trim), w + 0.24, 0.42, 0.22, 0, top + 0.18, side * (d / 2));
        block(g, trimMat(s.trim), 0.22, 0.42, d + 0.24, side * (w / 2), top + 0.18, 0);
      }
    };
    parapet();
    // Masonry depth: a belt course over the shopfront and another part-way up,
    // pilasters at the corners, and a recessed doorway under a lintel.
    const trim = trimMat(s.trim);
    block(g, trim, f.w + 0.2, 0.16, f.d + 0.2, 0, groundH + 0.02, 0);
    if (lower > s.floor * 5) block(g, trim, f.w + 0.12, 0.1, f.d + 0.12, 0, groundH + Math.round(lower / s.floor / 2) * s.floor, 0);
    if (f.kind === 'walkup') {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) block(g, trim, 0.34, lower, 0.34, sx * (f.w / 2 - 0.1), groundH + lower / 2, sz * (f.d / 2 - 0.1));
      }
    }
    for (const side of [-1, 1]) {
      block(g, doorMat, 0.8, groundH * 0.72, 0.1, f.w * 0.3, groundH * 0.36, side * (f.d / 2 + 0.11));
      block(g, trim, 1.06, 0.12, 0.2, f.w * 0.3, groundH * 0.76, side * (f.d / 2 + 0.12));
    }
    if (stepped) {
      w = f.w - 2 * s.bay;
      d = f.d - 2 * s.bay;
      facadeBox(g, s.material, roofMat, s.facade, w, upper - lower, d, 0, top + (upper - lower) / 2, 0, s.bay, s.floor);
      top = groundH + upper;
      parapet();
    }
    f = { ...f, w, d };
    const units = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < units; i += 1) {
      const uw = 0.8 + rand() * 0.8;
      block(g, unitMat, uw, 0.5 + rand() * 0.3, 0.8 + rand() * 0.5, (rand() - 0.5) * (f.w - 2.2), top + 0.3, (rand() - 0.5) * (f.d - 2.2));
    }
    if (rand() < 0.6) block(g, trimMat(s.trim), 1.5, 1.1, 1.5, (rand() - 0.5) * (f.w - 2.6), top + 0.55, (rand() - 0.5) * (f.d - 2.6));
  };

  const house = (f: Filler, g: THREE.Group) => {
    const wall = wallMats[f.style % wallMats.length];
    const roofM = roofMats[(f.style * 3 + 1) % roofMats.length];
    block(g, wall, f.w, f.h, f.d, 0, f.h / 2, 0);
    const peak = 1.1 + (f.style % 3) * 0.2;
    const roof = gableRoof(f.w + 0.5, f.d + 0.5, peak, roofM);
    // Half the street runs its ridges the other way.
    if (f.style % 2 === 0) {
      roof.geometry.dispose();
      const turned = gableRoof(f.d + 0.5, f.w + 0.5, peak, roofM);
      turned.rotation.y = Math.PI / 2;
      turned.position.y = f.h;
      g.add(turned);
    } else {
      roof.position.y = f.h;
      g.add(roof);
    }
    block(g, mat(0x7a5a4a, { roughness: 0.9 }), 0.45, 1, 0.45, f.w * 0.26, f.h + peak * 0.7, -f.d * 0.15);
    // A stoop under a small porch roof, white trim under the eaves, and a foundation course.
    block(g, mat(0x8d877c, { roughness: 0.95 }), f.w + 0.16, 0.24, f.d + 0.16, 0, 0.12, 0);
    block(g, porchMat, f.w + 0.36, 0.1, f.d + 0.36, 0, f.h - 0.02, 0);
    block(g, porchMat, 1.5, 0.08, 0.8, 0, 1.42, f.d / 2 + 0.4);
    for (const px of [-0.66, 0.66]) block(g, porchMat, 0.09, 1.2, 0.09, px, 0.8, f.d / 2 + 0.72);
    block(g, mat(0x9a948a, { roughness: 0.95 }), 1.3, 0.16, 0.7, 0, 0.16, f.d / 2 + 0.4);
    // Door and windows on the street side, one window on each flank.
    block(g, mat(0x4f4238, { roughness: 0.8 }), 0.6, 1.2, 0.06, 0, 0.6, f.d / 2 + 0.02);
    for (let storey = 0; storey < Math.round(f.h / 2.4); storey += 1) {
      const y = 1.35 + storey * 2.1;
      for (const wx of [-f.w * 0.3, f.w * 0.3]) {
        if (storey === 0 && Math.abs(wx) < 0.5) continue;
        block(g, houseGlass, 0.62, 0.72, 0.06, wx, y, f.d / 2 + 0.02);
      }
      for (const side of [-1, 1]) block(g, houseGlass, 0.06, 0.72, 0.62, side * (f.w / 2 + 0.02), y, 0);
    }
  };

  // Parked cars: a body, a cabin, and a dark slab underneath standing in for a contact shadow.
  const paints = [0x8a2f3c, 0x2f4c8a, 0x3c6b4a, 0x6b7078, 0xc9c6bd, 0x23262c, 0x8a7a2f, 0xa9b4c0].map((c) =>
    mat(c, { roughness: 0.45, metalness: 0.4 })
  );
  const cabin = mat(0x1a2030, { roughness: 0.3, metalness: 0.5 });
  const under = mat(0x08090c, { roughness: 1 });
  for (const car of plan.parked) {
    const g = new THREE.Group();
    g.position.set(car.x, 0.05, car.z);
    g.rotation.y = (car.along ? 0 : Math.PI / 2) + (rand() < 0.5 ? Math.PI : 0);
    block(g, under, 1.62, 0.03, 0.84, 0.05, 0.0, 0.03).userData.noCast = true;
    block(g, paints[Math.floor(rand() * paints.length)], 1.5, 0.4, 0.7, 0, 0.32, 0);
    block(g, cabin, 0.75, 0.3, 0.62, -0.1, 0.62, 0);
    group.add(g);
  }

  // --- Street furniture: what people actually use a downtown sidewalk for. ---
  const timber = mat(0x7a5a3c, { roughness: 0.9 });
  const iron = mat(0x2c3038, { roughness: 0.6, metalness: 0.4 });
  const stoneTub = mat(0xc9c2b2, { roughness: 0.9 });
  const planting = mat(0x47763f, { roughness: 1 });
  const cloth = [0xb5483c, 0x2f6a52, 0x2f4f7a, 0xd0a03a, 0xe9e2cf, 0x8a4470].map((c) => mat(c, { roughness: 0.85 }));
  const umbrellaGeo = new THREE.ConeGeometry(0.95, 0.4, 8);
  const tableGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 10);
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  /** A cafe table under a canvas umbrella. */
  const cafe = (x: number, z: number) => {
    add(umbrellaGeo, cloth[Math.floor(rand() * cloth.length)], x, 1.62, z).rotation.y = rand();
    block(group, iron, 0.05, 1.3, 0.05, x, 0.82, z);
    add(tableGeo, stoneTub, x, 0.72, z);
  };
  /** A slatted bench facing `angle`. */
  const bench = (x: number, z: number, angle: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.19, z);
    g.rotation.y = angle;
    block(g, timber, 1.5, 0.08, 0.42, 0, 0.42, 0);
    block(g, timber, 1.5, 0.4, 0.07, 0, 0.68, -0.2);
    for (const s of [-0.6, 0.6]) block(g, iron, 0.07, 0.42, 0.4, s, 0.21, 0);
    group.add(g);
  };
  /** A stone tub of clipped planting. */
  const planter = (x: number, z: number, size = 1.5) => {
    block(group, stoneTub, size, 0.5, size, x, 0.44, z);
    block(group, planting, size - 0.24, 0.5, size - 0.24, x, 0.86, z);
  };

  // The plaza: benches round the monument, planters at the corners, cafes along two sides.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    bench(plan.plaza.x + Math.sin(a) * 7.6, plan.plaza.z + Math.cos(a) * 7.6, a + Math.PI);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) planter(plan.plaza.x + sx * 9, plan.plaza.z + sz * 9, 1.8);
    for (const t of [-4.6, -1.6, 1.6, 4.6]) cafe(plan.plaza.x + sx * 9.3, plan.plaza.z + t);
  }
  // Tower forecourts: tables out front, a bench and planters by the door.
  for (const { project, lot } of plan.placements) {
    if (tierOf(project.commits) !== 4) continue;
    const front = lot.z + BLOCK / 2 - 2.5;
    for (const t of [-7.6, -5.4, 5.4, 7.6]) if (rand() < 0.8) cafe(lot.x + t, front + (rand() - 0.5) * 0.6);
    planter(lot.x - 3.1, front + 0.3);
    planter(lot.x + 3.1, front + 0.3);
    bench(lot.x - 8.6, lot.z + 2, Math.PI / 2);
    bench(lot.x + 8.6, lot.z + 2, -Math.PI / 2);
  }

  for (const f of plan.fillers) {
    const g = new THREE.Group();
    g.position.set(f.x, 0.19, f.z);
    g.rotation.y = f.rotationY;
    if (f.kind === 'house') house(f, g);
    else tall(f, g);
    group.add(g);
  }

  return { group, windowMaterials: [...walkups, ...offices].map((s) => s.material) };
}
