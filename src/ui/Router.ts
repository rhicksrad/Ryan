import type { RouteName } from '../types';

type Listener = (route: RouteName) => void;

const ROUTE_TITLES: Record<RouteName, string> = {
  '#home': 'Ryan 3D World',
  '#cooking': 'Ryan 3D World — Cooking',
  '#it': 'Ryan 3D World — IT',
  '#gardening': 'Ryan 3D World — Gardening',
  '#ai': 'Ryan 3D World — AI',
  '#music': 'Ryan 3D World — Music',
  '#projects': 'Ryan 3D World — Projects',
  '#writing': 'Ryan 3D World — Writing',
  '#talks': 'Ryan 3D World — Talks',
  '#resume': 'Ryan 3D World — Resume',
  '#contact': 'Ryan 3D World — Contact'
};

export class Router {
  private listeners = new Set<Listener>();
  private current: RouteName = '#home';

  constructor() {
    window.addEventListener('hashchange', () => this.handleChange());
    if (!window.location.hash) {
      window.location.hash = '#home';
    }
    this.handleChange();
  }

  private handleChange() {
    const hash = (window.location.hash || '#home') as RouteName;
    if (!ROUTE_TITLES[hash]) {
      window.location.hash = '#home';
      return;
    }
    this.current = hash;
    document.title = ROUTE_TITLES[hash];
    for (const listener of this.listeners) {
      listener(hash);
    }
  }

  onChange(listener: Listener) {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  go(route: RouteName) {
    if (route === '#resume') {
      window.open('/resume.html', '_blank', 'noopener');
      return;
    }
    if (route === '#contact') {
      document.dispatchEvent(
        new CustomEvent('ryan-world-contact-intent', {
          detail: { route }
        })
      );
    }
    if (window.location.hash !== route) {
      window.location.hash = route;
    } else {
      this.handleChange();
    }
  }

  getRoute(): RouteName {
    return this.current;
  }
}
