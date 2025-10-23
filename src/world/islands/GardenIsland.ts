import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { Hotspot } from '../Hotspot';
import { AudioController } from '../../utils/Audio';

interface GardenOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createGardenIsland(options: GardenOptions): Hotspot {
  const { audio, reducedMotion } = options;
  const group = new Group();

  const soilMaterial = new MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.8 });
  const bedGeometry = new BoxGeometry(3.2, 0.6, 2.1);
  const bedMaterial = new MeshStandardMaterial({ color: 0x1f2937 });
  let primaryBed: Mesh | null = null;
  for (let i = 0; i < 3; i += 1) {
    const bed = new Mesh(bedGeometry, bedMaterial);
    bed.position.set(0, 0.3, i * 2.3 - 2.3);
    if (i === 1) {
      primaryBed = bed;
    }
    group.add(bed);

    const soil = new Mesh(new BoxGeometry(3.0, 0.5, 1.9), soilMaterial);
    soil.position.set(0, 0.8, i * 2.3 - 2.3);
    group.add(soil);
  }

  const plantGeometry = new BoxGeometry(0.2, 0.8, 0.2);
  const plantMaterial = new MeshStandardMaterial({ color: 0x22c55e });
  const plantCount = 60;
  const plants = new InstancedMesh(plantGeometry, plantMaterial, plantCount);
  const dummy = new Object3D();
  const bases: { position: Vector3; scale: number; swayOffset: number }[] = [];
  for (let i = 0; i < plantCount; i += 1) {
    const bedIndex = Math.floor(i / 20);
    const base = new Vector3((Math.random() - 0.5) * 2.2, 1, bedIndex * 2.3 - 2.3 + (Math.random() - 0.5) * 1.5);
    const scale = 0.6 + Math.random() * 0.5;
    const swayOffset = Math.random() * Math.PI * 2;
    bases.push({ position: base, scale, swayOffset });
    dummy.position.copy(base);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    plants.setMatrixAt(i, dummy.matrix);
  }
  plants.instanceMatrix.needsUpdate = true;
  group.add(plants);

  const state = { time: 0 };

  return new Hotspot({
    name: 'Garden Retreat',
    ariaLabel: 'Learn about Ryan\'s gardening experiments',
    mesh: group,
    hitArea: primaryBed ?? group,
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
        const base = bases[i];
        dummy.position.copy(base.position);
        dummy.scale.setScalar(base.scale);
        dummy.rotation.set(0, Math.sin(state.time * 1.5 + base.swayOffset) * 0.3, 0);
        dummy.updateMatrix();
        plants.setMatrixAt(i, dummy.matrix);
      }
      plants.instanceMatrix.needsUpdate = true;
    }
  });
}
