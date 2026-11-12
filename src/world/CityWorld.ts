import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { WorldData, Project } from '../data';
import { createBuilding, type BuildingHandle } from './buildings';
import {
  createStars,
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
  applyTints
} from './environment';
import { buildCityPlan, type CityPlan } from './cityplan';
import { createPerson, updatePerson, citizenCount, type Person } from './people';
import { createTraffic, type Traffic } from './cars';
import { bubbleSprite } from './textures';
import { bakeStatic, bakedGlow } from './bake';

/** Everything that changes between night and day, lerped by a single mix factor. */
const NIGHT = {
  sky: new THREE.Color('#0a0f1e'),
  skyTop: new THREE.Color('#04060e'),
  skyBottom: new THREE.Color('#141b33'),
  bloom: 0.7,
  bloomThreshold: 0.86,
  fog: 0.55, // fog density × overview distance, so haze scales with the town
  ambient: new THREE.Color(0x5a6aa0),
  ambientIntensity: 1.55,
  hemiSky: new THREE.Color(0x5a6aa0),
  hemiGround: new THREE.Color(0x191d2c),
  hemiIntensity: 1.25,
  sun: new THREE.Color(0xa8b8ff),
  sunIntensity: 1.15,
  water: new THREE.Color(0x4c5c78)
};
const DAY = {
  sky: new THREE.Color('#8fb8dd'),
  skyTop: new THREE.Color('#2a6fc4'),
  skyBottom: new THREE.Color('#c4def2'),
  bloom: 0.18,
  bloomThreshold: 1.0,
  fog: 0.2,
  ambient: new THREE.Color(0xc4d2e8),
  ambientIntensity: 1.05,
  hemiSky: new THREE.Color(0xcfe4ff),
  hemiGround: new THREE.Color(0x6a7a8a),
  hemiIntensity: 0.9,
  sun: new THREE.Color(0xfff2d8),
  sunIntensity: 2.7,
  water: new THREE.Color(0xcfe2f6)
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

const OVERVIEW_TARGET = new THREE.Vector3(0, 4, 0);
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
  private spireRings: THREE.Mesh[] = [];
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
  private starsMaterial!: THREE.PointsMaterial;
  private skyDomeMaterial!: THREE.ShaderMaterial;
  private bloomPass!: UnrealBloomPass;
  private composer!: EffectComposer;
  private waterMaterial!: THREE.MeshStandardMaterial;
  private lampBulbMaterial!: THREE.MeshStandardMaterial;
  private lampGlowMaterials: { material: THREE.Material; base: number }[] = [];
  private nightWindows: { mat: THREE.MeshStandardMaterial; base: number; dim: number }[] = [];
  private labelBoxes: { id: string; label: THREE.Sprite; priority: number; halfW: number; halfH: number }[] = [];
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
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // refreshed every other frame in the loop
    this.renderer.info.autoReset = false; // count draw calls across all composer passes
    this.renderer.domElement.dataset.test = 'world-canvas';
    container.appendChild(this.renderer.domElement);

    // Neutral image-based lighting so glass, metal, and water read as real PBR.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.scene.fog = new THREE.FogExp2(0x05070f, 0.0042);

    this.camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      1,
      2400
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
      new THREE.RingGeometry(1, 1.14, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.3;
    this.scene.add(this.selectionRing);

    this.plan = buildCityPlan(data);
    this.fitOverview();
    this.camera.position.copy(this.reducedMotion ? this.overviewPos : this.overviewPos.clone().multiplyScalar(1.9));
    this.buildScene();
    this.bindEvents();

    // HDR post-processing: MSAA render target + bloom + tone-mapped output.
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4
    });
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

    if (import.meta.env.DEV) {
      // Dev-only hook so e2e tests can find moving citizens on screen.
      (window as unknown as Record<string, unknown>).__cityDebug = {
        bubbleActive: () => this.bubble !== null,
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
    const { minX, maxX, minZ, maxZ } = this.plan.bounds;
    const halfX = (maxX - minX) / 2 + 6;
    const halfZ = (maxZ - minZ) / 2 + 6;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = this.camera.aspect;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    // On a tall screen, stand at the east end and look down the town's long axis.
    const portrait = aspect < 1;
    const across = portrait ? halfZ : halfX;
    const deep = portrait ? halfX : halfZ;
    const pitch = THREE.MathUtils.degToRad(portrait ? 40 : 33);
    // Wide enough for the span across, tall enough for the foreshortened depth.
    const forWidth = across / Math.tan(hFov / 2) + deep * Math.cos(pitch) * 0.4;
    const forDepth = (deep * Math.sin(pitch) + 18) / Math.tan(vFov / 2);
    const dist = Math.max(forWidth, forDepth);
    const out = Math.cos(pitch) * dist;
    this.overviewPos.set(portrait ? out : 0, OVERVIEW_TARGET.y + Math.sin(pitch) * dist, portrait ? 0 : out);
  }

  private buildScene(): void {
    this.ambientLight = new THREE.AmbientLight(0x46548c, 1.6);
    this.scene.add(this.ambientLight);
    this.hemiLight = new THREE.HemisphereLight(0x46548c, 0x10131f, 1.1);
    this.scene.add(this.hemiLight);
    this.sunLight = new THREE.DirectionalLight(0x93a7ff, 0.85);
    this.sunLight.position.set(90, 140, -70);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 460;
    this.sunLight.shadow.camera.left = -170;
    this.sunLight.shadow.camera.right = 170;
    this.sunLight.shadow.camera.top = 170;
    this.sunLight.shadow.camera.bottom = -170;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.03;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const skyDome = createSkyDome();
    skyDome.mesh.userData.skipShadow = true;
    this.scene.add(skyDome.mesh);
    this.skyDomeMaterial = skyDome.material;

    const stars = createStars();
    this.scene.add(stars.points);
    this.starsMaterial = stars.material;

    this.city.position.set(-this.plan.center.x, 0, -this.plan.center.z);
    this.scene.add(this.city);

    this.city.add(createBlocks(this.plan));
    this.city.add(createRoads(this.plan));
    const river = createRiver(this.plan);
    this.city.add(river.group);
    this.riverUpdate = river.update;
    this.waterMaterial = river.waterMaterial;
    this.city.add(createTrees(this.plan));

    const outskirts = createOutskirts(this.plan);
    this.city.add(outskirts.group);
    this.outskirtsUpdate = outskirts.update;

    const lampField = createLampField([...this.plan.lamps, ...outskirts.lamps]);
    this.lampBulbMaterial = lampField.bulbMaterial;
    this.lampGlowMaterials = lampField.glowMaterials;
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

    const terrain = createTerrain();
    terrain.userData.noCast = true; // flat ground: receive only
    this.scene.add(terrain);

    // Buildings and their citizens.
    const centroids = new Map<string, { sum: THREE.Vector3; n: number }>();
    for (const placement of this.plan.placements) {
      const handle = createBuilding(placement.project, placement.district, placement.towerRank);
      handle.group.position.set(placement.lot.x, 0.18, placement.lot.z);
      this.city.add(handle.group);
      this.buildings.set(placement.project.id, handle);
      this.pickMeshes.push(...handle.pickMeshes);

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
      const labelScale = handle.label.scale;
      this.labelBoxes.push({
        id: placement.project.id,
        label: handle.label,
        priority: placement.project.commits,
        halfW: labelScale.x / 2,
        halfH: labelScale.y / 2
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
          handle.footprint * 0.9 + 1.6,
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
    this.spireRings = spire.rings;
    this.pickMeshes.push(...spire.pickMeshes);

    bakeStatic(this.city);
    this.enableShadows();
  }

  /** Solid opaque meshes cast + receive; thin/transparent decals only receive. */
  private enableShadows(): void {
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return; // InstancedMesh extends Mesh
      if (obj.userData.skipShadow) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        return;
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const transparent = mats.some((m) => (m as THREE.Material).transparent);
      obj.castShadow = !transparent && !obj.userData.noCast;
      obj.receiveShadow = true;
    });
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
        mat.emissiveIntensity = handle.baseEmissive[i] * (active ? 2.4 : 1);
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

  focusProject(id: string): void {
    const handle = this.buildings.get(id);
    if (!handle) return;
    const pos = handle.group.position.clone().add(this.city.position);
    const outward = pos.clone().setY(0);
    if (outward.lengthSq() < 1) outward.set(0, 0, 1);
    outward.normalize();
    // Nudge the framing right so the building sits left of the info panel.
    const right = new THREE.Vector3(outward.z, 0, -outward.x);
    const portrait = this.camera.aspect < 1;
    const dist = (12 + handle.footprint * 2 + handle.height * 0.75) * (portrait ? 1.35 : 1);
    // Desktop: the panel sits on the right, so slide the building left.
    // Phone: the panel is a bottom sheet, so lift the building into the top half.
    const toTarget = new THREE.Vector3(pos.x, handle.height * 0.45, pos.z);
    if (portrait) toTarget.y -= dist * 0.22;
    else toTarget.add(right.clone().multiplyScalar(dist * 0.2));
    const toPos = new THREE.Vector3(pos.x, 0, pos.z)
      .add(right.clone().multiplyScalar(portrait ? 0 : dist * 0.2))
      .add(outward.multiplyScalar(dist))
      .setY(Math.max(handle.height * 0.7 + 6, 9));
    this.atOverview = false;
    this.startTween(toPos, toTarget);
  }

  focusDistrict(id: string): void {
    const center = this.districtCenters.get(id);
    if (!center) return;
    const outward = center.clone().setY(0);
    if (outward.lengthSq() < 1) outward.set(0, 0, 1);
    outward.normalize();
    const toTarget = center.clone().setY(3);
    const back = this.camera.aspect < 1 ? 78 : 54;
    const toPos = center.clone().add(outward.multiplyScalar(back)).setY(back * 0.8);
    this.atOverview = false;
    this.startTween(toPos, toTarget);
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
    fog.density = THREE.MathUtils.lerp(NIGHT.fog, DAY.fog, k) / this.overviewPos.length();

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

    this.starsMaterial.opacity = 0.95 * night;
    applyTints(k);
    bakedGlow.value = 1 - 0.8 * k;
    this.waterMaterial.color.lerpColors(NIGHT.water, DAY.water, k);
    this.waterMaterial.emissiveIntensity = 0.9 * night + 0.15;
    // Grazing-angle reflections of the studio environment read as a white sheet at night.
    this.waterMaterial.envMapIntensity = 0.12 + 0.88 * k;

    this.lampBulbMaterial.emissiveIntensity = 3.4 * night + 0.1;
    for (const glow of this.lampGlowMaterials) {
      glow.material.opacity = glow.base * night;
      glow.material.visible = night > 0.01;
    }
    for (const { mat, base, dim } of this.nightWindows) mat.emissiveIntensity = base * (1 - dim * k);
    for (const { mat, base } of this.headlights) mat.emissiveIntensity = base * (1 - 0.7 * k);
  }

  focusAbout(): void {
    const plaza = this.toWorld(this.plan.plaza.x, this.plan.plaza.z);
    this.atOverview = false;
    this.startTween(
      plaza.clone().add(new THREE.Vector3(16, 26, 34)),
      plaza.clone().setY(15)
    );
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
    this.fitOverview();
    (this.scene.fog as THREE.FogExp2).density =
      THREE.MathUtils.lerp(NIGHT.fog, DAY.fog, this.dayMix) / this.overviewPos.length();
    if (this.atOverview) this.startTween(this.overviewPos.clone(), OVERVIEW_TARGET.clone());
  }

  /**
   * Labels fade in as the camera approaches, then yield to one another: the
   * selected or hovered project always shows, and bigger projects win ties, so
   * names never pile up into an unreadable stack.
   */
  private layoutLabels(): void {
    const shown: { x: number; y: number; halfW: number; halfH: number }[] = [];
    const aspect = this.camera.aspect;
    const candidates = this.labelBoxes
      .map((box) => {
        const handle = this.buildings.get(box.id)!;
        const world = box.label.getWorldPosition(new THREE.Vector3());
        const distance = this.camera.position.distanceTo(world);
        const near = 1 - THREE.MathUtils.clamp((distance - LABEL_NEAR) / (LABEL_FAR - LABEL_NEAR), 0, 1);
        const forced = box.id === this.hoveredId || box.id === this.selectedId;
        const ndc = world.project(this.camera);
        void handle;
        return { box, near, forced, ndc };
      })
      .sort((a, b) => Number(b.forced) - Number(a.forced) || b.box.priority - a.box.priority);

    for (const { box, near, forced, ndc } of candidates) {
      let target = forced ? 1 : Math.min(1, near * 3);
      if (ndc.z > 1) target = 0;
      // Sprite scale is in view-height units; convert to NDC half-extents.
      const halfW = (box.halfW * 2) / aspect / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
      const halfH = (box.halfH * 2) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
      if (target > 0.02) {
        const clash = shown.some(
          (s) => Math.abs(s.x - ndc.x) < s.halfW + halfW + 0.01 && Math.abs(s.y - ndc.y) < s.halfH + halfH + 0.012
        );
        if (clash && !forced) target = 0;
        else shown.push({ x: ndc.x, y: ndc.y, halfW, halfH });
      }
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
    if (this.slowFrames > 45 && this.pixelRatio > 1) {
      this.slowFrames = 0;
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.composer.setPixelRatio(this.pixelRatio);
    }
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

      // Sky brightness tracks day/night even when motion is reduced.
      this.skyUpdate(t, this.dayMix, !this.reducedMotion);

      if (!this.reducedMotion) {
        this.spireRings.forEach((ring, i) => {
          ring.rotation.z = t * (0.2 + i * 0.07);
        });
        this.riverUpdate(t);
        this.outskirtsUpdate(t);
        this.traffic?.update(dt);
        for (const person of this.people) {
          updatePerson(person, t, dt);
        }
        for (const handle of this.buildings.values()) {
          handle.billboards.forEach((mat, i) => {
            // Lettered boards flicker like LED panels; printed posters are steadily floodlit.
            if (mat.userData.poster) mat.color.setScalar(0.4 + 0.6 * this.dayMix);
            mat.emissiveIntensity = mat.userData.poster
              ? 0.3 - 0.05 * this.dayMix
              : (1.15 + Math.sin(t * 2.2 + i * 1.7) * 0.18) * (1 - 0.3 * this.dayMix);
          });
          if (handle.craneJib) {
            handle.craneJib.rotation.y = t * 0.16 + handle.height;
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

      this.renderer.shadowMap.needsUpdate = this.frame % 2 === 0;
      this.composer.render();
      this.watchFrameRate();

      if (firstFrame) {
        firstFrame = false;
        this.events.onReady();
      }
    });
  }
}
