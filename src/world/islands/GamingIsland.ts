import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandHotspotBundle } from './types';
import { AudioController } from '../../utils/Audio';

interface GamingOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createGamingIsland(options: GamingOptions): IslandHotspotBundle {
  const { audio, reducedMotion } = options;
  const group = new Group();
  const extras: Hotspot[] = [];

  const podium = new Mesh(new CylinderGeometry(3.4, 3.8, 0.5, 40), new MeshStandardMaterial({ color: 0x14532d, roughness: 0.82 }));
  podium.position.y = 0.25;
  group.add(podium);

  const foundation = new Mesh(new CylinderGeometry(3.1, 3.4, 0.6, 32), new MeshStandardMaterial({ color: 0x111827, roughness: 0.65 }));
  foundation.position.y = 0.55;
  group.add(foundation);

  const shellMaterial = new MeshStandardMaterial({
    color: 0x1e1b4b,
    metalness: 0.6,
    roughness: 0.25,
    emissive: new Color(0x4338ca),
    emissiveIntensity: 0.24,
    transparent: true,
    opacity: 0.78
  });
  const shell = new Mesh(new CylinderGeometry(2.6, 2.9, 2.6, 6, 1, true), shellMaterial);
  shell.position.y = 1.9;
  group.add(shell);

  const spineMaterial = new MeshStandardMaterial({ color: 0x3730a3, roughness: 0.3, metalness: 0.45 });
  for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    const panel = new Mesh(new BoxGeometry(0.4, 3.2, 5.2), spineMaterial);
    panel.position.set(Math.cos(angle) * 1.6, 1.8, Math.sin(angle) * 1.6);
    panel.rotation.y = angle;
    group.add(panel);
  }

  const portalMaterial = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.46,
    transparent: true,
    opacity: 0.72,
    metalness: 0.55,
    roughness: 0.18
  });
  const portal = new Mesh(new TorusGeometry(1.6, 0.18, 24, 64), portalMaterial);
  portal.rotation.x = Math.PI / 2;
  portal.position.set(0, 1.4, 2.2);
  group.add(portal);

  const portalBase = new Mesh(new BoxGeometry(2.6, 0.14, 1.6), new MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.4, metalness: 0.3 }));
  portalBase.position.set(0, 0.12, 2.6);
  group.add(portalBase);

  const roofRing = new Mesh(new TorusGeometry(2.2, 0.16, 24, 64), new MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 0.35 }));
  roofRing.position.y = 3.4;
  group.add(roofRing);

  const beacon = new Mesh(new CylinderGeometry(0.24, 0.24, 1.6, 20), new MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.55 }));
  beacon.position.y = 4.4;
  group.add(beacon);

  const accentMaterial = new MeshStandardMaterial({ color: 0x312e81, roughness: 0.35, metalness: 0.5 });
  const accent = new Mesh(new BoxGeometry(3.2, 0.28, 3.4), accentMaterial);
  accent.position.y = 1.2;
  group.add(accent);

  const walkway = new Mesh(new BoxGeometry(2.6, 0.16, 4.2), new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.78 }));
  walkway.position.set(0, 0.08, 2.6);
  group.add(walkway);

  const interior = new Group();
  interior.position.y = 0.7;
  group.add(interior);

  const interiorFloor = new Mesh(new CylinderGeometry(1.8, 1.8, 0.12, 48), new MeshStandardMaterial({ color: 0x0b1120, roughness: 0.5 }));
  interiorFloor.position.y = 0.12;
  interior.add(interiorFloor);

  const holoPadMaterial = new MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.36,
    transparent: true,
    opacity: 0.85,
    metalness: 0.55,
    roughness: 0.18
  });

  const holoPad = new Mesh(new CylinderGeometry(0.9, 0.9, 0.08, 48), holoPadMaterial);
  holoPad.position.set(0, 0.18, 0.6);
  interior.add(holoPad);

  const podMaterial = new MeshStandardMaterial({ color: 0x4c1d95, emissive: 0x4c1d95, emissiveIntensity: 0.24, metalness: 0.5, roughness: 0.32 });
  const podGeometry = new CylinderGeometry(0.4, 0.6, 1.1, 16);
  const podPositions: Array<Vector3> = [new Vector3(-1, 0.6, -0.6), new Vector3(1, 0.6, -0.6)];
  const pods = new InstancedMesh(podGeometry, podMaterial, podPositions.length);
  const podDummy = new Object3D();
  podPositions.forEach((position, index) => {
    podDummy.position.copy(position);
    podDummy.updateMatrix();
    pods.setMatrixAt(index, podDummy.matrix);
  });
  pods.instanceMatrix.needsUpdate = true;
  interior.add(pods);

  const consoleMaterial = new MeshStandardMaterial({ color: 0x1f2937, metalness: 0.45, roughness: 0.35 });
  const console = new Mesh(new BoxGeometry(1.6, 0.5, 0.9), consoleMaterial);
  console.position.set(0, 0.65, -1.2);
  interior.add(console);

  const consoleScreenMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 });
  const consoleScreen = new Mesh(new BoxGeometry(1.4, 0.9, 0.1), consoleScreenMaterial);
  consoleScreen.position.set(0, 1.1, -1.18);
  interior.add(consoleScreen);

  const entryLightMaterial = new MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.4, transparent: true, opacity: 0.8 });
  const entryLight = new Mesh(new BoxGeometry(0.16, 2.2, 0.12), entryLightMaterial);
  entryLight.position.set(1.6, 1.2, 1.4);
  interior.add(entryLight);
  const entryLightMirror = entryLight.clone();
  entryLightMirror.position.x = -1.6;
  interior.add(entryLightMirror);

  const holoHotspot = new Hotspot({
    name: 'Game Prototype Hub',
    ariaLabel: 'Inspect upcoming game prototypes inside the arcade',
    mesh: holoPad,
    route: '#gaming',
    onEnter: () => {
      holoPadMaterial.emissiveIntensity = 0.6;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      holoPadMaterial.emissiveIntensity = 0.36;
    }
  });
  extras.push(holoHotspot);

  const consoleHotspot = new Hotspot({
    name: 'Strategy Command Console',
    ariaLabel: 'Review multiplayer strategy boards inside the arcade',
    mesh: consoleScreen,
    route: '#gaming',
    onEnter: () => {
      consoleScreenMaterial.emissiveIntensity = 0.7;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      consoleScreenMaterial.emissiveIntensity = 0.5;
    }
  });
  extras.push(consoleHotspot);

  const podsState = { time: 0 };

  const podHotspot = new Hotspot({
    name: 'VR Battle Pods',
    ariaLabel: 'Load into a VR battle pod for immersive demos',
    mesh: pods,
    route: '#gaming',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
      podMaterial.emissiveIntensity = 0.36;
    },
    onLeave: () => {
      podMaterial.emissiveIntensity = 0.24;
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      podsState.time += delta;
      const sway = Math.sin(podsState.time * 1.5) * 0.08;
      podPositions.forEach((position, index) => {
        podDummy.position.set(position.x, 0.6 + sway * (index % 2 === 0 ? 1 : -1), position.z);
        podDummy.rotation.y = podsState.time * 0.4 * (index % 2 === 0 ? 1 : -1);
        podDummy.updateMatrix();
        pods.setMatrixAt(index, podDummy.matrix);
      });
      pods.instanceMatrix.needsUpdate = true;
    }
  });
  extras.push(podHotspot);

  const state = { time: 0 };

  const hotspot = new Hotspot({
    name: 'Gaming Arcade',
    ariaLabel: 'Step into Ryan\'s gaming innovation arcade',
    mesh: group,
    hitArea: portal,
    route: '#gaming',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      const pulse = 0.4 + Math.sin(state.time * 3.6) * 0.12;
      portalMaterial.emissiveIntensity = 0.46 + Math.sin(state.time * 2.6) * 0.18;
      shellMaterial.emissiveIntensity = 0.24 + Math.sin(state.time * 1.6) * 0.06;
      roofRing.rotation.y += delta * 0.6;
      beacon.position.y = 4.4 + Math.sin(state.time * 2.2) * 0.18;
      portal.scale.setScalar(1 + pulse * 0.06);
    }
  });

  return { main: hotspot, extras };
}
