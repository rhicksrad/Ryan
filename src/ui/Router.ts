import type { Overlay } from './Overlay';
import type { HUD } from './HUD';
import type { World } from '../world/World';

type RouteName =
  | 'home'
  | 'cooking'
  | 'it'
  | 'gardening'
  | 'ai'
  | 'music'
  | 'projects'
  | 'writing'
  | 'talks'
  | 'resume'
  | 'contact';

type RouteConfig = {
  hotspot: string | null;
  panel: RouteName | null;
};

const ROUTES: Record<RouteName, RouteConfig> = {
  home: { hotspot: 'home', panel: null },
  cooking: { hotspot: 'cooking', panel: 'cooking' },
  it: { hotspot: 'it', panel: 'it' },
  gardening: { hotspot: 'gardening', panel: 'gardening' },
  ai: { hotspot: 'ai', panel: 'ai' },
  music: { hotspot: 'music', panel: 'music' },
  projects: { hotspot: null, panel: 'projects' },
  writing: { hotspot: null, panel: 'writing' },
  talks: { hotspot: null, panel: 'talks' },
  resume: { hotspot: null, panel: 'resume' },
  contact: { hotspot: null, panel: 'contact' }
};

interface RouterOptions {
  world: World;
  overlay: Overlay;
  hud: HUD;
  reducedMotion: () => boolean;
}

export class Router {
  private current: RouteName = 'home';
  private ignoreHashChange = false;

  constructor(private options: RouterOptions) {
    window.addEventListener('hashchange', () => this.applyFromHash());
  }

  start(defaultRoute: RouteName = 'home') {
    if (!location.hash) {
      this.navigate(defaultRoute, { replace: true, immediate: true });
    } else {
      this.applyFromHash(true);
    }
  }

  navigate(route: RouteName, opts: { replace?: boolean; immediate?: boolean } = {}) {
    if (this.current === route && !opts.immediate) return;
    this.current = route;
    const hash = `#${route}`;
    this.ignoreHashChange = true;
    if (opts.replace) {
      history.replaceState(null, '', hash);
    } else {
      location.hash = hash;
    }
    this.ignoreHashChange = false;
    this.applyRoute(route, opts.immediate ?? false);
  }

  getCurrent(): RouteName {
    return this.current;
  }

  private applyFromHash(immediate = false) {
    if (this.ignoreHashChange) return;
    const hash = (location.hash || '#home').slice(1) as RouteName;
    if (!ROUTES[hash]) {
      this.navigate('home', { replace: true });
      return;
    }
    this.current = hash;
    this.applyRoute(hash, immediate);
  }

  private applyRoute(route: RouteName, immediate: boolean) {
    const config = ROUTES[route];
    if (!config) return;

    if (config.hotspot) {
      this.options.world.focus(config.hotspot, immediate || this.options.reducedMotion());
      localStorage.setItem('ryan.lastHotspot', config.hotspot);
    } else if (route === 'home') {
      this.options.world.focus('home', true);
    }

    if (config.panel) {
      this.options.overlay.open(config.panel);
    } else {
      this.options.overlay.close();
    }

    this.options.hud.setActive(route);
  }
}

export type { RouteName };
