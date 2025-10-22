import type { ProfileContent, Project, Post, Talk } from '../types.d.ts';

interface OverlayCallbacks {
  onClose?: () => void;
}

type SectionName =
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

const TITLE_MAP: Record<SectionName, string> = {
  home: 'Overview',
  cooking: 'Cooking & Smoking',
  it: 'Infrastructure',
  gardening: 'Gardening',
  ai: 'Artificial Intelligence',
  music: 'Music',
  projects: 'Projects',
  writing: 'Writing',
  talks: 'Talks',
  resume: 'Resume',
  contact: 'Contact'
};

export class Overlay {
  private panel: HTMLDivElement | null = null;
  private focusable: HTMLElement[] = [];
  private cleanup: (() => void) | null = null;
  private current: SectionName | null = null;

  constructor(private root: HTMLElement, private content: ProfileContent, private callbacks: OverlayCallbacks = {}) {
    this.root.setAttribute('aria-live', 'polite');
  }

  open(section: SectionName): void {
    if (this.current === section) return;
    this.close();
    this.current = section;
    this.root.style.pointerEvents = 'auto';
    const panel = document.createElement('div');
    panel.className = 'overlay-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', TITLE_MAP[section]);

    const header = document.createElement('div');
    header.className = 'overlay-header';
    const title = document.createElement('h2');
    title.id = `overlay-title-${section}`;
    title.textContent = TITLE_MAP[section];
    panel.setAttribute('aria-labelledby', title.id);

    const close = document.createElement('button');
    close.className = 'overlay-close';
    close.type = 'button';
    close.innerText = 'Close';
    close.addEventListener('click', () => this.close());

    header.append(title, close);
    panel.appendChild(header);

    const content = document.createElement('div');
    content.className = 'overlay-content';
    content.append(...this.renderSection(section));
    panel.appendChild(content);

    this.root.innerHTML = '';
    this.root.appendChild(panel);
    this.panel = panel;

