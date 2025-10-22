import {
  AmbientLight,
  Clock,
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
  SRGBColorSpace,
  Vector2,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ProfileContent } from '../types.d.ts';
import { Hotspot } from './Hotspot';
import { createGrillIsland } from './islands/GrillIsland';
import { createITRackIsland } from './islands/ITRackIsland';
import { createGardenIsland } from './islands/GardenIsland';
import { createAIHubIsland } from './islands/AIHubIsland';
import { createMusicIsland } from './islands/MusicIsland';
import { AssetLoader } from '../utils/AssetLoader';
import { AudioController } from '../utils/Audio';
import { CameraRig } from './CameraRig';
import { Labels } from './Labels';
import { createSky } from './Sky';
import { DebugUI } from '../debug/DebugUI';

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  content: ProfileContent;
  assets: AssetLoader;
  audio: AudioController;
  reducedMotion: () => boolean;
  onHotspotSelected: (id: string) => void;
}

export class World {
  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private hotspots = new Map<string, Hotspot>();
  private labels: Labels;
  private clock = new Clock();
  private debug: DebugUI;
  private animating = true;
  private cameraRig: CameraRig;
  private hovered: Hotspot | null = null;
  private hotspotNames = new Map<Hotspot, string>();

  constructor(private options: WorldOptions) {
    const { canvas } = options;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.scene = new Scene();
    this.scene.background = new Color(0x0c1821);
    this.scene.fog = new Fog(0x0c1821, 30, 120);

    this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 10, 20);

    this.cameraRig = new CameraRig(this.camera, options.reducedMotion);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 42;
    this.controls.minPolarAngle = 0.3;
    this.controls.maxPolarAngle = Math.PI / 2.1;

    const ambient = new AmbientLight(0x7bd88f, 0.6);
    const directional = new DirectionalLight(0xffffff, 1.2);
    directional.position.set(12, 24, 12);
    directional.castShadow = false;
    this.scene.add(ambient, directional);

    const ground = new Mesh(
      new PlaneGeometry(160, 160, 32, 32),
      new MeshStandardMaterial({ color: 0x1f2a33 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = false;
    this.scene.add(ground);

    const sky = createSky();
    this.scene.add(sky);

    const labelContainer = document.createElement('div');
    labelContainer.setAttribute('aria-hidden', 'false');
    canvas.parentElement?.appendChild(labelContainer);

    this.labels = new Labels(labelContainer, this.camera, this.renderer, (hotspot) => {
      const name = this.hotspotNames.get(hotspot);
      if (name) {
        this.options.onHotspotSelected(name);
      }
    });

    this.createIslands();

    const debug = new URLSearchParams(location.search).get('debug') === '1';
    this.debug = new DebugUI(debug);

    this.bindEvents();
    this.pointer.set(1000, 1000);
    this.animate();
  }

  private createIslands() {
    const group = new Group();
    const { content, assets, audio } = this.options;

    const grill = createGrillIsland({
      content,
      assets,
      audio,
      reducedMotion: this.options.reducedMotion
    });
    grill.group.position.set(10, 0, 0);
    this.registerHotspot('cooking', grill.hotspot);
    group.add(grill.group);

    const rack = createITRackIsland({
      content,
      assets,
      audio,
      reducedMotion: this.options.reducedMotion
    });
    rack.group.position.set(-10, 0, 0);
    this.registerHotspot('it', rack.hotspot);
    group.add(rack.group);

    const garden = createGardenIsland({
      content,
      assets,
      audio,
      reducedMotion: this.options.reducedMotion
    });
    garden.group.position.set(0, 0, -10);
    this.registerHotspot('gardening', garden.hotspot);
    group.add(garden.group);

    const ai = createAIHubIsland({
      content,
      assets,
      audio,
      reducedMotion: this.options.reducedMotion
    });
    ai.group.position.set(-4, 0, -6);
    this.registerHotspot('ai', ai.hotspot);
    group.add(ai.group);

    const music = createMusicIsland({
      content,
      assets,
      audio,
      reducedMotion: this.options.reducedMotion
    });
    music.group.position.set(0, 0, 8);
    this.registerHotspot('music', music.hotspot);
    group.add(music.group);

    this.scene.add(group);
  }

  private registerHotspot(name: string, hotspot: Hotspot) {
    this.hotspots.set(name, hotspot);
    this.hotspotNames.set(hotspot, name);
    this.labels.register(name, hotspot);
    hotspot.on('click', () => this.options.onHotspotSelected(name));
  }

  private bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      this.animating = document.visibilityState !== 'hidden';
      if (this.animating) {
        this.clock.getDelta();
        this.animate();
      }
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('click', () => this.onClick());
    canvas.addEventListener('pointerleave', () => {
      if (this.hovered) {
        this.hovered.setHoverState(false);
        this.hovered = null;
        this.labels.setActive(null);
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'h' || event.key === 'H') {
        this.options.onHotspotSelected('home');
      }
      const keys = ['1', '2', '3', '4', '5'];
      const names = ['cooking', 'it', 'gardening', 'ai', 'music'];
      const index = keys.indexOf(event.key);
      if (index >= 0) {
        this.options.onHotspotSelected(names[index]);
      }
    });
  }

  private onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private onPointerMove(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onClick() {
    if (this.hovered) {
      this.hovered.click();
    }
  }

  private updateHover() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = Array.from(this.hotspots.values())
      .map((spot) => ({
        spot,
        intersection: this.raycaster.intersectObject(spot.hitArea, false)[0]
      }))
      .filter((entry) => entry.intersection)
      .sort((a, b) => a.intersection!.distance - b.intersection!.distance);

    const first = intersects[0]?.spot ?? null;
    if (first !== this.hovered) {
      if (this.hovered) this.hovered.setHoverState(false);
      this.hovered = first;
      if (this.hovered) {
        this.hovered.setHoverState(true);
        const current = this.hotspotNames.get(this.hovered) ?? null;
        this.labels.setActive(current);
      } else {
        this.labels.setActive(null);
      }
    }
  }

  private animate = () => {
    if (!this.animating) return;
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this.controls.enableDamping = !this.options.reducedMotion();
    this.controls.update();
    this.cameraRig.update(delta);
    this.updateHover();
    this.renderer.render(this.scene, this.camera);
    this.labels.update();
    this.debug.update();
  };

  focus(name: string, immediate = false) {
    if (name === 'home') {
      this.cameraRig.animateTo('home', { immediate });
      this.labels.setActive(null);
      return;
    }
    const hotspot = this.hotspots.get(name);
    if (!hotspot) return;
    switch (name) {
      case 'cooking':
        this.cameraRig.animateTo('cooking', { immediate });
        break;
      case 'it':
        this.cameraRig.animateTo('it', { immediate });
        break;
      case 'gardening':
        this.cameraRig.animateTo('gardening', { immediate });
        break;
      case 'ai':
        this.cameraRig.animateTo('ai', { immediate });
        break;
      case 'music':
        this.cameraRig.animateTo('music', { immediate });
        break;
    }
    this.labels.setActive(name);
  }
}
