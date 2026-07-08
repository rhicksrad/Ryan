import { data } from './data';
import { CityWorld, ABOUT_ID } from './world/CityWorld';
import { UI } from './ui';

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

  const ui = new UI({
    onSelectProject: (id) => selectProject(id),
    onSelectDistrict: (id) => {
      ui.hidePanel();
      writeHash(`d/${id}`);
      world?.setSelected(null);
      world?.focusDistrict(id);
    },
    onOverview: () => {
      ui.hidePanel();
      writeHash('');
      world?.setSelected(null);
      world?.focusOverview();
    },
    onClosePanel: () => {
      ui.hidePanel();
      writeHash('');
      world?.setSelected(null);
      world?.focusOverview();
    }
  });

  function selectProject(id: string): void {
    const project = data.projects.find((p) => p.id === id);
    if (!project) return;
    writeHash(`p/${id}`);
    ui.showProjectPanel(project);
    world?.setSelected(id);
    world?.focusProject(id);
  }

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
      ui.hideLoader();
      document.documentElement.dataset.testReady = '1';
      const initial = readHash();
      if (initial.kind === 'project') selectProject(initial.id);
      else if (initial.kind === 'district') world?.focusDistrict(initial.id);
    }
  });
  world.start();
}

boot();
