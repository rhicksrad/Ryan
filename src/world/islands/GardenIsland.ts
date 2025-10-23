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

interface GardenOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createGardenIsland(options: GardenOptions): Hotspot {
  const { audio, reducedMotion } = options;
  const group = new Group();

  const terrace = new Mesh(new CylinderGeometry(3.6, 3.9, 0.5, 32), new MeshStandardMaterial({ color: 0x14532d, roughness: 0.82 }));
  terrace.position.y = 0.25;
  group.add(terrace);

  const foundation = new Mesh(new BoxGeometry(4.4, 0.4, 4.4), new MeshStandardMaterial({ color: 0x1d4c27, roughness: 0.7 }));
  foundation.position.y = 0.45;
  group.add(foundation);

  const greenhouseMaterial = new MeshStandardMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.38,
    roughness: 0.1,
    metalness: 0.45,
    emissive: 0x7dd3fc,
    emissiveIntensity: 0.18
  });
  const greenhouse = new Mesh(new BoxGeometry(3.4, 2.2, 3.4), greenhouseMaterial);
  greenhouse.position.y = 1.6;
  group.add(greenhouse);

  const frameMaterial = new MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 });
  const frameColumn = new BoxGeometry(0.14, 2.4, 0.14);
  for (const [x, z] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6]
  ]) {
    const column = new Mesh(frameColumn, frameMaterial);
    column.position.set(x, 1.6, z);
    group.add(column);
  }
  const beamX = new BoxGeometry(3.4, 0.14, 0.14);
  const beamZ = new BoxGeometry(0.14, 0.14, 3.4);
  for (const height of [0.9, 1.6, 2.3]) {
    const beamA = new Mesh(beamX, frameMaterial);
    beamA.position.set(0, height + 0.45, -1.6);
    group.add(beamA);
    const beamB = new Mesh(beamX, frameMaterial);
    beamB.position.set(0, height + 0.45, 1.6);
    group.add(beamB);
    const beamC = new Mesh(beamZ, frameMaterial);
    beamC.position.set(-1.6, height + 0.45, 0);
    group.add(beamC);
    const beamD = new Mesh(beamZ, frameMaterial);
    beamD.position.set(1.6, height + 0.45, 0);
    group.add(beamD);
  }

  const roofMaterial = new MeshStandardMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.45,
    roughness: 0.12,
    metalness: 0.4,
    emissive: 0x93c5fd,
    emissiveIntensity: 0.25
  });
  const roof = new Mesh(new CylinderGeometry(0, 2.6, 1.4, 4), roofMaterial);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.3;
  group.add(roof);

  const skylight = new Mesh(new CylinderGeometry(0.7, 0.7, 0.18, 20), new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.32, transparent: true, opacity: 0.6 }));
  skylight.position.y = 3.9;
  group.add(skylight);

  const entryPath = new Mesh(new BoxGeometry(1.6, 0.2, 3.2), new MeshStandardMaterial({ color: 0xd9f99d, roughness: 0.88 }));
  entryPath.position.set(0, 0.1, 2.3);
  group.add(entryPath);

  const doorMaterial = new MeshStandardMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.6,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.2
  });
  const door = new Mesh(new BoxGeometry(1.0, 1.6, 0.08), doorMaterial);
  door.position.set(0, 1.2, 1.7);
  group.add(door);

  const sidePlanterMaterial = new MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 });
  const sideSoilMaterial = new MeshStandardMaterial({ color: 0x365314, roughness: 0.85 });
  for (const offset of [-2.0, 2.0]) {
    const planter = new Mesh(new BoxGeometry(1.2, 0.5, 3.2), sidePlanterMaterial);
    planter.position.set(offset, 0.55, 0);
    group.add(planter);
    const soil = new Mesh(new BoxGeometry(1.05, 0.36, 3.0), sideSoilMaterial);
    soil.position.set(offset, 0.68, 0);
    group.add(soil);
  }

  const interiorBed = new Mesh(new CylinderGeometry(1.2, 1.4, 0.4, 24), new MeshStandardMaterial({ color: 0x15803d, roughness: 0.75 }));
  interiorBed.position.set(0, 0.2, 0);
  group.add(interiorBed);

  const interiorTree = new Mesh(new ConeGeometry(0.8, 1.8, 8), new MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }));
  interiorTree.position.set(0, 1.8, 0);
  group.add(interiorTree);

  const plantGeometry = new ConeGeometry(0.25, 0.7, 6);
  const plantMaterial = new MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55 });
  const plantCount = 72;
  const plants = new InstancedMesh(plantGeometry, plantMaterial, plantCount);
  const dummy = new Object3D();
  const plantBases: { position: Vector3; scale: number; swayOffset: number; rotationY: number }[] = [];
  for (let i = 0; i < plantCount; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (1.9 + (Math.random() - 0.5) * 0.7);
    const z = (Math.random() - 0.5) * 2.6;
    const position = new Vector3(x, 0.88, z);
    const scale = 0.7 + Math.random() * 0.5;
    const swayOffset = Math.random() * Math.PI * 2;
    const rotationY = Math.random() * Math.PI * 2;
    plantBases.push({ position, scale, swayOffset, rotationY });
    dummy.position.copy(position);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(0, rotationY, 0);
    dummy.updateMatrix();
    plants.setMatrixAt(i, dummy.matrix);
  }
  plants.instanceMatrix.needsUpdate = true;
  group.add(plants);

  const state = { time: 0 };

  return new Hotspot({
    name: 'Greenhouse Atrium',
    ariaLabel: 'Explore Ryan\'s greenhouse-inspired workspace',
    mesh: group,
    hitArea: greenhouse,
    route: '#gardening',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      for (let i = 0; i < plantCount; i += 1) {
        const base = plantBases[i];
        dummy.position.copy(base.position);
        dummy.scale.setScalar(base.scale * (1 + Math.sin(state.time * 1.6 + base.swayOffset) * 0.06));
        dummy.rotation.set(
          Math.sin(state.time * 1.4 + base.swayOffset) * 0.15,
          base.rotationY,
          Math.cos(state.time * 1.2 + base.swayOffset) * 0.1
        );
        dummy.updateMatrix();
        plants.setMatrixAt(i, dummy.matrix);
      }
      plants.instanceMatrix.needsUpdate = true;
      greenhouseMaterial.emissiveIntensity = 0.18 + Math.sin(state.time * 1.8) * 0.05;
      roofMaterial.emissiveIntensity = 0.25 + Math.sin(state.time * 2.1) * 0.06;
      doorMaterial.emissiveIntensity = 0.2 + Math.sin(state.time * 3.0) * 0.06;
      interiorTree.scale.y = 1 + Math.sin(state.time * 1.1) * 0.05;
    }
  });
}
