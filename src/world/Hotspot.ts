import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3
} from 'three';

type HotspotEvent = 'enter' | 'leave' | 'click';

type Handler = (hotspot: Hotspot) => void;

export interface HotspotOptions {
  name: string;
  label: string;
  onEnter?: () => void;
  onClick?: () => void;
  annotations?: string[];
  ariaLabel?: string;
}

export class Hotspot {
  public readonly group: Group;
  public readonly hitArea: Mesh;
  public readonly annotations: string[];
  public readonly label: string;
  public readonly ariaLabel: string;
  private readonly handlers: Record<HotspotEvent, Set<Handler>> = {
    enter: new Set(),
    leave: new Set(),
    click: new Set()
  };
  private readonly center = new Vector3();
  private hovering = false;

  constructor(group: Group, options: HotspotOptions) {
    this.group = group;
    this.annotations = options.annotations ?? [];
    this.label = options.label;
    this.ariaLabel = options.ariaLabel ?? options.label;
    const bounds = new Box3().setFromObject(group);
    const size = bounds.getSize(new Vector3());
    const geometry = new BoxGeometry(Math.max(1, size.x), Math.max(1, size.y), Math.max(1, size.z));
    const material = new MeshBasicMaterial({ visible: false });
    this.hitArea = new Mesh(geometry, material);
    this.hitArea.position.copy(bounds.getCenter(new Vector3()));
    this.hitArea.name = `${options.name}-hit`; 
    this.group.add(this.hitArea);
    if (options.onClick) {
      this.on('click', () => options.onClick?.());
    }
    if (options.onEnter) {
      this.on('enter', () => options.onEnter?.());
    }
  }

  on(type: HotspotEvent, handler: Handler): void {
    this.handlers[type].add(handler);
  }

  off(type: HotspotEvent, handler: Handler): void {
    this.handlers[type].delete(handler);
  }

  emit(type: HotspotEvent): void {
    this.handlers[type].forEach((handler) => handler(this));
  }

  setHoverState(hovering: boolean): void {
    if (this.hovering === hovering) return;
    this.hovering = hovering;
    this.emit(hovering ? 'enter' : 'leave');
  }

  click(): void {
    this.emit('click');
  }

  getWorldPosition(target = new Vector3()): Vector3 {
    return new Box3().setFromObject(this.group).getCenter(target);
  }
}
