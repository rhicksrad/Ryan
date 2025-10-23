import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  TorusGeometry
} from 'three';
import { Hotspot } from '../Hotspot';
import { AudioController } from '../../utils/Audio';
import type { IslandHotspotBundle } from './types';

interface AIHubOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createAIHubIsland(options: AIHubOptions): IslandHotspotBundle {
  const { audio, reducedMotion } = options;
  const group = new Group();
  const extras: Hotspot[] = [];
  const tableDynamics: Array<{ projection: Mesh; phase: number; baseY: number }> = [];

  const plaza = new Mesh(new CylinderGeometry(3.4, 3.8, 0.5, 48), new MeshStandardMaterial({ color: 0x14532d, roughness: 0.82 }));
  plaza.position.y = 0.25;
  group.add(plaza);

  const towerMaterial = new MeshStandardMaterial({
    color: 0x1e3a8a,
    metalness: 0.75,
    roughness: 0.25,
    emissive: new Color(0x38bdf8),
    emissiveIntensity: 0.2,
    side: DoubleSide
  });
  const tower = new Mesh(new BoxGeometry(2.6, 4.6, 2.6), towerMaterial);
  tower.position.y = 2.8;
  group.add(tower);

  const lobby = new Mesh(
    new BoxGeometry(3.2, 0.6, 3.4),
    new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, side: DoubleSide })
  );
  lobby.position.y = 0.8;
  group.add(lobby);

  const doorMaterial = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.32,
    transparent: true,
    opacity: 0.85
  });
  const door = new Mesh(new BoxGeometry(1.2, 1.8, 0.1), doorMaterial);
  door.position.set(0, 1.2, 1.7);
  group.add(door);

  const canopy = new Mesh(new BoxGeometry(2.6, 0.2, 1.2), new MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.4 }));
  canopy.position.set(0, 2.2, 1.4);
  group.add(canopy);

  const walkway = new Mesh(new BoxGeometry(2.0, 0.12, 3.2), new MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.85 }));
  walkway.position.set(0, 0.06, 2.4);
  group.add(walkway);

  const interiorGroup = new Group();
  interiorGroup.position.y = 0.5;
  group.add(interiorGroup);

  const interiorFloor = new Mesh(
    new CylinderGeometry(1.9, 1.9, 0.08, 48),
    new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.2, side: DoubleSide })
  );
  interiorFloor.position.y = 0;
  interiorGroup.add(interiorFloor);

  const floorInlay = new Mesh(new CircleGeometry(1.25, 48), new MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 }));
  floorInlay.rotation.x = -Math.PI / 2;
  floorInlay.position.y = 0.045;
  interiorGroup.add(floorInlay);

  const interiorLight = new PointLight(0x38bdf8, 1.5, 6);
  interiorLight.position.set(0, 2.6, 0);
  interiorGroup.add(interiorLight);

  const pedestalMaterial = new MeshStandardMaterial({ color: 0x111827, roughness: 0.6, metalness: 0.2 });
  const tableBaseMaterial = new MeshStandardMaterial({ color: 0x1f2937, roughness: 0.45, metalness: 0.35 });

  const tableConfigs = [
    {
      name: 'NBA Analytics Table',
      aria: 'Open the NBA analytics lab project',
      url: 'https://rhicksrad.github.io/NBA/index.html',
      position: [-0.95, 0.95],
      color: 0x38bdf8
    },
    {
      name: 'NASA Mission Table',
      aria: 'Open the NASA exploration project',
      url: 'https://rhicksrad.github.io/NASA/',
      position: [0.95, 0.95],
      color: 0x38e8f8
    },
    {
      name: 'WAR Analysis Table',
      aria: 'Open the WAR analytics project',
      url: 'https://rhicksrad.github.io/WAR/',
      position: [-0.95, -0.95],
      color: 0xa855f7
    },
    {
      name: 'AIR Research Table',
      aria: 'Open the AIR research project',
      url: 'https://rhicksrad.github.io/AIR/',
      position: [0.95, -0.95],
      color: 0x22d3ee
    }
  ] as const;

  for (const config of tableConfigs) {
    const tableGroup = new Group();
    tableGroup.position.set(config.position[0], 0, config.position[1]);
    interiorGroup.add(tableGroup);

    const pedestal = new Mesh(new CylinderGeometry(0.18, 0.26, 0.9, 20), pedestalMaterial);
    pedestal.position.y = 0.45;
    tableGroup.add(pedestal);

    const deck = new Mesh(new CylinderGeometry(0.78, 0.78, 0.08, 32), tableBaseMaterial);
    deck.position.y = 0.9;
    tableGroup.add(deck);

    const glowMaterial = new MeshStandardMaterial({
      color: config.color,
      emissive: new Color(config.color),
      emissiveIntensity: 0.36,
      transparent: true,
      opacity: 0.85,
      roughness: 0.28,
      metalness: 0.6
    });
    const surface = new Mesh(new CylinderGeometry(0.64, 0.64, 0.06, 48), glowMaterial);
    surface.position.y = 0.96;
    tableGroup.add(surface);

    const projection = new Mesh(
      new CylinderGeometry(0.42, 0.24, 0.48, 32),
      new MeshStandardMaterial({
        color: config.color,
        emissive: new Color(config.color),
        emissiveIntensity: 0.18,
        transparent: true,
        opacity: 0.32,
        roughness: 0.2,
        metalness: 0.45
      })
    );
    projection.position.y = 1.32;
    tableGroup.add(projection);

    tableDynamics.push({ projection, phase: Math.random() * Math.PI * 2, baseY: projection.position.y });

    const tableHotspot = new Hotspot({
      name: config.name,
      ariaLabel: config.aria,
      mesh: tableGroup,
      hitArea: surface,
      route: '#ai',
      onEnter: () => {
        glowMaterial.emissiveIntensity = 0.75;
        surface.scale.set(1.05, 1, 1.05);
        audio.playHoverBleep().catch(() => undefined);
      },
      onLeave: () => {
        glowMaterial.emissiveIntensity = 0.36;
        surface.scale.set(1, 1, 1);
      },
      onClick: () => {
        window.open(config.url, '_blank', 'noopener,noreferrer');
      }
    });
    extras.push(tableHotspot);
  }

  const dataCoreMaterial = new MeshStandardMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.7,
    metalness: 0.6,
    roughness: 0.12,
    emissive: new Color(0x22d3ee),
    emissiveIntensity: 0.35
  });
  const dataCore = new Mesh(new CylinderGeometry(1.2, 1.2, 0.4, 32), dataCoreMaterial);
  dataCore.position.y = 1.8;
  group.add(dataCore);

  const observationRing = new Mesh(
    new TorusGeometry(1.9, 0.12, 16, 48),
    new MeshStandardMaterial({ color: 0xa855f7, emissive: new Color(0xa855f7), emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25 })
  );
  observationRing.rotation.x = Math.PI / 2;
  observationRing.position.y = 4.4;
  group.add(observationRing);

  const crown = new Mesh(new CylinderGeometry(1.4, 1.6, 0.4, 32), new MeshStandardMaterial({ color: 0x4338ca, metalness: 0.5, roughness: 0.3 }));
  crown.position.y = 4.9;
  group.add(crown);

  const antenna = new Mesh(new CylinderGeometry(0.18, 0.18, 2.4, 12), new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.45 }));
  antenna.position.y = 5.9;
  group.add(antenna);

  const beaconMaterial = new MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 0.5 });
  const beacon = new Mesh(new CylinderGeometry(0.4, 0.4, 0.4, 16), beaconMaterial);
  beacon.position.y = 7.1;
  group.add(beacon);

  const windowGeometry = new BoxGeometry(0.16, 0.8, 0.04);
  const windowMaterial = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: new Color(0x93c5fd),
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.85
  });
  windowMaterial.vertexColors = true;
  const windowCount = 96;
  const windows = new InstancedMesh(windowGeometry, windowMaterial, windowCount);
  const dummy = new Object3D();
  const windowOffsets: number[] = [];
  const windowColor = new Color();
  let index = 0;
  const xOffsets = [-0.9, -0.3, 0.3, 0.9];
  const zOffsets = [-0.9, -0.3, 0.3, 0.9];
  for (let floor = 0; floor < 6; floor += 1) {
    const y = 0.9 + floor * 0.65;
    for (const x of xOffsets) {
      dummy.position.set(x, y, 1.37);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      windows.setMatrixAt(index, dummy.matrix);
      windowOffsets.push(Math.random() * Math.PI * 2);
      windowColor.setHSL(0.55, 0.65, 0.55);
      windows.setColorAt(index, windowColor);
      index += 1;

      dummy.position.set(x, y, -1.37);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.updateMatrix();
      windows.setMatrixAt(index, dummy.matrix);
      windowOffsets.push(Math.random() * Math.PI * 2);
      windows.setColorAt(index, windowColor);
      index += 1;
    }
    for (const z of zOffsets) {
      dummy.position.set(1.37, y, z);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      windows.setMatrixAt(index, dummy.matrix);
      windowOffsets.push(Math.random() * Math.PI * 2);
      windows.setColorAt(index, windowColor);
      index += 1;

      dummy.position.set(-1.37, y, z);
      dummy.rotation.set(0, -Math.PI / 2, 0);
      dummy.updateMatrix();
      windows.setMatrixAt(index, dummy.matrix);
      windowOffsets.push(Math.random() * Math.PI * 2);
      windows.setColorAt(index, windowColor);
      index += 1;
    }
  }
  windows.instanceMatrix.needsUpdate = true;
  windows.instanceColor!.needsUpdate = true;
  group.add(windows);

  const plazaLightsGeometry = new CylinderGeometry(0.15, 0.2, 1.2, 8);
  const plazaLightsMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.35 });
  for (const angle of [Math.PI / 5, (Math.PI * 3) / 5, (Math.PI * 7) / 5, (Math.PI * 9) / 5]) {
    const light = new Mesh(plazaLightsGeometry, plazaLightsMaterial);
    light.position.set(Math.cos(angle) * 2.6, 0.6, Math.sin(angle) * 2.6);
    group.add(light);
  }

  const state = { time: 0 };

  const hotspot = new Hotspot({
    name: 'AI Innovation Tower',
    ariaLabel: 'See Ryan\'s AI explorations inside a futuristic tower',
    mesh: group,
    hitArea: tower,
    route: '#ai',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      observationRing.rotation.y += delta * 0.6;
      towerMaterial.emissiveIntensity = 0.2 + Math.sin(state.time * 1.4) * 0.05;
      dataCoreMaterial.emissiveIntensity = 0.35 + Math.sin(state.time * 2.6) * 0.1;
      doorMaterial.emissiveIntensity = 0.32 + Math.sin(state.time * 3.0) * 0.1;
      beaconMaterial.emissiveIntensity = 0.5 + Math.sin(state.time * 4.0) * 0.2;
      antenna.rotation.y += delta * 1.5;
      for (let i = 0; i < windowCount; i += 1) {
        const intensity = 0.45 + Math.sin(state.time * 2.2 + windowOffsets[i]) * 0.25;
        windowColor.setHSL(0.55, 0.7, intensity * 0.4 + 0.25);
        windows.setColorAt(i, windowColor);
      }
      windows.instanceColor!.needsUpdate = true;
      for (const dynamic of tableDynamics) {
        dynamic.projection.rotation.y += delta * 0.6;
        dynamic.projection.position.y = dynamic.baseY + Math.sin(state.time * 1.6 + dynamic.phase) * 0.05;
      }
    }
  });

  return { main: hotspot, extras };
}
