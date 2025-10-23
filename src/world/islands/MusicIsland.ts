import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3
} from 'three';
import { Hotspot } from '../Hotspot';
import { AudioController } from '../../utils/Audio';

interface MusicOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createMusicIsland(options: MusicOptions): Hotspot {
  const { audio, reducedMotion } = options;
  const group = new Group();

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

  const state = { time: 0 };

  return new Hotspot({
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
    }
  });
}
