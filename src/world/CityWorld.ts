import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WorldData, Project } from '../data';
import { createBuilding, type BuildingHandle } from './buildings';
import {
  createStars,
  createTerrain,
  createBlocks,
  createRoads,
  createRiver,
  createTrees,
  createLamps,
  createSigns,
  createSpire
} from './environment';
import { buildCityPlan, planCenterX, type CityPlan } from './cityplan';
import { createPerson, updatePerson, citizenCount, type Person } from './people';
import { bubbleSprite } from './textures';

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

const OVERVIEW_POS = new THREE.Vector3(0, 72, 134);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);
const LABEL_NEAR = 40;
const LABEL_FAR = 92;

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
  private pickMeshes: THREE.Mesh[] = [];
  private spireRings: THREE.Mesh[] = [];
  private riverUpdate: (t: number) => void = () => {};
  private districtCenters = new Map<string, THREE.Vector3>();

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.domElement.dataset.test = 'world-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#05070f');
    this.scene.fog = new THREE.FogExp2(0x05070f, 0.0042);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      1400
    );
    this.camera.position.copy(this.reducedMotion ? OVERVIEW_POS : OVERVIEW_POS.clone().multiplyScalar(1.9));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(OVERVIEW_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 300;
    this.controls.enablePan = false;

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.14, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.3;
    this.scene.add(this.selectionRing);

    this.plan = buildCityPlan(data);
    this.buildScene();
    this.bindEvents();

    if (import.meta.env.DEV) {
      // Dev-only hook so e2e tests can find moving citizens on screen.
      (window as unknown as Record<string, unknown>).__cityDebug = {
        bubbleActive: () => this.bubble !== null,
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
        toPos: OVERVIEW_POS.clone(),
        fromTarget: OVERVIEW_TARGET.clone(),
        toTarget: OVERVIEW_TARGET.clone(),
        start: performance.now() + 250,
        duration: 2600
      };
    }
  }

  /** City-plan coordinates → world coordinates (plan is recentered on the origin). */
  private toWorld(x: number, z: number, y = 0): THREE.Vector3 {
    return new THREE.Vector3(x - planCenterX(), y, z);
  }

  private buildScene(): void {
    this.scene.add(new THREE.AmbientLight(0x46548c, 1.6));
    this.scene.add(new THREE.HemisphereLight(0x46548c, 0x10131f, 1.1));
    const moon = new THREE.DirectionalLight(0x93a7ff, 0.85);
    moon.position.set(70, 110, -50);
    this.scene.add(moon);

    this.scene.add(createStars());

    this.city.position.x = -planCenterX();
    this.scene.add(this.city);

    this.city.add(createBlocks());
    this.city.add(createRoads(this.plan));
    const river = createRiver(this.plan);
    this.city.add(river.group);
    this.riverUpdate = river.update;
    this.city.add(createTrees(this.plan));
    this.city.add(createLamps(this.plan));
    this.city.add(createSigns(this.plan));

    const terrain = createTerrain();
    this.scene.add(terrain);

    // Buildings and their citizens.
    const centroids = new Map<string, { sum: THREE.Vector3; n: number }>();
    for (const placement of this.plan.placements) {
      const handle = createBuilding(placement.project, placement.district);
      handle.group.position.set(placement.lot.x, 0.18, placement.lot.z);
      this.city.add(handle.group);
      this.buildings.set(placement.project.id, handle);
      this.pickMeshes.push(...handle.pickMeshes);

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
    const toTarget = new THREE.Vector3(pos.x, handle.height * 0.4, pos.z).add(right.clone().multiplyScalar(3.5));
    const toPos = toTarget
      .clone()
      .add(outward.multiplyScalar(12 + handle.footprint * 2 + handle.height * 0.55))
      .setY(Math.max(handle.height * 0.9 + 7, 9));
    this.startTween(toPos, toTarget);
  }

  focusDistrict(id: string): void {
    const center = this.districtCenters.get(id);
    if (!center) return;
    const outward = center.clone().setY(0);
    if (outward.lengthSq() < 1) outward.set(0, 0, 1);
    outward.normalize();
    const toTarget = center.clone().setY(3);
    const toPos = center.clone().add(outward.multiplyScalar(46)).setY(38);
    this.startTween(toPos, toTarget);
  }

  focusOverview(): void {
    this.startTween(OVERVIEW_POS.clone(), OVERVIEW_TARGET.clone());
  }

  focusAbout(): void {
    const plaza = this.toWorld(this.plan.plaza.x, this.plan.plaza.z);
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

      if (!this.reducedMotion) {
        this.spireRings.forEach((ring, i) => {
          ring.rotation.z = t * (0.2 + i * 0.07);
        });
        this.riverUpdate(t);
        for (const person of this.people) {
          updatePerson(person, t, dt);
        }
        for (const handle of this.buildings.values()) {
          handle.billboards.forEach((mat, i) => {
            mat.emissiveIntensity = 1.15 + Math.sin(t * 2.2 + i * 1.7) * 0.18;
          });
        }
        const ringMat = this.selectionRing.material as THREE.MeshBasicMaterial;
        if (ringMat.opacity > 0) {
          ringMat.opacity = 0.6 + Math.sin(t * 3) * 0.25;
        }
      }

      if (this.bubble && performance.now() > this.bubble.expires) {
        this.clearBubble();
      }

      // Labels fade in as the camera approaches; hovered/selected stay visible.
      for (const [id, handle] of this.buildings) {
        const world = handle.group.position.clone().add(this.city.position);
        const distance = this.camera.position.distanceTo(world);
        const near = 1 - THREE.MathUtils.clamp((distance - LABEL_NEAR) / (LABEL_FAR - LABEL_NEAR), 0, 1);
        const forced = id === this.hoveredId || id === this.selectedId ? 1 : 0;
        handle.label.material.opacity = Math.max(near * 0.92, forced);
        handle.label.visible = handle.label.material.opacity > 0.02;
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);

      if (firstFrame) {
        firstFrame = false;
        this.events.onReady();
      }
    });
  }
}
