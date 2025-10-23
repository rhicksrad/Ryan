import type { Object3D } from 'three';

export interface HotspotConfig {
  name: string;
  ariaLabel: string;
  mesh: Object3D;
  hitArea?: Object3D;
  onEnter?: () => void;
  onLeave?: () => void;
  onClick?: () => void;
  onUpdate?: (delta: number) => void;
  route: '#home' | '#cooking' | '#it' | '#gardening' | '#ai' | '#music' | '#gaming';
}

export class Hotspot {
  public readonly name: string;
  public readonly ariaLabel: string;
  public readonly mesh: Object3D;
  public readonly hitArea: Object3D;
  public readonly route: HotspotConfig['route'];
  private readonly enter?: () => void;
  private readonly leave?: () => void;
  private readonly click?: () => void;
  private readonly update?: (delta: number) => void;

  constructor(config: HotspotConfig) {
    this.name = config.name;
    this.ariaLabel = config.ariaLabel;
    this.mesh = config.mesh;
    this.hitArea = config.hitArea ?? config.mesh;
    this.route = config.route;
    this.enter = config.onEnter;
    this.leave = config.onLeave;
    this.click = config.onClick;
    this.update = config.onUpdate;
  }

  onEnter(): void {
    this.enter?.();
  }

  onLeave(): void {
    this.leave?.();
  }

  onClick(): void {
    this.click?.();
  }

  onUpdate(delta: number): void {
    this.update?.(delta);
  }
}
