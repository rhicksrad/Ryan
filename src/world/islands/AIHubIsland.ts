import {
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  TorusGeometry,
  UniformsUtils
} from 'three';
import type { LoadedAssets, ProfileContent } from '../../types';
import { Hotspot } from '../Hotspot';

const vertexShader = /* glsl */ `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vPosition;
  uniform float time;
  uniform vec3 colorA;
  uniform vec3 colorB;
  void main() {
    float pulse = sin(time + length(vPosition)) * 0.5 + 0.5;
    vec3 color = mix(colorA, colorB, pulse);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function create(parent: Group, content: ProfileContent, _assets: LoadedAssets) {
  const group = new Group();
  group.name = 'AI Hub Island';

  const geometry = new TorusGeometry(1.6, 0.3, 24, 64);
  const uniforms = UniformsUtils.merge([
    {
      time: { value: 0 },
      colorA: { value: new Color('#5d5fef') },
      colorB: { value: new Color('#9c6ff4') }
    }
  ]);
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: false
  });

  const torus = new Mesh(geometry, material);
  torus.rotation.x = Math.PI / 4;
  torus.rotation.z = Math.PI / 6;
  torus.castShadow = true;
  group.add(torus);

  const inner = new Mesh(new TorusGeometry(1, 0.18, 24, 64), material);
  inner.rotation.x = -Math.PI / 5;
  inner.rotation.y = Math.PI / 3;
  group.add(inner);

  parent.add(group);

  const hitArea = new Mesh(new TorusGeometry(2.2, 0.4, 12, 32));
  hitArea.visible = false;
  group.add(hitArea);

  const hotspot = new Hotspot({
    name: 'AI Hub Island',
    route: '#ai',
    ariaLabel: 'Open AI research notes',
    mesh: group,
    hitArea,
    interestKey: 'ai',
    summary: content.interests.ai.summary
  });

  hotspot.setUpdate(({ elapsed, reducedMotion }) => {
    if (!reducedMotion) {
      uniforms.time.value = elapsed;
      torus.rotation.y = elapsed * 0.3;
      inner.rotation.y = -elapsed * 0.4;
    }
  });

  return hotspot;
}
