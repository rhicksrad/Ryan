import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandContext, IslandResult } from './types';

export function createAIHubIsland(context: IslandContext): IslandResult {
  const group = new Group();
  const base = new Mesh(new TorusGeometry(3.2, 0.3, 8, 32), new MeshStandardMaterial({ color: 0x282a36 }));
  base.rotation.x = Math.PI / 2;
  group.add(base);

  const nodeMaterial = new MeshStandardMaterial({ color: 0x5c63ff, emissive: 0x222244, emissiveIntensity: 0.4 });
  const ring = new Mesh(new TorusGeometry(1.6, 0.2, 12, 48), nodeMaterial);
  ring.position.y = 1.2;
  group.add(ring);

  const points = new Float32Array([
    -1.4, 0.6, 0,
    0, 1.8, 1.2,
    1.4, 0.6, 0,
    0, 1.8, -1.2,
    -1.4, 0.6, 0
  ]);
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  const lineMaterial = new LineBasicMaterial({ color: new Color(0x7bd88f) });
  const line = new Line(lineGeometry, lineMaterial);
  line.onBeforeRender = () => {
    if (context.reducedMotion()) return;
    const pulse = 0.6 + Math.sin(performance.now() * 0.002) * 0.4;
    lineMaterial.color.setScalar(pulse);
  };
  group.add(line);

  const sign = new Mesh(new TorusGeometry(0.8, 0.08, 8, 16), new MeshStandardMaterial({ color: 0x7bd88f }));
  sign.rotation.x = Math.PI / 2;
  sign.position.set(2.6, 0.8, 0);
  group.add(sign);

  const hotspot = new Hotspot(group, {
    name: 'ai',
    label: 'AI',
    annotations: [context.content.interests.ai.summary],
    ariaLabel: 'Open AI work'
  });

  return { group, hotspot };
}
