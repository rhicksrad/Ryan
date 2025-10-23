import { supports3D } from './polyfills/webglCheck';
import { loadContent } from './content';
import { AssetLoader } from './utils/AssetLoader';
import { AudioController } from './utils/Audio';
import { Overlay } from './ui/Overlay';
import { HUD } from './ui/HUD';
import { Router, type RouteName } from './ui/Router';
import { World } from './world/World';

type Theme = 'light' | 'dark';

document.querySelectorAll('[data-js="year"]').forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
const allowMotion = localStorage.getItem('ryan.motion.allow') === 'true';
const isDev = import.meta.env.DEV;
const shouldFallback =
  !isDev && (!supports3D() || (reducedMotionMedia.matches && !allowMotion));

if (shouldFallback) {
  window.location.replace('fallback/index.html');
} else {
  (async () => {
    const content = await loadContent();
    const assets = new AssetLoader();
    await assets.preload();
    const audio = new AudioController();

    const overlayRoot = document.getElementById('overlay-root');
    const hudRoot = document.getElementById('hud-root');
    const canvas = document.getElementById('world') as HTMLCanvasElement | null;
    if (!overlayRoot || !hudRoot || !canvas) {
      throw new Error('Missing required DOM nodes');
    }

    let router: Router;
    let hud: HUD;

    const overlay = new Overlay(overlayRoot, content, {
      onClose: () => {
        if (!location.hash || location.hash === '#home') {
          router.navigate('home', { replace: true });
        }
      }
    });

    const storedTheme = (localStorage.getItem('ryan.theme') as Theme | null) ?? null;
    let currentTheme: Theme = storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const applyTheme = (theme: Theme) => {
      currentTheme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('ryan.theme', theme);
      hud?.setTheme(theme);
    };

    const storedMotion = localStorage.getItem('ryan.motion.disabled');
    let motionDisabled = storedMotion ? storedMotion === 'true' : reducedMotionMedia.matches;

    hud = new HUD(hudRoot, {
      onNavigate: (route) => router.navigate(route as RouteName),
      onThemeToggle: () => {
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
      },
      onAudioToggle: () => {
        const muted = audio.toggleMute();
        hud.setAudioMuted(muted);
      },
      onMotionToggle: () => {
        motionDisabled = !motionDisabled;
        localStorage.setItem('ryan.motion.disabled', String(motionDisabled));
        hud.setMotionDisabled(motionDisabled);
      }
    });

    applyTheme(currentTheme);
    hud.setAudioMuted(audio.isMuted());
    hud.setMotionDisabled(motionDisabled);

    const world = new World({
      canvas,
      content,
      assets,
      audio,
      reducedMotion: () => motionDisabled,
      onHotspotSelected: (id) => router.navigate(id as RouteName)
    });

    router = new Router({
      world,
      overlay,
      hud,
      reducedMotion: () => motionDisabled
    });

    const lastHotspot = (localStorage.getItem('ryan.lastHotspot') as RouteName) || 'home';
    router.start(lastHotspot);

    window.addEventListener('pointerdown', () => audio.resume(), { once: true });
  })();
}
