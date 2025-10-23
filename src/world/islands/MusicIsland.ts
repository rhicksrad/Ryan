import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial
} from 'three';
import type { LoadedAssets, ProfileContent } from '../../types';
import { Hotspot } from '../Hotspot';

export function create(parent: Group, content: ProfileContent, _assets: LoadedAssets) {
  const group = new Group();
  group.name = 'Music Island';

  const baseMaterial = new MeshStandardMaterial({ color: '#1f2230', roughness: 0.5 });
  const accentMaterial = new MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.8 });
  const speakerMaterial = new MeshStandardMaterial({ color: '#e94f64', roughness: 0.4, metalness: 0.2 });

  const synth = new Mesh(new BoxGeometry(3.6, 0.6, 1.6), baseMaterial);
  synth.position.y = 0.8;
  synth.castShadow = true;
  group.add(synth);

  const keys = new Group();
  const keyGeometry = new BoxGeometry(0.2, 0.1, 1.5);
  for (let i = 0; i < 18; i++) {
    const key = new Mesh(keyGeometry, accentMaterial);
    key.position.set(-1.6 + i * 0.2, 1.1, 0);
    key.castShadow = true;
    keys.add(key);
  }
  group.add(keys);

  const speaker = new Mesh(new BoxGeometry(1, 1.6, 1), speakerMaterial);
  speaker.position.set(2.4, 1.2, 0);
  speaker.castShadow = true;
  group.add(speaker);

  parent.add(group);

  const hitArea = new Mesh(new BoxGeometry(5, 0.4, 3));
  hitArea.position.y = 0.2;
  hitArea.visible = false;
  group.add(hitArea);

  const hotspot = new Hotspot({
    name: 'Music Island',
    route: '#music',
    ariaLabel: 'Open music notes',
    mesh: group,
    hitArea,
    interestKey: 'music',
    summary: content.interests.music.summary
  });

  hotspot.setUpdate(({ elapsed, audioActive, reducedMotion }) => {
    if (!reducedMotion) {
      keys.rotation.y = Math.sin(elapsed * 0.5) * 0.1;
    }
    if (audioActive) {
      const scale = 1 + Math.sin(elapsed * 4) * 0.1;
      speaker.scale.set(scale, 1 + Math.sin(elapsed * 4 + 0.5) * 0.1, scale);
    } else {
      speaker.scale.setScalar(1);
    }
  });

  return hotspot;
}
