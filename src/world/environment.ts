import * as THREE from 'three';
import { mulberry32 } from './rng';
import { signTexture, vacancyTexture } from './textures';
import { emblemUrl } from '../art';
import skyDayUrl from '../assets/sky/sky-day.webp?url';
import skyNightUrl from '../assets/sky/sky-night.webp?url';
import { BLOCK, ROAD, RIVER_WIDTH, type CityPlan } from './cityplan';

const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

/**
 * Surfaces whose base color shifts between night and day (ground, pavement,
 * asphalt…). Register once; `applyTints(dayMix)` lerps them all.
 */
const tints: { color: THREE.Color; night: THREE.Color; day: THREE.Color }[] = [];

function tint<T extends THREE.MeshStandardMaterial>(material: T, night: number, day: number): T {
  tints.push({ color: material.color, night: new THREE.Color(night), day: new THREE.Color(day) });
  material.color.setHex(night);
  material.userData.tinted = true; // keeps its own material through the static bake
  return material;
}

export function applyTints(dayMix: number): void {
  for (const t of tints) t.color.lerpColors(t.night, t.day, dayMix);
}

// Shared wind clock; trees read it in their vertex shaders. Updated each frame.
const windUniform = { value: 0 };

/** Set the global wind time (drives tree sway). */
export function setWindTime(t: number): void {
  windUniform.value = t;
}

/** Inject a gentle height-weighted sway into a canopy material. */
function applyWind(material: THREE.MeshStandardMaterial, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.uniforms.uWindStrength = { value: strength };
    shader.vertexShader =
      'uniform float uWindTime;\nuniform float uWindStrength;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         float wPhase = instanceMatrix[3][0] * 0.12 + instanceMatrix[3][2] * 0.12;
       #else
         float wPhase = (modelMatrix[3][0] + modelMatrix[3][2]) * 0.12;
       #endif
       float wH = max(transformed.y + 0.5, 0.0);
       transformed.x += sin(uWindTime * 1.3 + wPhase) * uWindStrength * wH;
       transformed.z += cos(uWindTime * 1.0 + wPhase * 1.3) * uWindStrength * 0.7 * wH;`
    );
  };
  material.customProgramCacheKey = () => `wind${strength}`;
  material.needsUpdate = true;
}

/** Unit vector toward the sun (and, at night, the moon). Low in the west-southwest for long shadows. */
export const SUN_DIR = new THREE.Vector3(-0.74, 0.46, 0.38).normalize();

const SKY_VERTEX = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The painted sky. Two panoramas from Ryan's own game PERSIAN STRIKE (the Gulf
 * afternoon cumulus and the Caspian night clearing) wrap the dome: azimuth across, elevation
 * +90 degrees at the top row down to -10 at the bottom, turned so the painted
 * glow sits under the real sun. As in the games, the painting never lights
 * the scene; it meets the terrain through a band of haze in the fog color,
 * and the stars and moon are drawn crisp on top rather than painted in.
 */
export function createSkyDome(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const loader = new THREE.TextureLoader();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      dayMap: { value: null as THREE.Texture | null },
      nightMap: { value: null as THREE.Texture | null },
      loaded: { value: 0 },
      day: { value: 0 },
      topColor: { value: new THREE.Color(0x05070f) },
      bottomColor: { value: new THREE.Color(0x10162c) },
      sunColor: { value: new THREE.Color(0xfff0d0) },
      sunDir: { value: SUN_DIR.clone() },
      sunAzimuth: { value: Math.atan2(SUN_DIR.x, SUN_DIR.z) },
      dayEnergy: { value: 1.25 },
      nightEnergy: { value: 2.4 }
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform float loaded;
      uniform float day;
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      uniform float sunAzimuth;
      uniform float dayEnergy;
      uniform float nightEnergy;
      varying vec3 vDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // Stars on a grid of directions: each cell holds at most one, cool or warm.
      vec3 stars(vec3 d) {
        vec2 grid = vec2(atan(d.x, d.z) / 6.2831853 + 0.5, d.y * 0.5 + 0.5) * vec2(700.0, 230.0);
        vec2 cell = floor(grid);
        vec2 offset = (vec2(hash(cell + vec2(17.3, 41.9)), hash(cell + vec2(73.1, 11.7))) - 0.5) * 0.4;
        vec2 point = (fract(grid) - 0.5 - offset) * vec2(1.0, 3.0 * max(sqrt(1.0 - d.y * d.y), 0.05));
        float seed = hash(cell + vec2(5.2, 93.7));
        float variant = hash(cell + vec2(53.8, 29.4));
        float radius = mix(0.09, 0.2, variant);
        float core = 1.0 - smoothstep(radius * 0.25, radius, length(point));
        vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.88, 0.7), hash(cell + vec2(19.6, 67.2)) * 0.42);
        return tint * step(0.985, seed) * core * mix(0.6, 1.6, variant);
      }

      void main() {
        vec3 dir = normalize(vDir);
        float azimuth = atan(dir.x, dir.z);
        float elev = degrees(asin(clamp(dir.y, -1.0, 1.0)));
        // A backdrop painter's cheat: the low sky is stretched so the cloud
        // banks stand just above the hills, where this camera actually looks.
        float painted = elev > 0.0 ? elev * (2.3 - 1.3 * smoothstep(0.0, 60.0, elev)) : elev;
        // Turned a fifth of a circle off the sun so the tall cumulus stands behind the skyline.
        vec2 uv = vec2(fract((sunAzimuth - azimuth) / 6.2831853 + 0.72), 1.0 - clamp((90.0 - painted) / 100.0, 0.002, 0.998));
        // The night painting is turned so its last glow on the horizon sits
        // behind the skyline, like the town's own light on the clouds.
        float paintedNightElev = elev > 0.0 ? elev * (2.3 - 1.3 * smoothstep(0.0, 60.0, elev)) : elev;
        vec2 uvNight = vec2(fract((sunAzimuth - azimuth) / 6.2831853 + 0.083), 1.0 - clamp((90.0 - paintedNightElev) / 100.0, 0.002, 0.998));

        vec3 gradient = mix(bottomColor, topColor, pow(max(dir.y, 0.0), 0.55));
        vec3 paintedDay = texture2D(dayMap, uv).rgb * dayEnergy;
        vec3 paintedNight = texture2D(nightMap, uvNight).rgb * nightEnergy;
        vec3 col = mix(gradient, mix(paintedNight, paintedDay, day), loaded);

        float night = 1.0 - day;
        float above = smoothstep(0.0, 0.07, dir.y);
        col += stars(dir) * night * above * 2.0 * (1.0 - smoothstep(0.25, 0.6, dot(paintedNight, vec3(0.333))));

        // The moon rides where the sun does by day: one light, one set of shadows.
        float toMoon = dot(dir, sunDir);
        float disc = smoothstep(0.99962, 0.99974, toMoon);
        vec2 face = (dir.xy - sunDir.xy) * 60.0;
        float maria = 0.82 + 0.18 * hash(floor(face * 3.0));
        col += vec3(0.86, 0.9, 1.0) * disc * maria * 2.6 * night;
        col += sunColor * (pow(max(toMoon, 0.0), 500.0) * 0.5 + pow(max(toMoon, 0.0), 30.0) * 0.1) * night;
        // By day the painted glow is the sun; a little bloom keeps it warm at any exposure.
        col += sunColor * pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0), 10.0)
          * (1.0 - smoothstep(0.0, 0.3, dir.y)) * 0.1 * day;

        // The horizon band dissolves into the haze; below it the sky is haze.
        float band = mix(0.05, 0.085, day);
        float fog = 0.9 * (1.0 - smoothstep(0.0, band, dir.y)) + 0.1 * (1.0 - smoothstep(-0.05, 0.0, dir.y));
        gl_FragColor = vec4(mix(col, bottomColor, fog), 1.0);
      }
    `
  });
  const finish = (name: 'dayMap' | 'nightMap') => (texture: THREE.Texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter; // no mips: the wrap seam would show as a line
    texture.generateMipmaps = false;
    material.uniforms[name].value = texture;
    if (material.uniforms.dayMap.value && material.uniforms.nightMap.value) material.uniforms.loaded.value = 1;
  };
  loader.load(skyDayUrl, finish('dayMap'));
  loader.load(skyNightUrl, finish('nightMap'));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), material);
  mesh.renderOrder = -1;
  return { mesh, material };
}

