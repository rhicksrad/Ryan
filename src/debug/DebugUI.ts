import type { World } from '../world/World';

export class DebugUI {
  constructor(private world: World) {}

  init() {
    if (!import.meta.env.DEV) return;
    const info = document.createElement('div');
    info.style.position = 'fixed';
    info.style.top = '72px';
    info.style.right = '16px';
    info.style.padding = '0.5rem 0.75rem';
    info.style.background = 'rgba(0,0,0,0.5)';
    info.style.color = '#fff';
    info.style.fontSize = '0.75rem';
    info.style.borderRadius = '8px';
    info.style.zIndex = '50';
    info.textContent = 'Debug: H to home, 1-5 to islands';
    document.body.appendChild(info);
    setTimeout(() => info.remove(), 6000);
  }
}
