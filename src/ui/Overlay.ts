import type { InterestKey, ProfileContent, RouteName } from '../types';

type RouteListener = (route: RouteName) => void;

export class Overlay {
  private profile: ProfileContent;
  private container: HTMLElement;
  private titleEl: HTMLHeadingElement;
  private contentEl: HTMLElement;
  private closeButton: HTMLButtonElement;
  private liveRegion: HTMLElement;
  private focusTrapNodes: HTMLElement[] = [];
  private previousFocus: Element | null = null;
  private openState = false;
  private listeners = new Set<RouteListener>();
  private activeRoute: RouteName = '#home';

  constructor(profile: ProfileContent) {
    this.profile = profile;
    this.container = document.createElement('section');
    this.container.className = 'overlay';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-hidden', 'true');

    const header = document.createElement('header');
    header.className = 'overlay__header';

    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'overlay__title';
    this.titleEl.id = 'overlay-title';

    this.closeButton = document.createElement('button');
    this.closeButton.className = 'overlay__close';
    this.closeButton.type = 'button';
    this.closeButton.setAttribute('aria-label', 'Close panel');
    this.closeButton.innerHTML = '&times;';

    header.append(this.titleEl, this.closeButton);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'overlay__body';

    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.style.position = 'absolute';
    this.liveRegion.style.left = '-9999px';

    this.container.append(header, this.contentEl, this.liveRegion);
    document.body.appendChild(this.container);

    this.closeButton.addEventListener('click', () => {
      this.close();
      this.emit('#home');
    });

    document.addEventListener('keydown', (event) => {
      if (!this.openState) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        this.emit('#home');
      } else if (event.key === 'Tab') {
        this.enforceFocus(event);
      }
    });

