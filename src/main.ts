import fallbackUrl from './fallback/index.html?url';
import { supports3D } from './polyfills/webglCheck';
import { loadProfile } from './content';
import { AssetLoader } from './utils/AssetLoader';
import { AudioController } from './utils/Audio';
import { createHUD } from './ui/HUD';
import { createOverlay } from './ui/Overlay';
import { createRouter, type RouteName, type RouterController } from './ui/Router';
import { World } from './world/World';
import { DebugUI } from './debug/DebugUI';

const THEME_KEY = 'ryan-theme';
const root = document.documentElement;
root.dataset.testReady = '0';

if (!supports3D()) {
  window.location.replace(fallbackUrl);
} else {
  bootstrap().catch((error) => {
    console.error('Failed to bootstrap world', error);
    root.dataset.testReady = '0';
  });
}

async function bootstrap(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('#app container missing');
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const profile = await loadProfile();
  const assetLoader = new AssetLoader();
  const audio = new AudioController();

  const initialTheme = loadTheme();
  applyTheme(initialTheme);

  const world = new World({
    container: app,
    assetLoader,
    audio,
    prefersReducedMotion
  });

  const debug = new DebugUI(world.getCamera());
  debug.attach(app);
  const debugLoop = () => {
    debug.update();
    requestAnimationFrame(debugLoop);
  };
  requestAnimationFrame(debugLoop);

  let router: RouterController | null = null;

  const redirectToMusicHall = (): void => {
    window.open('https://rhicksrad.github.io/8Beat', '_blank', 'noopener');
  };

  const navigate = (route: RouteName) => {
    if (route === '#music') {
      redirectToMusicHall();
      if (router) {
        router.navigate('#home');
      } else {
        window.location.hash = '#home';
      }
      return;
    }
    if (router) {
      router.navigate(route);
    } else {
      window.location.hash = route;
    }
  };

  const hud = createHUD({
    container: app,
    audioMuted: audio.isMuted(),
    theme: initialTheme,
    onNavigate: (route) => navigate(route),
    onToggleTheme: (next) => {
      applyTheme(next);
      hud.setTheme(next);
    },
    onToggleAudio: (muted) => {
      audio.setMuted(muted);
      hud.setAudioMuted(muted);
      if (!muted) {
        audio.resume().catch(() => undefined);
      }
    }
  });

  const overlay = createOverlay({
    container: app,
    profile,
    onClose: () => navigate('#home'),
    onResumeRequest: () => navigate('#resume')
  });

  router = createRouter({
    onChange: (route) => handleRouteChange(route)
  });

  function handleRouteChange(route: RouteName): void {
    world.setRoute(route);
    overlay.setRoute(route);
    hud.setActive(route);
    if (route !== '#home') {
      hud.hideHint();
    }
    if (route === '#music') {
      redirectToMusicHall();
      router?.navigate('#home');
    } else if (route === '#resume') {
      window.open('resume.html', '_blank', 'noopener');
    }
  }

  if (router) {
    world.setRoute(router.current, true);
  }

  world.onFirstFrame(() => {
    root.dataset.testReady = '1';
  });

  world.onHotspotClick((hotspot) => {
    navigate(hotspot.route as RouteName);
  });

  world.onHotspotHover((hotspot) => {
    if (hotspot) {
      audio.resume().catch(() => undefined);
    }
  });

  const movementKeys: Record<string, RouteName> = {
    Digit1: '#cooking',
    Digit2: '#it',
    Digit3: '#gardening',
    Digit4: '#ai',
    Digit5: '#music'
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'h' || event.key === 'H') {
      router.navigate('#home');
    }
    const targetRoute = movementKeys[event.code];
    if (targetRoute) {
      router.navigate(targetRoute);
    }
    if (event.key === 'Escape') {
      router.navigate('#home');
    }
  });

  let hasInteracted = false;
  const markInteraction = () => {
    if (!hasInteracted) {
      hasInteracted = true;
      hud.hideHint();
      audio.resume().catch(() => undefined);
    }
  };
  window.addEventListener('pointerdown', markInteraction, { once: true });
  window.addEventListener('keydown', markInteraction, { once: true });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    const stored = localStorage.getItem(THEME_KEY);
    if (!stored) {
      applyTheme(event.matches ? 'dark' : 'light');
      hud.setTheme(event.matches ? 'dark' : 'light');
    }
  });
}

function applyTheme(theme: 'light' | 'dark'): void {
  root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.warn('Unable to persist theme', error);
  }
}

function loadTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch (error) {
    console.warn('Unable to load theme preference', error);
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
