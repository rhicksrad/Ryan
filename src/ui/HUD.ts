import logoUrl from '../../assets/logo.svg?url';
import type { InterestKey, ProfileContent, RouteName } from '../types';
import { AudioController } from '../utils/Audio';
import { Overlay } from './Overlay';

const ISLAND_ROUTES: { route: RouteName; key: InterestKey; label: string; shortcut: string }[] = [
  { route: '#cooking', key: 'cooking', label: 'Cooking', shortcut: '1' },
  { route: '#it', key: 'it', label: 'IT', shortcut: '2' },
  { route: '#gardening', key: 'gardening', label: 'Gardening', shortcut: '3' },
  { route: '#ai', key: 'ai', label: 'AI', shortcut: '4' },
  { route: '#music', key: 'music', label: 'Music', shortcut: '5' }
];

type NavListener = (route: RouteName) => void;

type Theme = 'system' | 'light' | 'dark';

type AudioListener = () => boolean;

type ThemeListener = (theme: Theme) => void;

export class HUD {
  private container: HTMLElement;
  private nav: HTMLElement;
  private hint: HTMLElement;
  private navListener: NavListener | null = null;
  private audioListener: AudioListener | null = null;
  private themeListener: ThemeListener | null = null;
  private audioButton: HTMLButtonElement;
  private themeButton: HTMLButtonElement;
  private activeRoute: RouteName = '#home';
  private theme: Theme = (localStorage.getItem('ryan-world-theme') as Theme) || 'system';

  constructor(
    private readonly overlay: Overlay,
    private readonly audio: AudioController,
    profile: ProfileContent
  ) {
    this.container = document.createElement('header');
    this.container.className = 'hud';

    const logoLink = document.createElement('a');
    logoLink.href = '#home';
    logoLink.className = 'hud__logo';
    logoLink.innerHTML = `<img src="${logoUrl}" width="32" height="32" alt="Ryan logo" />`;
    const logoText = document.createElement('span');
    logoText.textContent = `${profile.name}`;
    logoLink.append(logoText);
    logoLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.emitNav('#home');
    });

    this.nav = document.createElement('nav');
    this.nav.className = 'hud__nav';

    for (const island of ISLAND_ROUTES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.route = island.route;
      button.textContent = `${island.label}`;
      button.setAttribute('aria-label', `${island.label} (press ${island.shortcut})`);
      button.addEventListener('click', () => this.emitNav(island.route));
      this.nav.appendChild(button);
    }

    const projects = this.createNavButton('#projects', 'Projects');
    const writing = this.createNavButton('#writing', 'Writing');
    const talks = this.createNavButton('#talks', 'Talks');
    const contact = this.createNavButton('#contact', 'Contact');

    this.nav.append(projects, writing, talks, contact);

    const toggles = document.createElement('div');
    toggles.className = 'hud__toggles';

    this.themeButton = document.createElement('button');
    this.themeButton.className = 'hud__toggle';
    this.themeButton.type = 'button';
    this.themeButton.setAttribute('aria-label', 'Toggle theme');
    this.themeButton.addEventListener('click', () => this.toggleTheme());

    this.audioButton = document.createElement('button');
    this.audioButton.className = 'hud__toggle';
    this.audioButton.type = 'button';
    this.audioButton.setAttribute('aria-label', 'Toggle audio');
    this.audioButton.addEventListener('click', () => {
      const enabled = this.audioListener ? this.audioListener() : !this.audio.isEnabled();
      this.renderAudioState(enabled);
    });

    toggles.append(this.themeButton, this.audioButton);

    const resumeLink = document.createElement('a');
    resumeLink.href = '/resume.html';
    resumeLink.target = '_blank';
    resumeLink.rel = 'noopener';
    resumeLink.className = 'hud__toggle';
    resumeLink.textContent = 'Resume';

    toggles.append(resumeLink);

    this.container.append(logoLink, this.nav, toggles);
    document.body.appendChild(this.container);

    this.hint = document.createElement('p');
    this.hint.className = 'hud__hint';
    this.hint.textContent = 'Click or tap an island to explore. Use keys 1-5 to jump. Press H to return home.';
    document.body.appendChild(this.hint);

    window.addEventListener('pointerdown', () => this.hideHint(), { once: true });
    window.addEventListener('keydown', () => this.hideHint(), { once: true });

    this.applyTheme();
    this.renderAudioState(this.audio.isEnabled());
  }

  onNavigate(listener: NavListener) {
    this.navListener = listener;
  }

  onAudioToggle(listener: AudioListener) {
    this.audioListener = listener;
  }

  onThemeToggle(listener: ThemeListener) {
    this.themeListener = listener;
  }

  setActive(route: RouteName) {
    this.activeRoute = route;
    const buttons = this.nav.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach((button) => {
      button.setAttribute('aria-current', button.dataset.route === route ? 'page' : 'false');
    });
  }

  setAudioState(enabled: boolean) {
    this.renderAudioState(enabled);
  }

  announce(summary: string) {
    this.overlay.announceHover(summary);
  }

  private createNavButton(route: RouteName, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.route = route;
    button.textContent = label;
    button.addEventListener('click', () => this.emitNav(route));
    return button;
  }

  private emitNav(route: RouteName) {
    if (this.navListener) {
      this.navListener(route);
    }
  }

  private hideHint() {
    this.hint.hidden = true;
  }

  private toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : this.theme === 'light' ? 'system' : 'dark';
    this.applyTheme();
    if (this.themeListener) {
      this.themeListener(this.theme);
    }
  }

  private applyTheme() {
    const root = document.documentElement;
    if (this.theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', this.theme);
    }
    localStorage.setItem('ryan-world-theme', this.theme);
    this.themeButton.textContent = `Theme: ${this.theme}`;
  }

  private renderAudioState(enabled: boolean) {
    this.audioButton.textContent = enabled ? 'Audio: On' : 'Audio: Off';
  }
}
