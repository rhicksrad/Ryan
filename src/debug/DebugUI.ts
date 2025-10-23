import type { PerspectiveCamera } from 'three';

export class DebugUI {
  private readonly element: HTMLPreElement;
  private readonly camera: PerspectiveCamera;
  private enabled = false;

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
    this.element = document.createElement('pre');
    this.element.style.position = 'absolute';
    this.element.style.left = '1rem';
    this.element.style.bottom = '1rem';
    this.element.style.padding = '0.5rem 0.75rem';
    this.element.style.background = 'rgba(15, 23, 42, 0.75)';
    this.element.style.borderRadius = '0.75rem';
    this.element.style.fontSize = '0.75rem';
    this.element.style.pointerEvents = 'none';
    this.element.style.whiteSpace = 'pre-wrap';
    if (new URLSearchParams(window.location.search).get('debug') === '1') {
      this.enable();
    }
  }

  attach(container: HTMLElement): void {
    if (this.enabled) {
      container.appendChild(this.element);
    }
  }

  enable(): void {
    this.enabled = true;
  }

  update(): void {
    if (!this.enabled) {
      return;
    }
    const { x, y, z } = this.camera.position;
    this.element.textContent = `Camera\n  x: ${x.toFixed(2)}\n  y: ${y.toFixed(2)}\n  z: ${z.toFixed(2)}`;
  }
}
