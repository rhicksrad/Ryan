import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Texture
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandContext, IslandResult } from './types';

export function createGrillIsland(context: IslandContext): IslandResult {
  const group = new Group();
  const island = new Mesh(
    new CylinderGeometry(3.2, 3.6, 0.8, 8),
    new MeshStandardMaterial({ color: 0x2a4230 })
  );
  island.position.y = 0;
  group.add(island);

  const body = new Mesh(new CylinderGeometry(1.4, 1.4, 1.2, 16), new MeshLambertMaterial({ color: 0x444444 }));
  body.position.y = 0.9;
  group.add(body);

  const lid = new Mesh(new SphereGeometry(1.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new MeshLambertMaterial({ color: 0x2f2f2f }));
  lid.position.y = 1.5;
  group.add(lid);

  const chimney = new Mesh(new CylinderGeometry(0.2, 0.2, 0.9, 8), new MeshLambertMaterial({ color: 0x1d1d1d }));
  chimney.position.set(0.6, 2, 0);
  group.add(chimney);

  const legMaterial = new MeshStandardMaterial({ color: 0x202020 });
  const legGeo = new BoxGeometry(0.2, 1.2, 0.2);
  [-0.6, 0.6].forEach((x) => {
    const leg = new Mesh(legGeo, legMaterial);
    leg.position.set(x, 0.2, 0.6);
    group.add(leg);
    const legBack = new Mesh(legGeo, legMaterial);
    legBack.position.set(x, 0.2, -0.6);
    group.add(legBack);
  });

  const smokeTexture: Texture = context.assets.getSmokeTexture();
  const smokeMaterial = new PointsMaterial({
    size: 0.8,
    map: smokeTexture,
    transparent: true,
    depthWrite: false,
    opacity: context.reducedMotion() ? 0.2 : 0.5
  });
  const smokeGeometry = new SphereGeometry(0.1, 6, 6);
  const smoke = new Points(smokeGeometry, smokeMaterial);
  smoke.position.set(0.6, 2.5, 0);
  group.add(smoke);

  const sign = new Mesh(new BoxGeometry(1.2, 0.4, 0.1), new MeshStandardMaterial({ color: 0xdeb887 }));
  sign.position.set(-2.5, 0.7, 0);
  group.add(sign);

  const hotspot = new Hotspot(group, {
    name: 'cooking',
    label: 'Cooking',
    annotations: [context.content.interests.cooking.summary],
    ariaLabel: 'Open cooking projects'
  });

  return { group, hotspot };
}