    this.focusable = Array.from(panel.querySelectorAll<HTMLElement>('a, button, [tabindex="0"]'));
    const firstFocusable = this.focusable[0] ?? close;
    setTimeout(() => firstFocusable.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
      if (event.key === 'Tab' && this.focusable.length > 0) {
        const currentIndex = this.focusable.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && currentIndex === 0) {
          event.preventDefault();
          this.focusable[this.focusable.length - 1].focus();
        } else if (!event.shiftKey && currentIndex === this.focusable.length - 1) {
          event.preventDefault();
          this.focusable[0].focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    this.cleanup = () => document.removeEventListener('keydown', onKeyDown);

    this.updateMetadata(section);
  }

  close(): void {
    if (!this.panel) return;
    this.root.innerHTML = '';
    this.root.style.pointerEvents = 'none';
    this.panel = null;
    this.focusable = [];
    this.cleanup?.();
    this.cleanup = null;
    this.current = null;
    this.restoreMetadata();
    this.callbacks.onClose?.();
  }

  isOpen(): boolean {
    return Boolean(this.panel);
  }

  getCurrent(): SectionName | null {
    return this.current;
  }

  private renderSection(section: SectionName): HTMLElement[] {
    const nodes: HTMLElement[] = [];
    const intro = document.createElement('section');
    switch (section) {
      case 'home': {
        intro.innerHTML = `<p>${this.content.bio_short}</p>`;
        const long = document.createElement('p');
        long.textContent = this.content.bio_long;
        intro.appendChild(long);
        nodes.push(intro, this.renderList('Skills', this.content.skills), this.renderList('Principles', this.content.principles));
        break;
      }
      case 'projects': {
        nodes.push(this.renderProjects());
        break;
      }
      case 'writing': {
        nodes.push(this.renderPosts());
        break;
      }
      case 'talks': {
        nodes.push(this.renderTalks());
        break;
      }
      case 'resume': {
        const link = document.createElement('a');
        link.href = 'resume.html';
        link.textContent = 'Open resume';
        link.target = '_blank';
        link.rel = 'noopener';
        intro.appendChild(link);
        nodes.push(intro);
        break;
      }
      case 'contact': {
        const list = document.createElement('ul');
        list.className = 'card-list';
        if (this.content.email && this.content.email !== 'TODO') {
          const emailItem = document.createElement('li');
          const emailLink = document.createElement('a');
          emailLink.href = `mailto:${this.content.email}`;
          emailLink.textContent = this.content.email;
          emailItem.appendChild(emailLink);
          list.appendChild(emailItem);
        }
        Object.entries(this.content.social).forEach(([platform, url]) => {
          if (!url || url === 'TODO') return;
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = url;
          link.textContent = platform;
          link.target = '_blank';
          link.rel = 'noopener';
          item.appendChild(link);
          list.appendChild(item);
        });
        intro.appendChild(list);
        nodes.push(intro);
        break;
      }
      default: {
        const interest = this.content.interests[section];
        if (interest) {
          intro.innerHTML = `<p>${interest.summary}</p>`;
          if (interest.links?.length) {
            const linkList = document.createElement('ul');
            linkList.className = 'card-list';
            interest.links.forEach((link) => {
              const item = document.createElement('li');
              const anchor = document.createElement('a');
              anchor.href = link;
              anchor.textContent = link;
              anchor.target = '_blank';
              anchor.rel = 'noopener';
              item.appendChild(anchor);
              linkList.appendChild(item);
            });
            intro.appendChild(linkList);
          }
          nodes.push(intro);
        }
        break;
      }
    }
    return nodes;
  }

  private renderList(title: string, items: string[]): HTMLElement {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    const list = document.createElement('ul');
    list.className = 'card-list';
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'card';
      li.textContent = item;
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  private renderProjects(): HTMLElement {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = 'Projects';
    section.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'card-list';
    this.content.projects.forEach((project: Project) => {
      const card = document.createElement('article');
      card.className = 'card';
      const name = document.createElement('h4');
      name.textContent = project.name;
      const role = document.createElement('p');
      role.textContent = `${project.role} · ${project.stack.join(', ')}`;
      const summary = document.createElement('p');
      summary.textContent = project.summary;
      const highlightList = document.createElement('ul');
      highlightList.className = 'card-list';
      project.highlights.forEach((highlight) => {
        const item = document.createElement('li');
        item.textContent = highlight;
        highlightList.appendChild(item);
      });
      const linkRow = document.createElement('p');
      if (project.links.github && project.links.github !== 'TODO') {
        const link = document.createElement('a');
        link.href = project.links.github;
        link.textContent = 'GitHub';
        link.target = '_blank';
        link.rel = 'noopener';
        linkRow.appendChild(link);
      }
      if (project.links.demo && project.links.demo !== 'TODO') {
        const link = document.createElement('a');
        link.href = project.links.demo;
        link.textContent = 'Demo';
        link.target = '_blank';
        link.rel = 'noopener';
        if (linkRow.childNodes.length) {
          linkRow.appendChild(document.createTextNode(' · '));
        }
        linkRow.appendChild(link);
      }
      card.append(name, role, summary, highlightList, linkRow);
      list.appendChild(card);
    });
    section.appendChild(list);
    return section;
  }

  private renderPosts(): HTMLElement {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = 'Writing';
    section.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'card-list';
    this.content.posts.forEach((post: Post) => {
      const card = document.createElement('article');
      card.className = 'card';
      const title = document.createElement('h4');
      title.textContent = post.title;
      const meta = document.createElement('p');
      meta.textContent = post.date;
      const summary = document.createElement('p');
      summary.textContent = post.summary;
      const link = document.createElement('a');
      link.href = post.url;
      link.textContent = 'Read post';
      link.target = '_blank';
      link.rel = 'noopener';
      card.append(title, meta, summary, link);
      list.appendChild(card);
    });
    section.appendChild(list);
    return section;
  }

  private renderTalks(): HTMLElement {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = 'Talks';
    section.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'card-list';
    this.content.talks.forEach((talk: Talk) => {
      const card = document.createElement('article');
      card.className = 'card';
      const title = document.createElement('h4');
      title.textContent = talk.title;
      const meta = document.createElement('p');
      meta.textContent = `${talk.event} · ${talk.date}`;
      const link = document.createElement('a');
      link.href = talk.link;
      link.textContent = 'View talk';
      link.target = '_blank';
      link.rel = 'noopener';
      card.append(title, meta, link);
      list.appendChild(card);
    });
    section.appendChild(list);
    return section;
  }

  private updateMetadata(section: SectionName) {
    const baseTitle = `${this.content.name} – ${this.content.tagline}`;
    const title = `${baseTitle} | ${TITLE_MAP[section]}`;
    document.title = title;
    const description = this.content.bio_short || this.content.bio_long.slice(0, 160);
    this.setMeta('description', description);
    this.setMeta('og:title', title, 'property');
    this.setMeta('og:description', description, 'property');
  }

  private restoreMetadata() {
    const baseTitle = `${this.content.name} – ${this.content.tagline}`;
    document.title = baseTitle;
    const description = this.content.bio_short || this.content.bio_long.slice(0, 160);
    this.setMeta('description', description);
    this.setMeta('og:title', baseTitle, 'property');
    this.setMeta('og:description', description, 'property');
  }

  private setMeta(name: string, value: string, attr: 'name' | 'property' = 'name') {
    let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attr, name);
      document.head.appendChild(element);
    }
    element.setAttribute('content', value);
  }
}