/**
 * A tiny sky-only scene for image-based lighting, so glass and water reflect
 * the same sky the visitor sees instead of a photo studio.
 */
export function createSkyEnvScene(
  top: THREE.ColorRepresentation,
  bottom: THREE.ColorRepresentation,
  ground: THREE.ColorRepresentation,
  sun: THREE.ColorRepresentation
): THREE.Scene {
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
      groundColor: { value: new THREE.Color(ground) },
      sunColor: { value: new THREE.Color(sun) },
      sunDir: { value: SUN_DIR.clone() }
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 groundColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        vec3 col = mix(bottomColor, topColor, pow(max(dir.y, 0.0), 0.55));
        col = mix(col, groundColor, smoothstep(0.02, -0.25, dir.y));
        col += sunColor * pow(max(dot(dir, sunDir), 0.0), 24.0) * 1.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), material));
  return scene;
}

/** Sizes shared by the terrain painting and the countryside built on top of it. */
export function countryMetrics(plan: CityPlan): { ring: number; reach: number; halfX: number; halfZ: number } {
  const halfX = (plan.bounds.maxX - plan.bounds.minX) / 2;
  const halfZ = (plan.bounds.maxZ - plan.bounds.minZ) / 2;
  const ring = Math.max(200, Math.hypot(halfX, halfZ) + 55);
  return { ring, reach: ring + 140, halfX, halfZ };
}

const HW_WIDTH = 11;
const TERRAIN_SPAN = 1700;

/**
 * The countryside as one painted sheet: mottled meadow and a patchwork of farm
 * fields with hedgerows and furrows. One texture and one draw call instead of
 * an empty green disc.
 */
function terrainTexture(plan: CityPlan): THREE.CanvasTexture {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(60606);
  const { ring, reach, halfX, halfZ } = countryMetrics(plan);
  const k = size / TERRAIN_SPAN;
  // Plan-centered world coordinates to pixels.
  const px = (v: number) => (v + TERRAIN_SPAN / 2) * k;

  ctx.fillStyle = '#75974f';
  ctx.fillRect(0, 0, size, size);

  // Meadow mottling: big soft blotches in neighbouring greens.
  const meadow: [number, number, number, number][] = [
    [88, 132, 62, 0.5],
    [128, 160, 84, 0.45],
    [74, 118, 60, 0.5],
    [150, 164, 92, 0.35]
  ];
  for (let i = 0; i < 700; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 30 + rand() * 110;
    const [cr, cg, cb, ca] = meadow[Math.floor(rand() * meadow.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${ca})`);
    g.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Farm fields on a slightly skewed grid, from the edge of town out to the forest.
  const fieldInks = ['#c6b36a', '#93b45c', '#58893f', '#8f7150', '#b8a660', '#74a85c', '#a9bd6e', '#7d8f48', '#d2c483'];
  const skew = 0.21;
  const cos = Math.cos(skew);
  const sin = Math.sin(skew);
  const cellW = 52;
  const cellD = 38;
  const span = reach + 60;
  const riverX = plan.riverX - plan.center.x;
  const streetZ = plan.mainStreetZ - plan.center.z;
  const avenueX = plan.mainAvenueX - plan.center.x;
  for (let gx = -span; gx < span; gx += cellW) {
    for (let gz = -span; gz < span; gz += cellD) {
      if (rand() < 0.3) continue;
      const cx = (gx + cellW / 2) * cos - (gz + cellD / 2) * sin;
      const cz = (gx + cellW / 2) * sin + (gz + cellD / 2) * cos;
      const radius = Math.hypot(cx, cz);
      const inTown = Math.abs(cx) < halfX + 28 && Math.abs(cz) < halfZ + 22;
      const onRing = Math.abs(radius - ring) < HW_WIDTH / 2 + 24;
      const onRiver = Math.abs(cx - riverX) < RIVER_WIDTH / 2 + 24;
      const onHighway = (Math.abs(cz - streetZ) < 22 || Math.abs(cx - avenueX) < 26) && radius < ring + 20;
      if (inTown || onRing || onRiver || onHighway || radius > span) continue;
      const w = cellW - 3 - rand() * 4;
      const d = cellD - 3 - rand() * 4;
      ctx.save();
      ctx.translate(px(cx), px(cz));
      ctx.rotate(skew);
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = fieldInks[Math.floor(rand() * fieldInks.length)];
      ctx.fillRect((-w / 2) * k, (-d / 2) * k, w * k, d * k);
      // Furrows or mowing stripes.
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = rand() < 0.5 ? '#2c3a1c' : '#f4ecc0';
      const step = (2.2 + rand() * 2.4) * k;
      if (rand() < 0.6) {
        for (let y = (-d / 2) * k; y < (d / 2) * k; y += step) ctx.fillRect((-w / 2) * k, y, w * k, step * 0.45);
      } else {
        for (let x = (-w / 2) * k; x < (w / 2) * k; x += step) ctx.fillRect(x, (-d / 2) * k, step * 0.45, d * k);
      }
      // Hedgerow.
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#3d6634';
      ctx.lineWidth = 1.5 * k;
      ctx.strokeRect((-w / 2) * k, (-d / 2) * k, w * k, d * k);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;

  // Finer grain over everything so nothing reads as a flat fill.
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(40, 70, 30, 0.10)' : 'rgba(210, 220, 150, 0.08)';
    const r = 1 + rand() * 5;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** The land beneath and beyond the city. */
export function createTerrain(plan: CityPlan): THREE.Mesh {
  const material = tint(
    new THREE.MeshStandardMaterial({ map: terrainTexture(plan), roughness: 1, metalness: 0 }),
    0x3a4a78,
    0xffffff
  );
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TERRAIN_SPAN, TERRAIN_SPAN), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.12;
  return mesh;
}

/** A square canvas texture that tiles, painted by `paint`. */
function tileTexture(size: number, paint: (ctx: CanvasRenderingContext2D, rand: () => number) => void, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d')!, mulberry32(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, rand: () => number, size: number, count: number, inks: string[], max = 3): void {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = inks[Math.floor(rand() * inks.length)];
    const r = 1 + rand() * max;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
}

/** Concrete flags with dark joints: sidewalks and downtown lots. */
function pavingTexture(base: string, joint: string, seed: number): THREE.CanvasTexture {
  return tileTexture(
    128,
    (ctx, rand) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          ctx.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'}, ${rand() * 0.06})`;
          ctx.fillRect(x * 32, y * 32, 32, 32);
        }
      }
      speckle(ctx, rand, 128, 500, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)']);
      ctx.fillStyle = joint;
      for (let i = 0; i < 4; i += 1) {
        ctx.fillRect(i * 32, 0, 1.5, 128);
        ctx.fillRect(0, i * 32, 128, 1.5);
      }
    },
    seed
  );
}

