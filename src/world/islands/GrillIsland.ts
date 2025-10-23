import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Texture
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandHotspotBundle } from './types';
import { AssetLoader } from '../../utils/AssetLoader';
import { AudioController } from '../../utils/Audio';

interface GrillOptions {
  assetLoader: AssetLoader;
  audio: AudioController;
  reducedMotion: boolean;
}

export function createGrillIsland(options: GrillOptions): IslandHotspotBundle {
  const { assetLoader, audio, reducedMotion } = options;
  const group = new Group();
  const extras: Hotspot[] = [];

  const courtyard = new Mesh(new CylinderGeometry(3.4, 3.8, 0.5, 32), new MeshStandardMaterial({ color: 0x14532d, roughness: 0.82 }));
  courtyard.position.y = 0.25;
  group.add(courtyard);

  const foundation = new Mesh(new BoxGeometry(3.8, 0.4, 3.8), new MeshStandardMaterial({ color: 0x1e1b1a, roughness: 0.6 }));
  foundation.position.y = 0.45;
  group.add(foundation);

  const facadeMaterial = new MeshStandardMaterial({
    color: 0x9f1239,
    roughness: 0.55,
    metalness: 0.18,
    emissive: 0x9f1239,
    emissiveIntensity: 0.12
  });
  const facade = new Mesh(new BoxGeometry(3.2, 2.6, 3.2), facadeMaterial);
  facade.position.y = 1.8;
  group.add(facade);

  const roof = new Mesh(new CylinderGeometry(0, 2.8, 1.6, 6), new MeshStandardMaterial({ color: 0x7f1d1d, metalness: 0.35, roughness: 0.45 }));
  roof.rotation.y = Math.PI / 6;
  roof.position.y = 3.3;
  group.add(roof);

  const chimneyMaterial = new MeshStandardMaterial({ color: 0x111827, roughness: 0.5 });
  const chimney = new Mesh(new BoxGeometry(0.6, 1.6, 0.6), chimneyMaterial);
  chimney.position.set(1.25, 3.0, -0.9);
  group.add(chimney);

  const chimneyCap = new Mesh(new BoxGeometry(0.8, 0.2, 0.8), chimneyMaterial);
  chimneyCap.position.copy(chimney.position);
  chimneyCap.position.y += 0.9;
  group.add(chimneyCap);

  const awning = new Mesh(new BoxGeometry(2.4, 0.15, 1.2), new MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.2 }));
  awning.position.set(0, 2.05, 1.4);
  group.add(awning);

  const doorMaterial = new MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xfacc15,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2
  });
  const door = new Mesh(new BoxGeometry(1, 1.8, 0.12), doorMaterial);
  door.position.set(0, 1.2, 1.7);
  group.add(door);

  const stepMaterial = new MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.9 });
  const steps = new Mesh(new BoxGeometry(1.9, 0.2, 1.2), stepMaterial);
  steps.position.set(0, 0.1, 2.2);
  group.add(steps);

  const platterMaterial = new MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7, metalness: 0.2 });
  const entreeMaterial = new MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.55, metalness: 0.18 });
  const garnishMaterial = new MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 });
  const plateGeometry = new CylinderGeometry(0.65, 0.7, 0.08, 24);
  const entreeGeometry = new CylinderGeometry(0.4, 0.36, 0.26, 20);
  const garnishGeometry = new ConeGeometry(0.2, 0.35, 10);
  const picnicSpots: Array<{ x: number; z: number; rotation: number }> = [
    { x: -2.8, z: 1.6, rotation: Math.PI / 8 },
    { x: 2.8, z: 1.4, rotation: -Math.PI / 12 },
    { x: -2.6, z: -1.8, rotation: Math.PI / 5 },
    { x: 2.6, z: -1.6, rotation: -Math.PI / 6 }
  ];
  for (const spot of picnicSpots) {
    const plate = new Mesh(plateGeometry, platterMaterial);
    plate.position.set(spot.x, 0.48, spot.z);
    plate.rotation.y = spot.rotation;
    group.add(plate);
    const entree = new Mesh(entreeGeometry, entreeMaterial);
    entree.position.set(spot.x, 0.7, spot.z);
    entree.rotation.y = spot.rotation;
    group.add(entree);
    const garnish = new Mesh(garnishGeometry, garnishMaterial);
    garnish.position.set(spot.x + 0.2, 0.78, spot.z + 0.15);
    garnish.rotation.x = Math.PI;
    group.add(garnish);
  }

  const planterMaterial = new MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 });
  const soilMaterial = new MeshStandardMaterial({ color: 0x365314, roughness: 0.85 });
  for (const offset of [-2.2, 2.2]) {
    const planter = new Mesh(new BoxGeometry(0.7, 0.5, 2.8), planterMaterial);
    planter.position.set(offset, 0.55, -0.1);
    group.add(planter);
    const soil = new Mesh(new BoxGeometry(0.55, 0.36, 2.6), soilMaterial);
    soil.position.set(offset, 0.66, -0.1);
    group.add(soil);
  }

  const windowMaterial = new MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xf97316,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.82
  });
  const windowGeometry = new BoxGeometry(0.6, 0.8, 0.06);
  const windowPositions: Array<[number, number, number, number]> = [
    [-1.1, 1.8, 1.63, 0],
    [1.1, 1.8, 1.63, 0],
    [-1.1, 1.8, -1.63, Math.PI],
    [1.1, 1.8, -1.63, Math.PI],
    [-1.63, 1.8, 0, Math.PI / 2],
    [1.63, 1.8, 0, -Math.PI / 2]
  ];
  for (const [x, y, z, rotation] of windowPositions) {
    const windowPane = new Mesh(windowGeometry, windowMaterial);
    windowPane.position.set(x, y, z);
    windowPane.rotation.y = rotation;
    group.add(windowPane);
  }

  const smokeGeometry = new BufferGeometry();
  const smokeCount = 16;
  const positions = new Float32Array(smokeCount * 3);
  const speeds = new Float32Array(smokeCount);
  const offsets = new Float32Array(smokeCount);
  for (let i = 0; i < smokeCount; i += 1) {
    const x = (Math.random() - 0.5) * 0.6;
    const y = Math.random() * 0.2;
    const z = (Math.random() - 0.5) * 0.6;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    speeds[i] = 0.4 + Math.random() * 0.3;
    offsets[i] = Math.random();
  }
  smokeGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  smokeGeometry.setAttribute('speed', new BufferAttribute(speeds, 1));
  smokeGeometry.setAttribute('offset', new BufferAttribute(offsets, 1));

  const smokeMaterial = new PointsMaterial({
    size: 0.8,
    transparent: true,
    map: assetLoader.getSmokeTexture() as Texture,
    depthWrite: false,
    opacity: 0.65
  });

  const smoke = new Points(smokeGeometry, smokeMaterial);
  smoke.position.copy(chimney.position);
  smoke.position.y += 0.9;
  group.add(smoke);

  const interior = new Group();
  interior.position.set(0, 0.9, 0);
  group.add(interior);

  const interiorFloor = new Mesh(new BoxGeometry(2.6, 0.1, 2.6), new MeshStandardMaterial({ color: 0x1b1b19, roughness: 0.65 }));
  interiorFloor.position.set(0, -0.1, 0);
  interior.add(interiorFloor);

  const serviceBar = new Mesh(new BoxGeometry(2.2, 0.5, 0.8), new MeshStandardMaterial({ color: 0x78350f, roughness: 0.55 }));
  serviceBar.position.set(0, 0.25, 0.9);
  interior.add(serviceBar);
  const tastingSurfaceMaterial = new MeshStandardMaterial({ color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 0.32, roughness: 0.38 });
  const tastingSurface = new Mesh(new BoxGeometry(2.0, 0.12, 0.7), tastingSurfaceMaterial);
  tastingSurface.position.set(0, 0.52, 0.92);
  interior.add(tastingSurface);

  const prepTable = new Mesh(new BoxGeometry(1.2, 0.4, 1.0), new MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.25 }));
  prepTable.position.set(-0.95, 0.2, -0.6);
  interior.add(prepTable);
  const prepGlowMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.22, transparent: true, opacity: 0.7 });
  const prepGlow = new Mesh(new BoxGeometry(1.0, 0.1, 0.8), prepGlowMaterial);
  prepGlow.position.set(-0.95, 0.45, -0.6);
  interior.add(prepGlow);

  const spiceShelf = new Mesh(new BoxGeometry(0.4, 1.2, 1.6), new MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.5 }));
  spiceShelf.position.set(1.1, 0.7, -0.1);
  interior.add(spiceShelf);
  const spiceGlowMaterial = new MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.24, transparent: true, opacity: 0.8 });
  const spiceGlow = new Mesh(new BoxGeometry(0.32, 0.9, 1.4), spiceGlowMaterial);
  spiceGlow.position.set(1.1, 0.7, -0.1);
  interior.add(spiceGlow);

  const ceilingLight = new Mesh(new CylinderGeometry(0.6, 0.6, 0.12, 20), new MeshStandardMaterial({ color: 0xfde68a, emissive: 0xfde68a, emissiveIntensity: 0.45, transparent: true, opacity: 0.85 }));
  ceilingLight.position.set(0, 1.2, 0);
  interior.add(ceilingLight);

  const interiorState = { tastingHover: false, prepHover: false, spiceHover: false };

  const tastingHotspot = new Hotspot({
    name: 'Tasting Flights',
    ariaLabel: 'Preview featured tasting flights inside the culinary studio',
    mesh: tastingSurface,
    route: '#cooking',
    onEnter: () => {
      interiorState.tastingHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.tastingHover = false;
    }
  });
  extras.push(tastingHotspot);

  const prepHotspot = new Hotspot({
    name: 'Prep Lab',
    ariaLabel: 'Experiment with new flavor prep workflows inside the studio',
    mesh: prepGlow,
    route: '#cooking',
    onEnter: () => {
      interiorState.prepHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.prepHover = false;
    }
  });
  extras.push(prepHotspot);

  const spiceHotspot = new Hotspot({
    name: 'Spice Library',
    ariaLabel: 'Explore curated spice blends and rubs inside the kitchen',
    mesh: spiceGlow,
    route: '#cooking',
    onEnter: () => {
      interiorState.spiceHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.spiceHover = false;
    }
  });
  extras.push(spiceHotspot);

  const garnishMeshes = group.children.filter((child): child is Mesh => child instanceof Mesh && child.geometry === garnishGeometry);

  const state = { time: 0 };

  const hotspot = new Hotspot({
    name: 'Culinary Workshop',
    ariaLabel: 'Step inside Ryan\'s culinary studio building',
    mesh: group,
    hitArea: facade,
    route: '#cooking',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      const positionsAttr = smokeGeometry.getAttribute('position') as BufferAttribute;
      const speedsAttr = smokeGeometry.getAttribute('speed') as BufferAttribute;
      const offsetsAttr = smokeGeometry.getAttribute('offset') as BufferAttribute;
      for (let i = 0; i < smokeCount; i += 1) {
        const offset = offsetsAttr.getX(i);
        const baseY = ((state.time + offset) * speedsAttr.getX(i)) % 2.4;
        positionsAttr.setY(i, baseY);
        positionsAttr.setX(i, Math.sin(state.time + offset + i) * 0.3);
        positionsAttr.setZ(i, Math.cos(state.time + offset + i) * 0.3);
      }
      positionsAttr.needsUpdate = true;
      facadeMaterial.emissiveIntensity = 0.12 + Math.sin(state.time * 0.8) * 0.04;
      windowMaterial.emissiveIntensity = 0.26 + Math.sin(state.time * 2.6) * 0.08;
      doorMaterial.emissiveIntensity = 0.26 + Math.sin(state.time * 3.1) * 0.07;
      awning.position.y = 2.05 + Math.sin(state.time * 1.2) * 0.04;
      const tastingPulse = 0.32 + Math.sin(state.time * 1.6) * 0.08 + (interiorState.tastingHover ? 0.2 : 0);
      tastingSurfaceMaterial.emissiveIntensity = tastingPulse;
      const prepPulse = 0.22 + Math.sin(state.time * 2.1) * 0.06 + (interiorState.prepHover ? 0.18 : 0);
      prepGlowMaterial.emissiveIntensity = prepPulse;
      const spicePulse = 0.24 + Math.sin(state.time * 1.9) * 0.05 + (interiorState.spiceHover ? 0.18 : 0);
      spiceGlowMaterial.emissiveIntensity = spicePulse;
      ceilingLight.position.y = 1.2 + Math.sin(state.time * 2.4) * 0.05;
      garnishMeshes.forEach((mesh, index) => {
        mesh.rotation.z = Math.sin(state.time * 1.5 + index) * 0.6;
      });
    }
  });

  return { main: hotspot, extras };
}
