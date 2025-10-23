import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Clock,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AssetLoader } from '../utils/AssetLoader';
import { AudioController } from '../utils/Audio';
import { Labels } from './Labels';
import { Hotspot } from './Hotspot';
import { CameraRig, CameraRoute } from './CameraRig';
import { Sky } from './Sky';
import { createGrillIsland } from './islands/GrillIsland';
import { createITRackIsland } from './islands/ITRackIsland';
import { createGardenIsland } from './islands/GardenIsland';
import { createAIHubIsland } from './islands/AIHubIsland';
import { createMusicIsland } from './islands/MusicIsland';
import type { IslandHotspotBundle } from './islands/types';
import type { RouteName } from '../ui/Router';

interface WorldOptions {
  container: HTMLElement;
  assetLoader: AssetLoader;
  audio: AudioController;
  prefersReducedMotion: boolean;
}

type HoverCallback = (hotspot: Hotspot | null) => void;
type ClickCallback = (hotspot: Hotspot) => void;
type FirstFrameCallback = () => void;

export class World {
  private readonly container: HTMLElement;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly assetLoader: AssetLoader;
  private readonly audio: AudioController;
  private readonly labels: Labels;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly hoverCallbacks = new Set<HoverCallback>();
  private readonly clickCallbacks = new Set<ClickCallback>();
  private readonly firstFrameCallbacks = new Set<FirstFrameCallback>();
  private readonly hotspots: Hotspot[] = [];
  private readonly updates: ((delta: number) => void)[] = [];
  private readonly clock = new Clock();
  private readonly sky: Sky;
  private readonly rig: CameraRig;
  private hovered: Hotspot | null = null;
  private firstFrame = false;
  private prefersReducedMotion: boolean;
  private hidden = false;

