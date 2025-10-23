import { Camera, Vector3 } from 'three';
import type { Hotspot } from './Hotspot';

interface LabelsOptions {
  container: HTMLElement;
  onHover: (hotspot: Hotspot | null) => void;
  onClick: (hotspot: Hotspot) => void;
}

interface LabelEntry {
  hotspot: Hotspot;
  element: HTMLButtonElement;
  screenPosition: Vector3;
}

export class Labels {
  private readonly entries: LabelEntry[] = [];
  private readonly container: HTMLElement;
  private readonly onHover: (hotspot: Hotspot | null) => void;
  private readonly onClick: (hotspot: Hotspot) => void;
  private readonly temp = new Vector3();

  constructor(options: LabelsOptions) {
    this.container = document.createElement('div');
    this.container.className = 'label-container';
    options.container.appendChild(this.container);
    this.onHover = options.onHover;
    this.onClick = options.onClick;
  }

  add(hotspot: Hotspot): void {
    const button = document.createElement('button');
    button.className = 'label';
    button.type = 'button';
    button.textContent = hotspot.name;
    button.setAttribute('aria-label', hotspot.ariaLabel);
    button.setAttribute('data-route', hotspot.route);
    button.addEventListener('focus', () => this.onHover(hotspot));
    button.addEventListener('blur', () => this.onHover(null));
    button.addEventListener('mouseenter', () => this.onHover(hotspot));
    button.addEventListener('mouseleave', () => this.onHover(null));
    button.addEventListener('click', () => this.onClick(hotspot));
    this.container.appendChild(button);
    this.entries.push({ hotspot, element: button, screenPosition: new Vector3() });
  }

  update(camera: Camera, width: number, height: number): void {
    for (const entry of this.entries) {
      const { hotspot, element, screenPosition } = entry;
      this.temp.setFromMatrixPosition(hotspot.mesh.matrixWorld);
      screenPosition.copy(this.temp);
      screenPosition.project(camera);
      const visible = screenPosition.z > -1 && screenPosition.z < 1;
      if (!visible) {
        element.style.display = 'none';
        continue;
      }
      element.style.display = 'flex';
      const x = (screenPosition.x + 1) / 2 * width;
      const y = (1 - screenPosition.y) / 2 * height;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    }
  }

  setActive(route: string | null): void {
    for (const entry of this.entries) {
      entry.element.dataset.active = entry.hotspot.route === route ? 'true' : 'false';
    }
  }
}
