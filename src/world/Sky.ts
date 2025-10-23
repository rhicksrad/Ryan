import {
  AdditiveBlending,
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry
} from 'three';

export class Sky {
  public readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor() {
    const geometry = new SphereGeometry(120, 32, 32);
    this.material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        topColor: { value: new Color(0x87ceeb) },
        bottomColor: { value: new Color(0xf1f5f9) },
        sunDirection: { value: [0.1, 0.9, 0.3] }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        uniform float time;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;

        void main() {
          vec3 direction = normalize(vWorldPosition);
          float gradient = max(direction.y * 0.5 + 0.5, 0.0);
          vec3 base = mix(bottomColor, topColor, pow(gradient, 1.5));
          float sun = pow(max(dot(normalize(direction), normalize(sunDirection)), 0.0), 64.0);
          vec3 color = base + vec3(1.0, 0.8, 0.5) * sun;
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    this.mesh = new Mesh(geometry, this.material);
  }

  update(delta: number): void {
    this.material.uniforms.time.value += delta;
  }
}
