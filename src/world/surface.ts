import * as THREE from 'three';
import { mulberry32 } from './rng';

/**
 * Surface character without texture budgets. Nothing in a real town is one
 * flat color: walls weather in broad patches, concrete has grain, a facade is
 * darker where it meets the pavement, a pitched roof shows its courses. This
 * patches a standard material so its base color is modulated in world space by
 * one small shared noise tile. One extra texture read per pixel, no new draw
 * calls, no per-building textures, and no visible repeat because the pattern is
 * laid out in world coordinates rather than per mesh.
 */

let noise: THREE.DataTexture | null = null;

/** Tileable two-channel noise built from whole-period cosines: broad in red, fine in green. */
export function noiseTexture(): THREE.DataTexture {
  if (noise) return noise;
  const size = 128;
  const rand = mulberry32(777);
  const waves = [7, 28].map((spread) =>
    Array.from({ length: 16 }, () => ({
      fx: Math.round((rand() - 0.5) * 2 * spread),
      fy: Math.round((rand() - 0.5) * 2 * spread),
      phase: rand() * Math.PI * 2,
      amp: 0.4 + rand() * 0.6
    }))
  );
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      waves.forEach((set, channel) => {
        let v = 0;
        let total = 0;
        for (const w of set) {
          v += Math.cos(((x * w.fx + y * w.fy) / size) * Math.PI * 2 + w.phase) * w.amp;
          total += w.amp;
        }
        data[i + channel] = Math.max(0, Math.min(255, Math.round((v / total) * 127 * 2.4 + 128)));
      });
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  noise = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.magFilter = THREE.LinearFilter;
  noise.minFilter = THREE.LinearMipmapLinearFilter;
  noise.generateMipmaps = true;
  noise.needsUpdate = true;
  return noise;
}

export interface Weathering {
  /** Broad patches, as a fraction of brightness (0.15 = plus or minus 7.5%). */
  blotch?: number;
  /** World units per broad noise tile. */
  blotchSize?: number;
  /** Fine grain, as a fraction of brightness. */
  grain?: number;
  /** World units per fine noise tile. */
  grainSize?: number;
  /** How much darker a wall is where it meets the ground. */
  ground?: number;
  /** Shingle courses on pitched faces and gravel on flat roofs. */
  roofs?: boolean;
}

const f = (n: number) => n.toFixed(4);

/** Patch `material` in place. `extra` lets a caller add its own shader edits alongside. */
export function weather<T extends THREE.MeshStandardMaterial>(
  material: T,
  opts: Weathering,
  extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
  extraKey = ''
): T {
  const { blotch = 0.14, blotchSize = 30, grain = 0.08, grainSize = 2.2, ground = 0, roofs = false } = opts;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfNoise = { value: noiseTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vec4 surfWorld = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           surfWorld = instanceMatrix * surfWorld;
         #endif
         surfWorld = modelMatrix * surfWorld;
         vSurfPos = surfWorld.xyz;
         vSurfNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;\nuniform sampler2D uSurfNoise;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           vec3 sn = abs(normalize(vSurfNormal));
           vec2 sq = sn.y > 0.6 ? vSurfPos.xz : (sn.x > sn.z ? vSurfPos.zy : vSurfPos.xy);
           float sBroad = texture2D(uSurfNoise, sq / ${f(blotchSize)}).r;
           float sFine = texture2D(uSurfNoise, sq / ${f(grainSize)}).g;
           float sShade = 1.0 + (sBroad - 0.5) * ${f(blotch)} + (sFine - 0.5) * ${f(grain)};
           ${
             ground > 0
               ? `sShade *= mix(${f(1 - ground)}, 1.0, clamp(smoothstep(0.1, 2.8, vSurfPos.y) + step(0.6, sn.y), 0.0, 1.0));`
               : ''
           }
           ${
             roofs
               ? `float sPitch = step(0.22, sn.y) * step(sn.y, 0.93);
                  float sCourse = vSurfPos.y * 4.5;
                  float sFade = 1.0 - smoothstep(0.25, 0.7, fwidth(sCourse));
                  sShade *= 1.0 - sPitch * sFade * 0.2 * smoothstep(0.55, 0.7, fract(sCourse));
                  sShade *= 1.0 + step(0.93, sn.y) * step(1.5, vSurfPos.y) * (sFine - 0.5) * 0.3;`
               : ''
           }
           diffuseColor.rgb *= sShade;
         }`
      );
    extra?.(shader);
  };
  material.customProgramCacheKey = () => `weather|${blotch}|${blotchSize}|${grain}|${grainSize}|${ground}|${roofs}|${extraKey}`;
  material.needsUpdate = true;
  return material;
}
