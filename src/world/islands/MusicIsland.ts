import {
  BoxGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial
} from 'three';
import { Hotspot } from '../Hotspot';
import type { IslandContext, IslandResult } from './types';

export function createMusicIsland(context: IslandContext): IslandResult {
  const group = new Group();
  const base = new Mesh(new BoxGeometry(4, 0.4, 4), new MeshStandardMaterial({ color: 0x242130 }));
  base.position.y = 0;
  group.add(base);

  const synth = new Mesh(new BoxGeometry(2.6, 0.4, 1.2), new MeshLambertMaterial({ color: 0x3b3d5c }));
  synth.position.set(0, 0.8, 0);
  group.add(synth);

  const keysMaterial = new MeshStandardMaterial({ color: 0xf8f9fa });
  for (let i = -4; i <= 4; i++) {
    const key = new Mesh(new BoxGeometry(0.25, 0.15, 1), keysMaterial);
    key.position.set(i * 0.27, 0.95, 0);
    group.add(key);
  }

  const speaker = new Mesh(new BoxGeometry(1, 1.4, 0.6), new MeshLambertMaterial({ color: 0x141321 }));
  speaker.position.set(1.9, 1, -0.3);
  speaker.onBeforeRender = () => {
    if (context.audio.isMuted() || context.reducedMotion()) return;
    speaker.scale.y = 1 + Math.sin(performance.now() * 0.004) * 0.05;
  };
  group.add(speaker);

  const sign = new Mesh(new BoxGeometry(1.2, 0.4, 0.1), new MeshStandardMaterial({ color: 0x7c6cf4 }));
  sign.position.set(-2.2, 1, 0.4);
  group.add(sign);

  let tone: OscillatorNode | null = null;

  const hotspot = new Hotspot(group, {
    name: 'music',
    label: 'Music',
    annotations: [context.content.interests.music.summary],
    ariaLabel: 'Open music projects',
    onEnter: () => {
      if (context.audio.isMuted()) return;
      if (!tone) {
        tone = context.audio.createOscillator(440);
        tone.type = 'triangle';
        tone.start();
        setTimeout(() => {
          tone?.stop();
          tone?.disconnect();
          tone = null;
        }, 300);
      }
    }
  });

  return { group, hotspot };
}
