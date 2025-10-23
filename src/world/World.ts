import {
  AmbientLight,
  CircleGeometry,
  Clock,
  Color,
  DirectionalLight,
  FogExp2,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
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
    this.scene.background = new Color(0x0f172a);
    this.scene.fog = new FogExp2(0x0f172a, 0.025);

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

    const ambient = new AmbientLight(0xffffff, 0.65);
    this.scene.add(ambient);
    const directional = new DirectionalLight(0xffffff, 0.8);
    directional.position.set(6, 12, 8);
    this.scene.add(directional);

    const ground = new Mesh(
      new CircleGeometry(24, 48),
      new MeshStandardMaterial({ color: 0x334155, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.labels = new Labels({
      container: this.container,
      onHover: (hotspot) => this.handleHover(hotspot),
      onClick: (hotspot) => this.handleClick(hotspot)
    });

    const radius = 9.5;
    const placements: Array<{ angle: number; create: () => Hotspot }> = [
      { angle: 0, create: () => createGrillIsland({ assetLoader: this.assetLoader, audio: this.audio, reducedMotion: this.prefersReducedMotion }) },
      { angle: (Math.PI * 2) / 5, create: () => createITRackIsland({ audio: this.audio, reducedMotion: this.prefersReducedMotion }) },
      { angle: (Math.PI * 4) / 5, create: () => createGardenIsland({ audio: this.audio, reducedMotion: this.prefersReducedMotion }) },
      { angle: (Math.PI * 6) / 5, create: () => createAIHubIsland({ audio: this.audio, reducedMotion: this.prefersReducedMotion }) },
      { angle: (Math.PI * 8) / 5, create: () => createMusicIsland({ audio: this.audio, reducedMotion: this.prefersReducedMotion }) }
    ];

    for (const placement of placements) {
      const hotspot = placement.create();
      const x = Math.cos(placement.angle) * radius;
      const z = Math.sin(placement.angle) * radius;
      hotspot.mesh.position.set(x, 0, z);
      hotspot.mesh.rotation.y = -placement.angle + Math.PI / 2;
      hotspot.hitArea.userData.hotspot = hotspot;
      this.scene.add(hotspot.mesh);
      this.hotspots.push(hotspot);
      this.labels.add(hotspot);
      this.updates.push((delta) => hotspot.onUpdate(delta));
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
}
