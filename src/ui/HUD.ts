import logoUrl from '../../assets/logo.svg?url';
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

const NAV_ROUTES: Array<{ route: RouteName; label: string }> = [
  { route: '#cooking', label: 'Cooking' },
  { route: '#it', label: 'IT Lab' },
  { route: '#gardening', label: 'Gardening' },
  { route: '#ai', label: 'AI Hub' },
  { route: '#music', label: 'Music' }
];

export function createHUD(options: HudOptions): HudController {
  const { container, audioMuted, theme, onNavigate, onToggleTheme, onToggleAudio } = options;
  const root = document.createElement('section');
  root.className = 'hud';
  root.dataset.test = 'hud';

  const top = document.createElement('div');
  top.className = 'hud__top';

  const brand = document.createElement('div');
  brand.className = 'hud__brand';
  const logo = document.createElement('img');
  logo.src = logoUrl;
  logo.alt = 'Ryan mark';
  const title = document.createElement('strong');
  title.textContent = 'Ryan 3D World';
  brand.append(logo, title);
  top.appendChild(brand);

  const nav = document.createElement('nav');
  nav.className = 'hud__nav';
  nav.setAttribute('aria-label', 'Primary');
  const buttons: HTMLButtonElement[] = [];
  for (const entry of NAV_ROUTES) {
    const button = document.createElement('button');
    button.className = 'hud__button';
    button.type = 'button';
    button.textContent = entry.label;
    button.setAttribute('data-route', entry.route);
    button.addEventListener('click', () => onNavigate(entry.route));
    buttons.push(button);
    nav.appendChild(button);
  }
  top.appendChild(nav);

  const toggles = document.createElement('div');
  toggles.className = 'hud__toggles';

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
  toggles.appendChild(themeButton);

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
  toggles.appendChild(audioButton);

  const resumeButton = document.createElement('button');
  resumeButton.className = 'hud__button';
  resumeButton.type = 'button';
  resumeButton.textContent = 'Resume';
  resumeButton.addEventListener('click', () => onNavigate('#resume'));
  toggles.appendChild(resumeButton);

  const contactButton = document.createElement('button');
  contactButton.className = 'hud__button';
  contactButton.type = 'button';
  contactButton.textContent = 'Contact';
  contactButton.addEventListener('click', () => onNavigate('#contact'));
  toggles.appendChild(contactButton);

  top.appendChild(toggles);

  const hint = document.createElement('div');
  hint.className = 'hud__hint';
  hint.textContent = 'Tip: Hover an island or press 1-5 to jump.';

  root.append(top, hint);
  container.appendChild(root);

  const controller: HudController = {
    root,
    setActive(route: RouteName) {
      for (const button of buttons) {
        const isActive = button.getAttribute('data-route') === route;
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      }
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