/** Mown grass: soft mottling, no visible repeat at block size. */
function grassTexture(): THREE.CanvasTexture {
  return tileTexture(
    128,
    (ctx, rand) => {
      ctx.fillStyle = '#6a9a4c';
      ctx.fillRect(0, 0, 128, 128);
      speckle(ctx, rand, 128, 1400, ['rgba(60,110,50,0.25)', 'rgba(130,170,80,0.22)', 'rgba(90,140,60,0.25)'], 5);
      speckle(ctx, rand, 128, 500, ['rgba(40,80,36,0.22)', 'rgba(170,190,100,0.16)'], 2);
    },
    11
  );
}

/** The plaza: warm stone setts with a darker inlaid border, drawn once across the whole square. */
function plazaTexture(): THREE.CanvasTexture {
  const texture = tileTexture(
    512,
    (ctx, rand) => {
      ctx.fillStyle = '#cfc4ad';
      ctx.fillRect(0, 0, 512, 512);
      const inks = ['#d6cbb4', '#c6baa2', '#cdbfa4', '#d9d0bd'];
      const s = 16;
      for (let y = 0; y < 512; y += s) {
        for (let x = (y / s) % 2 ? -s / 2 : 0; x < 512; x += s) {
          ctx.fillStyle = inks[Math.floor(rand() * inks.length)];
          ctx.fillRect(x + 0.7, y + 0.7, s - 1.4, s - 1.4);
        }
      }
      // Inlaid rings around the monument and a banded border.
      ctx.strokeStyle = '#8f7d68';
      for (const [r, w] of [[70, 7], [128, 4], [186, 7]] as const) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(256, 256, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 12;
      ctx.strokeRect(20, 20, 472, 472);
      ctx.strokeStyle = '#a89780';
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(256 + Math.cos(a) * 74, 256 + Math.sin(a) * 74);
        ctx.lineTo(256 + Math.cos(a) * 184, 256 + Math.sin(a) * 184);
        ctx.stroke();
      }
    },
    23
  );
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Tile a box's top face `n` times; side faces follow along. */
function tiledBox(w: number, h: number, d: number, n: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * n, uv.getY(i) * n);
  return geo;
}

/** Pavement, lawns, and park greens for every block. */
export function createBlocks(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const sidewalkMat = tint(
    new THREE.MeshStandardMaterial({ map: pavingTexture('#c9c5ba', 'rgba(70,66,60,0.55)', 3), roughness: 0.92 }),
    0x59648f,
    0xffffff
  );
  const lotMat = tint(
    new THREE.MeshStandardMaterial({ map: pavingTexture('#a9a6a0', 'rgba(60,58,56,0.4)', 5), roughness: 0.95 }),
    0x4a5580,
    0xffffff
  );
  const plazaMat = tint(new THREE.MeshStandardMaterial({ map: plazaTexture(), roughness: 0.85 }), 0x5b6694, 0xffffff);
  const grassMat = tint(new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }), 0x3a5878, 0xffffff);
  const pathMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.95 }), 0x5a5f7c, 0xd9cdb0);
  const fountainMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.6 }), 0x5a648c, 0xe4e0d6);

  const walkGeo = tiledBox(BLOCK, 0.16, BLOCK, 9);
  const innerSize = BLOCK - 3;
  const innerGeo = tiledBox(innerSize, 0.1, innerSize, 5);
  const plazaGeo = new THREE.BoxGeometry(BLOCK - 1.2, 0.1, BLOCK - 1.2);
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.userData.noCast = true;
    group.add(mesh);
    return mesh;
  };
  const slab = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = place(BOX_GEO, mat, x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  };

  for (const block of plan.blocks) {
    place(walkGeo, sidewalkMat, block.x, 0.08, block.z);
    if (block.kind === 'plaza') place(plazaGeo, plazaMat, block.x, 0.14, block.z);
    else place(innerGeo, block.kind === 'park' || !block.paved ? grassMat : lotMat, block.x, 0.14, block.z);
  }

  // Lawns under houses that share a paved block with something bigger.
  const lawnGeo = tiledBox(1, 0.06, 1, 2);
  for (const lawn of plan.lawns) {
    const mesh = place(lawnGeo, grassMat, lawn.x, 0.2, lawn.z);
    mesh.scale.set(lawn.size - 0.6, 1, lawn.size - 0.6);
  }

  // Parks: crossing footpaths; the riverside park gets a fountain.
  const water = waterMaterial();
  for (const park of plan.parkBlocks) {
    slab(pathMat, innerSize, 0.04, 1.5, park.x, 0.2, park.z);
    slab(pathMat, 1.5, 0.04, innerSize, park.x, 0.2, park.z);
    const basinR = park.main ? 3.2 : 2.2;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(basinR, basinR, 0.5, 24), fountainMat);
    basin.position.set(park.x, 0.4, park.z);
    group.add(basin);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(basinR - 0.35, 24), water);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(park.x, 0.66, park.z);
    pool.userData.skipShadow = true;
    group.add(pool);
    if (park.main) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.6, 10), fountainMat);
      column.position.set(park.x, 1.3, park.z);
      group.add(column);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.3, 0.3, 14), fountainMat);
      bowl.position.set(park.x, 2.2, park.z);
      group.add(bowl);
    }
  }
  return group;
}

const ASPHALT = '#33353b';

/** Asphalt with tyre wear, a dashed center line, and faint edge lines; one tile per road width. */
function asphaltTexture(lines: boolean): THREE.CanvasTexture {
  return tileTexture(
    128,
    (ctx, rand) => {
      ctx.fillStyle = ASPHALT;
      ctx.fillRect(0, 0, 128, 128);
      speckle(ctx, rand, 128, 900, ['rgba(255,255,255,0.035)', 'rgba(0,0,0,0.08)'], 2);
      if (!lines) return;
      // Darker wheel tracks in each lane.
      for (const x of [22, 46, 82, 106]) {
        const g = ctx.createLinearGradient(x - 7, 0, x + 7, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, 'rgba(0,0,0,0.13)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 7, 0, 14, 128);
      }
      ctx.fillStyle = 'rgba(226, 222, 204, 0.5)';
      ctx.fillRect(5, 0, 2, 128);
      ctx.fillRect(121, 0, 2, 128);
      ctx.fillStyle = '#e3c558';
      ctx.fillRect(62.5, 10, 3, 52);
    },
    lines ? 41 : 43
  );
}

/** Zebra crossings on all four sides of a plain asphalt square. */
function intersectionTexture(): THREE.CanvasTexture {
  const size = 128;
  const texture = tileTexture(
    size,
    (ctx, rand) => {
      ctx.fillStyle = ASPHALT;
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, rand, size, 900, ['rgba(255,255,255,0.035)', 'rgba(0,0,0,0.08)'], 2);
      ctx.fillStyle = 'rgba(232, 230, 220, 0.82)';
      const band = 13; // crossing depth
      for (let i = 0; i < 7; i += 1) {
        const p = 24 + i * 12.5;
        ctx.fillRect(p, 4, 6, band);
        ctx.fillRect(p, size - band - 4, 6, band);
        ctx.fillRect(4, p, band, 6);
        ctx.fillRect(size - band - 4, p, band, 6);
      }
    },
    47
  );
  return texture;
}

// Asphalt keeps its charcoal by day and goes to deep blue-grey at night.
const ASPHALT_NIGHT = 0x7f8ab8;
const ASPHALT_DAY = 0xffffff;

/** A flat road strip whose texture repeats once per road width. */
function roadStrip(width: number, length: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, length);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) uv.setY(i, uv.getY(i) * (length / width));
  return geo;
}

