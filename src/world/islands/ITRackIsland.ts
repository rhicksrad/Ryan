import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandHotspotBundle } from './types';
import { AudioController } from '../../utils/Audio';

interface ITRackOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createITRackIsland(options: ITRackOptions): IslandHotspotBundle {
  const { audio, reducedMotion } = options;
  const group = new Group();
  const extras: Hotspot[] = [];

  const plaza = new Mesh(new CylinderGeometry(3.8, 4.2, 0.55, 48), new MeshStandardMaterial({ color: 0x14532d, roughness: 0.82 }));
  plaza.position.y = 0.275;
  group.add(plaza);

  const foundation = new Mesh(new BoxGeometry(4.6, 0.4, 4.6), new MeshStandardMaterial({ color: 0x111827, roughness: 0.6 }));
  foundation.position.y = 0.45;
  group.add(foundation);

  const towerMaterial = new MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.45,
    roughness: 0.3,
    emissive: new Color(0x38bdf8),
    emissiveIntensity: 0.15
  });
  const tower = new Mesh(new BoxGeometry(4.0, 3.8, 4.0), towerMaterial);
  tower.position.y = 2.35;
  group.add(tower);

  const roof = new Mesh(new BoxGeometry(4.4, 0.4, 4.4), new MeshStandardMaterial({ color: 0x0b1120, roughness: 0.4 }));
  roof.position.y = 4.45;
  group.add(roof);

  const doorMaterial = new MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.82
  });
  const door = new Mesh(new BoxGeometry(1.6, 2.0, 0.12), doorMaterial);
  door.position.set(0, 1.4, 2.1);
  group.add(door);

  const entryCanopy = new Mesh(new BoxGeometry(2.6, 0.18, 1.2), new MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.35, metalness: 0.4 }));
  entryCanopy.position.set(0, 2.1, 1.5);
  group.add(entryCanopy);

  const walkway = new Mesh(new BoxGeometry(2.4, 0.16, 4.4), new MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.85 }));
  walkway.position.set(0, 0.08, 2.6);
  group.add(walkway);

  const generatorBaseMaterial = new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 });
  const generatorGlowMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.28, transparent: true, opacity: 0.78 });
  const generatorTopMaterial = new MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 0.22, transparent: true, opacity: 0.72 });
  const generatorCaps: Mesh[] = [];
  const generatorGlows: Mesh[] = [];
  const generatorPositions: Array<[number, number]> = [
    [-3.2, 0],
    [3.2, 0],
    [0, -3.2]
  ];
  for (const [x, z] of generatorPositions) {
    const base = new Mesh(new CylinderGeometry(0.6, 0.8, 0.6, 18), generatorBaseMaterial);
    base.position.set(x, 0.3, z);
    group.add(base);
    const glow = new Mesh(new CylinderGeometry(0.7, 0.7, 0.24, 24), generatorGlowMaterial);
    glow.position.set(x, 0.72, z);
    group.add(glow);
    generatorGlows.push(glow);
    const cap = new Mesh(new CylinderGeometry(0.4, 0.6, 0.5, 20), generatorTopMaterial);
    cap.position.set(x, 1.05, z);
    group.add(cap);
    generatorCaps.push(cap);
  }

  const beaconMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.4 });
  const beacon = new Mesh(new CylinderGeometry(0.22, 0.22, 1.8, 16), beaconMaterial);
  beacon.position.y = 5.35;
  group.add(beacon);

  const dishArm = new Mesh(new CylinderGeometry(0.1, 0.1, 1.2, 12), new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 }));
  dishArm.rotation.z = Math.PI / 2;
  dishArm.position.set(-2.2, 4.3, 0);
  group.add(dishArm);

  const dish = new Mesh(new CylinderGeometry(0, 1.1, 0.4, 24), new MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x60a5fa, emissiveIntensity: 0.45 }));
  dish.rotation.x = -Math.PI / 2;
  dish.position.set(-2.8, 4.9, 0);
  group.add(dish);

  const indicatorGeometry = new BoxGeometry(0.18, 1.0, 0.08);
  const indicatorMaterial = new MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
  indicatorMaterial.vertexColors = true;
  const indicatorCount = 96;
  const indicators = new InstancedMesh(indicatorGeometry, indicatorMaterial, indicatorCount);
  const dummy = new Object3D();
  const indicatorData: Array<{ position: Vector3; rotationY: number; phase: number }> = [];
  let index = 0;
  const panelOffsets = [-1.2, -0.4, 0.4, 1.2];
  for (let tier = 0; tier < 4; tier += 1) {
    const y = 1.0 + tier * 0.8;
    for (const x of panelOffsets) {
      for (const z of [-1.75, 1.75]) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, z > 0 ? 0 : Math.PI, 0);
        dummy.updateMatrix();
        indicators.setMatrixAt(index, dummy.matrix);
        indicatorData.push({ position: dummy.position.clone(), rotationY: dummy.rotation.y, phase: Math.random() * Math.PI * 2 });
        index += 1;
      }
    }
    for (const z of panelOffsets) {
      for (const x of [-1.75, 1.75]) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, x > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        dummy.updateMatrix();
        indicators.setMatrixAt(index, dummy.matrix);
        indicatorData.push({ position: dummy.position.clone(), rotationY: dummy.rotation.y, phase: Math.random() * Math.PI * 2 });
        index += 1;
      }
    }
  }
  indicators.instanceMatrix.needsUpdate = true;
  group.add(indicators);

  const accentBandMaterial = new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45 });
  for (const height of [1.3, 2.1, 2.9]) {
    const band = new Mesh(new BoxGeometry(4.2, 0.18, 4.2), accentBandMaterial);
    band.position.y = height + 0.3;
    group.add(band);
  }

  const interior = new Group();
  interior.position.set(0, 0.75, 0);
  group.add(interior);

  const interiorFloor = new Mesh(new BoxGeometry(2.8, 0.12, 2.8), new MeshStandardMaterial({ color: 0x0b1120, roughness: 0.55 }));
  interiorFloor.position.set(0, -0.12, 0);
  interior.add(interiorFloor);

  const opsTable = new Mesh(new CylinderGeometry(0.95, 0.95, 0.42, 32), new MeshStandardMaterial({ color: 0x1f2937, roughness: 0.35, metalness: 0.4 }));
  opsTable.position.set(0, 0.2, 0.2);
  interior.add(opsTable);
  const opsSurfaceMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.26, transparent: true, opacity: 0.82 });
  const opsSurface = new Mesh(new CylinderGeometry(0.9, 0.9, 0.08, 32), opsSurfaceMaterial);
  opsSurface.position.set(0, 0.44, 0.2);
  interior.add(opsSurface);

  const deploymentStack = new Mesh(new CylinderGeometry(0.35, 0.5, 1.4, 18), new MeshStandardMaterial({ color: 0x2563eb, emissive: 0x2563eb, emissiveIntensity: 0.22 }));
  deploymentStack.position.set(-1.2, 0.7, -0.6);
  interior.add(deploymentStack);
  const deploymentGlowMaterial = new MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x60a5fa, emissiveIntensity: 0.28, transparent: true, opacity: 0.75 });
  const deploymentGlow = new Mesh(new CylinderGeometry(0.55, 0.55, 0.2, 24), deploymentGlowMaterial);
  deploymentGlow.position.set(-1.2, 1.4, -0.6);
  interior.add(deploymentGlow);

  const monitoringWall = new Mesh(new BoxGeometry(0.16, 1.6, 2.4), new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45 }));
  monitoringWall.position.set(1.3, 0.8, -0.2);
  interior.add(monitoringWall);
  const monitoringScreenMaterial = new MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.24, transparent: true, opacity: 0.85 });
  const monitoringScreen = new Mesh(new BoxGeometry(0.12, 1.4, 2.0), monitoringScreenMaterial);
  monitoringScreen.position.set(1.34, 0.8, -0.2);
  interior.add(monitoringScreen);

  const interiorRing = new Mesh(new CylinderGeometry(1.6, 1.6, 0.06, 40), new MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }));
  interiorRing.position.set(0, 0.02, 0.2);
  interior.add(interiorRing);

  const interiorState = { opsHover: false, deployHover: false, monitorHover: false };

  const opsHotspot = new Hotspot({
    name: 'Operations Console',
    ariaLabel: 'Configure infrastructure automation from the central console',
    mesh: opsSurface,
    route: '#it',
    onEnter: () => {
      interiorState.opsHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.opsHover = false;
    }
  });
  extras.push(opsHotspot);

  const deploymentHotspot = new Hotspot({
    name: 'Deployment Reactor',
    ariaLabel: 'Trigger blue-green deploy pipelines from the reactor',
    mesh: deploymentGlow,
    route: '#it',
    onEnter: () => {
      interiorState.deployHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.deployHover = false;
    }
  });
  extras.push(deploymentHotspot);

  const monitorHotspot = new Hotspot({
    name: 'Observability Wall',
    ariaLabel: 'Review real-time observability dashboards inside the tower',
    mesh: monitoringScreen,
    route: '#it',
    onEnter: () => {
      interiorState.monitorHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.monitorHover = false;
    }
  });
  extras.push(monitorHotspot);

  const color = new Color();
  const state = { time: 0 };

  const hotspot = new Hotspot({
    name: 'Infrastructure Tower',
    ariaLabel: 'Visit Ryan\'s infrastructure HQ building',
    mesh: group,
    hitArea: tower,
    route: '#it',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      beaconMaterial.emissiveIntensity = 0.4 + Math.sin(state.time * 2.2) * 0.1;
      dish.rotation.y = Math.sin(state.time * 0.8) * 0.6;
      towerMaterial.emissiveIntensity = 0.15 + Math.sin(state.time * 1.5) * 0.04;
      doorMaterial.emissiveIntensity = 0.3 + Math.sin(state.time * 2.8) * 0.08;
      for (let i = 0; i < indicatorData.length; i += 1) {
        const data = indicatorData[i];
        dummy.position.copy(data.position);
        const scaleY = 0.6 + Math.sin(state.time * 2.5 + data.phase) * 0.35;
        dummy.scale.set(1, Math.max(0.3, scaleY), 1);
        dummy.rotation.set(0, data.rotationY, 0);
        dummy.updateMatrix();
        indicators.setMatrixAt(i, dummy.matrix);
        const brightness = 0.45 + Math.sin(state.time * 2.5 + data.phase) * 0.25;
        color.setHSL(0.55, 0.7, brightness * 0.5 + 0.25);
        indicators.setColorAt(i, color);
      }
      indicators.instanceMatrix.needsUpdate = true;
      indicators.instanceColor!.needsUpdate = true;
      generatorCaps.forEach((cap, index) => {
        cap.rotation.y += delta * (index % 2 === 0 ? 1.2 : -1.1);
      });
      const generatorPulse = 0.28 + Math.sin(state.time * 2.6) * 0.12;
      generatorGlows.forEach((glow) => {
        glow.scale.y = 1 + generatorPulse * 0.15;
        (glow.material as MeshStandardMaterial).emissiveIntensity = 0.28 + Math.sin(state.time * 3.0) * 0.1;
      });
      opsSurfaceMaterial.emissiveIntensity = 0.26 + Math.sin(state.time * 1.8) * 0.08 + (interiorState.opsHover ? 0.2 : 0);
      deploymentGlowMaterial.emissiveIntensity = 0.28 + Math.sin(state.time * 2.2) * 0.08 + (interiorState.deployHover ? 0.2 : 0);
      monitoringScreenMaterial.emissiveIntensity = 0.24 + Math.sin(state.time * 2.0) * 0.06 + (interiorState.monitorHover ? 0.22 : 0);
    }
  });

  return { main: hotspot, extras };
}
