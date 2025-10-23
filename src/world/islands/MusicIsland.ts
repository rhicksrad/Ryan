import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandHotspotBundle } from './types';
import { AudioController } from '../../utils/Audio';

interface MusicOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createMusicIsland(options: MusicOptions): IslandHotspotBundle {
  const { audio, reducedMotion } = options;
  const group = new Group();
  const extras: Hotspot[] = [];

  const plaza = new Mesh(new CylinderGeometry(3.6, 4.0, 0.5, 32), new MeshStandardMaterial({ color: 0x14532d, roughness: 0.82 }));
  plaza.position.y = 0.25;
  group.add(plaza);

  const hallMaterial = new MeshStandardMaterial({
    color: 0x312e81,
    metalness: 0.6,
    roughness: 0.3,
    emissive: 0x312e81,
    emissiveIntensity: 0.2
  });
  const hall = new Mesh(new CylinderGeometry(2.8, 2.8, 2.6, 32), hallMaterial);
  hall.position.y = 1.6;
  group.add(hall);

  const glassMaterial = new MeshStandardMaterial({
    color: 0x818cf8,
    transparent: true,
    opacity: 0.25,
    metalness: 0.4,
    roughness: 0.2,
    emissive: 0x6366f1,
    emissiveIntensity: 0.22
  });
  const glass = new Mesh(new CylinderGeometry(2.9, 2.9, 2.0, 32, 1, true), glassMaterial);
  glass.position.y = 1.6;
  group.add(glass);

  const domeMaterial = new MeshStandardMaterial({ color: 0x4338ca, metalness: 0.6, roughness: 0.2, emissive: 0x6366f1, emissiveIntensity: 0.3 });
  const dome = new Mesh(new ConeGeometry(3.0, 1.8, 32), domeMaterial);
  dome.position.y = 3.5;
  group.add(dome);

