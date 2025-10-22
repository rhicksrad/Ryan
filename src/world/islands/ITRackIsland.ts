import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandContext, IslandResult } from './types';

export function createITRackIsland(context: IslandContext): IslandResult {
  const group = new Group();
  const base = new Mesh(new BoxGeometry(5, 0.6, 4), new MeshStandardMaterial({ color: 0x1b1f2a }));
  base.position.y = 0;
  group.add(base);

  const towerMaterial = new MeshStandardMaterial({ color: 0x111620 });
  const ledMaterial = new MeshStandardMaterial({ color: 0x061822, emissive: new Color(0x00ffcc), emissiveIntensity: 0.2 });

  for (let i = -1; i <= 1; i += 2) {
    const tower = new Mesh(new BoxGeometry(1.2, 3.2, 1.2), towerMaterial);
    tower.position.set(i * 1.2, 1.7, 0);
    group.add(tower);

    const led = new Mesh(new BoxGeometry(1, 0.1, 1), ledMaterial.clone());
    led.position.set(i * 1.2, 3, 0);
    led.onBeforeRender = () => {
      const material = led.material as MeshStandardMaterial;
      material.emissiveIntensity = 0.15 + 0.15 * Math.sin(performance.now() * 0.003 + i);
    };
    group.add(led);
  }

  const sign = new Mesh(new BoxGeometry(1.4, 0.4, 0.1), new MeshStandardMaterial({ color: 0x455d7a }));
  sign.position.set(2.6, 1.2, 0);
  group.add(sign);

  let fanOscillator: OscillatorNode | null = null;

  const hotspot = new Hotspot(group, {
    name: 'it',
    label: 'IT',
    annotations: [context.content.interests.it.summary],
    ariaLabel: 'Open infrastructure content',
    onEnter: () => {
      if (context.reducedMotion()) return;
      if (context.audio.isMuted()) return;
      if (!fanOscillator) {
        fanOscillator = context.audio.createOscillator(110);
        fanOscillator.type = 'sawtooth';
        fanOscillator.start();
      }
    }
  });

  const stopFan = () => {
    if (fanOscillator) {
      fanOscillator.stop();
      fanOscillator.disconnect();
      fanOscillator = null;
    }
  };

  hotspot.on('leave', stopFan);
  hotspot.on('click', stopFan);

  return { group, hotspot };
}
