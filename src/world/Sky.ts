import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  UniformsUtils,
  Vector3
} from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vWorldPosition;
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;

  void main() {
    float h = normalize(vWorldPosition + vec3(0.0, 100.0, 0.0)).y;
    float t = smoothstep(-0.1, 0.8, h);
    vec3 base = mix(bottomColor, topColor, t);
    float sunAmount = max(dot(normalize(vWorldPosition), sunDirection), 0.0);
    vec3 color = base + sunColor * pow(sunAmount, 32.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createSky() {
  const geometry = new SphereGeometry(200, 32, 15);
  const material = new ShaderMaterial({
    side: BackSide,
    vertexShader,
    fragmentShader,
    uniforms: UniformsUtils.clone({
      topColor: { value: new Color('#2c3e70') },
      bottomColor: { value: new Color('#0b0f18') },
      sunDirection: { value: new Vector3(0.2, 0.8, 0.1).normalize() },
      sunColor: { value: new Color('#ffcf82') }
    })
  });
  const mesh = new Mesh(geometry, material);
  return mesh;
}
