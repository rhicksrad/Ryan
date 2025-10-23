import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Texture
} from 'three';
import { Hotspot } from '../Hotspot';
import { AssetLoader } from '../../utils/AssetLoader';
import { AudioController } from '../../utils/Audio';

interface GrillOptions {
  assetLoader: AssetLoader;
  audio: AudioController;
  reducedMotion: boolean;
}

export function createGrillIsland(options: GrillOptions): Hotspot {
  const { assetLoader, audio, reducedMotion } = options;
  const group = new Group();

  const bodyMaterial = new MeshStandardMaterial({ color: 0x2f3640, metalness: 0.5, roughness: 0.4 });
  const lidMaterial = new MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.2, roughness: 0.5 });

  const base = new Mesh(new CylinderGeometry(2.4, 2.7, 0.8, 16), new MeshStandardMaterial({ color: 0x3f3f46 }));
  base.position.y = 0.4;
  group.add(base);

  const body = new Mesh(new CylinderGeometry(1.4, 1.5, 1.2, 16), bodyMaterial);
  body.position.y = 1.5;
  group.add(body);

  const lid = new Mesh(new CylinderGeometry(1.45, 1.55, 0.9, 16, 1, true), lidMaterial);
  lid.position.y = 2.1;
  lid.rotation.x = Math.PI / 2;
  group.add(lid);

  const chimney = new Mesh(new CylinderGeometry(0.2, 0.2, 1.1, 8), bodyMaterial);
  chimney.position.set(0.9, 2.8, 0);
  group.add(chimney);

  const handle = new Mesh(new CylinderGeometry(0.05, 0.05, 1.0, 8), new MeshStandardMaterial({ color: 0xfacc15 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 2.3, 1);
  group.add(handle);

  const legMaterial = new MeshStandardMaterial({ color: 0x18181b });
  for (const offset of [-0.9, 0.9]) {
    const leg = new Mesh(new CylinderGeometry(0.12, 0.12, 1.2, 8), legMaterial);
    leg.position.set(offset, 0.6, offset > 0 ? 0.6 : -0.6);
    group.add(leg);
  }

  const sign = new Mesh(new CylinderGeometry(0.6, 0.6, 0.1, 8), new MeshStandardMaterial({ color: 0x1f2937 }));
  sign.position.set(-2.6, 1.2, -0.5);
  group.add(sign);

  const signFace = new Mesh(
    new CylinderGeometry(0.5, 0.5, 0.05, 8),
    new MeshStandardMaterial({ color: 0xf97316, side: DoubleSide })
  );
  signFace.position.copy(sign.position);
  signFace.position.y += 0.4;
  group.add(signFace);

  const smokeGeometry = new BufferGeometry();
  const smokeCount = 16;
  const positions = new Float32Array(smokeCount * 3);
  const speeds = new Float32Array(smokeCount);
  const offsets = new Float32Array(smokeCount);
  for (let i = 0; i < smokeCount; i += 1) {
    const x = (Math.random() - 0.5) * 0.6;
    const y = Math.random() * 0.2;
    const z = (Math.random() - 0.5) * 0.6;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    speeds[i] = 0.4 + Math.random() * 0.3;
    offsets[i] = Math.random();
  }
  smokeGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  smokeGeometry.setAttribute('speed', new BufferAttribute(speeds, 1));
  smokeGeometry.setAttribute('offset', new BufferAttribute(offsets, 1));

  const smokeMaterial = new PointsMaterial({
    size: 0.8,
    transparent: true,
    map: assetLoader.getSmokeTexture() as Texture,
    depthWrite: false,
    opacity: 0.65
  });

  const smoke = new Points(smokeGeometry, smokeMaterial);
  smoke.position.set(0.9, 3.2, 0);
  group.add(smoke);

  const state = { time: 0 };

  return new Hotspot({
    name: 'Grill Mastery',
    ariaLabel: 'Explore Ryan\'s cooking experiments',
    mesh: group,
    hitArea: body,
    route: '#cooking',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      const positionsAttr = smokeGeometry.getAttribute('position') as BufferAttribute;
      const speedsAttr = smokeGeometry.getAttribute('speed') as BufferAttribute;
      const offsetsAttr = smokeGeometry.getAttribute('offset') as BufferAttribute;
      for (let i = 0; i < smokeCount; i += 1) {
        const offset = offsetsAttr.getX(i);
        const baseY = ((state.time + offset) * speedsAttr.getX(i)) % 2.4;
        positionsAttr.setY(i, baseY);
        positionsAttr.setX(i, Math.sin(state.time + offset + i) * 0.3);
        positionsAttr.setZ(i, Math.cos(state.time + offset + i) * 0.3);
      }
      positionsAttr.needsUpdate = true;
    }
  });
}