let sharedRoadMat: THREE.MeshStandardMaterial | null = null;
function roadMaterial(): THREE.MeshStandardMaterial {
  sharedRoadMat ??= tint(
    new THREE.MeshStandardMaterial({ map: asphaltTexture(true), roughness: 0.93 }),
    ASPHALT_NIGHT,
    ASPHALT_DAY
  );
  return sharedRoadMat;
}

/** Roads with lane markings, plus crosswalk squares where they meet. */
export function createRoads(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  for (const road of plan.roads) {
    const mesh = new THREE.Mesh(roadStrip(ROAD, road.length), roadMaterial());
    mesh.rotation.x = -Math.PI / 2;
    if (road.horizontal) mesh.rotation.z = Math.PI / 2;
    // Streets sit a hair above avenues so the two never z-fight where they cross.
    mesh.position.set(road.x, road.horizontal ? 0.03 : 0.02, road.z);
    mesh.userData.noCast = true;
    group.add(mesh);
  }

  const crossMat = tint(
    new THREE.MeshStandardMaterial({ map: intersectionTexture(), roughness: 0.93 }),
    ASPHALT_NIGHT,
    ASPHALT_DAY
  );
  const crossGeo = new THREE.PlaneGeometry(ROAD, ROAD);
  crossGeo.rotateX(-Math.PI / 2);
  const crossings = new THREE.InstancedMesh(crossGeo, crossMat, plan.intersections.length);
  const dummy = new THREE.Object3D();
  plan.intersections.forEach((spot, i) => {
    dummy.position.set(spot.x, 0.04, spot.z);
    dummy.updateMatrix();
    crossings.setMatrixAt(i, dummy.matrix);
  });
  crossings.userData.noCast = true;
  group.add(crossings);
  return group;
}

// ---------------------------------------------------------------------------
// Water: one shader shared by the river, ponds, and fountains. It mirrors the
// sky by view angle, ripples with scrolling noise, and catches the sun.
// ---------------------------------------------------------------------------

const waterUniforms = {
  uNoise: { value: null as THREE.Texture | null },
  uTime: { value: 0 },
  uDeep: { value: new THREE.Color(0x1d4f6e) },
  uZenith: { value: new THREE.Color(0x2f6fc0) },
  uHorizon: { value: new THREE.Color(0xe9dcc4) },
  uSunColor: { value: new THREE.Color(0xfff0d0) },
  uSunDir: { value: SUN_DIR.clone() },
  uGlint: { value: 1.6 }
};

/** Tileable two-channel noise built from whole-period cosines. */
function noiseTexture(): THREE.DataTexture {
  const size = 128;
  const rand = mulberry32(777);
  const waves = Array.from({ length: 2 }, () =>
    Array.from({ length: 14 }, () => ({
      fx: Math.round((rand() - 0.5) * 14),
      fy: Math.round((rand() - 0.5) * 14),
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
        data[i + channel] = Math.round((v / total) * 127 * 2.2 + 128);
      });
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

let sharedWater: THREE.ShaderMaterial | null = null;
function waterMaterial(): THREE.ShaderMaterial {
  if (sharedWater) return sharedWater;
  waterUniforms.uNoise.value = noiseTexture();
  sharedWater = new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...THREE.UniformsLib.fog, ...waterUniforms },
    vertexShader: `
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        #ifdef USE_INSTANCING
          world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #endif
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform sampler2D uNoise;
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uGlint;
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz;
        vec2 a = texture2D(uNoise, p * 0.045 + vec2(0.006, 0.019) * uTime).rg - 0.5;
        vec2 b = texture2D(uNoise, p * 0.13 + vec2(-0.017, 0.031) * uTime).gr - 0.5;
        vec2 c = texture2D(uNoise, p * 0.37 + vec2(0.04, 0.06) * uTime).rg - 0.5;
        vec2 slope = (a * 0.5 + b * 0.35 + c * 0.3) * 0.22;
        vec3 n = normalize(vec3(slope.x, 1.0, slope.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.45));
        vec3 col = mix(uDeep, sky, clamp(0.05 + 0.5 * fres, 0.0, 1.0));
        // Ripple crests catch a little more sky than the troughs.
        col += sky * max(slope.x + slope.y, 0.0) * 0.9;
        col *= 1.0 + (a.x + b.y) * 0.22;
        col += uSunColor * pow(max(dot(r, uSunDir), 0.0), 220.0) * uGlint;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `
  });
  return sharedWater;
}

/** Match the water to the sky it reflects. */
export function setWaterLook(deep: THREE.Color, zenith: THREE.Color, horizon: THREE.Color, sun: THREE.Color, glint: number): void {
  waterUniforms.uDeep.value.copy(deep);
  waterUniforms.uZenith.value.copy(zenith);
  waterUniforms.uHorizon.value.copy(horizon);
  waterUniforms.uSunColor.value.copy(sun);
  waterUniforms.uGlint.value = glint;
}

/** The river: rippling water, stone quays through town, reedy banks beyond, and bridges where roads cross. */
export function createRiver(plan: CityPlan): {
  group: THREE.Group;
  update: (t: number) => void;
} {
  const group = new THREE.Group();
  // Runs the full width of the world so it flows off past the forest into the haze.
  const length = TERRAIN_SPAN;
  const centerZ = plan.center.z;
  const riverX = plan.riverX;
  const { minZ, maxZ } = plan.bounds;

  const surface = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_WIDTH + 3, length), waterMaterial());
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(riverX, -0.04, centerZ);
  surface.userData.skipShadow = true;
  group.add(surface);

  // Stone quays through town; a sandy, reedy shore out in the country.
  const quayMat = tint(
    new THREE.MeshStandardMaterial({ map: pavingTexture('#bdb8ab', 'rgba(70,66,60,0.5)', 9), roughness: 0.9 }),
    0x59648f,
    0xffffff
  );
  const shoreMat = tint(new THREE.MeshStandardMaterial({ roughness: 1 }), 0x3c4a66, 0xb9ad84);
  const townLength = maxZ - minZ + 24;
  for (const side of [-1, 1]) {
    const quay = new THREE.Mesh(tiledBox(2.6, 0.62, townLength, 1), quayMat);
    const uv = quay.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) uv.setY(i, uv.getY(i) * (townLength / 2.6));
    quay.position.set(riverX + side * (RIVER_WIDTH / 2 + 1.1), 0.12, (minZ + maxZ) / 2);
    group.add(quay);
    for (const end of [-1, 1]) {
      const run = (length - townLength) / 2;
      const shore = new THREE.Mesh(new THREE.PlaneGeometry(3.4, run), shoreMat);
      shore.rotation.x = -Math.PI / 2;
      shore.position.set(riverX + side * (RIVER_WIDTH / 2 + 1.2), -0.02, (minZ + maxZ) / 2 + end * (townLength / 2 + run / 2));
      shore.userData.noCast = true;
      group.add(shore);
    }
  }

  // Bridges: a concrete deck on two piers, parapets with a warm light strip under the cap.
  const deckMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.85 }), 0x4c5680, 0xa9a69e);
  const capMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.8 }), 0x5b6694, 0xd0ccc0);
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x6a5a40, emissive: 0xffc070, emissiveIntensity: 1.6, roughness: 0.6 });
  const span = RIVER_WIDTH + 7;
  for (const bridge of plan.bridges) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 0.5, ROAD + 1.8), deckMat);
    deck.position.set(riverX, 0.28, bridge.z);
    group.add(deck);
    // The road carries on across the deck.
    const lane = new THREE.Mesh(roadStrip(ROAD, span), roadMaterial());
    lane.rotation.x = -Math.PI / 2;
    lane.rotation.z = Math.PI / 2;
    lane.position.set(riverX, 0.535, bridge.z);
    lane.userData.noCast = true;
    group.add(lane);
    for (const px of [-RIVER_WIDTH / 4.4, RIVER_WIDTH / 4.4]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, ROAD + 2.6), deckMat);
      pier.position.set(riverX + px, -0.05, bridge.z);
      group.add(pier);
    }
    for (const side of [-1, 1]) {
      const z = bridge.z + side * (ROAD / 2 + 0.7);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(span, 0.62, 0.28), deckMat);
      wall.position.set(riverX, 0.84, z);
      group.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(span + 0.3, 0.1, 0.44), capMat);
      cap.position.set(riverX, 1.2, z);
      group.add(cap);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(span - 1, 0.05, 0.05), stripMat);
      strip.position.set(riverX, 1.1, z - side * 0.17);
      strip.userData.noCast = true;
      group.add(strip);
    }
  }

  return {
    group,
    update: (t: number) => {
      waterUniforms.uTime.value = t;
    }
  };
}

