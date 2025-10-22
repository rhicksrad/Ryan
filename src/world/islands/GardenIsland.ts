import {
  BoxGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandContext, IslandResult } from './types';

export function createGardenIsland(context: IslandContext): IslandResult {
  const group = new Group();
  const base = new Mesh(new BoxGeometry(4.6, 0.4, 4.6), new MeshStandardMaterial({ color: 0x3a5f2b }));
  base.position.y = 0;
  group.add(base);

  const bedGeometry = new BoxGeometry(1.6, 0.6, 0.9);
  const bedMaterial = new MeshStandardMaterial({ color: 0x6b4f2d });
  const plantMaterial = new MeshLambertMaterial({ color: 0x8bdc65 });
  [-1.2, 0, 1.2].forEach((x, index) => {
    const bed = new Mesh(bedGeometry, bedMaterial);
    bed.position.set(x, 0.7, index % 2 === 0 ? -0.8 : 0.8);
    group.add(bed);
    for (let i = 0; i < 4; i++) {
      const plant = new Mesh(new BoxGeometry(0.2, 0.8, 0.2), plantMaterial);
      const offset = i;
      plant.position.set(x + (offset - 1.5) * 0.3, 1.2 + Math.random() * 0.2, bed.position.z + (Math.random() - 0.5) * 0.4);
      plant.onBeforeRender = () => {
        if (context.reducedMotion()) return;
        plant.rotation.y = Math.sin(performance.now() * 0.001 + offset) * 0.1;
      };
      group.add(plant);
    }
  });

  const can = new Mesh(new BoxGeometry(0.6, 0.4, 0.3), new MeshStandardMaterial({ color: 0xa4b0be }));
  can.position.set(1.8, 1.1, -1);
  can.onBeforeRender = () => {
    if (context.reducedMotion()) return;
    can.rotation.z = Math.sin(performance.now() * 0.0012) * 0.2;
  };
  group.add(can);

  const sign = new Mesh(new BoxGeometry(1.4, 0.4, 0.1), new MeshStandardMaterial({ color: 0x8f9c6c }));
  sign.position.set(-2.3, 1, 0);
  group.add(sign);

  const hotspot = new Hotspot(group, {
    name: 'gardening',
    label: 'Gardening',
    annotations: [context.content.interests.gardening.summary],
    ariaLabel: 'Open gardening notes'
  });

  return { group, hotspot };
}
