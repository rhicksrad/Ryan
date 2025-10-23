import { Color, Group, Mesh, ShaderMaterial, TorusKnotGeometry } from 'three';
import { Hotspot } from '../Hotspot';
import { AudioController } from '../../utils/Audio';

interface AIHubOptions {
  audio: AudioController;
  reducedMotion: boolean;
}

export function createAIHubIsland(options: AIHubOptions): Hotspot {
  const { audio, reducedMotion } = options;
  const group = new Group();

  const geometry = new TorusKnotGeometry(1.2, 0.28, 128, 16);
  const material = new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      colorA: { value: new Color(0x38bdf8) },
      colorB: { value: new Color(0xa855f7) }
    },
    transparent: true,
    fragmentShader: `
      uniform float time;
      uniform vec3 colorA;
      uniform vec3 colorB;
      varying vec2 vUv;
      void main() {
        float pulse = 0.5 + 0.5 * sin(time * 2.0 + vUv.x * 6.28);
        vec3 color = mix(colorA, colorB, pulse);
        gl_FragColor = vec4(color, 0.85);
      }
    `,
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position + normal * sin(time + position.y * 3.0) * 0.08;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `
  });

  const mesh = new Mesh(geometry, material);
  group.add(mesh);

  return new Hotspot({
    name: 'AI Hub',
    ariaLabel: 'See Ryan\'s AI explorations',
    mesh: group,
    hitArea: mesh,
    route: '#ai',
    onEnter: () => {
      audio.playHoverBleep().catch(() => undefined);
    },
    onUpdate: (delta) => {
      if (reducedMotion) {
        return;
      }
      material.uniforms.time.value += delta;
      mesh.rotation.y += delta * 0.5;
    }
  });
}
