import { BoxGeometry, Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { Hotspot } from '../Hotspot';
import { AudioController } from '../../utils/Audio';

interface ITRackOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createITRackIsland(options: ITRackOptions): Hotspot {
  const { audio, reducedMotion } = options;
  const group = new Group();

  const base = new Mesh(new BoxGeometry(4, 0.6, 3), new MeshStandardMaterial({ color: 0x111827 }));
  base.position.y = 0.3;
  group.add(base);

  const rackGeometry = new BoxGeometry(0.8, 3, 0.8);
  const rackMaterial = new MeshStandardMaterial({ color: 0x1f2937, metalness: 0.3, roughness: 0.5 });
  const rackPositions = [
    [-1, 1.8, -0.9],
    [0, 1.8, 0],
    [1, 1.8, 0.9]
  ];
  for (const [x, y, z] of rackPositions) {
    const rack = new Mesh(rackGeometry, rackMaterial);
    rack.position.set(x, y, z);
    group.add(rack);
  }

  const ledGeometry = new BoxGeometry(0.08, 0.08, 0.02);
  const ledMaterial = new MeshStandardMaterial({ color: 0xffffff, emissive: 0x22d3ee, emissiveIntensity: 0.7 });
  ledMaterial.vertexColors = true;
  const ledCount = 120;
  const leds = new InstancedMesh(ledGeometry, ledMaterial, ledCount);
  const dummy = new Object3D();
  const color = new Color();
  for (let i = 0; i < ledCount; i += 1) {
    const rackIndex = i % rackPositions.length;
    const [baseX, baseY, baseZ] = rackPositions[rackIndex];
    const row = Math.floor(i / rackPositions.length) % 10;
    const column = Math.floor(i / (rackPositions.length * 10));
    dummy.position.set(baseX + (Math.random() - 0.5) * 0.1, baseY + 1.2 - row * 0.2, baseZ + column * 0.25 - 0.3);
    dummy.updateMatrix();
    leds.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.54 + rackIndex * 0.08, 0.8, 0.6);
    leds.setColorAt(i, color);
  }
  leds.instanceMatrix.needsUpdate = true;
  group.add(leds);

  const state = { time: 0 };

  return new Hotspot({
    name: 'IT Lab',
    ariaLabel: 'Visit Ryan\'s infrastructure rack builds',
    mesh: group,
    hitArea: base,
    route: '#it',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      state.time += delta;
      const blink = (index: number) => 0.4 + 0.6 * Math.abs(Math.sin(state.time * 2 + index));
      for (let i = 0; i < ledCount; i += 1) {
        const intensity = blink(i * 0.3);
        color.setHSL(0.54, 0.8, intensity * 0.5 + 0.2);
        leds.setColorAt(i, color);
      }
      leds.instanceColor!.needsUpdate = true;
    }
  });
}
