import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry
} from 'three';

const vertex = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  varying vec3 vWorldPosition;
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  void main() {
    float h = normalize(vWorldPosition + offset).y;
    float mixValue = max(pow(max(h, 0.0), exponent), 0.0);
    gl_FragColor = vec4(mix(bottomColor, topColor, mixValue), 1.0);
  }
`;

export function createSky(): Mesh {
  const geometry = new SphereGeometry(120, 32, 15);
  const material = new ShaderMaterial({
    uniforms: {
      topColor: { value: new Color(0x7bd88f) },
      bottomColor: { value: new Color(0x0c1821) },
      offset: { value: 33 },
      exponent: { value: 0.6 }
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: BackSide,
    depthWrite: false
  });
  return new Mesh(geometry, material);
}
