import '../css/styles.css';
import fallbackUrl from './fallback/index.html?url';
import { supports3D } from './polyfills/webglCheck';
import { AssetLoader } from './utils/AssetLoader';
import { AudioController } from './utils/Audio';
import { content } from './content';
import { Overlay } from './ui/Overlay';
import { Router } from './ui/Router';
import { HUD } from './ui/HUD';
import { World } from './world/World';
import { DebugUI } from './debug/DebugUI';

async function bootstrap() {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Missing app container');
  }

  if (!supports3D()) {
    window.location.replace(fallbackUrl);
    return;
  }

  const loader = new AssetLoader();
  const assets = await loader.load();

  const audio = new AudioController();
  const overlay = new Overlay(content.profile);
  const router = new Router();
  const hud = new HUD(overlay, audio, content.profile);

  const world = new World({
    container,
    content: content.profile,
    assets,
    router,
    overlay,
    hud,
    audio
  });

  const debug = new DebugUI(world);
  debug.init();

  router.onChange((route) => world.handleRoute(route));
  overlay.onRequestRoute((route) => router.go(route));
  hud.onNavigate((route) => router.go(route));
  hud.onAudioToggle(() => audio.toggle());
  audio.onChange((enabled) => hud.setAudioState(enabled));

  document.addEventListener('visibilitychange', () => {
    world.setPaused(document.hidden);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap world', error);
});