/** Street, yard, and park trees, instanced. */
export function createTrees(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(4242);
  buildForest(
    group,
    plan.trees.map((tree) => ({
      x: tree.x,
      z: tree.z,
      s: (tree.street ? 0.5 : 0.6) + rand() * 0.35,
      pine: tree.kind === 'pine',
      autumn: rand() < 0.07
    })),
    true
  );
  return group;
}

/**
 * The countryside around the city: a ring road (beltway) circling town that the
 * four main highways connect to, so no road dead-ends, plus roadside tree rows,
 * woods, farmsteads, hills on the horizon, ponds, and lamps out along the roads.
 * Placed in plan coordinates and added to the city group.
 */
export function createOutskirts(plan: CityPlan): {
  group: THREE.Group;
  lamps: LampSpec[];
  update: (t: number) => void;
} {
  const group = new THREE.Group();
  const lamps: LampSpec[] = [];
  const rand = mulberry32(9091);

  const centerX = plan.center.x;
  const centerZ = plan.center.z;
  const { minX, maxX, minZ, maxZ } = plan.bounds;
  const { ring: R_RING, reach: REACH, halfX, halfZ } = countryMetrics(plan);

  const HW_Z = plan.mainStreetZ; // east/west highway follows a city cross-street
  const HW_X = plan.mainAvenueX; // north/south highway follows a city avenue
  const shoulderMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.95 }), 0x3c4460, 0x8d8a80);
  const asphaltMat = tint(new THREE.MeshStandardMaterial({ roughness: 0.95 }), 0x262b40, 0x33353b);

  // Where each highway meets the ring (circle centered on the city).
  const ewCross = Math.sqrt(R_RING * R_RING - (HW_Z - centerZ) ** 2);
  const nsCross = Math.sqrt(R_RING * R_RING - (HW_X - centerX) ** 2);
  const eastX = centerX + ewCross;
  const westX = centerX - ewCross;
  const southZ = centerZ + nsCross;
  const northZ = centerZ - nsCross;

  interface HighwayDef { cx: number; cz: number; length: number; horizontal: boolean; from: number; to: number }
  const highways: HighwayDef[] = [
    { horizontal: true, cz: HW_Z, cx: (maxX + eastX) / 2, length: eastX - maxX, from: maxX, to: eastX },
    { horizontal: true, cz: HW_Z, cx: (minX + westX) / 2, length: minX - westX, from: westX, to: minX },
    { horizontal: false, cx: HW_X, cz: (maxZ + southZ) / 2, length: southZ - maxZ, from: maxZ, to: southZ },
    { horizontal: false, cx: HW_X, cz: (minZ + northZ) / 2, length: northZ - minZ, from: northZ, to: minZ }
  ];

  for (const hw of highways) {
    const asphalt = new THREE.Mesh(roadStrip(HW_WIDTH, hw.length), roadMaterial());
    asphalt.rotation.x = -Math.PI / 2;
    if (hw.horizontal) asphalt.rotation.z = Math.PI / 2;
    asphalt.position.set(hw.cx, 0.0, hw.cz);
    asphalt.userData.noCast = true;
    group.add(asphalt);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(1.6, hw.length), shoulderMat);
      shoulder.rotation.x = -Math.PI / 2;
      if (hw.horizontal) shoulder.rotation.z = Math.PI / 2;
      if (hw.horizontal) shoulder.position.set(hw.cx, -0.01, hw.cz + side * (HW_WIDTH / 2 + 0.8));
      else shoulder.position.set(hw.cx + side * (HW_WIDTH / 2 + 0.8), -0.01, hw.cz);
      shoulder.userData.noCast = true;
      group.add(shoulder);
    }
  }

  // --- Ring road: a flat asphalt annulus with a painted centerline. ---
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(R_RING - HW_WIDTH / 2, R_RING + HW_WIDTH / 2, 160),
    asphaltMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(centerX, 0.0, centerZ);
  ring.userData.noCast = true;
  group.add(ring);
  const ringLine = new THREE.Mesh(
    new THREE.RingGeometry(R_RING - 0.16, R_RING + 0.16, 160),
    tint(new THREE.MeshStandardMaterial({ roughness: 0.7 }), 0x8a84a0, 0xd9bc58)
  );
  ringLine.rotation.x = -Math.PI / 2;
  ringLine.position.set(centerX, 0.02, centerZ);
  ringLine.userData.noCast = true;
  group.add(ringLine);

  // --- Rejection tests so nothing lands on a road, ring, or the river. ---
  const inCity = (x: number, z: number, pad: number) =>
    x > minX - pad && x < maxX + pad && z > minZ - pad && z < maxZ + pad;
  const onHighway = (x: number, z: number) => {
    const rad = Math.hypot(x - centerX, z - centerZ);
    if (rad > R_RING + HW_WIDTH) return false; // highways only run city -> ring
    return (
      (Math.abs(z - HW_Z) < HW_WIDTH / 2 + 5 && (x < minX || x > maxX)) ||
      (Math.abs(x - HW_X) < HW_WIDTH / 2 + 5 && (z < minZ || z > maxZ))
    );
  };
  const onRing = (x: number, z: number) => {
    const rad = Math.hypot(x - centerX, z - centerZ);
    return Math.abs(rad - R_RING) < HW_WIDTH / 2 + 4;
  };
  const onRiver = (x: number, z: number) => Math.abs(x - plan.riverX) < RIVER_WIDTH / 2 + 5 && (z < minZ || z > maxZ);
  const blocked = (x: number, z: number, pad: number) =>
    inCity(x, z, pad) || onHighway(x, z) || onRing(x, z) || onRiver(x, z);

  // --- Woods: most trees gather into a few real forests; the rest are copses between fields. ---
  interface T { x: number; z: number; s: number; pine: boolean; autumn: boolean }
  const trees: T[] = [];
  const belt = 8;
  const inner = Math.max(halfX, halfZ) + belt;
  const woods = Array.from({ length: 11 }, () => {
    const angle = rand() * Math.PI * 2;
    const radius = inner + 30 + rand() * (REACH - inner - 10);
    return { x: centerX + Math.cos(angle) * radius, z: centerZ + Math.sin(angle) * radius, r: 34 + rand() * 46, pine: rand() < 0.5 };
  });
  for (const wood of woods) {
    const count = Math.round(wood.r * wood.r * 0.05);
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * wood.r;
      const x = wood.x + Math.cos(a) * d * 1.3;
      const z = wood.z + Math.sin(a) * d;
      if (blocked(x, z, belt)) continue;
      trees.push({ x, z, s: 1.2 + rand() * 1.5, pine: rand() < (wood.pine ? 0.8 : 0.2), autumn: rand() < 0.08 });
    }
  }
  for (let c = 0; c < 120; c += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = inner + Math.pow(rand(), 0.7) * (REACH - inner);
    const cxp = centerX + Math.cos(angle) * radius;
    const czp = centerZ + Math.sin(angle) * radius * 0.92;
    const clusterSize = 2 + Math.floor(rand() * 6);
    for (let i = 0; i < clusterSize; i += 1) {
      const x = cxp + (rand() - 0.5) * 12;
      const z = czp + (rand() - 0.5) * 12;
      if (blocked(x, z, belt)) continue;
      trees.push({ x, z, s: 1.2 + rand() * 1.4, pine: rand() < 0.4, autumn: rand() < 0.12 });
    }
  }
  // Riverside willows out in the country.
  for (let z = centerZ - REACH; z < centerZ + REACH; z += 7 + rand() * 9) {
    if (z > minZ - 6 && z < maxZ + 6) continue;
    const side = rand() < 0.5 ? -1 : 1;
    trees.push({ x: plan.riverX + side * (RIVER_WIDTH / 2 + 5 + rand() * 5), z, s: 1.1 + rand() * 0.9, pine: false, autumn: false });
  }
  for (const hw of highways) {
    const lo = Math.min(hw.from, hw.to);
    const hi = Math.max(hw.from, hw.to);
    for (let d = lo + 5; d < hi - 5; d += 9) {
      for (const side of [-1, 1]) {
        const offset = side * (HW_WIDTH / 2 + 3.5);
        const x = hw.horizontal ? d + (rand() - 0.5) * 2 : hw.cx + offset;
        const z = hw.horizontal ? hw.cz + offset : d + (rand() - 0.5) * 2;
        if (inCity(x, z, 2) || onRing(x, z)) continue;
        trees.push({ x, z, s: 1.1 + rand() * 0.6, pine: rand() < 0.3, autumn: false });
      }
    }
  }
  buildForest(group, trees, false);

  // --- Farmsteads: a barn, a silo, and a farmhouse where the fields are. ---
  const barnRed = new THREE.MeshStandardMaterial({ color: 0x8f3b2c, roughness: 0.9 });
  const barnRoof = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.8 });
  const farmWhite = new THREE.MeshStandardMaterial({ color: 0xe6e0d0, roughness: 0.9 });
  const siloMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.5, metalness: 0.4 });
  const roofGeo = (w: number, d: number, peak: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, peak);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geo.translate(0, 0, -d / 2);
    return geo;
  };
  const barnRoofGeo = roofGeo(6.6, 9.6, 2.6);
  const houseRoofGeo = roofGeo(5, 5.6, 1.8);
  for (let i = 0; i < 16; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = inner + 26 + rand() * (REACH - inner - 40);
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    if (blocked(x, z, 22)) continue;
    const farm = new THREE.Group();
    farm.position.set(x, 0, z);
    farm.rotation.y = 0.21 + Math.floor(rand() * 4) * (Math.PI / 2);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.scale.set(sx, sy, sz);
      farm.add(mesh);
    };
    add(BOX_GEO, barnRed, 0, 2, 0, 6, 4, 9);
    add(barnRoofGeo, barnRoof, 0, 4, 0);
    add(new THREE.CylinderGeometry(1.5, 1.5, 7, 12), siloMat, 5.2, 3.5, -2.5);
    add(new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), siloMat, 5.2, 7, -2.5);
    add(BOX_GEO, farmWhite, -8, 1.6, 4, 4.4, 3.2, 5);
    add(houseRoofGeo, barnRoof, -8, 3.2, 4);
    group.add(farm);
  }

  // --- Street lamps out along the highways and around the ring. ---
  for (const hw of highways) {
    const lo = Math.min(hw.from, hw.to);
    const hi = Math.max(hw.from, hw.to);
    for (let d = lo + 6; d < hi - 4; d += 26) {
      const x = hw.horizontal ? d : hw.cx + HW_WIDTH / 2 + 1.4;
      const z = hw.horizontal ? hw.cz + HW_WIDTH / 2 + 1.4 : d;
      lamps.push({ x, z, height: 5.5 });
    }
  }
  const ringLamps = 30;
  for (let i = 0; i < ringLamps; i += 1) {
    const a = (i / ringLamps) * Math.PI * 2;
    const r = R_RING + HW_WIDTH / 2 + 1.6;
    lamps.push({ x: centerX + Math.cos(a) * r, z: centerZ + Math.sin(a) * r, height: 5.5 });
  }

  // --- Hills: a near range of green downs and a far, taller range that fades into the haze. ---
  const hillNear = tint(new THREE.MeshStandardMaterial({ roughness: 1 }), 0x2c3a5c, 0x5f8a4c);
  const hillFar = tint(new THREE.MeshStandardMaterial({ roughness: 1 }), 0x28324f, 0x567a70);
  const hillGeo = new THREE.IcosahedronGeometry(1, 2);
  const ranges: [number, number, number, number, THREE.Material][] = [
    [22, REACH + 30, 46, 0.24, hillNear],
    [30, REACH + 260, 120, 0.2, hillFar]
  ];
  for (const [count, at, size, lift, material] of ranges) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.3;
      const radius = at + rand() * 70;
      const r = size * (0.6 + rand() * 0.8);
      const hill = new THREE.Mesh(hillGeo, material);
      hill.scale.set(r * (1.3 + rand() * 1.2), r * (lift + rand() * 0.14), r);
      hill.position.set(centerX + Math.cos(angle) * radius, -3, centerZ + Math.sin(angle) * radius);
      hill.rotation.y = angle + Math.PI / 2 + (rand() - 0.5) * 0.6;
      hill.userData.noCast = true;
      group.add(hill);
    }
  }

  // --- Ponds out among the fields (kept clear of the ring). ---
  for (const [px, pz, r] of [
    [centerX - halfX - 62, centerZ + halfZ * 0.7, 15],
    [centerX + halfX * 0.55, centerZ - halfZ - 44, 17],
    [centerX - halfX * 0.4, centerZ - halfZ - 70, 13]
  ] as const) {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(r, 28), waterMaterial());
    pond.rotation.x = -Math.PI / 2;
    pond.scale.x = 1.3;
    pond.position.set(px, -0.05, pz);
    pond.userData.skipShadow = true;
    group.add(pond);
    const shore = new THREE.Mesh(new THREE.RingGeometry(r * 0.98, r * 1.09, 28), shoulderMat);
    shore.rotation.x = -Math.PI / 2;
    shore.scale.x = 1.3;
    shore.position.set(px, -0.04, pz);
    shore.userData.noCast = true;
    group.add(shore);
  }

  return {
    group,
    lamps,
    update: (t: number) => setWindTime(t)
  };
}