  const spire = new Mesh(new CylinderGeometry(0.2, 0.2, 1.2, 12), new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.4 }));
  spire.position.y = 4.8;
  group.add(spire);

  const noteMaterial = new MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.32 });
  const noteHeadGeometry = new SphereGeometry(0.35, 16, 16);
  const noteStemGeometry = new CylinderGeometry(0.08, 0.08, 0.9, 12);
  const musicNotes: Array<{ group: Group; speed: number; offset: number }> = [];
  const notePositions: Array<[number, number]> = [
    [1.8, -2.4],
    [-2.0, -1.6],
    [2.2, 2.0],
    [-1.6, 2.4]
  ];
  notePositions.forEach(([x, z], index) => {
    const noteGroup = new Group();
    noteGroup.position.set(x, 2.6 + Math.random() * 0.8, z);
    const head = new Mesh(noteHeadGeometry, noteMaterial);
    head.position.y = -0.2;
    noteGroup.add(head);
    const stem = new Mesh(noteStemGeometry, noteMaterial);
    stem.position.y = 0.3;
    stem.rotation.z = Math.PI * 0.05;
    noteGroup.add(stem);
    const flag = new Mesh(new BoxGeometry(0.45, 0.18, 0.05), noteMaterial);
    flag.position.set(0.2, 0.7, 0);
    flag.rotation.y = Math.PI * 0.25;
    noteGroup.add(flag);
    group.add(noteGroup);
    musicNotes.push({ group: noteGroup, speed: 0.8 + index * 0.25, offset: Math.random() * Math.PI * 2 });
  });

  const marquee = new Mesh(new BoxGeometry(3.2, 0.3, 1.2), new MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.45 }));
  marquee.position.set(0, 1.8, 2.2);
  group.add(marquee);

  const marqueeGlow = new Mesh(new BoxGeometry(3.0, 0.18, 0.4), new MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.4 }));
  marqueeGlow.position.set(0, 1.85, 2.6);
  group.add(marqueeGlow);

  const doorMaterial = new MeshStandardMaterial({
    color: 0xfde68a,
    emissive: 0xfde68a,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.85
  });
  const door = new Mesh(new BoxGeometry(1.6, 1.8, 0.1), doorMaterial);
  door.position.set(0, 1.2, 2.4);
  group.add(door);

  const steps = new Mesh(new BoxGeometry(2.4, 0.2, 1.6), new MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.85 }));
  steps.position.set(0, 0.1, 2.8);
  group.add(steps);

  const barGeometry = new BoxGeometry(0.3, 1.0, 0.3);
  const barMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.4 });
  const barCount = 18;
  const bars = new InstancedMesh(barGeometry, barMaterial, barCount);
  const dummy = new Object3D();
  const barData: Array<{ position: Vector3; offset: number }> = [];
  for (let i = 0; i < barCount; i += 1) {
    const column = i % 9;
    const layer = i < 9 ? 0 : 1;
    const x = column * 0.6 - 2.4;
    const z = layer === 0 ? 1.6 : 1.0;
    const position = new Vector3(x, 0.6, z);
    barData.push({ position, offset: Math.random() * Math.PI * 2 });
    dummy.position.set(position.x, position.y, position.z);
    dummy.scale.set(1, 0.6, 1);
    dummy.updateMatrix();
    bars.setMatrixAt(i, dummy.matrix);
  }
  bars.instanceMatrix.needsUpdate = true;
  group.add(bars);

  const spotMaterial = new MeshStandardMaterial({ color: 0x6366f1, emissive: 0x6366f1, emissiveIntensity: 0.35, transparent: true, opacity: 0.6 });
  for (const angle of [Math.PI / 6, (Math.PI * 5) / 6, (Math.PI * 9) / 6]) {
    const spotlight = new Mesh(new CylinderGeometry(0.2, 0.25, 1.6, 12), spotMaterial);
    spotlight.position.set(Math.cos(angle) * 2.8, 0.8, Math.sin(angle) * 2.8);
    group.add(spotlight);
  }

  const interior = new Group();
  interior.position.y = 0.6;
  group.add(interior);

  const stageFloor = new Mesh(new CylinderGeometry(2.1, 2.1, 0.12, 40), new MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.4 }));
  stageFloor.position.y = -0.12;
  interior.add(stageFloor);

  const centerStageMaterial = new MeshStandardMaterial({ color: 0x312e81, emissive: 0x4338ca, emissiveIntensity: 0.22 });
  const centerStage = new Mesh(new CylinderGeometry(1.6, 1.6, 0.16, 40), centerStageMaterial);
  centerStage.position.y = 0.04;
  interior.add(centerStage);

  const synthMaterial = new MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.45 });
  const synthConsole = new Mesh(new BoxGeometry(1.8, 0.4, 0.8), synthMaterial);
  synthConsole.position.set(0, 0.3, -0.8);
  interior.add(synthConsole);
  const synthSurfaceMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.24, transparent: true, opacity: 0.85 });
  const synthSurface = new Mesh(new BoxGeometry(1.6, 0.08, 0.7), synthSurfaceMaterial);
  synthSurface.position.set(0, 0.54, -0.8);
  interior.add(synthSurface);

  const rhythmPadsMaterial = new MeshStandardMaterial({ color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 0.22, transparent: true, opacity: 0.82 });
  const rhythmPads = new Mesh(new BoxGeometry(1.2, 0.1, 0.9), rhythmPadsMaterial);
  rhythmPads.position.set(-1.3, 0.4, 0.6);
  interior.add(rhythmPads);

  const loungeMaterial = new MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 });
  const loungeBase = new Mesh(new CylinderGeometry(0.9, 0.9, 0.18, 30), loungeMaterial);
  loungeBase.position.set(1.3, 0.1, 0.6);
  interior.add(loungeBase);
  const loungeGlowMaterial = new MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.18, transparent: true, opacity: 0.7 });
  const loungeGlow = new Mesh(new CylinderGeometry(0.8, 0.8, 0.08, 30), loungeGlowMaterial);
  loungeGlow.position.set(1.3, 0.18, 0.6);
  interior.add(loungeGlow);

  const interiorState = { synthHover: false, rhythmHover: false, loungeHover: false };

  const synthHotspot = new Hotspot({
    name: 'Synth Console',
    ariaLabel: 'Jump into Ryan\'s live synth sets',
    mesh: synthSurface,
    route: '#music',
    onEnter: () => {
      interiorState.synthHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.synthHover = false;
    },
    onClick: () => {
      window.open('https://rhicksrad.github.io/8Beat', '_blank', 'noopener');
    }
  });
  extras.push(synthHotspot);

  const rhythmHotspot = new Hotspot({
    name: 'Rhythm Lab',
    ariaLabel: 'Experiment with rhythm patterns on the pad array',
    mesh: rhythmPads,
    route: '#music',
    onEnter: () => {
      interiorState.rhythmHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.rhythmHover = false;
    }
  });
  extras.push(rhythmHotspot);

  const loungeHotspot = new Hotspot({
    name: 'Listening Lounge',
    ariaLabel: 'Queue up mixes in the listening lounge',
    mesh: loungeGlow,
    route: '#music',
    onEnter: () => {
      interiorState.loungeHover = true;
      audio.playHoverBleep().catch(() => undefined);
    },
    onLeave: () => {
      interiorState.loungeHover = false;
    }
  });
  extras.push(loungeHotspot);

  const state = { time: 0 };

  const hotspot = new Hotspot({
    name: 'Music Hall',
    ariaLabel: 'Listen to Ryan\'s synth experiments inside the concert dome',
    mesh: group,
    hitArea: hall,
    route: '#music',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      const beat = audio.isMuted() ? Math.sin(state.time * 2.5) : Math.sin(state.time * 4.0);
      hallMaterial.emissiveIntensity = 0.2 + Math.sin(state.time * 1.5) * 0.04;
      glassMaterial.emissiveIntensity = 0.22 + Math.sin(state.time * 1.9) * 0.05;
      domeMaterial.emissiveIntensity = 0.3 + Math.sin(state.time * 1.4) * 0.06;
      doorMaterial.emissiveIntensity = 0.3 + Math.sin(state.time * 2.6) * 0.08;
      barMaterial.emissiveIntensity = 0.4 + Math.sin(state.time * 3.0) * 0.1;
      for (let i = 0; i < barCount; i += 1) {
        const data = barData[i];
        const height = 0.5 + Math.abs(Math.sin(state.time * 3.2 + data.offset + beat * 0.4)) * 0.9;
        dummy.position.set(data.position.x, 0.5 + height / 2, data.position.z);
        dummy.scale.set(1, height, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
      }
      bars.instanceMatrix.needsUpdate = true;
      musicNotes.forEach((note) => {
        note.group.position.y = 2.4 + Math.sin(state.time * note.speed + note.offset) * 0.6;
        note.group.rotation.y = state.time * 0.6;
      });
      synthSurfaceMaterial.emissiveIntensity = 0.24 + Math.sin(state.time * 2.2) * 0.08 + (interiorState.synthHover ? 0.24 : 0);
      rhythmPadsMaterial.emissiveIntensity = 0.22 + Math.sin(state.time * 2.8) * 0.07 + (interiorState.rhythmHover ? 0.2 : 0);
      loungeGlowMaterial.emissiveIntensity = 0.18 + Math.sin(state.time * 1.9) * 0.06 + (interiorState.loungeHover ? 0.18 : 0);
      centerStageMaterial.emissiveIntensity = 0.22 + Math.sin(state.time * 1.7) * 0.05;
    }
  });

  return { main: hotspot, extras };
}
