import { data, districtOf, repoUrl, type Project } from './data';

export interface UIActions {
  onSelectProject: (id: string) => void;
  onSelectDistrict: (id: string) => void;
  onOverview: () => void;
  onClosePanel: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export class UI {
  private tooltip = document.getElementById('tooltip')!;
  private panel = document.getElementById('panel')!;
  private legend = document.getElementById('legend')!;
  private listOverlay = document.getElementById('list-overlay')!;
  private hint = document.getElementById('hint')!;
  private pointerX = 0;
  private pointerY = 0;

  constructor(private actions: UIActions) {
    this.buildLegend();
    this.buildListOverlay();

    window.addEventListener('pointermove', (e) => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      this.positionTooltip();
    });

    document.getElementById('btn-list')!.addEventListener('click', () => this.toggleList(true));
    this.listOverlay.addEventListener('click', (e) => {
      if (e.target === this.listOverlay) this.toggleList(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.listOverlay.hidden) this.toggleList(false);
        else if (!this.panel.hidden) this.actions.onClosePanel();
      }
    });
  }

  private buildLegend(): void {
    const overviewChip = el('button', 'chip chip-overview', 'Overview');
    overviewChip.addEventListener('click', () => {
      this.tooltip.hidden = true;
      this.actions.onOverview();
    });
    this.legend.appendChild(overviewChip);

    for (const district of data.districts) {
      const chip = el('button', 'chip');
      chip.style.setProperty('--chip-color', district.color);
      const dot = el('span', 'chip-dot');
      chip.append(dot, document.createTextNode(district.name));
      chip.title = district.blurb;
      chip.addEventListener('click', () => {
        this.tooltip.hidden = true;
        this.actions.onSelectDistrict(district.id);
      });
      this.legend.appendChild(chip);
    }
  }

  private buildListOverlay(): void {
    const sheet = el('div', 'list-sheet');
    const header = el('div', 'list-header');
    header.append(el('h2', undefined, 'Project Index'));
    const close = el('button', 'btn-close', '×');
    close.setAttribute('aria-label', 'Close project index');
    close.addEventListener('click', () => this.toggleList(false));
    header.append(close);
    sheet.append(header);

    for (const district of data.districts) {
      const section = el('section', 'list-district');
      const title = el('h3');
      const dot = el('span', 'chip-dot');
      dot.style.background = district.color;
      title.append(dot, document.createTextNode(district.name));
      section.append(title, el('p', 'list-blurb', district.blurb));

      const grid = el('div', 'list-grid');
      for (const project of data.projects.filter((p) => p.district === district.id)) {
        const card = el('button', 'list-card');
        card.style.setProperty('--chip-color', district.color);
        card.append(el('strong', undefined, project.title), el('span', undefined, project.blurb));
        card.addEventListener('click', () => {
          this.toggleList(false);
          this.actions.onSelectProject(project.id);
        });
        grid.append(card);
      }
      section.append(grid);
      sheet.append(section);
    }
    this.listOverlay.append(sheet);
  }

  toggleList(open: boolean): void {
    this.listOverlay.hidden = !open;
  }

  showTooltip(project: Project | null): void {
    if (!project) {
      this.tooltip.hidden = true;
      return;
    }
    const district = districtOf(project);
    this.tooltip.innerHTML = '';
    this.tooltip.append(el('strong', undefined, project.title), el('span', undefined, district.name));
    (this.tooltip.querySelector('span') as HTMLElement).style.color = district.color;
    this.tooltip.hidden = false;
    this.positionTooltip();
  }

  private positionTooltip(): void {
    if (this.tooltip.hidden) return;
    const pad = 16;
    const rect = this.tooltip.getBoundingClientRect();
    const x = Math.min(this.pointerX + pad, window.innerWidth - rect.width - pad);
    const y = Math.min(this.pointerY + pad, window.innerHeight - rect.height - pad);
    this.tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }

  showProjectPanel(project: Project): void {
    this.tooltip.hidden = true;
    const district = districtOf(project);
    this.panel.innerHTML = '';

    const close = el('button', 'btn-close', '×');
    close.setAttribute('aria-label', 'Close panel');
    close.addEventListener('click', () => this.actions.onClosePanel());
    this.panel.append(close);

    const chip = el('span', 'panel-chip', district.name);
    chip.style.setProperty('--chip-color', district.color);
    this.panel.append(chip);
    this.panel.append(el('h2', undefined, project.title));
    this.panel.append(
      el('p', 'panel-meta', `${project.lang} · ${project.commits} commit${project.commits === 1 ? '' : 's'} · github.com/rhicksrad/${project.repo}`)
    );
    this.panel.append(el('p', 'panel-blurb', project.blurb));

    const buttons = el('div', 'panel-buttons');
    if (project.demo) {
      const demo = el('a', 'btn btn-primary', 'Launch demo ↗') as HTMLAnchorElement;
      demo.href = project.demo;
      demo.target = '_blank';
      demo.rel = 'noopener';
      demo.style.setProperty('--chip-color', district.color);
      buttons.append(demo);
    }
    const source = el('a', 'btn', 'View source') as HTMLAnchorElement;
    source.href = repoUrl(project);
    source.target = '_blank';
    source.rel = 'noopener';
    buttons.append(source);
    this.panel.append(buttons);

    this.panel.hidden = false;
    this.hint.classList.add('hint-hidden');
  }

  showAboutPanel(): void {
    this.panel.innerHTML = '';
    const close = el('button', 'btn-close', '×');
    close.setAttribute('aria-label', 'Close panel');
    close.addEventListener('click', () => this.actions.onClosePanel());
    this.panel.append(close);

    this.panel.append(el('h2', undefined, data.profile.name));
    this.panel.append(el('p', 'panel-blurb', data.profile.about));
    const totalCommits = data.projects.reduce((sum, p) => sum + p.commits, 0);
    const stats = el(
      'p',
      'panel-meta',
      `${data.projects.length} projects · ${totalCommits.toLocaleString()} commits · 4 districts · 1 city`
    );
    this.panel.append(stats);

    const buttons = el('div', 'panel-buttons');
    const gh = el('a', 'btn btn-primary', 'GitHub ↗') as HTMLAnchorElement;
    gh.href = data.profile.github;
    gh.target = '_blank';
    gh.rel = 'noopener';
    buttons.append(gh);
    const li = el('a', 'btn', 'LinkedIn ↗') as HTMLAnchorElement;
    li.href = data.profile.linkedin;
    li.target = '_blank';
    li.rel = 'noopener';
    buttons.append(li);
    const mail = el('a', 'btn', 'Email') as HTMLAnchorElement;
    mail.href = `mailto:${data.profile.email}`;
    buttons.append(mail);
    this.panel.append(buttons);

    this.panel.hidden = false;
  }

  hidePanel(): void {
    this.panel.hidden = true;
  }

  hideLoader(): void {
    const loader = document.getElementById('loader');
    if (!loader) return;
    loader.classList.add('loader-done');
    window.setTimeout(() => loader.remove(), 900);
  }

  showWebglFallback(): void {
    this.hideLoader();
    document.body.classList.add('no-webgl');
    this.toggleList(true);
  }
}
