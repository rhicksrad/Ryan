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
import { AudioController } from '../../utils/Audio';

interface ITRackOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createITRackIsland(options: ITRackOptions): Hotspot {
  const { audio, reducedMotion } = options;
  const group = new Group();

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

  const color = new Color();
  const state = { time: 0 };

  return new Hotspot({
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
    }
  });
}
