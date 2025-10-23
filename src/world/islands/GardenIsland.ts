import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  CylinderGeometry,
  Vector3,
  Quaternion
} from 'three';
import type { LoadedAssets, ProfileContent } from '../../types';
import { Hotspot } from '../Hotspot';

const tempMatrix = new Matrix4();
const tempVector = new Vector3();
const tempQuat = new Quaternion();
const tempScale = new Vector3();
const axisZ = new Vector3(0, 0, 1);

export function create(parent: Group, content: ProfileContent, _assets: LoadedAssets) {
  const group = new Group();
  group.name = 'Garden Island';

  const soilMaterial = new MeshStandardMaterial({ color: '#5b3a29', roughness: 0.9 });
  const bedMaterial = new MeshStandardMaterial({ color: '#8d6e63', roughness: 0.8 });

  for (let i = 0; i < 3; i++) {
    const bed = new Mesh(new BoxGeometry(2.8, 0.6, 1.4), bedMaterial);
    bed.position.set((i - 1) * 2.4, 0.3, 0);
    bed.castShadow = true;
    bed.receiveShadow = true;
    group.add(bed);

    const soil = new Mesh(new BoxGeometry(2.6, 0.3, 1.2), soilMaterial);
    soil.position.set((i - 1) * 2.4, 0.75, 0);
    soil.receiveShadow = true;
    group.add(soil);
  }

  const plantGeometry = new CylinderGeometry(0.1, 0.4, 0.9, 6, 1);
  const plantMaterial = new MeshStandardMaterial({ color: '#6cc24a' });
  const plantCount = 48;
  const plants = new InstancedMesh(plantGeometry, plantMaterial, plantCount);

  const basePositions: Vector3[] = [];
  for (let i = 0; i < plantCount; i++) {
    const bedIndex = Math.floor(i / 16);
    const x = (Math.random() - 0.5) * 2.2 + (bedIndex - 1) * 2.4;
    const z = (Math.random() - 0.5) * 0.8;
    const y = 1.2;
    tempVector.set(x, y, z);
    tempQuat.set(0, 0, 0, 1);
    tempScale.set(1, 1, 1);
    tempMatrix.compose(tempVector, tempQuat, tempScale);
    plants.setMatrixAt(i, tempMatrix);
    basePositions.push(tempVector.clone());
  }
  plants.instanceMatrix.needsUpdate = true;
  plants.castShadow = true;
  group.add(plants);

  parent.add(group);

  const hitArea = new Mesh(new BoxGeometry(6, 0.4, 4));
  hitArea.position.y = 0.2;
  hitArea.visible = false;
  group.add(hitArea);

  const hotspot = new Hotspot({
    name: 'Garden Island',
    route: '#gardening',
    ariaLabel: 'Open gardening notes',
    mesh: group,
    hitArea,
    interestKey: 'gardening',
    summary: content.interests.gardening.summary
  });

  const swayOffsets = Array.from({ length: plantCount }, () => Math.random() * Math.PI * 2);

  hotspot.setUpdate(({ elapsed, reducedMotion }) => {
    if (reducedMotion) return;
    for (let i = 0; i < plantCount; i++) {
      const sway = Math.sin(elapsed * 0.8 + swayOffsets[i]) * 0.15;
      const scale = 0.9 + Math.sin(elapsed * 0.5 + swayOffsets[i]) * 0.1;
      tempVector.copy(basePositions[i]);
      tempQuat.setFromAxisAngle(axisZ, sway);
      tempScale.set(1, scale, 1);
      tempMatrix.compose(tempVector, tempQuat, tempScale);
      plants.setMatrixAt(i, tempMatrix);
    }
    plants.instanceMatrix.needsUpdate = true;
  });

  return hotspot;
}
