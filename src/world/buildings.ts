import * as THREE from 'three';
import type { Project, District } from '../data';
import { tierOf, isUnderConstruction } from '../data';
import { rngFor } from './rng';
import { facadeTextures, billboardTexture, fasciaTexture, labelSprite, type Facade } from './textures';
import { posterUrl } from '../art';
import { growable, weather } from './surface';
import { BOX, block, buildHouse, buildLargeHouse, buildShack, gableRoof, mat } from './homes';

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

// ---------------------------------------------------------------------------
// Shared material factories. Fresh instances per building so hover/day-night
// tweaks never bleed between neighbors.
// ---------------------------------------------------------------------------

function trimMaterial(accent: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(accent),
    emissive: new THREE.Color(accent),
    emissiveIntensity: 1.4,
    roughness: 0.4,
    metalness: 0.1
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
  // The project's name on a painted fascia over the shopfront, front and side:
  // a building should say what it is, legibly, from across the street.
  const fasciaTex = fasciaTexture(project.title, district.color);
  const fasciaMat = growable(
    new THREE.MeshStandardMaterial({ map: fasciaTex, emissive: 0xffffff, emissiveMap: fasciaTex, emissiveIntensity: 0.45, roughness: 0.8 })
  );
  const fasciaW = Math.min(w * 0.9, 5.6);
  const fasciaH = fasciaW / 6;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(fasciaW, fasciaH), fasciaMat);
  front.position.set(0, groundH + fasciaH / 2 + 0.12, d / 2 + 0.07);
  group.add(front);
  block(group, brick, fasciaW + 0.16, fasciaH + 0.16, 0.08, 0, groundH + fasciaH / 2 + 0.12, d / 2 + 0.02);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(fasciaW * 0.86, fasciaH * 0.86), fasciaMat);
  side.rotation.y = Math.PI / 2;
  side.position.set(w / 2 + 0.07, groundH + fasciaH / 2 + 0.12, 0);
  group.add(side);

  // Cornice + parapet.
  block(group, brick, w + 0.5, 0.5, d + 0.5, 0, bodyH + 0.05, 0); // cornice overhang
  block(group, brick, w, 0.7, d, 0, bodyH + 0.35, 0); // parapet

  // Rooftop plant in galvanised greys: cooling units, a water tower, a stair bulkhead.
  const roofMat = mat(0x8d939c, { metalness: 0.4, roughness: 0.5 });
  const legMat = mat(0x4b4f58, { metalness: 0.4, roughness: 0.6 });
  for (let i = 0; i < 3; i += 1) {
    block(group, roofMat, 0.9 + rand() * 0.5, 0.6, 0.9 + rand() * 0.4, (rand() - 0.5) * w * 0.6, bodyH + 0.7, (rand() - 0.5) * d * 0.6);
  }
  // water tower on legs
  const tankX = w * 0.28;
  const tankZ = -d * 0.25;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 10), mat(0x7a6248, { roughness: 1 }));
  tank.position.set(tankX, bodyH + 1.7, tankZ);
  group.add(tank);
  const tankRoof = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.6, 10), mat(0x5a4a3a));
  tankRoof.position.set(tankX, bodyH + 2.5, tankZ);
  group.add(tankRoof);
  for (const lx of [-0.4, 0.4]) {
    for (const lz of [-0.4, 0.4]) {
      block(group, legMat, 0.08, 1.2, 0.08, tankX + lx, bodyH + 0.9, tankZ + lz);
    }
  }
  block(group, brick, 1.4, 1, 1.4, -w * 0.25, bodyH + 0.85, d * 0.2); // stair bulkhead

  // A fire escape in dark iron down the front, to one side of the door: a thin
  // railed landing at each floor and a stair flight between them, switching back.
  const iron = mat(0x2a2d33, { metalness: 0.5, roughness: 0.6 });
  const fx = -w * 0.24;
  const run = 1.5; // horizontal run of a flight
  const wallZ = d / 2;
  const landingY = (f: number) => groundH + (f - 1) * floorH + 0.5;
  for (let f = 1; f <= floors; f += 1) {
    const y = landingY(f);
    block(group, iron, 2.4, 0.05, 0.7, fx, y, wallZ + 0.4); // landing
    block(group, iron, 2.4, 0.04, 0.04, fx, y + 0.6, wallZ + 0.74); // top rail
    block(group, iron, 2.4, 0.03, 0.03, fx, y + 0.32, wallZ + 0.74); // mid rail
    for (const px of [-1.2, -0.4, 0.4, 1.2]) block(group, iron, 0.04, 0.6, 0.04, fx + px, y + 0.3, wallZ + 0.74);
    for (const end of [-1.2, 1.2]) block(group, iron, 0.04, 0.04, 0.7, fx + end, y + 0.6, wallZ + 0.4);
    if (f === 1) continue;
    // The flight down to the landing below, leaning the other way each floor.
    const lean = f % 2 === 0 ? 1 : -1;
    const length = Math.hypot(run, floorH);
    const flight = block(group, iron, length, 0.05, 0.3, fx, y - floorH / 2, wallZ + 0.22);
    flight.rotation.z = lean * Math.atan2(floorH, run);
    const handrail = block(group, iron, length, 0.03, 0.03, fx, y - floorH / 2 + 0.5, wallZ + 0.36);
    handrail.rotation.z = flight.rotation.z;
  }
  // The drop ladder from the lowest landing, hung clear of the pavement.
  block(group, iron, 0.04, 1.3, 0.04, fx + 0.75, landingY(1) - 0.65, wallZ + 0.4);
  block(group, iron, 0.04, 1.3, 0.04, fx + 1.05, landingY(1) - 0.65, wallZ + 0.4);
  for (let r = 0; r < 4; r += 1) block(group, iron, 0.3, 0.03, 0.03, fx + 0.9, landingY(1) - 0.2 - r * 0.3, wallZ + 0.4);

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
    const bmat = growable(
      new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1.25, roughness: 0.6 })
    );
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
    // On the jib's own axis, so it turns in place and is hidden with the crane until its building is up.
    beacon.position.set(0, 0.5, 0);
    jib.add(beacon);
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
  // Homes get gardens: the painted kerb takes in most of the quarter lot, so
  // the porch, the drive, and the back yard all sit inside it.
  const yard = [3.3, 4.1, 4.6][tier] ?? 0;
  if (tier === 0) {
    top = buildShack(group, rand, yard);
    footprint = 3.2;
  } else if (tier === 1) {
    top = buildHouse(group, rand, yard);
    footprint = 4.8;
  } else if (tier === 2) {
    top = buildLargeHouse(group, rand, yard);
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
  const curbSize = tier === 4 ? footprint + 1.1 : tier === 3 ? footprint * 1.2 + 1 : yard * 2;
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
