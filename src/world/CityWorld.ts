import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { tierOf, type WorldData, type Project } from '../data';
import { createBuilding, type BuildingHandle } from './buildings';
import {
  createTerrain,
  createBlocks,
  createRoads,
  createRiver,
  createTrees,
  createOutskirts,
  createLampField,
  createSigns,
  createSpire,
  createSky,
  createSkyDome,
  createSkyEnvScene,
  createPaintedEnvScene,
  setWaterLook,
  setTownGlow,
  applyTints,
  SUN_DIR
} from './environment';
import { createFabric } from './fabric';
import { createWalkers } from './walkers';
import { buildCityPlan, PITCH, type CityPlan } from './cityplan';
import { createPerson, updatePerson, citizenCount, type Person } from './people';
import { createTraffic, type Traffic } from './cars';
import { bubbleSprite } from './textures';
import { bakeStatic, bakedGlow } from './bake';
import { growClock, GROW_RISE } from './surface';

/** Everything that changes between night and day, lerped by a single mix factor. */
const NIGHT = {
  // Sampled from the night painting: zenith and the haze it meets the land in.
  skyTop: new THREE.Color('#101a2e'),
  skyBottom: new THREE.Color('#3b3649'),
  skySun: new THREE.Color('#8fa4e0'),
  ranges: new THREE.Color('#1c1f30'),
  bloom: 0.6,
  bloomThreshold: 0.9,
  fog: 0.36, // fog density × overview distance, so haze scales with the town
  ambient: new THREE.Color(0x5a6aa0),
  ambientIntensity: 0.55,
  hemiSky: new THREE.Color(0x5066a8),
  hemiGround: new THREE.Color(0x161a2a),
  hemiIntensity: 1.5,
  sun: new THREE.Color(0xa8b8ff),
  sunIntensity: 1.5,
  waterDeep: new THREE.Color(0x1d3f78),
  waterZenith: new THREE.Color(0x3a5ea8),
  waterHorizon: new THREE.Color(0x7f9fdc),
  glint: 0.3,
  exposure: 1.15
};
// A clear late afternoon: low warm sun, long shadows, cream haze on the horizon.
const DAY = {
  // Sampled from the afternoon painting: zenith blue and the warm haze on its horizon.
  skyTop: new THREE.Color('#4f7db4'),
  skyBottom: new THREE.Color('#dcc7a6'),
  skySun: new THREE.Color('#ffe9c4'),
  ranges: new THREE.Color('#62745a'),
  bloom: 0.16,
  bloomThreshold: 1.0,
  fog: 0.15,
  ambient: new THREE.Color(0xc4d2e8),
  ambientIntensity: 0.1,
  hemiSky: new THREE.Color(0xa9c6ff),
  hemiGround: new THREE.Color(0x8a7a5c),
  hemiIntensity: 0.55,
  sun: new THREE.Color(0xffe0b0),
  sunIntensity: 3.6,
  waterDeep: new THREE.Color(0x20566e),
  glint: 1.8,
  exposure: 1.06
};

export const ABOUT_ID = '__about__';

export interface CityWorldEvents {
  onHover: (project: Project | null) => void;
  onSelect: (id: string | null) => void;
  onReady: () => void;
}

interface CameraTween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
}