    document.addEventListener('ryan-world-contact-intent', () => {
      this.open('#contact');
    });
  }

  onRequestRoute(listener: RouteListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(route: RouteName) {
    for (const listener of this.listeners) {
      listener(route);
    }
  }

  open(route: RouteName): boolean {
    const markup = this.render(route);
    if (!markup) {
      this.close();
      return false;
    }
    this.activeRoute = route;
    this.contentEl.innerHTML = markup;
    this.container.classList.add('overlay--open');
    this.container.setAttribute('aria-hidden', 'false');
    this.titleEl.textContent = this.titleForRoute(route);
    this.previousFocus = document.activeElement;
    this.updateFocusTrap();
    this.openState = true;
    window.setTimeout(() => this.closeButton.focus(), 30);
    return true;
  }

  close() {
    if (!this.openState) return;
    this.openState = false;
    this.container.classList.remove('overlay--open');
    this.container.setAttribute('aria-hidden', 'true');
    if (this.previousFocus instanceof HTMLElement) {
      this.previousFocus.focus();
    }
    this.activeRoute = '#home';
  }

  isOpen() {
    return this.openState;
  }

  getActiveRoute(): RouteName {
    return this.activeRoute;
  }

  announceHover(summary: string) {
    this.liveRegion.textContent = summary;
  }

  private enforceFocus(event: KeyboardEvent) {
    if (this.focusTrapNodes.length === 0) return;
    const { shiftKey } = event;
    const first = this.focusTrapNodes[0];
    const last = this.focusTrapNodes[this.focusTrapNodes.length - 1];
    const current = document.activeElement;
    if (!shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    } else if (shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    }
  }

  private updateFocusTrap() {
    const focusables = this.container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    this.focusTrapNodes = Array.from(focusables).filter((el) => !el.hasAttribute('disabled'));
    if (!this.focusTrapNodes.includes(this.closeButton)) {
      this.focusTrapNodes.unshift(this.closeButton);
    }
  }

  private render(route: RouteName): string | null {
    switch (route) {
      case '#cooking':
      case '#it':
      case '#gardening':
      case '#ai':
      case '#music':
        return this.renderInterest(route.replace('#', '') as InterestKey);
      case '#projects':
        return this.renderProjects();
      case '#writing':
        return this.renderPosts();
      case '#talks':
        return this.renderTalks();
      case '#contact':
        return this.renderContact();
      default:
        return null;
    }
  }

  private titleForRoute(route: RouteName): string {
    switch (route) {
      case '#cooking':
        return 'Cooking & Grilling';
      case '#it':
        return 'Infrastructure & IT';
      case '#gardening':
        return 'Gardening & Growing';
      case '#ai':
        return 'AI Hub';
      case '#music':
        return 'Music & Sound';
      case '#projects':
        return 'Highlighted Projects';
      case '#writing':
        return 'Writing';
      case '#talks':
        return 'Talks & Sessions';
      case '#contact':
        return 'Contact Ryan';
      default:
        return 'Ryan 3D World';
    }
  }

  private renderInterest(key: InterestKey): string {
    const interest = this.profile.interests[key];
    const header = `<section class="overlay__section"><p>${this.profile.bio_short}</p></section>`;
    const links = interest.links
      .map((link) => `<li><a href="${link}" target="_blank" rel="noopener">${link}</a></li>`)
      .join('');
    const listMarkup = links
      ? `<section class="overlay__section"><h3>Links</h3><ul class="overlay__list">${links}</ul></section>`
      : '';
    return `
      ${header}
      <section class="overlay__section">
        <h3>Focus</h3>
        <p>${interest.summary}</p>
      </section>
      ${listMarkup}
    `;
  }

  private renderProjects(): string {
    const { projects } = this.profile;
    if (!projects.length) {
      return '<section class="overlay__section"><p>TODO: Add project write-ups.</p></section>';
    }
    const items = projects
      .map(
        (project) => `
        <li>
          <h3>${project.name}</h3>
          <p>${project.summary}</p>
          <p><strong>Role:</strong> ${project.role}</p>
          <p><strong>Stack:</strong> ${project.stack.join(', ')}</p>
          <ul>
            ${project.highlights.map((item) => `<li>${item}</li>`).join('')}
          </ul>
          <p>
            <a href="${project.links.github}" target="_blank" rel="noopener">Source</a>
            &nbsp;·&nbsp;
            <a href="${project.links.demo}" target="_blank" rel="noopener">Demo</a>
          </p>
        </li>
      `
      )
      .join('');
    return `<section class="overlay__section"><ul class="overlay__list">${items}</ul></section>`;
  }

  private renderPosts(): string {
    const { posts } = this.profile;
    if (!posts.length) {
      return '<section class="overlay__section"><p>TODO: Add writing samples.</p></section>';
    }
    const items = posts
      .map(
        (post) => `
        <li>
          <h3>${post.title}</h3>
          <p><time datetime="${post.date}">${post.date}</time></p>
          <p>${post.summary}</p>
          <p><a href="${post.url}" target="_blank" rel="noopener">Read more</a></p>
        </li>
      `
      )
      .join('');
    return `<section class="overlay__section"><ul class="overlay__list">${items}</ul></section>`;
  }

  private renderTalks(): string {
    const { talks } = this.profile;
    if (!talks.length) {
      return '<section class="overlay__section"><p>TODO: Add talk recordings.</p></section>';
    }
    const items = talks
      .map(
        (talk) => `
        <li>
          <h3>${talk.title}</h3>
          <p>${talk.event}</p>
          <p><time datetime="${talk.date}">${talk.date}</time></p>
          <p><a href="${talk.link}" target="_blank" rel="noopener">Watch</a></p>
        </li>
      `
      )
      .join('');
    return `<section class="overlay__section"><ul class="overlay__list">${items}</ul></section>`;
  }

  private renderContact(): string {
    return `
      <section class="overlay__section">
        <p>${this.profile.contact.cta}</p>
        <p>Email: <a href="mailto:${this.profile.email}">${this.profile.email}</a></p>
        <p>${this.profile.contact.availability}</p>
      </section>
      <section class="overlay__section">
        <h3>Elsewhere</h3>
        <ul class="overlay__list">
          <li><a href="${this.profile.social.github}" target="_blank" rel="noopener">GitHub</a></li>
          <li><a href="${this.profile.social.linkedin}" target="_blank" rel="noopener">LinkedIn</a></li>
          <li><a href="${this.profile.social.x}" target="_blank" rel="noopener">X (Twitter)</a></li>
          <li><a href="${this.profile.social.website}" target="_blank" rel="noopener">Website</a></li>
        </ul>
      </section>
    `;
  }
}
