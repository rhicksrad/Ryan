import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Vector3
} from 'three';
import type { LoadedAssets, ProfileContent } from '../../types';
import { Hotspot } from '../Hotspot';

export function create(parent: Group, content: ProfileContent, assets: LoadedAssets) {
  const group = new Group();
  group.name = 'Grill Island';

  const bodyMaterial = new MeshStandardMaterial({ color: '#363c46', metalness: 0.5, roughness: 0.4 });
  const accentMaterial = new MeshStandardMaterial({ color: '#f25f4c', metalness: 0.2, roughness: 0.6 });

  const body = new Mesh(new CylinderGeometry(1.4, 1.5, 1.2, 24), bodyMaterial);
  body.position.y = 1.2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const lid = new Mesh(new CylinderGeometry(1.45, 1.45, 0.6, 24), bodyMaterial);
  lid.position.set(0, 1.9, 0);
  group.add(lid);

  const chimney = new Mesh(new CylinderGeometry(0.2, 0.2, 0.7, 16), accentMaterial);
  chimney.position.set(0.6, 2.4, 0.1);
  group.add(chimney);

  const legsGeometry = new BoxGeometry(0.2, 1.2, 0.2);
  const legPositions = [
    new Vector3(0.8, 0.6, 0.8),
    new Vector3(-0.8, 0.6, 0.8),
    new Vector3(0.8, 0.6, -0.8),
    new Vector3(-0.8, 0.6, -0.8)
  ];
  for (const pos of legPositions) {
    const leg = new Mesh(legsGeometry, bodyMaterial);
    leg.position.copy(pos);
    leg.castShadow = true;
    group.add(leg);
  }

  const handle = new Mesh(new BoxGeometry(0.5, 0.1, 0.1), accentMaterial);
  handle.position.set(0, 2.2, 1.2);
  group.add(handle);

  const signPost = new Mesh(new BoxGeometry(0.1, 1.4, 0.1), bodyMaterial);
  signPost.position.set(-1.8, 1.2, 0);
  group.add(signPost);
  const sign = new Mesh(new BoxGeometry(1.4, 0.6, 0.1), accentMaterial);
  sign.position.set(-1.8, 1.9, 0);
  group.add(sign);

  const smokeCount = 40;
  const smokeGeometry = new BufferGeometry();
  const positions = new Float32Array(smokeCount * 3);
  const sizes = new Float32Array(smokeCount);
  for (let i = 0; i < smokeCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 0.4;
    positions[i * 3 + 1] = Math.random() * 0.6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    sizes[i] = Math.random() * 0.4 + 0.2;
  }
  smokeGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  smokeGeometry.setAttribute('size', new BufferAttribute(sizes, 1));

  const smokeMaterial = new PointsMaterial({
    size: 0.8,
    color: '#d7dbde',
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    map: assets.smokeTexture
  });
  const smoke = new Points(smokeGeometry, smokeMaterial);
  smoke.position.set(0.6, 2.6, 0.1);
  group.add(smoke);

  parent.add(group);

  const hitArea = new Mesh(new CylinderGeometry(2.4, 2.4, 0.4, 12));
  hitArea.position.y = 0.2;
  hitArea.visible = false;
  group.add(hitArea);

  const hotspot = new Hotspot({
    name: 'Grill Island',
    route: '#cooking',
    ariaLabel: 'Open cooking and grilling notes',
    mesh: group,
    hitArea,
    interestKey: 'cooking',
    summary: content.interests.cooking.summary
  });

  const offsets = new Array(smokeCount).fill(0).map(() => Math.random());

  hotspot.setUpdate(({ delta, elapsed, reducedMotion }) => {
    if (reducedMotion) return;
    const arr = smokeGeometry.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < smokeCount; i++) {
      const baseY = offsets[i];
      const y = ((elapsed * 0.2 + baseY) % 1) * 1.5;
      arr.setY(i, y);
      arr.setX(i, Math.sin(elapsed * 0.5 + baseY * Math.PI * 2) * 0.2);
      arr.setZ(i, Math.cos(elapsed * 0.5 + baseY * Math.PI) * 0.2);
    }
    arr.needsUpdate = true;
  });

  return hotspot;
}
