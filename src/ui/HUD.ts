type HudCallbacks = {
  onNavigate: (route: string) => void;
  onThemeToggle: () => void;
  onAudioToggle: () => void;
  onMotionToggle: () => void;
};

const NAV_ITEMS: { id: string; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'it', label: 'IT' },
  { id: 'gardening', label: 'Gardening' },
  { id: 'ai', label: 'AI' },
  { id: 'music', label: 'Music' }
];

export class HUD {
  private activeRoute: string = 'home';
  private navButtons: Map<string, HTMLElement> = new Map();
  private hint: HTMLDivElement | null = null;
  private interacted = false;
  private themeButton: HTMLButtonElement | null = null;
  private audioButton: HTMLButtonElement | null = null;
  private motionButton: HTMLButtonElement | null = null;

  constructor(private root: HTMLElement, private callbacks: HudCallbacks) {
    this.render();
  }

  private render() {
    this.root.innerHTML = '';
    this.root.style.pointerEvents = 'none';

    const bar = document.createElement('div');
    bar.className = 'hud-bar';
    bar.style.pointerEvents = 'auto';

    const logo = document.createElement('a');
    logo.href = '#home';
    logo.className = 'hud-logo';
    logo.innerHTML = `<img src="/assets/logo.svg" alt="Ryan" width="32" height="32" />`;
    logo.addEventListener('click', (event) => {
      event.preventDefault();
      this.callbacks.onNavigate('home');
    });
    bar.appendChild(logo);

    const actions = document.createElement('div');
    actions.className = 'hud-actions';
    NAV_ITEMS.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.setAttribute('data-route', item.id);
      button.addEventListener('click', () => this.handleNavigate(item.id));
      actions.appendChild(button);
      this.navButtons.set(item.id, button);
    });

    const projects = document.createElement('button');
    projects.type = 'button';
    projects.textContent = 'Projects';
    projects.addEventListener('click', () => this.handleNavigate('projects'));
    actions.appendChild(projects);
    this.navButtons.set('projects', projects);

    const writing = document.createElement('button');
    writing.type = 'button';
    writing.textContent = 'Writing';
    writing.addEventListener('click', () => this.handleNavigate('writing'));
    actions.appendChild(writing);
    this.navButtons.set('writing', writing);

    const talks = document.createElement('button');
    talks.type = 'button';
    talks.textContent = 'Talks';
    talks.addEventListener('click', () => this.handleNavigate('talks'));
    actions.appendChild(talks);
    this.navButtons.set('talks', talks);

    const resume = document.createElement('a');
    resume.href = '#resume';
    resume.textContent = 'Resume';
    resume.addEventListener('click', (event) => {
      event.preventDefault();
      this.handleNavigate('resume');
    });
    actions.appendChild(resume);
    this.navButtons.set('resume', resume);

    const contact = document.createElement('a');
    contact.href = '#contact';
    contact.textContent = 'Contact';
    contact.addEventListener('click', (event) => {
      event.preventDefault();
      this.handleNavigate('contact');
    });
    actions.appendChild(contact);
    this.navButtons.set('contact', contact);

    const themeToggle = document.createElement('button');
    themeToggle.type = 'button';
    themeToggle.className = 'theme-toggle';
    themeToggle.textContent = 'Theme';
    themeToggle.addEventListener('click', () => {
      this.callbacks.onThemeToggle();
      this.markInteracted();
    });
    actions.appendChild(themeToggle);
    this.themeButton = themeToggle;

    const motionToggle = document.createElement('button');
    motionToggle.type = 'button';
    motionToggle.textContent = 'Motion';
    motionToggle.addEventListener('click', () => {
      this.callbacks.onMotionToggle();
      this.markInteracted();
    });
    actions.appendChild(motionToggle);
    this.motionButton = motionToggle;

    const audioToggle = document.createElement('button');
    audioToggle.type = 'button';
    audioToggle.className = 'audio-toggle';
    audioToggle.textContent = 'Audio';
    audioToggle.addEventListener('click', () => {
      this.callbacks.onAudioToggle();
      this.markInteracted();
    });
    actions.appendChild(audioToggle);
    this.audioButton = audioToggle;

    bar.appendChild(actions);
    this.root.appendChild(bar);

    const hint = document.createElement('div');
    hint.className = 'hud-hint';
    hint.textContent = 'Hint: Drag to orbit, scroll or pinch to zoom, H for home, 1-5 jump to islands.';
    hint.style.pointerEvents = 'auto';
    this.root.appendChild(hint);
    this.hint = hint;
  }

  private handleNavigate(route: string) {
    this.callbacks.onNavigate(route);
    this.markInteracted();
  }

  setActive(route: string) {
    this.activeRoute = route;
    this.navButtons.forEach((button, id) => {
      button.setAttribute('aria-current', id === route ? 'true' : 'false');
    });
  }

  setTheme(theme: 'light' | 'dark') {
    if (this.themeButton) {
      this.themeButton.textContent = theme === 'dark' ? 'Dark' : 'Light';
    }
  }

  setAudioMuted(muted: boolean) {
    if (this.audioButton) {
      this.audioButton.textContent = muted ? 'Audio Off' : 'Audio On';
    }
  }

  setMotionDisabled(disabled: boolean) {
    if (this.motionButton) {
      this.motionButton.textContent = disabled ? 'Motion Off' : 'Motion On';
    }
  }

  markInteracted() {
    if (this.interacted) return;
    this.interacted = true;
    this.hint?.classList.add('visually-hidden');
  }
}
