import { data, districtOf, repoUrl, tierOf, isUnderConstruction, type Project, type District } from './data';
import { emblemUrl, posterUrl } from './art';

export interface UIActions {
  onSelectProject: (id: string) => void;
  onSelectDistrict: (id: string) => void;
  onOverview: () => void;
  onClosePanel: () => void;
}

/** One icon family: 24px grid, 2px round stroke. */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  out: '<path d="M8 16 17 7M9 7h8v8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>'
} as const;

export function icon(name: keyof typeof ICONS): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function closeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'btn-close');
  button.innerHTML = icon('close');
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

function link(className: string, text: string, href: string, external = true): HTMLAnchorElement {
  const a = el('a', className) as HTMLAnchorElement;
  a.href = href;
  a.append(text);
  if (external) {
    a.target = '_blank';
    a.rel = 'noopener';
    a.insertAdjacentHTML('beforeend', icon('out'));
  }
  return a;
}

function facts(rows: [string, string][]): HTMLElement {
  const list = el('dl', 'panel-facts');
  for (const [term, value] of rows) list.append(el('dt', undefined, term), el('dd', undefined, value));
  return list;
}

/** "2026-11-08" -> "8 Nov 2026" */
function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const TIER_NAMES = ['Shack', 'House', 'Large house', 'Mid-rise', 'Skyscraper'];

/** A district's enamel badge, or a plain color swatch if it has no art yet. */
function badge(district: District): HTMLElement {
  const url = emblemUrl(district.id);
  if (!url) return el('span', 'chip-dot');
  const image = el('img', 'chip-badge');
  image.src = url;
  image.alt = '';
  return image;
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

    const totalCommits = data.projects.reduce((sum, p) => sum + p.commits, 0);
    document.getElementById('brand-stats')!.textContent =
      `Pop. ${data.projects.length} projects · Elev. ${totalCommits.toLocaleString()} commits`;
    // The hint has done its job once the visitor touches the town.
    document.getElementById('scene')!.addEventListener(
      'pointerdown',
      () => window.setTimeout(() => this.hint.classList.add('hint-hidden'), 1200),
      { once: true }
    );

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
    const overviewChip = el('button', 'chip chip-overview', 'Whole town');
    overviewChip.addEventListener('click', () => {
      this.tooltip.hidden = true;
      this.actions.onOverview();
    });
    this.legend.appendChild(overviewChip);

    for (const district of data.districts) {
      const chip = el('button', 'chip');
      chip.style.setProperty('--district', district.color);
      chip.append(badge(district), document.createTextNode(district.name));
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
    header.append(
      el('h2', undefined, 'Directory'),
      el('p', undefined, 'Sorted by commits. Pick one to fly there.'),
      closeButton('Close directory', () => this.toggleList(false))
    );
    sheet.append(header);

    for (const district of data.districts) {
      const projects = data.projects
        .filter((p) => p.district === district.id)
        .sort((a, b) => b.commits - a.commits);
      const section = el('section', 'list-district');
      section.style.setProperty('--district', district.color);
      const title = el('h3', undefined, district.name);
      title.append(el('small', undefined, `${projects.length} projects`));
      section.append(title);

      for (const project of projects) {
        const row = el('button', 'list-row');
        row.append(
          el('strong', undefined, project.title),
          el('span', undefined, project.blurb),
          el('b', undefined, `${project.estimated ? '~' : ''}${project.commits.toLocaleString()}`)
        );
        row.addEventListener('click', () => {
          this.toggleList(false);
          this.actions.onSelectProject(project.id);
        });
        section.append(row);
      }
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
    this.tooltip.style.setProperty('--district', district.color);
    this.tooltip.append(
      el('strong', undefined, project.title),
      el('span', undefined, `${district.name} · ${project.commits.toLocaleString()} commits`)
    );
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
    this.panel.style.setProperty('--district', district.color);
    const poster = posterUrl(project.id);
    if (poster) {
      const art = el('img', 'panel-poster') as HTMLImageElement;
      art.src = poster;
      art.alt = '';
      this.panel.append(art);
    }
    this.panel.append(closeButton('Close panel', () => this.actions.onClosePanel()));
    const chip = el('span', 'panel-chip');
    chip.append(badge(district), document.createTextNode(district.name));
    this.panel.append(chip);
    this.panel.append(el('h2', undefined, project.title));
    this.panel.append(
      facts([
        ['Built', `${project.estimated ? '~' : ''}${project.commits.toLocaleString()} commit${project.commits === 1 ? '' : 's'} of ${project.lang}`],
        ['Zoning', `${TIER_NAMES[tierOf(project.commits)]}${isUnderConstruction(project) ? ', under construction' : ''}`],
        ['Last push', shortDate(project.pushedAt)],
        ['Deed', `${data.profile.github.replace('https://', '')}/${project.repo}`]
      ])
    );
    this.panel.append(el('p', 'panel-blurb', project.blurb));

    const buttons = el('div', 'panel-buttons');
    if (project.demo) buttons.append(link('btn btn-primary', 'Open it', project.demo));
    buttons.append(link(project.demo ? 'btn' : 'btn btn-primary', 'Read the source', repoUrl(project)));
    this.panel.append(buttons);

    this.panel.hidden = false;
    this.hint.classList.add('hint-hidden');
  }

  showAboutPanel(): void {
    this.panel.innerHTML = '';
    this.panel.style.setProperty('--district', '#ffffff');
    this.panel.append(closeButton('Close panel', () => this.actions.onClosePanel()));
    this.panel.append(el('span', 'panel-chip', 'Town hall'));
    this.panel.append(el('h2', undefined, data.profile.name));

    const totalCommits = data.projects.reduce((sum, p) => sum + p.commits, 0);
    const tallest = [...data.projects].sort((a, b) => b.commits - a.commits)[0];
    const building = data.projects.filter(isUnderConstruction).length;
    this.panel.append(
      facts([
        ['Population', `${data.projects.length} projects in ${data.districts.length} districts`],
        ['Elevation', `${totalCommits.toLocaleString()} commits`],
        ['Tallest', `${tallest.title}, ${tallest.commits.toLocaleString()} commits`],
        ['Cranes up', `${building} site${building === 1 ? '' : 's'} pushed in the last 30 days`]
      ])
    );
    this.panel.append(el('p', 'panel-blurb', data.profile.about));

    const buttons = el('div', 'panel-buttons');
    buttons.append(
      link('btn btn-primary', 'GitHub', data.profile.github),
      link('btn', 'LinkedIn', data.profile.linkedin),
      link('btn', 'Email', `mailto:${data.profile.email}`, false)
    );
    this.panel.append(buttons);
    this.panel.hidden = false;
    this.hint.classList.add('hint-hidden');
  }

  hidePanel(): void {
    this.panel.hidden = true;
  }

  hideLoader(): void {
    const loader = document.getElementById('loader');
    if (!loader) return;
    loader.classList.add('loader-done');
    window.setTimeout(() => loader.remove(), 600);
  }

  showWebglFallback(): void {
    this.hideLoader();
    document.body.classList.add('no-webgl');
    this.toggleList(true);
  }
}
