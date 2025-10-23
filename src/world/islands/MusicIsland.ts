import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { Hotspot } from '../Hotspot';
import { AudioController } from '../../utils/Audio';

interface MusicOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createMusicIsland(options: MusicOptions): Hotspot {
  const { audio, reducedMotion } = options;
  const group = new Group();

  const platform = new Mesh(new CylinderGeometry(2.6, 2.9, 0.7, 24), new MeshStandardMaterial({ color: 0x1f2937 }));
  platform.position.y = 0.35;
  group.add(platform);

  const keyboardBase = new Mesh(new BoxGeometry(2.6, 0.3, 1.2), new MeshStandardMaterial({ color: 0x0f172a }));
  keyboardBase.position.set(0, 1.1, 0);
  group.add(keyboardBase);

  const keyMaterial = new MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
  for (let i = 0; i < 12; i += 1) {
    const key = new Mesh(new BoxGeometry(0.18, 0.12, 1.1), keyMaterial);
    key.position.set(i * 0.2 - 1.1, 1.25, 0);
    group.add(key);
  }

  const speakerMaterial = new MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.4 });
  const speaker = new Mesh(new CylinderGeometry(0.6, 0.7, 1.6, 16), speakerMaterial);
  speaker.position.set(-1.8, 1.4, -0.6);
  speaker.rotation.z = Math.PI / 2;
  group.add(speaker);

  const state = { time: 0 };

  return new Hotspot({
    name: 'Music Studio',
    ariaLabel: 'Listen to Ryan\'s synth experiments',
    mesh: group,
    hitArea: platform,
    route: '#music',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      const wobble = audio.isMuted() ? 1 : 1 + Math.sin(state.time * 4) * 0.05;
      speaker.scale.set(wobble, 1, wobble);
    }
  });
}
