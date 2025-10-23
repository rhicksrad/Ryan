import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  Clock,
  SRGBColorSpace,
  PCFSoftShadowMap
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LoadedAssets, ProfileContent, RouteName } from '../types';
import { CameraRig } from './CameraRig';
import { createSky } from './Sky';
import { Labels } from './Labels';
import { Hotspot } from './Hotspot';
import * as GrillIsland from './islands/GrillIsland';
import * as ITRackIsland from './islands/ITRackIsland';
import * as GardenIsland from './islands/GardenIsland';
import * as AIHubIsland from './islands/AIHubIsland';
import * as MusicIsland from './islands/MusicIsland';
import type { AudioController } from '../utils/Audio';
import type { Router } from '../ui/Router';
import type { Overlay } from '../ui/Overlay';
import type { HUD } from '../ui/HUD';

interface WorldOptions {
  container: HTMLElement;
  content: ProfileContent;
  assets: LoadedAssets;
  router: Router;
  overlay: Overlay;
  hud: HUD;
  audio: AudioController;
}

const ISLAND_ROUTES: RouteName[] = ['#cooking', '#it', '#gardening', '#ai', '#music'];

export class World {
  private scene = new Scene();
  private camera = new PerspectiveCamera(55, 1, 0.1, 400);
  private renderer = new WebGLRenderer({ antialias: true, alpha: false });
  private controls: OrbitControls;
  private cameraRig: CameraRig;
  private labels = new Labels();
  private hotspots: Hotspot[] = [];
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private hovered: Hotspot | null = null;
  private clock = new Clock();
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private paused = false;
  private islandGroup = new Group();

  constructor(private options: WorldOptions) {
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 34;
    this.controls.enablePan = true;

    this.camera.position.set(0, 10, 22);
    this.controls.target.set(0, 2, 0);

    this.cameraRig = new CameraRig(this.camera, this.controls);

    this.scene.background = new Color('#0b0f18');
    this.scene.fog = new Fog('#0b0f18', 20, 120);

    this.setupLights();
    this.setupGround();
    this.scene.add(createSky());
    this.scene.add(this.islandGroup);

    this.options.container.appendChild(this.renderer.domElement);
    this.onResize();

    this.populateIslands();
    this.labels.setHotspots(this.hotspots, (hotspot) => this.options.router.go(hotspot.route));

    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('pointermove', (event: PointerEvent) => this.onPointerMove(event));
    this.renderer.domElement.addEventListener('click', () => this.onClick());
    window.addEventListener('keydown', (event) => this.onKeyDown(event));

    this.cameraRig.setReducedMotion(this.reducedMotion);
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotionQuery.addEventListener('change', (event) => {
      this.reducedMotion = event.matches;
      this.cameraRig.setReducedMotion(this.reducedMotion);
    });

    this.start();
  }

  private setupLights() {
    const ambient = new AmbientLight('#f0f4ff', 0.5);
    this.scene.add(ambient);

    const directional = new DirectionalLight('#f6f8ff', 1.1);
    directional.position.set(12, 18, 8);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 1024;
    directional.shadow.mapSize.height = 1024;
    directional.shadow.camera.near = 4;
    directional.shadow.camera.far = 60;
    this.scene.add(directional);
  }

  private setupGround() {
    const groundGeometry = new PlaneGeometry(60, 60, 1, 1);
    const groundMaterial = new MeshStandardMaterial({
      color: '#1b2435',
      roughness: 0.8,
      metalness: 0.1,
      bumpScale: 0.2
    });
    groundMaterial.bumpMap = this.options.assets.noiseTexture;
    const ground = new Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = 0;
    this.scene.add(ground);
  }

  private populateIslands() {
    const radius = 14;
    const angleStep = (Math.PI * 2) / ISLAND_ROUTES.length;
    const { content, assets } = this.options;

    const factories = [
      GrillIsland.create,
      ITRackIsland.create,
      GardenIsland.create,
      AIHubIsland.create,
      MusicIsland.create
    ];

    factories.forEach((factory, index) => {
      const angle = index * angleStep;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const hotspot = factory(this.islandGroup, content, assets);
      hotspot.mesh.position.set(x, 0, z);
      hotspot.mesh.lookAt(0, 0.5, 0);
      this.hotspots.push(hotspot);
      hotspot.addEventListener('enter', () => this.handleHotspotEnter(hotspot));
      hotspot.addEventListener('click', () => this.options.router.go(hotspot.route));
      const target = new Vector3().copy(hotspot.mesh.position).setY(2);
      const cameraPos = new Vector3().copy(hotspot.mesh.position).setLength(radius + 6).setY(8);
      this.cameraRig.addPose(hotspot.route, cameraPos, target);
    });

    const homePos = new Vector3(0, 12, radius + 6);
    const homeTarget = new Vector3(0, 3, 0);
    this.cameraRig.addPose('#home', homePos, homeTarget);
    ['#projects', '#writing', '#talks', '#contact'].forEach((route) => {
      this.cameraRig.addPose(route as RouteName, homePos, homeTarget);
    });
  }

  private start() {
    this.clock.start();
    const loop = () => {
      if (!this.paused) {
        const delta = Math.min(this.clock.getDelta(), 1 / 30);
        this.update(delta);
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (!paused) {
      this.clock.getDelta();
    }
  }

  private update(delta: number) {
    this.cameraRig.update(delta);
    this.controls.update();
    this.renderHotspots(delta);
    this.labels.update(this.camera, this.renderer, this.options.router.getRoute());
    this.renderer.render(this.scene, this.camera);
  }

  private renderHotspots(delta: number) {
    const elapsed = this.clock.elapsedTime;
    const audioActive = this.options.audio.isEnabled();
    for (const hotspot of this.hotspots) {
      hotspot.update?.({ delta, elapsed, reducedMotion: this.reducedMotion, audioActive });
    }
  }

  private onResize() {
    const { clientWidth, clientHeight } = this.options.container;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  private onPointerMove(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycast();
  }

  private onClick() {
    if (this.hovered) {
      this.options.router.go(this.hovered.route);
    }
  }

  private raycast() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.hotspots.map((h) => h.hitArea), false);
    if (intersections.length > 0) {
      const hotspot = (intersections[0].object as Mesh).userData.hotspot as Hotspot;
      if (hotspot && hotspot !== this.hovered) {
        this.hovered = hotspot;
        hotspot.onEnter();
        this.options.hud.announce(hotspot.summary);
        this.options.audio.playHoverTone();
      }
    } else {
      this.hovered = null;
    }
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.key.toLowerCase() === 'h') {
      this.options.router.go('#home');
      return;
    }
    const index = Number(event.key) - 1;
    if (index >= 0 && index < ISLAND_ROUTES.length) {
      this.options.router.go(ISLAND_ROUTES[index]);
    }
  }

  private handleHotspotEnter(hotspot: Hotspot) {
    this.options.overlay.announceHover(hotspot.summary);
  }

  handleRoute(route: RouteName) {
    if (route === '#resume') {
      return;
    }
    if (route === '#home') {
      this.options.overlay.close();
    } else {
      this.options.overlay.open(route);
    }
    this.options.hud.setActive(route);
    this.cameraRig.animateTo(route);
  }
}
