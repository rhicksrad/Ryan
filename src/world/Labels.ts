import { Vector3 } from 'three';
import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { Hotspot } from './Hotspot';
import type { RouteName } from '../types';

const WORLD_POSITION = new Vector3();

export class Labels {
  private container: HTMLElement;
  private buttons = new Map<Hotspot, HTMLButtonElement>();
  private cameraDistanceThreshold = 4;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'labels';
    document.body.appendChild(this.container);
  }

  setHotspots(hotspots: Hotspot[], onSelect: (hotspot: Hotspot) => void) {
    this.container.innerHTML = '';
    this.buttons.clear();

    for (const hotspot of hotspots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = hotspot.name;
      button.setAttribute('aria-label', hotspot.ariaLabel);
      button.addEventListener('click', () => onSelect(hotspot));
      button.addEventListener('pointerenter', () => hotspot.onEnter());
      button.addEventListener('focus', () => hotspot.onEnter());
      this.container.appendChild(button);
      this.buttons.set(hotspot, button);
    }
  }

  update(camera: PerspectiveCamera, renderer: WebGLRenderer, activeRoute: RouteName) {
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;

    for (const [hotspot, button] of this.buttons.entries()) {
      hotspot.mesh.getWorldPosition(WORLD_POSITION);
      const distance = camera.position.distanceTo(WORLD_POSITION);
      if (distance < this.cameraDistanceThreshold) {
        button.style.display = 'none';
        continue;
      }
      const projected = WORLD_POSITION.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      if (projected.z > 1) {
        button.style.display = 'none';
        continue;
      }
      button.style.display = 'block';
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      button.setAttribute('aria-current', hotspot.route === activeRoute ? 'true' : 'false');
    }
  }
}