/** Several overlapping spheres as one clumpy crown, shaded darker underneath. */
function crownGeometry(detail: number): THREE.BufferGeometry {
  const lobes: [number, number, number, number][] = detail > 0
    ? [[0, 0, 0, 1], [0.62, -0.18, 0.28, 0.68], [-0.5, -0.12, -0.46, 0.64], [0.05, 0.5, -0.05, 0.6], [-0.3, -0.2, 0.58, 0.55]]
    : [[0, 0, 0, 1], [0.5, 0.1, 0.3, 0.7]];
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  lobes.forEach(([cx, cy, cz, r], index) => {
    const geo = new THREE.IcosahedronGeometry(r, index === 0 ? detail : 0);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      positions.push(x + cx, y * 0.9 + cy, z + cz);
      // Spherical normals blended toward the whole crown, so lobes shade as one soft mass.
      const n = new THREE.Vector3(x / r + cx * 0.6, y / r + cy * 0.6 + 0.25, z / r + cz * 0.6).normalize();
      normals.push(n.x, n.y, n.z);
      const shade = THREE.MathUtils.clamp(0.62 + ((y * 0.9 + cy) / 1) * 0.42, 0.42, 1.08);
      colors.push(shade, shade, shade);
    }
    geo.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

/** Two stacked cones, darker toward the skirt. */
function pineGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  for (const [y0, h, r] of [[-0.5, 0.62, 1], [-0.12, 0.62, 0.72]] as const) {
    const geo = new THREE.ConeGeometry(r, h, 7, 1, true).toNonIndexed();
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i) + h / 2;
      positions.push(pos.getX(i), y + y0, pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      const shade = 0.6 + (y / h) * 0.5;
      colors.push(shade, shade, shade);
    }
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

/** Build a list of trees as three InstancedMeshes (trunks, pine + round canopies). */
function buildForest(
  group: THREE.Group,
  trees: { x: number; z: number; s: number; pine: boolean; autumn: boolean }[],
  close: boolean
): void {
  const rand = mulberry32(555);
  const dummy = new THREE.Object3D();
  const pines = trees.filter((t) => t.pine);
  const rounds = trees.filter((t) => !t.pine);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 5);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  trees.forEach((t, i) => {
    const h = t.s * 1.5;
    dummy.position.set(t.x, h / 2, t.z);
    dummy.scale.set(t.s, h, t.s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  trunks.userData.noCast = !close;
  group.add(trunks);

  const pineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true });
  applyWind(pineMat, 0.03);
  const pineMesh = new THREE.InstancedMesh(pineGeometry(), pineMat, pines.length);
  const pineBase = new THREE.Color(0x2f5d3a);
  pines.forEach((t, i) => {
    const h = t.s * 1.3;
    const coneH = t.s * 4.4;
    const coneR = t.s * 1.15;
    dummy.position.set(t.x, h + coneH / 2 - 0.3, t.z);
    dummy.scale.set(coneR, coneH, coneR);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    pineMesh.setMatrixAt(i, dummy.matrix);
    pineMesh.setColorAt(i, pineBase.clone().multiplyScalar(0.8 + rand() * 0.4));
  });
  pineMesh.instanceMatrix.needsUpdate = true;
  if (pineMesh.instanceColor) pineMesh.instanceColor.needsUpdate = true;
  group.add(pineMesh);

  const roundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true });
  applyWind(roundMat, 0.035);
  const roundMesh = new THREE.InstancedMesh(crownGeometry(close ? 1 : 0), roundMat, rounds.length);
  const greens = [new THREE.Color(0x4f8a3e), new THREE.Color(0x5f9744), new THREE.Color(0x3f7a40), new THREE.Color(0x6c9a3c)];
  const autumn = new THREE.Color(0xc27a34);
  rounds.forEach((t, i) => {
    const h = t.s * 1.5;
    const r = t.s * 1.35;
    dummy.position.set(t.x, h + r * 0.6, t.z);
    dummy.scale.set(r, r * (0.9 + rand() * 0.25), r);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.updateMatrix();
    roundMesh.setMatrixAt(i, dummy.matrix);
    const base = t.autumn ? autumn : greens[Math.floor(rand() * greens.length)];
    roundMesh.setColorAt(i, base.clone().multiplyScalar(0.85 + rand() * 0.3));
  });
  roundMesh.instanceMatrix.needsUpdate = true;
  if (roundMesh.instanceColor) roundMesh.instanceColor.needsUpdate = true;
  group.add(roundMesh);
}

