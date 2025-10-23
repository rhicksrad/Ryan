import type { HotspotDefinition, HotspotUpdateContext, RouteName } from '../types';
import type { Object3D } from 'three';

export class Hotspot extends EventTarget {
  name: string;
  route: RouteName;
  ariaLabel: string;
  mesh: Object3D;
  hitArea: Object3D;
  interestKey: HotspotDefinition['interestKey'];
  summary: string;
  onEnter: () => void;
  onClick: () => void;
  update?: (context: HotspotUpdateContext) => void;

  constructor(definition: HotspotDefinition) {
    super();
    this.name = definition.name;
    this.route = definition.route;
    this.ariaLabel = definition.ariaLabel;
    this.mesh = definition.mesh;
    this.hitArea = definition.hitArea;
    this.interestKey = definition.interestKey;
    this.summary = definition.summary;
    this.hitArea.userData.hotspot = this;

    this.onEnter = () => this.trigger('enter');
    this.onClick = () => this.trigger('click');
  }

  setUpdate(callback: (context: HotspotUpdateContext) => void) {
    this.update = callback;
  }

  trigger(event: 'enter' | 'click') {
    const detail = { route: this.route };
    this.dispatchEvent(new CustomEvent(event, { detail }));
    document.dispatchEvent(new CustomEvent(`hotspot-${event}`, { detail }));
  }
}