  constructor(options: WorldOptions) {
    this.container = options.container;
    this.assetLoader = options.assetLoader;
    this.audio = options.audio;
    this.prefersReducedMotion = options.prefersReducedMotion;

    this.scene = new Scene();
    this.scene.background = new Color(0xcfe8ff);
    this.scene.fog = new FogExp2(0xcfe8ff, 0.015);

    this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.dataset.test = 'world-canvas';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxDistance = 24;
    this.controls.minDistance = 6;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.screenSpacePanning = true;

    const ambient = new AmbientLight(0xffffff, 0.75);
    this.scene.add(ambient);
    const directional = new DirectionalLight(0xffffff, 0.85);
    directional.position.set(-4, 14, 10);
    this.scene.add(directional);

    this.buildLandscape();

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.labels = new Labels({
      container: this.container,
      onHover: (hotspot) => this.handleHover(hotspot),
      onClick: (hotspot) => this.handleClick(hotspot)
    });

    const radius = 9.5;
    const placements: Array<{ angle: number; create: () => IslandHotspotBundle }> = [
      {
        angle: 0,
        create: () => createGrillIsland({ assetLoader: this.assetLoader, audio: this.audio, reducedMotion: this.prefersReducedMotion })
      },
      { angle: (Math.PI * 2) / 5, create: () => createITRackIsland({ audio: this.audio, reducedMotion: this.prefersReducedMotion }) },
      { angle: (Math.PI * 4) / 5, create: () => createGardenIsland({ audio: this.audio, reducedMotion: this.prefersReducedMotion }) },
      { angle: (Math.PI * 6) / 5, create: () => createAIHubIsland({ audio: this.audio, reducedMotion: this.prefersReducedMotion }) },
      { angle: (Math.PI * 8) / 5, create: () => createMusicIsland({ audio: this.audio, reducedMotion: this.prefersReducedMotion }) }
    ];

    for (const placement of placements) {
      const { main: hotspot, extras = [] } = placement.create();
      const x = Math.cos(placement.angle) * radius;
      const z = Math.sin(placement.angle) * radius;
      hotspot.mesh.position.set(x, 0, z);
      hotspot.mesh.rotation.y = -placement.angle + Math.PI / 2;
      hotspot.hitArea.userData.hotspot = hotspot;
      this.scene.add(hotspot.mesh);
      this.hotspots.push(hotspot);
      this.labels.add(hotspot);
      this.updates.push((delta) => hotspot.onUpdate(delta));
      for (const extra of extras) {
        extra.hitArea.userData.hotspot = extra;
        this.hotspots.push(extra);
        this.updates.push((delta) => extra.onUpdate(delta));
      }
    }

    this.rig = new CameraRig({
      camera: this.camera,
      prefersReducedMotion: this.prefersReducedMotion,
      onTargetChange: (target) => {
        this.controls.target.copy(target);
      }
    });

    this.bindEvents();
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.renderFrame());
  }

  getCamera(): PerspectiveCamera {
    return this.camera;
  }

  onHotspotHover(callback: HoverCallback): () => void {
    this.hoverCallbacks.add(callback);
    return () => this.hoverCallbacks.delete(callback);
  }

  onHotspotClick(callback: ClickCallback): () => void {
    this.clickCallbacks.add(callback);
    return () => this.clickCallbacks.delete(callback);
  }

  onFirstFrame(callback: FirstFrameCallback): () => void {
    this.firstFrameCallbacks.add(callback);
    return () => this.firstFrameCallbacks.delete(callback);
  }

  setRoute(route: RouteName, immediate = false): void {
    const cameraRoute = this.routeToCamera(route);
    if (cameraRoute) {
      if (immediate) {
        this.rig.jumpTo(cameraRoute);
      } else {
        this.rig.animateTo(cameraRoute);
      }
    }
    const focusRoute = cameraRoute === '#home' ? null : cameraRoute;
    this.labels.setActive(focusRoute);
  }

  dispose(): void {
    this.renderer.dispose();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.renderer.setAnimationLoop(null);
  }

  private routeToCamera(route: RouteName): CameraRoute | null {
    switch (route) {
      case '#cooking':
      case '#it':
      case '#gardening':
      case '#ai':
      case '#music':
        return route;
      default:
        return '#home';
    }
  }

  private bindEvents(): void {
    this.renderer.domElement.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.renderer.domElement.addEventListener('click', () => this.handlePointerClick());
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  private handlePointerMove(event: PointerEvent): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.castRay();
  }

  private handlePointerClick(): void {
    if (this.hovered) {
      this.handleClick(this.hovered);
    }
  }

  private handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleVisibility = (): void => {
    this.hidden = document.hidden;
    if (!this.hidden) {
      this.clock.start();
    }
  };

  private castRay(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.hotspots.map((hotspot) => hotspot.hitArea), false);
    if (intersections.length > 0) {
      const object = intersections[0].object;
      const hotspot: Hotspot | undefined = (object.userData.hotspot || object.parent?.userData.hotspot) as Hotspot | undefined;
      if (hotspot && hotspot !== this.hovered) {
        this.handleHover(hotspot);
      }
    } else if (this.hovered) {
      this.handleHover(null);
    }
  }

  private handleHover(hotspot: Hotspot | null): void {
    if (hotspot === this.hovered) {
      return;
    }
    if (this.hovered) {
      this.hovered.onLeave();
    }
    this.hovered = hotspot;
    if (hotspot) {
      hotspot.onEnter();
    }
    for (const callback of this.hoverCallbacks) {
      callback(hotspot);
    }
  }

  private handleClick(hotspot: Hotspot): void {
    hotspot.onClick();
    for (const callback of this.clickCallbacks) {
      callback(hotspot);
    }
  }

  private renderFrame(): void {
    if (this.hidden) {
      return;
    }
    if (!this.clock.running) {
      this.clock.start();
    }
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.controls.update();
    this.rig.update(delta);
    this.sky.update(delta);
    for (const update of this.updates) {
      update(delta);
    }
    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    this.labels.update(this.camera, width, height);
    this.renderer.render(this.scene, this.camera);
    if (!this.firstFrame) {
      this.firstFrame = true;
      for (const callback of this.firstFrameCallbacks) {
        callback();
      }
    }
  }

  private buildLandscape(): void {
    const landscape = new Group();

    const meadowMaterial = new MeshStandardMaterial({ color: 0x0f5132, roughness: 0.86, metalness: 0.05 });
    const meadow = new Mesh(new CircleGeometry(28, 96), meadowMaterial);
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.y = -0.05;
    landscape.add(meadow);

    const clearingMaterial = new MeshStandardMaterial({ color: 0x166534, roughness: 0.78, metalness: 0.06 });
    const clearing = new Mesh(new CircleGeometry(13, 72), clearingMaterial);
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.y = 0.015;
    landscape.add(clearing);

    const mossMaterial = new MeshStandardMaterial({ color: 0xa7f3d0, roughness: 0.92, metalness: 0.02, transparent: true, opacity: 0.35 });
    const mossRing = new Mesh(new CircleGeometry(9.6, 72), mossMaterial);
    mossRing.rotation.x = -Math.PI / 2;
    mossRing.position.y = 0.02;
    landscape.add(mossRing);

    const hillGeometry = new SphereGeometry(5.2, 36, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const hillMaterial = new MeshStandardMaterial({ color: 0x15803d, roughness: 0.82 });
    const hillConfigs = [
      { x: -9.2, y: 1.2, z: 6.6, sx: 1.5, sy: 0.58, sz: 1.15 },
      { x: 10.4, y: 1.05, z: -7.6, sx: 1.25, sy: 0.52, sz: 1.4 },
      { x: 6.4, y: 1.12, z: 9.8, sx: 1.18, sy: 0.54, sz: 1.3 },
      { x: -11.8, y: 0.95, z: -2.6, sx: 1.0, sy: 0.48, sz: 1.1 }
    ];
    for (const config of hillConfigs) {
      const hill = new Mesh(hillGeometry, hillMaterial);
      hill.rotation.x = Math.PI;
      hill.position.set(config.x, config.y, config.z);
      hill.scale.set(config.sx, config.sy, config.sz);
      landscape.add(hill);
    }

    const ridgeMaterial = new MeshStandardMaterial({ color: 0x14532d, roughness: 0.8 });
    for (const ridge of [
      { x: -3.8, y: 0.35, z: -10.8, sx: 7.6, sz: 3.4, ry: Math.PI * 0.08 },
      { x: 7.5, y: 0.3, z: 8.2, sx: 6.0, sz: 3.0, ry: -Math.PI * 0.14 }
    ]) {
      const berm = new Mesh(new BoxGeometry(1, 0.6, 1), ridgeMaterial);
      berm.scale.set(ridge.sx, 1, ridge.sz);
      berm.position.set(ridge.x, ridge.y, ridge.z);
      berm.rotation.y = ridge.ry;
      landscape.add(berm);
    }

    const riverMaterial = new MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      roughness: 0.14,
      metalness: 0.45,
      emissive: new Color(0x0ea5e9),
      emissiveIntensity: 0.34
    });
    const river = new Mesh(new BoxGeometry(6.2, 0.08, 24), riverMaterial);
    river.position.set(-1.6, 0.045, 0.4);
    river.rotation.y = 0.18;
    landscape.add(river);

    const riverbed = new Mesh(new BoxGeometry(6.4, 0.02, 24.2), new MeshStandardMaterial({ color: 0x0f172a, roughness: 1 }));
    riverbed.position.copy(river.position);
    riverbed.rotation.copy(river.rotation);
    riverbed.position.y -= 0.08;
    landscape.add(riverbed);

    const riverbanksMaterial = new MeshStandardMaterial({ color: 0x166534, roughness: 0.86 });
    for (const side of [-1, 1]) {
      const bank = new Mesh(new BoxGeometry(6.4, 0.24, 1.1), riverbanksMaterial);
      bank.position.copy(river.position);
      bank.position.y += 0.16;
      bank.rotation.y = river.rotation.y;
      bank.translateZ(side * 2.8);
      landscape.add(bank);
    }

    const bridge = new Mesh(new BoxGeometry(2.1, 0.12, 6.6), new MeshStandardMaterial({ color: 0xd9f99d, roughness: 0.88 }));
    bridge.position.set(-0.6, 0.08, 0.0);
    bridge.rotation.y = 0.18;
    landscape.add(bridge);

    const steppingStoneMaterial = new MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.92 });
    const steppingStoneGeometry = new CylinderGeometry(0.7, 0.85, 0.16, 12);
    for (const step of [
      { x: -4.6, z: -3.6 },
      { x: -3.4, z: -1.2 },
      { x: -2.4, z: 1.6 }
    ]) {
      const stone = new Mesh(steppingStoneGeometry, steppingStoneMaterial);
      stone.position.set(step.x, 0.09, step.z);
      landscape.add(stone);
    }

    const poolMaterial = new MeshStandardMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.75,
      roughness: 0.12,
      metalness: 0.5,
      emissive: new Color(0x38bdf8),
      emissiveIntensity: 0.32
    });
    const pool = new Mesh(new CircleGeometry(3.8, 36), poolMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-8.6, 0.025, -6.6);
    landscape.add(pool);

    const lilyGeometry = new CircleGeometry(0.35, 14);
    const lilyMaterial = new MeshStandardMaterial({ color: 0x166534, roughness: 0.6, metalness: 0.08 });
    const lilyCount = 28;
    const lilies = new InstancedMesh(lilyGeometry, lilyMaterial, lilyCount);
    const lilyDummy = new Object3D();
    for (let i = 0; i < lilyCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.6 + Math.random() * 2.4;
      lilyDummy.position.set(Math.cos(angle) * radius - 8.6, 0.03, Math.sin(angle) * radius - 6.6);
      lilyDummy.rotation.x = -Math.PI / 2;
      lilyDummy.scale.setScalar(0.8 + Math.random() * 0.6);
      lilyDummy.updateMatrix();
      lilies.setMatrixAt(i, lilyDummy.matrix);
    }
    lilies.instanceMatrix.needsUpdate = true;
    landscape.add(lilies);

    const waterfallGeometry = new PlaneGeometry(4.4, 5.6, 1, 18);
    const waterfallMaterial = new MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.82,
      roughness: 0.18,
      metalness: 0.4,
      emissive: new Color(0x7dd3fc),
      emissiveIntensity: 0.56
    });
    const waterfall = new Mesh(waterfallGeometry, waterfallMaterial);
    waterfall.position.set(-10.2, 2.9, -7.3);
    waterfall.rotation.y = Math.PI * 0.68;
    landscape.add(waterfall);

    const cascadeShelf = new Mesh(new BoxGeometry(4.8, 0.24, 1.8), new MeshStandardMaterial({ color: 0x155e75, roughness: 0.4 }));
    cascadeShelf.position.set(-8.9, 0.22, -6.9);
    cascadeShelf.rotation.y = Math.PI * 0.12;
    landscape.add(cascadeShelf);

    const mistMaterial = new MeshStandardMaterial({ color: 0xcffafe, transparent: true, opacity: 0.36, roughness: 0.6 });
    const mist = new Mesh(new CylinderGeometry(1.5, 2.3, 0.65, 24), mistMaterial);
    mist.position.set(-8.8, 0.52, -6.9);
    landscape.add(mist);

    const sprayGeometry = new BufferGeometry();
    const sprayCount = 80;
    const sprayPositionsAttr = new BufferAttribute(new Float32Array(sprayCount * 3), 3);
    const sprayOffsetsAttr = new BufferAttribute(new Float32Array(sprayCount), 1);
    const spraySpeedsAttr = new BufferAttribute(new Float32Array(sprayCount), 1);
    sprayGeometry.setAttribute('position', sprayPositionsAttr);
    sprayGeometry.setAttribute('offset', sprayOffsetsAttr);
    sprayGeometry.setAttribute('speed', spraySpeedsAttr);
    for (let i = 0; i < sprayCount; i += 1) {
      sprayOffsetsAttr.setX(i, Math.random());
      spraySpeedsAttr.setX(i, 0.8 + Math.random() * 0.6);
    }
    const sprayMaterial = new PointsMaterial({ color: 0xeff6ff, size: 0.22, transparent: true, opacity: 0.55, depthWrite: false });
    const spray = new Points(sprayGeometry, sprayMaterial);
    spray.position.set(-9.4, 1.0, -7.1);
    landscape.add(spray);

    const flowerGeometry = new ConeGeometry(0.16, 0.52, 6);
    const flowerMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.12 });
    flowerMaterial.vertexColors = true;
    const flowerCount = 260;
    const flowers = new InstancedMesh(flowerGeometry, flowerMaterial, flowerCount);
    const flowerDummy = new Object3D();
    const flowerColor = new Color();
    const flowerData: Array<{ position: Vector3; scale: number; sway: number; offset: number; hue: number; heading: number }> = [];
    for (let i = 0; i < flowerCount; i += 1) {
      const radius = 8 + Math.random() * 14;
      const angle = Math.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 0.04 + Math.random() * 0.04;
      const scale = 0.6 + Math.random() * 0.7;
      const heading = angle + Math.PI / 2;
      const hue = 0.95 - Math.random() * 0.4;
      const offset = Math.random() * Math.PI * 2;
      flowerDummy.position.set(x, y, z);
      flowerDummy.scale.setScalar(scale);
      flowerDummy.rotation.set(Math.random() * 0.2 - 0.1, heading, Math.random() * 0.2 - 0.1);
      flowerDummy.updateMatrix();
      flowers.setMatrixAt(i, flowerDummy.matrix);
      flowerColor.setHSL(hue, 0.75 + Math.random() * 0.15, 0.58 + Math.random() * 0.18);
      flowers.setColorAt(i, flowerColor);
      flowerData.push({ position: new Vector3(x, y, z), scale, sway: 0.25 + Math.random() * 0.5, offset, hue, heading });
    }
    flowers.instanceMatrix.needsUpdate = true;
    flowers.instanceColor!.needsUpdate = true;
    landscape.add(flowers);

    const fireflyGeometry = new BufferGeometry();
    const fireflyCount = 40;
    const fireflyPositionsAttr = new BufferAttribute(new Float32Array(fireflyCount * 3), 3);
    fireflyGeometry.setAttribute('position', fireflyPositionsAttr);
    const fireflyMaterial = new PointsMaterial({ color: 0xfef08a, size: 0.28, transparent: true, opacity: 0.78, depthWrite: false, sizeAttenuation: true });
    const fireflies = new Points(fireflyGeometry, fireflyMaterial);
    const fireflyData: Array<{ radius: number; height: number; speed: number; offset: number }> = [];
    for (let i = 0; i < fireflyCount; i += 1) {
      const radius = 6 + Math.random() * 9;
      const height = 1.4 + Math.random() * 2.8;
      const speed = 0.4 + Math.random() * 0.6;
      const offset = Math.random() * Math.PI * 2;
      fireflyData.push({ radius, height, speed, offset });
      fireflyPositionsAttr.setXYZ(i, Math.cos(offset) * radius, height, Math.sin(offset) * radius);
    }
    landscape.add(fireflies);

    const forest = this.createForest();
    landscape.add(forest.group);
    this.updates.push(forest.update);

    this.scene.add(landscape);

    const waterfallPositions = waterfallGeometry.attributes.position as BufferAttribute;
    const basePositions = new Float32Array(waterfallPositions.array as Float32Array);
    const waterState = { time: 0 };

    this.updates.push((delta) => {
      if (this.prefersReducedMotion) {
        return;
      }
      waterState.time += delta;
      const pulse = Math.sin(waterState.time * 1.4) * 0.08;
      riverMaterial.emissiveIntensity = 0.34 + pulse;
      poolMaterial.emissiveIntensity = 0.32 + Math.sin(waterState.time * 1.2) * 0.07;
      waterfallMaterial.emissiveIntensity = 0.56 + Math.sin(waterState.time * 2.4) * 0.12;
      mistMaterial.opacity = 0.32 + Math.sin(waterState.time * 1.8) * 0.05;
      sprayMaterial.opacity = 0.5 + Math.sin(waterState.time * 3.4) * 0.08;
      for (let i = 0; i < waterfallPositions.count; i += 1) {
        const baseIndex = i * 3;
        const baseX = basePositions[baseIndex];
        const baseY = basePositions[baseIndex + 1];
        const offset = Math.sin(waterState.time * 3 + baseY * 2.6) * 0.12;
        waterfallPositions.setX(i, baseX + offset);
      }
      waterfallPositions.needsUpdate = true;

      for (let i = 0; i < sprayCount; i += 1) {
        const offset = sprayOffsetsAttr.getX(i);
        const speed = spraySpeedsAttr.getX(i);
        const phase = (waterState.time * speed + offset) % 1;
        const height = phase * 3.2;
        const swayX = Math.sin(waterState.time * 2.2 + offset * 6) * 0.4;
        const swayZ = Math.cos(waterState.time * 2.4 + offset * 5) * 0.35;
        sprayPositionsAttr.setXYZ(i, swayX, height, swayZ);
      }
      sprayPositionsAttr.needsUpdate = true;

      const flowerColorUpdate = new Color();
      for (let i = 0; i < flowerCount; i += 1) {
        const data = flowerData[i];
        flowerDummy.position.copy(data.position);
        flowerDummy.position.y = data.position.y + Math.sin(waterState.time * 1.6 + data.offset) * 0.08;
        flowerDummy.scale.set(data.scale, data.scale * (1 + Math.sin(waterState.time * 1.4 + data.offset) * 0.22), data.scale);
        flowerDummy.rotation.set(
          Math.sin(waterState.time * 1.5 + data.offset) * data.sway * 0.35,
          data.heading,
          Math.cos(waterState.time * 1.3 + data.offset) * data.sway * 0.25
        );
        flowerDummy.updateMatrix();
        flowers.setMatrixAt(i, flowerDummy.matrix);
        const brightness = 0.55 + Math.sin(waterState.time * 2.6 + data.offset) * 0.12;
        flowerColorUpdate.setHSL(data.hue, 0.78, brightness);
        flowers.setColorAt(i, flowerColorUpdate);
      }
      flowers.instanceMatrix.needsUpdate = true;
      flowers.instanceColor!.needsUpdate = true;

      for (let i = 0; i < fireflyCount; i += 1) {
        const data = fireflyData[i];
        const angle = waterState.time * data.speed + data.offset;
        const x = Math.cos(angle) * data.radius;
        const z = Math.sin(angle) * data.radius;
        const y = data.height + Math.sin(waterState.time * 3.0 + data.offset) * 0.4;
        fireflyPositionsAttr.setXYZ(i, x, y, z);
      }
      fireflyPositionsAttr.needsUpdate = true;
      fireflyMaterial.opacity = 0.72 + Math.sin(waterState.time * 2.2) * 0.1;
    });
  }

  private createForest(): { group: Group; update: (delta: number) => void } {
    const group = new Group();

    const trunkGeometry = new CylinderGeometry(0.18, 0.25, 1.6, 6);
    const trunkMaterial = new MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.92 });
    const canopyGeometry = new ConeGeometry(0.9, 2.2, 10);
    const canopyMaterial = new MeshStandardMaterial({ color: 0x15803d, roughness: 0.65, metalness: 0.08 });

    const treeCount = 90;
    const trunks = new InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
    const canopies = new InstancedMesh(canopyGeometry, canopyMaterial, treeCount);
    const dummy = new Object3D();
    const canopyData: Array<{ position: Vector3; scale: number; rotationY: number; swayOffset: number }> = [];

    for (let i = 0; i < treeCount; i += 1) {
      const radius = 11 + Math.random() * 10;
      const angle = Math.random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const heightScale = 0.85 + Math.random() * 0.7;
      const baseY = 0.9 + Math.random() * 0.15;

      dummy.position.set(x, baseY, z);
      dummy.scale.set(1, heightScale, 1);
      dummy.rotation.set(0, angle, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      const canopyScale = heightScale * 1.15;
      const canopyY = baseY + 0.8 * heightScale + 0.6 * canopyScale;
      const rotationY = Math.random() * Math.PI * 2;
      dummy.position.set(x, canopyY, z);
      dummy.scale.setScalar(canopyScale);
      dummy.rotation.set(0, rotationY, 0);
      dummy.updateMatrix();
      canopies.setMatrixAt(i, dummy.matrix);
      canopyData.push({ position: new Vector3(x, canopyY, z), scale: canopyScale, rotationY, swayOffset: Math.random() * Math.PI * 2 });
    }

    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    group.add(trunks);
    group.add(canopies);

    const state = { time: 0 };
    const update = (delta: number) => {
      if (this.prefersReducedMotion) {
        return;
      }
      state.time += delta;
      for (let i = 0; i < canopyData.length; i += 1) {
        const data = canopyData[i];
        dummy.position.copy(data.position);
        dummy.scale.setScalar(data.scale);
        dummy.rotation.set(
          Math.sin(state.time * 1.2 + data.swayOffset) * 0.1,
          data.rotationY,
          Math.cos(state.time * 1.3 + data.swayOffset) * 0.08
        );
        dummy.updateMatrix();
        canopies.setMatrixAt(i, dummy.matrix);
      }
      canopies.instanceMatrix.needsUpdate = true;
    };

    return { group, update };
  }
}