export interface LampSpec {
  x: number;
  z: number;
  height?: number;
}

export interface LampField {
  group: THREE.Group;
  bulbMaterial: THREE.MeshStandardMaterial;
  /** Halo + ground-pool materials; opacity follows the night. */
  glowMaterials: { material: THREE.Material; base: number }[];
}

function radialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Every street lamp in the world as a handful of instanced meshes: poles,
 * heads, bulbs, a tight halo, and a warm pool of light on the pavement.
 */
export function createLampField(specs: LampSpec[]): LampField {
  const group = new THREE.Group();
  const n = specs.length;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: 0.7, metalness: 0.4 });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe1b0,
    emissive: 0xffc472,
    emissiveIntensity: 3.4,
    roughness: 0.3
  });

  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 1, 6), poleMat, n);
  const heads = new THREE.InstancedMesh(BOX_GEO, poleMat, n);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 8), bulbMaterial, n);
  bulbs.userData.noCast = true;

  const poolGeo = new THREE.CircleGeometry(1, 20);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: radialTexture([
      [0, 'rgba(255, 205, 135, 0.55)'],
      [0.45, 'rgba(255, 190, 110, 0.2)'],
      [1, 'rgba(255, 190, 110, 0)']
    ]),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
  pools.userData.skipShadow = true;
  pools.renderOrder = 2;

  const haloPositions = new Float32Array(n * 3);
  const dummy = new THREE.Object3D();
  specs.forEach((spec, i) => {
    const height = spec.height ?? 4.2;
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(spec.x, height / 2, spec.z);
    dummy.scale.set(1, height, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spec.x, height + 0.05, spec.z);
    dummy.scale.set(0.46, 0.14, 0.46);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spec.x, height - 0.1, spec.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    const reach = height * 0.8;
    dummy.position.set(spec.x, 0.24, spec.z);
    dummy.scale.set(reach, 1, reach);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
    haloPositions.set([spec.x, height - 0.1, spec.z], i * 3);
  });
  group.add(poles, heads, bulbs, pools);

  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPositions, 3));
  const haloMat = new THREE.PointsMaterial({
    map: radialTexture([
      [0, 'rgba(255, 214, 150, 0.9)'],
      [0.35, 'rgba(255, 190, 110, 0.28)'],
      [1, 'rgba(255, 190, 110, 0)']
    ]),
    size: 1.9,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  group.add(halos);

  return {
    group,
    bulbMaterial,
    glowMaterials: [
      { material: poolMat, base: 0.6 },
      { material: haloMat, base: 0.85 }
    ]
  };
}

/** District entrance signs. */
export function createSigns(plan: CityPlan): THREE.Group {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x39415e, roughness: 0.6, metalness: 0.3 });
  for (const sign of plan.signs) {
    const post = new THREE.Group();
    post.position.set(sign.x, 0, sign.z);
    post.rotation.y = sign.rotationY;
    group.add(post);
    for (const px of [-2.2, 2.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.2, 6), poleMat);
      pole.position.set(px, 2.1, 0);
      post.add(pole);
    }
    const texture = signTexture(sign.district.name, sign.district.color, emblemUrl(sign.district.id));
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.3),
      new THREE.MeshStandardMaterial({
        map: texture,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0.55,
        roughness: 0.7,
        side: THREE.DoubleSide
      })
    );
    board.position.set(0, 3.6, 0);
    post.add(board);
  }

  // "Lot for sale" boards on unbuilt lots — room for whatever gets built next.
  if (plan.vacancies.length > 0) {
    const texture = vacancyTexture();
    const boardMat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.35,
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    const stakeMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.9 });
    for (const lot of plan.vacancies) {
      const stand = new THREE.Group();
      stand.position.set(lot.x, 0.2, lot.z);
      stand.rotation.y = lot.rotationY;
      for (const px of [-0.7, 0.7]) {
        const stake = new THREE.Mesh(BOX_GEO, stakeMat);
        stake.scale.set(0.1, 1.9, 0.1);
        stake.position.set(px, 0.95, 0);
        stand.add(stake);
      }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.25), boardMat);
      board.position.y = 1.4;
      stand.add(board);
      group.add(stand);
    }
  }
  return group;
}

