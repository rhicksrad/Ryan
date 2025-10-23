const ROUTE_TITLES = {
  '#home': 'Home',
  '#cooking': 'Cooking Island',
  '#it': 'IT Lab',
  '#gardening': 'Garden Retreat',
  '#ai': 'AI Hub',
  '#music': 'Music Studio',
  '#gaming': 'Gaming Nexus',
  '#projects': 'Projects',
  '#writing': 'Writing',
  '#talks': 'Talks',
  '#resume': 'Resume',
  '#contact': 'Contact'
} as const;

export type RouteName = keyof typeof ROUTE_TITLES;

interface RouterOptions {
  onChange: (route: RouteName) => void;
}

export interface RouterController {
  current: RouteName;
  navigate(route: RouteName): void;
}

function normalize(hash: string): RouteName {
  return (Object.keys(ROUTE_TITLES).includes(hash) ? hash : '#home') as RouteName;
}

export function createRouter(options: RouterOptions): RouterController {
  const { onChange } = options;

  function applyTitle(route: RouteName): void {
    const suffix = ROUTE_TITLES[route];
    document.title = suffix ? `Ryan 3D World — ${suffix}` : 'Ryan 3D World';
  }

  function emit(route: RouteName): void {
    applyTitle(route);
    onChange(route);
  }

  const controller: RouterController = {
    get current() {
      return normalize(window.location.hash || '#home');
    },
    navigate(route: RouteName) {
      if (controller.current === route) {
        emit(route);
      } else {
        window.location.hash = route;
      }
    }
  };

  window.addEventListener('hashchange', () => {
    const route = controller.current;
    emit(route);
  });

  const initial = controller.current;
  if (!window.location.hash) {
    window.location.hash = initial;
  }
  emit(initial);

  return controller;
}
