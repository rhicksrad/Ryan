import { PerspectiveCamera, Vector3 } from 'three';
import type { WebGLRenderer } from 'three';
import { Hotspot } from './Hotspot';

type LabelEntry = {
  name: string;
  hotspot: Hotspot;
  element: HTMLButtonElement;
};

export class Labels {
  private entries: LabelEntry[] = [];
  private hiddenButtonsLayer: HTMLElement;

  constructor(
    private container: HTMLElement,
    private camera: PerspectiveCamera,
    private renderer: WebGLRenderer,
    private onSelect: (hotspot: Hotspot) => void
  ) {
    this.container.classList.add('world-labels');
    this.hiddenButtonsLayer = document.createElement('div');
    this.hiddenButtonsLayer.className = 'visually-hidden';
    this.container.appendChild(this.hiddenButtonsLayer);
  }

  register(name: string, hotspot: Hotspot): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'world-label';
    button.textContent = hotspot.label;
    button.setAttribute('aria-label', hotspot.ariaLabel);
    button.style.position = 'absolute';
    button.style.transform = 'translate(-50%, -50%)';
    button.style.pointerEvents = 'auto';
    button.addEventListener('click', () => this.onSelect(hotspot));
    button.addEventListener('focus', () => this.onSelect(hotspot));
    this.container.appendChild(button);

    const hiddenButton = document.createElement('button');
    hiddenButton.type = 'button';
    hiddenButton.textContent = hotspot.label;
    hiddenButton.className = 'visually-hidden-focusable';
    hiddenButton.addEventListener('click', () => this.onSelect(hotspot));
    this.hiddenButtonsLayer.appendChild(hiddenButton);

    this.entries.push({ name, hotspot, element: button });
  }

  setActive(name: string | null): void {
    this.entries.forEach((entry) => {
      entry.element.setAttribute('aria-current', entry.name === name ? 'true' : 'false');
    });
  }

  update(): void {
    const { width, height } = this.renderer.domElement.getBoundingClientRect();
    const vector = new Vector3();
    this.entries.forEach(({ hotspot, element }) => {
      hotspot.getWorldPosition(vector);
      vector.project(this.camera);
      const x = (vector.x * 0.5 + 0.5) * width;
      const y = (vector.y * -0.5 + 0.5) * height;
      const distance = this.camera.position.distanceTo(hotspot.getWorldPosition(new Vector3()));
      const visible = vector.z > -1 && vector.z < 1 && distance > 2;
      element.style.display = visible ? 'inline-flex' : 'none';
      if (!visible) return;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    });
  }
}