/** A clock face that tells the visitor's own local time. */
function clockTexture(): { texture: THREE.CanvasTexture; draw: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const now = new Date();
    ctx.fillStyle = '#cfc6b0';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#f6f0dc';
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2c33';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ctx.lineWidth = i % 3 === 0 ? 5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(64 + Math.sin(a) * 44, 64 - Math.cos(a) * 44);
      ctx.lineTo(64 + Math.sin(a) * 51, 64 - Math.cos(a) * 51);
      ctx.stroke();
    }
    const hand = (turn: number, length: number, w: number) => {
      const a = turn * Math.PI * 2;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.sin(a) * length, 64 - Math.cos(a) * length);
      ctx.stroke();
    };
    hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12, 27, 7);
    hand(now.getMinutes() / 60, 42, 4.5);
    texture.needsUpdate = true;
  };
  draw();
  return { texture, draw };
}

/**
 * Town hall on the plaza, standing for the site and for Ryan himself: a
 * limestone clock tower under a copper roof. The clock keeps the visitor's time.
 */
export function createSpire(): {
  group: THREE.Group;
  pickMeshes: THREE.Mesh[];
  /** Redraw the clock hands. */
  tick: () => void;
  faceMaterial: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xd9cfb8, roughness: 0.9 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0xb3a88f, roughness: 0.9 });
  const copper = new THREE.MeshStandardMaterial({ color: 0x5f9a88, roughness: 0.55, metalness: 0.35 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b24a, roughness: 0.35, metalness: 0.8, emissive: 0x6a4a10, emissiveIntensity: 0.5 });
  const slit = new THREE.MeshStandardMaterial({ color: 0x2b3440, emissive: 0xffc97a, emissiveIntensity: 0.9, roughness: 0.4 });
  const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(BOX_GEO, m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // Stepped plinth and a two-storey hall.
  box(stoneDark, 11, 0.4, 11, 0, 0.2, 0);
  box(stoneDark, 9.6, 0.4, 9.6, 0, 0.6, 0);
  box(stone, 8, 4.2, 8, 0, 2.9, 0);
  box(stoneDark, 8.5, 0.4, 8.5, 0, 5.2, 0);
  for (const s of [-1, 1]) {
    for (let i = -2; i <= 2; i += 1) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.6, 10), stone);
      col.position.set(i * 1.5, 2.8, s * 4.35);
      group.add(col);
      const col2 = new THREE.Mesh(col.geometry, stone);
      col2.position.set(s * 4.35, 2.8, i * 1.5);
      group.add(col2);
    }
    box(stone, 8.9, 0.5, 0.9, 0, 4.85, s * 4.35);
    box(stone, 0.9, 0.5, 8.9, s * 4.35, 4.85, 0);
    box(slit, 1.3, 2.3, 0.1, 0, 2.15, s * 4.01);
    box(slit, 0.1, 2.3, 1.3, s * 4.01, 2.15, 0);
  }

  // The tower.
  const shaftH = 15;
  box(stone, 3.2, shaftH, 3.2, 0, 5.4 + shaftH / 2, 0);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      box(slit, 0.5, 1.5, 0.08, 0, 8 + i * 3.1, s * 1.62);
      box(slit, 0.08, 1.5, 0.5, s * 1.62, 8 + i * 3.1, 0);
    }
  }
  const belfryY = 5.4 + shaftH;
  box(stoneDark, 3.9, 0.4, 3.9, 0, belfryY + 0.2, 0);
  box(stone, 3.6, 3.6, 3.6, 0, belfryY + 2.2, 0);
  box(stoneDark, 4.1, 0.4, 4.1, 0, belfryY + 4.2, 0);

  const clock = clockTexture();
  const faceMat = new THREE.MeshStandardMaterial({
    map: clock.texture,
    emissive: 0xffffff,
    emissiveMap: clock.texture,
    emissiveIntensity: 0.55,
    roughness: 0.7
  });
  faceMat.userData.dayDim = 0.9;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), faceMat);
    face.position.set(Math.sin(a) * 1.82, belfryY + 2.2, Math.cos(a) * 1.82);
    face.rotation.y = a;
    face.userData.noCast = true;
    group.add(face);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 5, 4), copper);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = belfryY + 4.4 + 2.5;
  group.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), gold);
  finial.position.y = belfryY + 9.6;
  group.add(finial);
  box(gold, 0.08, 1.6, 0.08, 0, belfryY + 10.4, 0);

  // One invisible hit volume stands in for the whole building.
  const hit = new THREE.Mesh(new THREE.BoxGeometry(9, 30, 9), new THREE.MeshBasicMaterial());
  hit.position.y = 15;
  hit.visible = false;
  hit.userData.keep = true;
  hit.userData.projectId = '__about__';
  group.add(hit);

  return { group, pickMeshes: [hit], tick: clock.draw, faceMaterial: faceMat };
}

/**
 * Life in the sky: a few flocks of birds wheeling overhead. The clouds are in
 * the painted sky; `update(t, dayMix, moving)` only flies the birds.
 */
export function createSky(): {
  group: THREE.Group;
  update: (t: number, dayMix: number, moving: boolean) => void;
} {
  const group = new THREE.Group();
  const rand = mulberry32(31337);

  // Birds: small dark chevrons that flap, gathered into flocks on circular paths.
  const birdMat = new THREE.MeshStandardMaterial({
    color: 0x11131c,
    roughness: 1,
    metalness: 0,
    emissive: 0x0a0c14,
    emissiveIntensity: 0.3
  });
  const wingGeo = new THREE.BoxGeometry(1, 0.06, 0.34);
  interface Flock { group: THREE.Group; wings: THREE.Mesh[]; radius: number; speed: number; phase: number; y: number; flap: number }
  const flocks: Flock[] = [];
  for (let f = 0; f < 4; f += 1) {
    const flock = new THREE.Group();
    flock.userData.dynamic = true;
    const wings: THREE.Mesh[] = [];
    const n = 5 + Math.floor(rand() * 4);
    for (let b = 0; b < n; b += 1) {
      const bird = new THREE.Group();
      const scale = 0.55 + rand() * 0.35;
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(wingGeo, birdMat);
        wing.userData.skipShadow = true; // no bird-shaped blots on the plaza
        wing.scale.setScalar(scale);
        wing.position.x = side * 0.5 * scale;
        wing.rotation.z = side * 0.4;
        bird.add(wing);
        wings.push(wing);
      }
      bird.position.set((rand() - 0.5) * 22, (rand() - 0.5) * 6, (rand() - 0.5) * 22);
      flock.add(bird);
    }
    group.add(flock);
    flocks.push({
      group: flock,
      wings,
      radius: 120 + rand() * 120,
      speed: (0.05 + rand() * 0.05) * (rand() < 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      y: 70 + rand() * 45,
      flap: 5 + rand() * 3
    });
  }

  const update = (t: number, _dayMix: number, moving: boolean) => {
    if (!moving) return;
    for (const flock of flocks) {
      const a = flock.phase + t * flock.speed;
      flock.group.position.set(Math.cos(a) * flock.radius, flock.y, Math.sin(a) * flock.radius);
      flock.group.rotation.y = -a + (flock.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      const flap = Math.sin(t * flock.flap) * 0.55;
      flock.wings.forEach((wing, i) => {
        wing.rotation.z = (i % 2 === 0 ? -1 : 1) * (0.35 + flap);
      });
    }
  };

  return { group, update };
}
