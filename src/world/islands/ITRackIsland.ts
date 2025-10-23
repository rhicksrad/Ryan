import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Color
} from 'three';
import type { LoadedAssets, ProfileContent } from '../../types';
import { Hotspot } from '../Hotspot';

const tempMatrix = new Matrix4();
const tempObject = new Object3D();

export function create(parent: Group, content: ProfileContent, _assets: LoadedAssets) {
  const group = new Group();
  group.name = 'IT Rack Island';

  const rackMaterial = new MeshStandardMaterial({ color: '#2b2f38', metalness: 0.3, roughness: 0.6 });
  const rack = new Mesh(new BoxGeometry(1.6, 3.2, 1.2), rackMaterial);
  rack.position.y = 1.6;
  rack.castShadow = true;
  rack.receiveShadow = true;
  group.add(rack);

  const top = new Mesh(new BoxGeometry(2.4, 0.3, 1.6), rackMaterial);
  top.position.y = 3.2;
  group.add(top);

  const ledMaterial = new MeshStandardMaterial({ color: '#56cfe1', emissive: new Color('#56cfe1'), emissiveIntensity: 2 });
  const ledGeometry = new BoxGeometry(0.2, 0.05, 0.05);
  const ledRows = 6;
  const ledsPerRow = 12;
  const ledMesh = new InstancedMesh(ledGeometry, ledMaterial, ledRows * ledsPerRow);

  const baseColors: Color[] = [];
  let index = 0;
  for (let row = 0; row < ledRows; row++) {
    for (let col = 0; col < ledsPerRow; col++) {
      tempObject.position.set(-0.9 + col * 0.16, 0.8 + row * 0.4, 0.63);
      tempObject.updateMatrix();
      tempMatrix.copy(tempObject.matrix);
      ledMesh.setMatrixAt(index, tempMatrix);
      const base = new Color().setHSL(0.45 + Math.random() * 0.1, 0.9, 0.5);
      ledMesh.setColorAt(index, base);
      baseColors.push(base.clone());
      index++;
    }
  }
  ledMesh.instanceMatrix.needsUpdate = true;
  ledMesh.castShadow = false;
  group.add(ledMesh);

  parent.add(group);

  const hitArea = new Mesh(new BoxGeometry(3, 0.5, 3));
  hitArea.position.y = 0.25;
  hitArea.visible = false;
  group.add(hitArea);

  const hotspot = new Hotspot({
    name: 'IT Rack Island',
    route: '#it',
    ariaLabel: 'Open infrastructure work notes',
    mesh: group,
    hitArea,
    interestKey: 'it',
    summary: content.interests.it.summary
  });

  const speeds = Array.from({ length: ledMesh.count }, () => Math.random() * 2 + 0.5);
  const color = new Color();

  hotspot.setUpdate(({ elapsed, reducedMotion }) => {
    if (reducedMotion) return;
    for (let i = 0; i < ledMesh.count; i++) {
      const intensity = (Math.sin(elapsed * speeds[i] + i * 0.13) + 1) * 0.5;
      color.copy(baseColors[i]).multiplyScalar(0.4 + intensity * 0.6);
      ledMesh.setColorAt(i, color);
    }
    ledMesh.instanceColor!.needsUpdate = true;
  });

  return hotspot;
}