// Aimed above the rooftops, so the town sits in the lower two thirds and the painted sky gets the rest.
const OVERVIEW_TARGET = new THREE.Vector3(0, 30, 0);
/** The opening view looks northeast across downtown from this compass bearing off due south. */
const OVERVIEW_BEARING = THREE.MathUtils.degToRad(-33);
// Where on the growth clock the first and the last project go up. Anything at 0 is always standing.
const GROW_START = 0.08;
const GROW_END = 0.92;
const LABEL_NEAR = 45;
const LABEL_FAR = 110;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CityWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = new THREE.Clock();

  private city = new THREE.Group();
  private plan: CityPlan;
  private buildings = new Map<string, BuildingHandle>();
  private people: Person[] = [];
  private traffic: Traffic | null = null;
  private pickMeshes: THREE.Mesh[] = [];
  /** Every building as a box in world space, for finding a clear line of sight. */
  private headliners = new Set<string>();
  /** When each project's building rises along the town's history (see surface.ts). */
  private growAt = new Map<string, number>();
  private history = { from: 0, to: 1 };
  private growth: { start: number; duration: number; onTick?: (date: Date, built: number) => void; onDone?: () => void } | null = null;
  /** Seconds spent resting at the overview; drives a slow sway so the opening view is never a still. */
  private idle = 0;
  private obstacles: { id: string; x: number; z: number; hw: number; hd: number; h: number }[] = [];
  private walkersUpdate: (t: number) => void = () => {};
  private clockTick: () => void = () => {};
  private clockMinute = -1;
  private riverUpdate: (t: number) => void = () => {};
  private outskirtsUpdate: (t: number) => void = () => {};
  private skyUpdate: (t: number, dayMix: number, moving: boolean) => void = () => {};
  private districtCenters = new Map<string, THREE.Vector3>();

  // Day/night machinery.
  private dayMix = 0;
  private dayTarget = 0;
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private skyDomeMaterial!: THREE.ShaderMaterial;
  private bloomPass!: UnrealBloomPass;
  private composer!: EffectComposer;
  private envDay!: THREE.Texture;
  private envNight!: THREE.Texture;
  /** The painted sky, prefiltered for the towers' glass to mirror. */
  private glassDay: THREE.Texture | null = null;
  private glassNight: THREE.Texture | null = null;
  private glass: THREE.MeshStandardMaterial[] = [];
  private shadowRefresh = 30;
  private fxaaPass!: ShaderPass;
  private sizeScratch = new THREE.Vector2();
  private lampBulbMaterial!: THREE.MeshStandardMaterial;
  private lampGlowMaterials: { material: THREE.Material; base: number }[] = [];
  private nightWindows: { mat: THREE.MeshStandardMaterial; base: number; dim: number }[] = [];
  private labelBoxes: {
    id: string;
    label: THREE.Sprite;
    priority: number;
    halfW: number;
    halfH: number;
    baseW: number;
    baseH: number;
  }[] = [];
  private overviewPos = new THREE.Vector3(0, 72, 134);
  private atOverview = true;
  private frame = 0;
  private pixelRatio = 1;
  private slowFrames = 0;
  private lastFrameAt = 0;
  private headlights: { mat: THREE.MeshStandardMaterial; base: number }[] = [];

  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private selectionRing: THREE.Mesh;
  private bubble: { sprite: THREE.Sprite; holder: THREE.Group; expires: number } | null = null;
  private tween: CameraTween | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private downAt = { x: 0, y: 0 };

  constructor(
    private container: HTMLElement,
    private data: WorldData,
    private events: CityWorldEvents
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // The sun never moves and nearly everything is static, so the shadow map is
    // drawn a few times at load and then left alone.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false; // count draw calls across all composer passes
    this.renderer.domElement.dataset.test = 'world-canvas';
    container.appendChild(this.renderer.domElement);

    // Image-based lighting from the town's own sky, so glass and metal reflect what is overhead.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    // Kept dim: it is there for reflections, not to flood the shadows with fill light.
    // Its colors follow the painted sky (blue zenith over warm haze; navy over slate).
    this.envDay = pmrem.fromScene(createSkyEnvScene('#22395a', '#7a6e5c', '#2c2a22', '#8a7a5a'), 0.02).texture;
    this.envNight = pmrem.fromScene(createSkyEnvScene('#070c18', '#1a2233', '#05060a', '#262e44'), 0.02).texture;
    pmrem.dispose();
    this.scene.environment = this.envNight;

    this.scene.fog = new THREE.FogExp2(0x05070f, 0.0042);

    this.camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / container.clientHeight,
      1,
      6000
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(OVERVIEW_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 420;
    this.controls.enablePan = false;
    this.controls.addEventListener('start', () => {
      this.atOverview = false;
      this.tween = null; // the visitor's hand always wins over a camera move
    });

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.045, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.3;
    this.scene.add(this.selectionRing);

    this.plan = buildCityPlan(data);
    this.fitOverview();
    this.camera.position.copy(
      this.reducedMotion
        ? this.overviewPos
        : OVERVIEW_TARGET.clone().add(this.overviewPos.clone().sub(OVERVIEW_TARGET).multiplyScalar(1.7).setY(this.overviewPos.y * 2.1))
    );
    this.buildScene();
    this.bindEvents();

    // HDR post-processing: bloom, tone-mapped output, then FXAA. Multisampling a
    // half-float target cost a third of the frame rate on integrated graphics;
    // FXAA on the finished image costs almost nothing.
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      NIGHT.bloom,
      0.6,
      NIGHT.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);
    this.sizePasses();

    if (import.meta.env.DEV) {
      // Dev-only hook so e2e tests can find moving citizens on screen.
      (window as unknown as Record<string, unknown>).__cityDebug = {
        bubbleActive: () => this.bubble !== null,
        world: this,
          quality: () => ({ pixelRatio: this.pixelRatio }),
          view: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
            this.tween = null;
            this.camera.position.set(px, py, pz);
            this.controls.target.set(tx, ty, tz);
          },
        renderInfo: () => ({ ...this.renderer.info.render, ...this.renderer.info.memory }),
        peopleOnScreen: () => {
          const rect = this.renderer.domElement.getBoundingClientRect();
          return this.people.map((person) => {
            const world = person.group.position.clone().add(this.city.position).setY(1);
            const ndc = world.project(this.camera);
            return {
              project: person.project.id,
              quoteIndex: person.quoteIndex,
              x: rect.left + ((ndc.x + 1) / 2) * rect.width,
              y: rect.top + ((1 - ndc.y) / 2) * rect.height,
              inFront: ndc.z < 1
            };
          });
        }
      };
    }

    if (!this.reducedMotion) {
      this.growth = { start: performance.now() + 500, duration: 3400 };
      growClock.value = GROW_START - 0.02;
      this.tween = {
        fromPos: this.camera.position.clone(),
        toPos: this.overviewPos.clone(),
        fromTarget: OVERVIEW_TARGET.clone(),
        toTarget: OVERVIEW_TARGET.clone(),
        start: performance.now() + 250,
        duration: 2600
      };
    }
  }

  /** City-plan coordinates → world coordinates (plan is recentered on the origin). */
  private toWorld(x: number, z: number, y = 0): THREE.Vector3 {
    return new THREE.Vector3(x - this.plan.center.x, y, z - this.plan.center.z);
  }

  /** Pull the overview camera back just far enough to frame the whole town. */
  private fitOverview(): void {
    // Frame the project grid (the ring of neighbourhood blocks may run off the
    // edges) from a low three-quarter angle, so the skyline stands against the
    // sky. Walk the camera back until every corner of that box is on screen.
    const { core, center, plaza } = this.plan;
    // A tall screen cannot hold the whole grid without shrinking it to a strip,
    // so it frames downtown (the blocks round the plaza) and lets the rest run off.
    const portrait = this.camera.aspect < 1;
    const bearing = OVERVIEW_BEARING;
    const pitch = THREE.MathUtils.degToRad(portrait ? 10.5 : 13.5);
    const dir = new THREE.Vector3(Math.sin(bearing) * Math.cos(pitch), Math.sin(pitch), Math.cos(bearing) * Math.cos(pitch));
    const box = portrait
      ? { minX: plaza.x - PITCH * 1.25, maxX: plaza.x + PITCH * 1.25, minZ: plaza.z - PITCH * 1.25, maxZ: plaza.z + PITCH * 1.25 }
      : core;
    const target = OVERVIEW_TARGET.clone().setX((box.minX + box.maxX) / 2 - center.x).setZ((box.minZ + box.maxZ) / 2 - center.z);
    OVERVIEW_TARGET.copy(target);
    const corners: THREE.Vector3[] = [];
    for (const x of [box.minX - center.x, box.maxX - center.x]) {
      for (const z of [box.minZ - center.z, box.maxZ - center.z]) {
        for (const y of [0, 30]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    const probe = this.camera.clone();
    const fits = (dist: number) => {
      probe.position.copy(target).addScaledVector(dir, dist);
      probe.lookAt(target);
      probe.updateMatrixWorld(true);
      return corners.every((corner) => {
        const ndc = corner.clone().project(probe);
        return Math.abs(ndc.x) < (portrait ? 1.12 : 0.97) && ndc.y < (portrait ? 0.3 : 0.3) && ndc.y > (portrait ? -0.7 : -0.92);
      });
    };
    let lo = 40;
    let hi = 1200;
    for (let i = 0; i < 18; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.overviewPos.copy(target).addScaledVector(dir, hi);
  }

  private buildScene(): void {
    this.ambientLight = new THREE.AmbientLight(0x46548c, 1.6);
    this.scene.add(this.ambientLight);
    this.hemiLight = new THREE.HemisphereLight(0x46548c, 0x10131f, 1.1);
    this.scene.add(this.hemiLight);
    this.sunLight = new THREE.DirectionalLight(0x93a7ff, 0.85);
    // One static shadow map fitted to the town. Because it is drawn once, it can
    // afford to be large; phones get a smaller one.
    const { minX, maxX, minZ, maxZ } = this.plan.bounds;
    const reach = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 14;
    const small = window.matchMedia('(pointer: coarse)').matches;
    this.sunLight.position.copy(SUN_DIR).multiplyScalar(reach + 120);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.setScalar(small ? 2048 : 4096);
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = reach * 2 + 240;
    this.sunLight.shadow.camera.left = -reach;
    this.sunLight.shadow.camera.right = reach;
    this.sunLight.shadow.camera.top = reach;
    this.sunLight.shadow.camera.bottom = -reach;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.16;
    this.sunLight.shadow.radius = 2.2;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const skyDome = createSkyDome((day, night) => {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.glassDay = pmrem.fromScene(createPaintedEnvScene(day, 1.0, '#5a5648'), 0.01).texture;
      this.glassNight = pmrem.fromScene(createPaintedEnvScene(night, 0.9, '#0c0d14'), 0.01).texture;
      pmrem.dispose();
      this.applyAtmosphere();
    });
    skyDome.mesh.userData.skipShadow = true;
    this.scene.add(skyDome.mesh);
    this.skyDomeMaterial = skyDome.material;

    this.city.position.set(-this.plan.center.x, 0, -this.plan.center.z);
    this.scene.add(this.city);

    this.city.add(createBlocks(this.plan));
    this.city.add(createRoads(this.plan));
    const river = createRiver(this.plan);
    this.city.add(river.group);
    this.riverUpdate = river.update;
    const fabric = createFabric(this.plan);
    this.city.add(fabric.group);
    const walkers = createWalkers(this.plan);
    this.city.add(walkers.mesh);
    this.walkersUpdate = walkers.update;
    for (const f of this.plan.fillers) {
      const turned = Math.abs(Math.sin(f.rotationY)) > 0.5;
      this.obstacles.push({
        id: '',
        x: f.x - this.plan.center.x,
        z: f.z - this.plan.center.z,
        hw: (turned ? f.d : f.w) / 2,
        hd: (turned ? f.w : f.d) / 2,
        h: f.h + 1.5
      });
    }
    for (const mat of fabric.windowMaterials) {
      this.nightWindows.push({ mat, base: mat.emissiveIntensity, dim: 0.97 });
    }
    this.city.add(createTrees(this.plan));

    const outskirts = createOutskirts(this.plan);
    this.city.add(outskirts.group);
    this.outskirtsUpdate = outskirts.update;

    const lampField = createLampField([...this.plan.lamps, ...outskirts.lamps]);
    this.lampBulbMaterial = lampField.bulbMaterial;
    this.lampGlowMaterials = [...lampField.glowMaterials, outskirts.glow];
    this.city.add(lampField.group);

    this.city.add(createSigns(this.plan));

    const sky = createSky();
    this.scene.add(sky.group);
    this.skyUpdate = sky.update;

    this.traffic = createTraffic(this.plan);
    this.city.add(this.traffic.group);
    this.headlights = this.traffic.headlightMaterials.map((mat) => ({
      mat,
      base: mat.emissiveIntensity
    }));

    const terrain = createTerrain(this.plan);
    this.scene.add(terrain);

    // Buildings and their citizens.
    const centroids = new Map<string, { sum: THREE.Vector3; n: number }>();
    // The town's history runs from the first repo's creation to the last one's.
    const founded = (p: Project) => new Date(`${p.createdAt ?? p.pushedAt}T00:00:00Z`).getTime();
    const dates = this.data.projects.map(founded);
    this.history = { from: Math.min(...dates), to: Math.max(...dates) };
    const span = Math.max(this.history.to - this.history.from, 1);
    for (const placement of this.plan.placements) {
      const handle = createBuilding(placement.project, placement.district, placement.towerRank, placement.rotationY);
      const growAt = GROW_START + (GROW_END - GROW_START) * ((founded(placement.project) - this.history.from) / span);
      this.growAt.set(placement.project.id, growAt);
      handle.group.userData.grow = growAt;
      handle.group.position.set(placement.lot.x, 0.18, placement.lot.z);
      this.city.add(handle.group);
      this.buildings.set(placement.project.id, handle);
      this.pickMeshes.push(...handle.pickMeshes);
      this.glass.push(...handle.glass);

      // Track window-style emissives so the day can switch them off.
      const seen = new Set<THREE.Material>();
      handle.group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = (Array.isArray(obj.material) ? obj.material : [obj.material]) as THREE.MeshStandardMaterial[];
        for (const mat of mats) {
          if (seen.has(mat) || !(mat instanceof THREE.MeshStandardMaterial)) continue;
          seen.add(mat);
          const isWindow = Boolean(mat.emissiveMap); // plain glowing trim is dimmed by the bake's shared uniform
          const excluded =
            mat === handle.craneBeacon ||
            handle.billboards.includes(mat) ||
            handle.glowMaterials.includes(mat);
          if (isWindow && !excluded) {
            this.nightWindows.push({ mat, base: mat.emissiveIntensity, dim: (mat.userData.dayDim as number) ?? 0.78 });
          }
        }
      });
      this.obstacles.push({
        id: placement.project.id,
        x: placement.lot.x - this.plan.center.x,
        z: placement.lot.z - this.plan.center.z,
        hw: handle.footprint / 2,
        hd: handle.footprint / 2,
        h: handle.height
      });
      const labelScale = handle.label.scale;
      this.labelBoxes.push({
        id: placement.project.id,
        label: handle.label,
        priority: placement.project.commits,
        halfW: labelScale.x / 2,
        halfH: labelScale.y / 2,
        baseW: labelScale.x,
        baseH: labelScale.y
      });

      const entry = centroids.get(placement.district.id) ?? { sum: new THREE.Vector3(), n: 0 };
      entry.sum.add(this.toWorld(placement.lot.x, placement.lot.z));
      entry.n += 1;
      centroids.set(placement.district.id, entry);

      const crowd = citizenCount(placement.project);
      for (let i = 0; i < crowd; i += 1) {
        const person = createPerson(
          placement.project,
          placement.district,
          placement.lot.x,
          placement.lot.z,
          Math.min(handle.footprint * 0.9 + 1.6, tierOf(placement.project.commits) === 4 ? 10.4 : 5.2),
          i % Math.max(placement.project.quotes.length, 1)
        );
        this.city.add(person.group);
        this.people.push(person);
        this.pickMeshes.push(...person.pickMeshes);
      }
    }
    for (const [id, entry] of centroids) {
      this.districtCenters.set(id, entry.sum.divideScalar(entry.n));
    }

    const spire = createSpire();
    spire.group.position.set(this.plan.plaza.x, 0.15, this.plan.plaza.z);
    this.city.add(spire.group);
    this.clockTick = spire.tick;
    this.obstacles.push({
      id: ABOUT_ID,
      x: this.plan.plaza.x - this.plan.center.x,
      z: this.plan.plaza.z - this.plan.center.z,
      hw: 4.5,
      hd: 4.5,
      h: 30
    });
    this.nightWindows.push({ mat: spire.faceMaterial, base: 1.1, dim: 0.75 });
    this.pickMeshes.push(...spire.pickMeshes);

    this.headliners = new Set(
      [...this.labelBoxes].sort((a, b) => b.priority - a.priority).slice(0, 3).map((box) => box.id)
    );
    bakeStatic(this.city, true);
    this.enableShadows();
    this.sizeLabels();
  }

  /** Name plates are sized against the view height; on a narrow screen that is too wide, so shrink them. */
  private sizeLabels(): void {
    const k = THREE.MathUtils.clamp(this.camera.aspect / 1.15, 0.7, 1);
    for (const box of this.labelBoxes) {
      box.label.scale.set(box.baseW * k, box.baseH * k, 1);
      box.halfW = (box.baseW * k) / 2;
      box.halfH = (box.baseH * k) / 2;
    }
  }

  /** Solid opaque meshes cast + receive; thin/transparent decals only receive. */
  private enableShadows(): void {
    // Anything that moves stays out of the static shadow map.
    const walk = (obj: THREE.Object3D, moving: boolean) => {
      const dynamic = moving || Boolean(obj.userData.dynamic);
      if (obj instanceof THREE.Mesh) {
        // InstancedMesh extends Mesh
        if (obj.userData.skipShadow) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        } else {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          const transparent = mats.some((m) => (m as THREE.Material).transparent);
          obj.castShadow = !transparent && !obj.userData.noCast && !dynamic;
          obj.receiveShadow = true;
        }
      }
      for (const child of obj.children) walk(child, dynamic);
    };
    walk(this.scene, false);
  }

  /** Bloom is a soft effect, so a quarter of the pixels is plenty; FXAA needs the true pixel size. */
  private sizePasses(): void {
    const size = this.renderer.getDrawingBufferSize(this.sizeScratch);
    this.bloomPass.setSize(size.x / 2, size.y / 2);
    this.fxaaPass.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.resize());

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.updateHover();
    });
    el.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
      if (moved > 7) return;
      const rect = el.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const hit = this.pickObject();
      if (hit && hit.userData.personProjectId) {
        this.speak(hit.userData.personProjectId as string, hit.userData.quoteIndex as number);
        return;
      }
      this.clearBubble();
      this.events.onSelect(hit ? (hit.userData.projectId as string) : null);
    });
  }

  private pickObject(): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickMeshes, false);
    return hits.length > 0 ? hits[0].object : null;
  }

  private updateHover(): void {
    const hit = this.pickObject();
    const id = hit
      ? ((hit.userData.projectId ?? hit.userData.personProjectId) as string)
      : null;
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    const project = id && id !== ABOUT_ID ? this.data.projects.find((p) => p.id === id) ?? null : null;
    this.events.onHover(project);
    this.applyGlow();
  }

  /** A citizen speaks a line from their README. */
  private speak(projectId: string, quoteIndex: number): void {
    const person = this.people.find(
      (p) => p.project.id === projectId && p.quoteIndex === quoteIndex
    );
    if (!person) return;
    this.clearBubble();
    const quote = person.project.quotes[quoteIndex % person.project.quotes.length] ?? person.project.blurb;
    const sprite = bubbleSprite(person.project.title, quote, person.district.color);
    sprite.position.y = 1.75;
    person.group.add(sprite);
    this.bubble = { sprite, holder: person.group, expires: performance.now() + 9000 };
  }

  private clearBubble(): void {
    if (!this.bubble) return;
    this.bubble.holder.remove(this.bubble.sprite);
    this.bubble.sprite.material.map?.dispose();
    this.bubble.sprite.material.dispose();
    this.bubble = null;
  }

  private applyGlow(): void {
    for (const [id, handle] of this.buildings) {
      const active = id === this.hoveredId || id === this.selectedId;
      handle.glowMaterials.forEach((mat, i) => {
        mat.emissiveIntensity = active ? 1.8 : handle.baseEmissive[i];
      });
    }
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.applyGlow();
    const ringMat = this.selectionRing.material as THREE.MeshBasicMaterial;
    if (id && this.buildings.has(id)) {
      const handle = this.buildings.get(id)!;
      const scale = handle.footprint * 1.2 + 1.5;
      this.selectionRing.scale.set(scale, scale, 1);
      const world = handle.group.position.clone().add(this.city.position);
      this.selectionRing.position.set(world.x, 0.3, world.z);
      ringMat.color = new THREE.Color(
        this.data.districts.find((d) => d.id === handle.project.district)?.color ?? '#ffffff'
      );
      ringMat.opacity = 0.8;
    } else {
      ringMat.opacity = 0;
    }
  }

  /** How much of the sight line from `eye` to `aim` passes through other buildings. */
  private blocked(eye: THREE.Vector3, aim: THREE.Vector3, selfId: string): number {
    let hits = 0;
    const point = new THREE.Vector3();
    for (let i = 0; i < 18; i += 1) {
      point.lerpVectors(eye, aim, 0.02 + (i / 18) * 0.9);
      for (const o of this.obstacles) {
        if (o.id === selfId || point.y > o.h) continue;
        if (Math.abs(point.x - o.x) < o.hw && Math.abs(point.z - o.z) < o.hd) {
          hits += 1;
          break;
        }
      }
    }
    return hits;
  }

  focusProject(id: string): void {
    const handle = this.buildings.get(id);
    if (!handle) return;
    const pos = handle.group.position.clone().add(this.city.position);
    const portrait = this.camera.aspect < 1;
    const facesNorth = !handle.landmark && Math.abs(handle.group.rotation.y) > 1;
    // Small buildings are viewed from closer and steeper, over their neighbours' roofs.
    const dist =
      (handle.landmark ? 12 + handle.footprint * 2 + handle.height * 0.8 : 8 + handle.footprint * 1.5 + handle.height) *
      (portrait ? 1.9 : 1);
    const aim = new THREE.Vector3(pos.x, handle.height * (handle.landmark ? 0.4 : 0.45), pos.z);

    // Approach from the sunlit side the posters and front doors face. Of a few
    // bearings on that side, take the one with the clearest line of sight, so
    // the chosen building is the hero and no neighbour stands in front of it.
    const bearings = handle.landmark ? [-33, -55, -12, -78, 14] : [-20, -45, 10, -70, 35];
    let best: { outward: THREE.Vector3; eye: THREE.Vector3; score: number } | null = null;
    for (const [rank, degrees] of bearings.entries()) {
      const bearing = THREE.MathUtils.degToRad(degrees);
      const outward = new THREE.Vector3(Math.sin(bearing), 0, Math.cos(bearing) * (facesNorth ? -1 : 1));
      const eye = aim.clone().addScaledVector(outward, dist);
      eye.y = handle.landmark ? aim.y + dist * 0.6 : dist * 0.8;
      // The sight line to the building, to its base, and to the space either
      // side of it: the hero should have air, not a neighbour's wall beside it.
      const across = new THREE.Vector3(outward.z, 0, -outward.x).multiplyScalar(handle.footprint * 1.6 + dist * 0.12);
      // Earlier bearings show the posters best, so a later one has to earn its place.
      const score =
        rank * 0.7 +
        this.blocked(eye, aim, id) +
        this.blocked(eye, aim.clone().setY(4), id) * 0.6 +
        this.blocked(eye, aim.clone().add(across), id) * 0.35 +
        this.blocked(eye, aim.clone().sub(across), id) * 0.35;
      if (!best || score < best.score - 0.4) best = { outward, eye, score };
    }
    const { outward, eye } = best!;

    // Desktop: the panel sits on the right, so slide the building left of it.
    // Phone: the panel is a bottom sheet, so lift the building into the top half.
    const right = new THREE.Vector3(outward.z, 0, -outward.x);
    const toTarget = aim.clone();
    const toPos = eye.clone();
    if (portrait) toTarget.y -= dist * (handle.landmark ? 0.3 : 0.22);
    else {
      toTarget.addScaledVector(right, dist * 0.17);
      toPos.addScaledVector(right, dist * 0.17);
    }
    this.atOverview = false;
    this.startTween(toPos, toTarget);
  }

  focusDistrict(id: string): void {
    const center = this.districtCenters.get(id);
    if (!center) return;
    // Same sunlit south-west approach as everything else, so the lit faces and front doors show.
    const outward = new THREE.Vector3(Math.sin(OVERVIEW_BEARING), 0, Math.cos(OVERVIEW_BEARING));
    const toTarget = center.clone().setY(4);
    const back = this.camera.aspect < 1 ? 96 : 70;
    const toPos = center.clone().add(outward.multiplyScalar(back)).setY(back * 0.5);
    this.atOverview = false;
    this.startTween(toPos, toTarget);
  }

  /**
   * Raise the town in the order its repos were created. `onTick` reports the
   * date the clock has reached and how many projects stand; used by the opening
   * and by the replay in the town hall panel.
   */
  playGrowth(duration: number, onTick?: (date: Date, built: number) => void, onDone?: () => void): void {
    if (this.reducedMotion) {
      onDone?.();
      return;
    }
    this.growth = { start: performance.now(), duration, onTick, onDone };
    growClock.value = GROW_START - 0.02;
  }

  focusOverview(): void {
    this.startTween(this.overviewPos.clone(), OVERVIEW_TARGET.clone());
    this.atOverview = true;
  }

  /** Flip between night and day. The transition eases over ~1.5s. */
  setDaytime(day: boolean, immediate = false): void {
    this.dayTarget = day ? 1 : 0;
    if (immediate || this.reducedMotion) {
      this.dayMix = this.dayTarget;
      this.applyAtmosphere();
    }
  }

  isDaytime(): boolean {
    return this.dayTarget === 1;
  }

  private applyAtmosphere(): void {
    const k = this.dayMix;
    const night = 1 - k;

    // Gradient sky dome + matching fog so the horizon blends into the sky.
    this.skyDomeMaterial.uniforms.topColor.value.lerpColors(NIGHT.skyTop, DAY.skyTop, k);
    this.skyDomeMaterial.uniforms.bottomColor.value.lerpColors(NIGHT.skyBottom, DAY.skyBottom, k);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.lerpColors(NIGHT.skyBottom, DAY.skyBottom, k);
    fog.density = THREE.MathUtils.lerp(NIGHT.fog, DAY.fog, k) / this.overviewDistance();
    this.skyDomeMaterial.uniforms.sunColor.value.lerpColors(NIGHT.skySun, DAY.skySun, k);
    this.skyDomeMaterial.uniforms.day.value = k;
    this.skyDomeMaterial.uniforms.rangeColor.value.lerpColors(NIGHT.ranges, DAY.ranges, k);
    this.scene.environment = k > 0.5 ? this.envDay : this.envNight;
    const mirror = k > 0.5 ? this.glassDay : this.glassNight;
    for (const mat of this.glass) {
      if (mat.envMap !== mirror) {
        mat.envMap = mirror;
        mat.needsUpdate = true;
      }
      mat.envMapIntensity = mirror ? THREE.MathUtils.lerp(0.9, 1.15, k) : 1;
    }
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(NIGHT.exposure, DAY.exposure, k);

    // Bloom blooms hard at night (neon), gentle by day.
    this.bloomPass.strength = THREE.MathUtils.lerp(NIGHT.bloom, DAY.bloom, k);
    this.bloomPass.threshold = THREE.MathUtils.lerp(NIGHT.bloomThreshold, DAY.bloomThreshold, k);

    this.ambientLight.color.lerpColors(NIGHT.ambient, DAY.ambient, k);
    this.ambientLight.intensity = THREE.MathUtils.lerp(NIGHT.ambientIntensity, DAY.ambientIntensity, k);
    this.hemiLight.color.lerpColors(NIGHT.hemiSky, DAY.hemiSky, k);
    this.hemiLight.groundColor.lerpColors(NIGHT.hemiGround, DAY.hemiGround, k);
    this.hemiLight.intensity = THREE.MathUtils.lerp(NIGHT.hemiIntensity, DAY.hemiIntensity, k);
    this.sunLight.color.lerpColors(NIGHT.sun, DAY.sun, k);
    this.sunLight.intensity = THREE.MathUtils.lerp(NIGHT.sunIntensity, DAY.sunIntensity, k);

    applyTints(k);
    bakedGlow.value = 1 - 0.8 * k;
    // At night the water mirrors a moonlit sky brighter than the real one, so the
    // river reads as a pale ribbon through the dark town instead of vanishing.
    setWaterLook(
      NIGHT.waterDeep.clone().lerp(DAY.waterDeep, k),
      NIGHT.waterZenith.clone().lerp(DAY.skyTop, k),
      NIGHT.waterHorizon.clone().lerp(DAY.skyBottom, k),
      this.skyDomeMaterial.uniforms.sunColor.value,
      THREE.MathUtils.lerp(NIGHT.glint, DAY.glint, k)
    );

    setTownGlow(0.3 * night, this.plan.core.minZ - this.plan.center.z, this.plan.core.maxZ - this.plan.center.z);

    this.lampBulbMaterial.emissiveIntensity = 3.4 * night + 0.1;
    for (const glow of this.lampGlowMaterials) {
      glow.material.opacity = glow.base * night;
      glow.material.visible = night > 0.01;
    }
    for (const { mat, base, dim } of this.nightWindows) mat.emissiveIntensity = base * (1 - dim * k);
    for (const { mat, base } of this.headlights) mat.emissiveIntensity = base * (1 - 0.7 * k);
    // Name plates are lit by the day; after dark they dim like any unlit sign.
    for (const box of this.labelBoxes) box.label.material.color.setScalar(0.5 + 0.5 * k);
  }

  focusAbout(): void {
    const plaza = this.toWorld(this.plan.plaza.x, this.plan.plaza.z);
    this.atOverview = false;
    this.startTween(
      plaza.clone().add(new THREE.Vector3(-26, 22, 40)),
      plaza.clone().setY(13)
    );
  }

  private overviewDistance(): number {
    return this.overviewPos.distanceTo(OVERVIEW_TARGET);
  }

  private startTween(toPos: THREE.Vector3, toTarget: THREE.Vector3): void {
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
      start: performance.now(),
      duration: this.reducedMotion ? 0 : 1400
    };
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
    this.composer.setSize(clientWidth, clientHeight);
    this.sizePasses();
    this.sizeLabels();
    this.fitOverview();
    (this.scene.fog as THREE.FogExp2).density =
      THREE.MathUtils.lerp(NIGHT.fog, DAY.fog, this.dayMix) / this.overviewDistance();
    if (this.atOverview) this.startTween(this.overviewPos.clone(), OVERVIEW_TARGET.clone());
  }

  /**
   * Name plates fade in as the camera approaches, then yield to one another and
   * to the interface: the selected or hovered project always shows, bigger
   * projects win ties, nothing sits under the masthead, the buttons, or the
   * panel, and a plate that would run off the side of the screen slides back in.
   */
  private layoutLabels(): void {
    const aspect = this.camera.aspect;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    // Interface plates, as NDC boxes the labels must keep clear of.
    const view = this.renderer.domElement.getBoundingClientRect();
    const shown: { x: number; y: number; halfW: number; halfH: number; ui?: boolean }[] = [];
    for (const selector of ['.hud .brand', '.hud-actions', '#legend', '#panel', '#hint:not(.hint-hidden)']) {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      shown.push({
        x: ((r.left + r.right) / 2 - view.left) / view.width * 2 - 1,
        y: 1 - ((r.top + r.bottom) / 2 - view.top) / view.height * 2,
        halfW: r.width / view.width + 0.012,
        halfH: r.height / view.height + 0.016,
        ui: true
      });
    }

    const candidates = this.labelBoxes
      .map((box) => {
        const handle = this.buildings.get(box.id)!;
        const world = box.label.getWorldPosition(new THREE.Vector3());
        const distance = this.camera.position.distanceTo(world);
        // Towers are named from the opening view; smaller buildings as you come closer.
        // From the opening view only the three biggest carry a plate, so the skyline stays the subject.
        // A phone has no room for plates over the skyline; there they wait until you come closer.
        const far = handle.landmark ? (this.headliners.has(box.id) && aspect >= 1 ? 1.25 : 0.7) : 0;
        const reach = far > 0 ? Math.max((this.overviewDistance() * far) / LABEL_FAR, 1) : 1;
        const near = 1 - THREE.MathUtils.clamp((distance - LABEL_NEAR * reach) / ((LABEL_FAR - LABEL_NEAR) * reach), 0, 1);
        const forced = box.id === this.hoveredId || box.id === this.selectedId;
        const ndc = world.project(this.camera);
        return { box, near, forced, ndc };
      })
      .sort((a, b) => Number(b.forced) - Number(a.forced) || b.box.priority - a.box.priority);

    for (const { box, near, forced, ndc } of candidates) {
      // A plate is either up or down: a half-faded sign reads as a glitch.
      let target = forced || near > 0.04 ? 1 : 0;
      if (ndc.z > 1) target = 0;
      if (growClock.value < (this.growAt.get(box.id) ?? 0) + GROW_RISE) target = 0; // not built yet
      // Sprite scale is in view-height units; convert to NDC half-extents.
      const halfW = box.halfW / aspect / tan;
      const halfH = box.halfH / tan;
      let slide = 0;
      if (target > 0.02) {
        // Slide a plate that pokes past a side edge back on screen, as far as its own half width.
        const limit = 0.985 - halfW;
        if (ndc.x > limit) slide = ndc.x - limit;
        else if (ndc.x < -limit) slide = ndc.x + limit;
        const x = ndc.x - slide;
        const y = ndc.y + halfH; // the plate stands on its anchor
        const offScreen = Math.abs(slide) > halfW * 0.92 || y + halfH > 0.985 || ndc.y < -0.985;
        const clash = shown.some(
          (s) =>
            Math.abs(s.x - x) < s.halfW + halfW + 0.01 &&
            Math.abs(s.y - y) < s.halfH + halfH + 0.012 &&
            (s.ui || !forced)
        );
        if (offScreen || clash) target = 0;
        else shown.push({ x, y, halfW, halfH });
      }
      box.label.center.x = 0.5 + slide / (2 * halfW);
      box.label.userData.target = target;
    }
  }

  /**
   * Adaptive resolution: if the frame rate sags for a sustained stretch, render
   * fewer pixels rather than drop frames. Steps down only, so it never thrashes.
   */
  private watchFrameRate(): void {
    const now = performance.now();
    const elapsed = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (elapsed <= 0 || elapsed > 500) return; // first frame, or the tab was in the background
    this.slowFrames = elapsed > 24 ? this.slowFrames + 1 : Math.max(this.slowFrames - 2, 0);
    if (this.slowFrames <= 45) return;
    this.slowFrames = 0;
    if (this.pixelRatio <= 0.75) return;
    this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.composer.setPixelRatio(this.pixelRatio);
    this.sizePasses();
  }

  start(): void {
    let firstFrame = true;
    let lastT = 0;
    this.renderer.setAnimationLoop(() => {
      const t = this.clock.getElapsedTime();
      const dt = Math.min(t - lastT, 0.05);
      lastT = t;

      if (this.tween) {
        const elapsed = performance.now() - this.tween.start;
        const progress = this.tween.duration === 0 ? 1 : Math.min(Math.max(elapsed / this.tween.duration, 0), 1);
        const k = easeInOutCubic(progress);
        this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, k);
        this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, k);
        if (progress >= 1) this.tween = null;
      }

      // The town going up: the growth clock runs along its history and the shadows follow.
      if (this.growth) {
        const f = THREE.MathUtils.clamp((performance.now() - this.growth.start) / this.growth.duration, 0, 1);
        growClock.value = GROW_START - 0.02 + (GROW_END + GROW_RISE + 0.02 - (GROW_START - 0.02)) * f;
        // Shadows follow the rising buildings, but redrawing the map every frame would
        // halve the frame rate on integrated graphics; every third frame is plenty.
        if (this.frame % 3 === 0) this.shadowRefresh = Math.max(this.shadowRefresh, 1);
        if (this.growth.onTick) {
          const along = THREE.MathUtils.clamp((growClock.value - GROW_START) / (GROW_END - GROW_START), 0, 1);
          let built = 0;
          for (const at of this.growAt.values()) if (growClock.value >= at) built += 1;
          this.growth.onTick(new Date(this.history.from + (this.history.to - this.history.from) * along), built);
        }
        if (f >= 1) {
          const done = this.growth.onDone;
          this.growth = null;
          growClock.value = 2;
          this.shadowRefresh = 3;
          done?.();
        }
      }

      // At rest on the overview the camera sways a few degrees either way, slowly:
      // enough parallax to show this is a place, never enough to lose the sunlit side.
      if (this.atOverview && !this.tween && !this.reducedMotion) {
        this.idle += dt;
        const offset = this.overviewPos.clone().sub(OVERVIEW_TARGET);
        offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.sin(this.idle * 0.16) * 0.12);
        this.camera.position.copy(OVERVIEW_TARGET).add(offset);
        this.controls.target.copy(OVERVIEW_TARGET);
      } else if (!this.atOverview) {
        this.idle = 0;
      }

      // Ease the sky between night and day.
      if (this.dayMix !== this.dayTarget) {
        const step = this.reducedMotion ? 1 : dt * 0.7;
        this.dayMix = THREE.MathUtils.clamp(
          this.dayMix + Math.sign(this.dayTarget - this.dayMix) * step,
          Math.min(this.dayMix, this.dayTarget),
          Math.max(this.dayMix, this.dayTarget)
        );
        this.applyAtmosphere();
      }

      if (!this.reducedMotion) this.skyDomeMaterial.uniforms.drift.value = t * 0.00045;
      // Sky brightness tracks day/night even when motion is reduced.
      this.skyUpdate(t, this.dayMix, !this.reducedMotion);

      if (!this.reducedMotion) {
        this.riverUpdate(t);
        this.outskirtsUpdate(t);
        this.traffic?.update(dt);
        this.walkersUpdate(t);
        for (const person of this.people) {
          updatePerson(person, t, dt);
        }
        for (const handle of this.buildings.values()) {
          if (handle.craneJib) {
            handle.craneJib.rotation.y = t * 0.16 + handle.height;
            handle.craneJib.visible = growClock.value >= (this.growAt.get(handle.project.id) ?? 0) + GROW_RISE;
          }
          if (handle.craneBeacon) {
            handle.craneBeacon.emissiveIntensity = Math.sin(t * 4) > 0 ? 2.2 : 0.25;
          }
        }
        const ringMat = this.selectionRing.material as THREE.MeshBasicMaterial;
        if (ringMat.opacity > 0) {
          ringMat.opacity = 0.6 + Math.sin(t * 3) * 0.25;
        }
      }

      // Posters and boards are lit whether or not anything is allowed to move.
      const flicker = this.reducedMotion ? 0 : t;
      for (const handle of this.buildings.values()) {
        handle.billboards.forEach((mat, i) => {
          // Printed posters are floodlit at night: bright enough to be the street's own light.
          // Lettered boards flicker like LED panels.
          if (mat.userData.poster) mat.color.setScalar(0.25 + 0.75 * this.dayMix);
          mat.emissiveIntensity = mat.userData.poster
            ? 0.85 - 0.6 * this.dayMix
            : (1.15 + Math.sin(flicker * 2.2 + i * 1.7) * 0.18) * (1 - 0.3 * this.dayMix);
        });
      }

      // The town hall clock keeps the visitor's own time.
      const minute = new Date().getMinutes();
      if (minute !== this.clockMinute) {
        this.clockMinute = minute;
        this.clockTick();
      }

      if (this.bubble && performance.now() > this.bubble.expires) {
        this.clearBubble();
      }

      this.controls.update();
      this.renderer.info.reset();

      // Re-solve label collisions a few times a second; ease opacity every frame.
      if (this.frame % 6 === 0) this.layoutLabels();
      this.frame += 1;
      for (const box of this.labelBoxes) {
        const material = box.label.material;
        const target = (box.label.userData.target as number) ?? 0;
        material.opacity += (target - material.opacity) * Math.min(dt * 10, 1);
        box.label.visible = material.opacity > 0.02;
      }

      if (this.shadowRefresh > 0) {
        this.shadowRefresh -= 1;
        this.renderer.shadowMap.needsUpdate = true;
      }
      this.composer.render();
      this.watchFrameRate();

      if (firstFrame) {
        firstFrame = false;
        this.events.onReady();
      }
    });
  }
}
