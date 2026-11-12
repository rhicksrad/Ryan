import { data } from './data';
import { CityWorld, ABOUT_ID } from './world/CityWorld';
import { UI, icon } from './ui';
import '../css/styles.css';

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function readHash(): { kind: 'project' | 'district' | null; id: string } {
  const match = window.location.hash.match(/^#\/(p|d)\/(.+)$/);
  if (!match) return { kind: null, id: '' };
  return { kind: match[1] === 'p' ? 'project' : 'district', id: match[2] };
}

function writeHash(value: string): void {
  history.replaceState(null, '', value ? `#/${value}` : window.location.pathname + window.location.search);
}

function boot(): void {
  const container = document.getElementById('scene')!;
  let world: CityWorld | null = null;

  // --- Guided tour: fly through the biggest projects, tallest first. ---
  const tourButton = document.getElementById('btn-tour') as HTMLButtonElement;
  const tourStops = [...data.projects].sort((a, b) => b.commits - a.commits).slice(0, 12);
  let tourTimer: number | null = null;
  let tourIndex = 0;
  tourButton.innerHTML = `${icon('play')}<span class="label-wide">Tour</span>`;
  function stopTour(): void {
    if (tourTimer === null) return;
    window.clearInterval(tourTimer);
    tourTimer = null;
    tourButton.innerHTML = `${icon('play')}<span class="label-wide">Tour</span>`;
    tourButton.setAttribute('aria-pressed', 'false');
  }
  function startTour(): void {
    tourIndex = 0;
    const step = () => {
      selectProject(tourStops[tourIndex % tourStops.length].id);
      tourIndex += 1;
    };
    step();
    tourTimer = window.setInterval(step, 6500);
    tourButton.innerHTML = `${icon('stop')}<span class="label-wide">Stop tour</span>`;
    tourButton.setAttribute('aria-pressed', 'true');
  }
  tourButton.addEventListener('click', () => (tourTimer === null ? startTour() : stopTour()));
  // Any hands-on exploring ends the tour.
  container.addEventListener('pointerdown', stopTour);
  document.getElementById('btn-list')!.addEventListener('click', stopTour);

  const ui = new UI({
    onSelectProject: (id) => {
      stopTour();
      selectProject(id);
    },
    onSelectDistrict: (id) => {
      stopTour();
      ui.hidePanel();
      writeHash(`d/${id}`);
      world?.setSelected(null);
      world?.focusDistrict(id);
    },
    onOverview: () => {
      stopTour();
      ui.hidePanel();
      writeHash('');
      world?.setSelected(null);
      world?.focusOverview();
    },
    onWatchGrowth: () => watchGrowth(),
    onStep: (direction) => {
      stopTour();
      stepProject(direction);
    },
    onClosePanel: () => {
      stopTour();
      ui.hidePanel();
      writeHash('');
      world?.setSelected(null);
      world?.focusOverview();
    }
  });

  // --- The town going up, in the order the repos were created. ---
  const buildButton = document.getElementById('btn-build') as HTMLButtonElement;
  buildButton.innerHTML = `${icon('history')}<span class="label-wide">Replay</span>`;
  buildButton.addEventListener('click', () => watchGrowth());
  const brand = document.getElementById('btn-about')!;
  const stats = document.getElementById('brand-stats')!;
  let restingStats = '';
  function watchGrowth(): void {
    if (!world) return;
    stopTour();
    ui.hidePanel();
    writeHash('');
    world.setSelected(null);
    world.focusOverview();
    restingStats ||= stats.textContent ?? '';
    brand.classList.add('is-replaying');
    world.playGrowth(
      15000,
      (date, built) => {
        const month = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
        stats.textContent = `${month} · ${built} of ${data.projects.length} projects built`;
      },
      () => {
        stats.textContent = restingStats;
        brand.classList.remove('is-replaying');
      }
    );
  }

  function selectProject(id: string): void {
    const project = data.projects.find((p) => p.id === id);
    if (!project) return;
    writeHash(`p/${id}`);
    ui.showProjectPanel(project);
    world?.setSelected(id);
    world?.focusProject(id);
  }

  // --- Keyboard: the town is fully drivable without a pointer. ---
  //   Left / Right  previous / next project, biggest first
  //   T tour, N night and day, D directory, H whole town, Esc close
  const bySize = [...data.projects].sort((a, b) => b.commits - a.commits);
  /** Step from whatever is open now; with nothing open, forward starts at the biggest. */
  function stepProject(step: 1 | -1): void {
    const current = bySize.findIndex((p) => `#/p/${p.id}` === window.location.hash);
    const cursor = current < 0 ? (step > 0 ? 0 : bySize.length - 1) : (current + step + bySize.length) % bySize.length;
    selectProject(bySize[cursor].id);
  }
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (ui.isListOpen()) return;
    const key = e.key.toLowerCase();
    if (key === 'arrowright' || key === 'arrowleft') {
      stopTour();
      stepProject(key === 'arrowright' ? 1 : -1);
      // Keyboard users land on the panel, so Tab goes straight to its links.
      document.getElementById('panel')!.focus({ preventScroll: true });
    } else if (key === 't') tourButton.click();
    else if (key === 'n') document.getElementById('btn-daynight')!.click();
    else if (key === 'd') document.getElementById('btn-list')!.click();
    else if (key === 'b') watchGrowth();
    else if (key === 'h') {
      stopTour();
      ui.hidePanel();
      writeHash('');
      world?.setSelected(null);
      world?.focusOverview();
    } else return;
    // Every handled key is consumed. Without this, D opened the directory and
    // then typed a "d" into its filter box, which had just taken focus.
    e.preventDefault();
  });

  document.getElementById('btn-about')!.addEventListener('click', () => {
    stopTour();
    selectAbout();
  });

  function selectAbout(): void {
    ui.showAboutPanel();
    world?.setSelected(null);
    world?.focusAbout();
  }

  if (!webglAvailable()) {
    ui.showWebglFallback();
    document.documentElement.dataset.testReady = '1';
    return;
  }

  const DAY_KEY = 'project-city-daytime';
  const dayButton = document.getElementById('btn-daynight') as HTMLButtonElement;
  const renderDayButton = (day: boolean) => {
    document.body.classList.toggle('is-day', day);
    dayButton.innerHTML = icon(day ? 'moon' : 'sun');
    dayButton.title = day ? 'Switch to night (N)' : 'Switch to day (N)';
  };
  dayButton.addEventListener('click', () => {
    const day = !(world?.isDaytime() ?? false);
    world?.setDaytime(day);
    renderDayButton(day);
    localStorage.setItem(DAY_KEY, day ? '1' : '0');
  });

  // First visit follows the visitor's own clock; after that, their last choice.
  const savedDay = localStorage.getItem(DAY_KEY);
  const hour = new Date().getHours();
  const startAsDay = savedDay !== null ? savedDay === '1' : hour >= 7 && hour < 19;

  performance.mark('city-build-start');
  world = new CityWorld(container, data, {
    onHover: (project) => ui.showTooltip(project),
    onSelect: (id) => {
      if (id === ABOUT_ID) {
        selectAbout();
      } else if (id) {
        selectProject(id);
      }
    },
    onReady: () => {
      performance.mark('city-first-frame');
      ui.hideLoader();
      document.documentElement.dataset.testReady = '1';
      const initial = readHash();
      if (initial.kind === 'project') selectProject(initial.id);
      else if (initial.kind === 'district') world?.focusDistrict(initial.id);
    }
  });
  performance.mark('city-build-end');
  // Honest stages: the lots are laid out; what is left is the GPU compiling shaders.
  const note = document.getElementById('loader-note');
  if (note) note.textContent = 'Pouring concrete';
  world.setDaytime(startAsDay, true);
  renderDayButton(startAsDay);
  world.start();
}

// Labels and billboards are painted to canvas, so the typeface has to be in
// memory before the town is built. Don't let a slow font hold the door, though.
const fonts = Promise.all([
  document.fonts.load('800 16px "Overpass Variable"'),
  document.fonts.load('500 16px "Overpass Mono Variable"')
]);
Promise.race([fonts, new Promise((resolve) => window.setTimeout(resolve, 1500))]).then(boot, boot);
