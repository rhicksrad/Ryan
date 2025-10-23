import type { RouteName } from './Router';

interface HudOptions {
  container: HTMLElement;
  audioMuted: boolean;
  theme: 'light' | 'dark';
  onNavigate: (route: RouteName) => void;
  onToggleTheme: (next: 'light' | 'dark') => void;
  onToggleAudio: (muted: boolean) => void;
}

interface HudController {
  root: HTMLElement;
  setActive(route: RouteName): void;
  hideHint(): void;
  setAudioMuted(muted: boolean): void;
  setTheme(theme: 'light' | 'dark'): void;
}

export function createHUD(options: HudOptions): HudController {
  const { container, audioMuted, theme, onNavigate, onToggleTheme, onToggleAudio } = options;
  const root = document.createElement('section');
  root.className = 'hud';
  root.dataset.test = 'hud';

  const controls = document.createElement('div');
  controls.className = 'hud__controls';

  const controlPanel = document.createElement('div');
  controlPanel.className = 'hud__control-panel';

  const themeButton = document.createElement('button');
  themeButton.className = 'hud__button';
  themeButton.type = 'button';
  themeButton.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  themeButton.textContent = theme === 'dark' ? 'Dark' : 'Light';
  themeButton.title = 'Toggle theme';
  themeButton.addEventListener('click', () => {
    const next = themeButton.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark';
    themeButton.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
    themeButton.textContent = next === 'dark' ? 'Dark' : 'Light';
    onToggleTheme(next);
  });
  controlPanel.appendChild(themeButton);

  const audioButton = document.createElement('button');
  audioButton.className = 'hud__button';
  audioButton.type = 'button';
  audioButton.setAttribute('aria-pressed', audioMuted ? 'false' : 'true');
  audioButton.textContent = audioMuted ? 'Unmute' : 'Mute';
  audioButton.title = 'Toggle audio';
  audioButton.addEventListener('click', () => {
    const currentlyMuted = audioButton.getAttribute('aria-pressed') === 'false';
    const nextMuted = !currentlyMuted;
    onToggleAudio(nextMuted);
  });
  controlPanel.appendChild(audioButton);

  const resumeButton = document.createElement('button');
  resumeButton.className = 'hud__button';
  resumeButton.type = 'button';
  resumeButton.textContent = 'Resume';
  resumeButton.addEventListener('click', () => onNavigate('#resume'));
  controlPanel.appendChild(resumeButton);

  const contactButton = document.createElement('button');
  contactButton.className = 'hud__button';
  contactButton.type = 'button';
  contactButton.textContent = 'Contact';
  contactButton.addEventListener('click', () => onNavigate('#contact'));
  controlPanel.appendChild(contactButton);

  controls.appendChild(controlPanel);

  const hint = document.createElement('div');
  hint.className = 'hud__hint';
  hint.textContent = 'Tip: Hover an island or press 1-6 to jump.';

  root.append(controls, hint);
  container.appendChild(root);

  const controller: HudController = {
    root,
    setActive() {
      // No active state when the top navigation is removed.
    },
    hideHint() {
      hint.dataset.hidden = 'true';
    },
    setAudioMuted(muted: boolean) {
      audioButton.textContent = muted ? 'Unmute' : 'Mute';
      audioButton.setAttribute('aria-pressed', muted ? 'false' : 'true');
    },
    setTheme(nextTheme: 'light' | 'dark') {
      themeButton.setAttribute('aria-pressed', nextTheme === 'dark' ? 'true' : 'false');
      themeButton.textContent = nextTheme === 'dark' ? 'Dark' : 'Light';
    }
  };

  return controller;
}
