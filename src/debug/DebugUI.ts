export class DebugUI {
  private container: HTMLDivElement | null = null;
  private fpsEl: HTMLSpanElement | null = null;
  private last = performance.now();
  private frames = 0;

  constructor(enabled: boolean) {
    if (!enabled) return;
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.bottom = '1rem';
    this.container.style.right = '1rem';
    this.container.style.padding = '0.5rem 0.75rem';
    this.container.style.background = 'rgba(0,0,0,0.6)';
    this.container.style.color = '#fff';
    this.container.style.fontFamily = 'monospace';
    this.container.style.fontSize = '0.75rem';
    this.container.style.zIndex = '20';
    this.container.innerHTML = 'FPS: <span>0</span>';
    this.fpsEl = this.container.querySelector('span');
    document.body.appendChild(this.container);
  }

  update(): void {
    if (!this.container || !this.fpsEl) return;
    this.frames++;
    const now = performance.now();
    if (now - this.last >= 1000) {
      this.fpsEl.textContent = String(this.frames);
      this.frames = 0;
      this.last = now;
    }
  }
}
