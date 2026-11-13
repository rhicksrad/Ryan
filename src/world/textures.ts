import * as THREE from 'three';

/** Everything painted to canvas uses the same road-sign face as the HTML interface. */
const SIGN_FONT = '"Overpass Variable", "Overpass", system-ui, sans-serif';

export interface FacadeStyle {
  /** 'curtain' = floor-to-ceiling glass; 'punched' = windows set in a masonry wall. */
  kind: 'curtain' | 'punched';
  /** Glass tint by day. */
  glass: string;
  /** Mullions (curtain) or wall (punched). */
  frame: string;
  /** District accent — a few lit windows pick it up at night. */
  accent: string;
  /** Share of windows lit at night. */
  lit: number;
}

export interface Facade {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  /** Windows per tile, so callers can size UVs in whole windows. */
  cols: number;
  rows: number;
}

const FACADE_COLS = 8;
const FACADE_ROWS = 16;

/**
 * A building skin as two matched tiles: the daytime surface (glass and frame)
 * and the night-time glow (which windows are lit). Mipmapped and anisotropic so
 * a distant tower resolves to a calm shimmer rather than pixel noise.
 */
export function facadeTextures(style: FacadeStyle, rand: () => number): Facade {
  const cell = 32;
  const width = FACADE_COLS * cell;
  const height = FACADE_ROWS * cell;
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext('2d')! };
  };
  const day = make();
  const night = make();

  const glass = new THREE.Color(style.glass);
  const frame = new THREE.Color(style.frame);
  const accent = new THREE.Color(style.accent);
  const warm = new THREE.Color('#ffd9a0');
  const cool = new THREE.Color('#dfeaff');
  const amber = new THREE.Color('#ffbf78');
  const soft = new THREE.Color('#fff0d4');
  const hex = (c: THREE.Color) => `#${c.getHexString()}`;

  day.ctx.fillStyle = hex(frame);
  day.ctx.fillRect(0, 0, width, height);
  night.ctx.fillStyle = '#000000';
  night.ctx.fillRect(0, 0, width, height);

  const curtain = style.kind === 'curtain';
  if (!curtain) {
    // Masonry: faint courses and weathering so the wall is not a flat fill.
    for (let i = 0; i < 2600; i += 1) {
      day.ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      day.ctx.fillRect(rand() * width, Math.floor(rand() * (height / 4)) * 4, 3 + rand() * 9, 2);
    }
  }
  const padX = curtain ? 1 : 7.5;
  const padTop = curtain ? 0 : 6;
  const padBottom = curtain ? 8 : 9; // spandrel / sill
  // The sky reflects unevenly across a glass wall: a slow wave of brightness, column by column.
  const columnTone = Array.from({ length: FACADE_COLS }, (_, x) => 1 + Math.sin((x / FACADE_COLS) * Math.PI * 2 + rand() * 0.6) * 0.07);

  for (let y = 0; y < FACADE_ROWS; y += 1) {
    // Offices light up by the floor: some storeys blaze, most are sparse.
    const floorMood = rand();
    // Whole floors go dark, a few are working late, the rest are scattered.
    const floorLit = floorMood < 0.24 ? 0 : floorMood < 0.34 ? 0.8 : floorMood < 0.5 ? style.lit * 1.8 : style.lit * 0.8;
    const floorTone = 0.93 + rand() * 0.14;
    for (let x = 0; x < FACADE_COLS; x += 1) {
      const px = x * cell + padX;
      const py = y * cell + padTop;
      const pw = cell - padX * 2;
      const ph = cell - padTop - padBottom;

      // Daytime pane: sky-tinted glass, brighter toward the top of each pane.
      const tone = floorTone * columnTone[x] * (0.95 + rand() * 0.1);
      const top = glass.clone().multiplyScalar(tone * (curtain ? 1.1 : 0.9));
      const bottom = glass.clone().multiplyScalar(tone * (curtain ? 0.84 : 0.62));
      const g = day.ctx.createLinearGradient(0, py, 0, py + ph);
      g.addColorStop(0, hex(top));
      g.addColorStop(1, hex(bottom));
      day.ctx.fillStyle = g;
      day.ctx.fillRect(px, py, pw, ph);
      // Blinds drawn part-way down on some panes.
      if (rand() < 0.16) {
        day.ctx.fillStyle = 'rgba(236, 232, 220, 0.5)';
        day.ctx.fillRect(px, py, pw, ph * (0.25 + rand() * 0.45));
      }
      if (curtain) {
        // Spandrel panel at the floor line, a shade deeper than the vision glass.
        day.ctx.fillStyle = hex(glass.clone().lerp(frame, 0.55).multiplyScalar(tone));
        day.ctx.fillRect(px, py + ph, pw, padBottom - 1.5);
      } else {
        // Stone sill and a shadow under the lintel.
        day.ctx.fillStyle = 'rgba(255,255,255,0.28)';
        day.ctx.fillRect(px - 1.5, py + ph, pw + 3, 2);
        day.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        day.ctx.fillRect(px, py, pw, 2);
        day.ctx.fillStyle = 'rgba(0,0,0,0.28)';
        day.ctx.fillRect(px + pw / 2 - 0.5, py, 1, ph);
      }

      if (rand() < floorLit) {
        // A lit room, not a lit square: brightest under the ceiling lights,
        // split by its mullion, sometimes half hidden by a blind, and most rooms
        // are dim with only a few blazing.
        const pick = rand();
        // Mostly tungsten and warm white, some cold fluorescent, the odd screen in the district color.
        const base = (pick < 0.4 ? warm : pick < 0.66 ? amber : pick < 0.8 ? soft : pick < 0.96 ? cool : accent).clone();
        const level = 0.22 + Math.pow(rand(), 2.2) * 0.78;
        const top = base.clone().multiplyScalar(level);
        const bottom = base.clone().multiplyScalar(level * (0.35 + rand() * 0.35));
        const glow = night.ctx.createLinearGradient(0, py, 0, py + ph);
        glow.addColorStop(0, hex(top));
        glow.addColorStop(1, hex(bottom));
        night.ctx.fillStyle = glow;
        const blind = rand() < 0.2 ? ph * (0.3 + rand() * 0.4) : 0;
        night.ctx.fillRect(px + 1.5, py + 1.5 + blind, pw - 3, ph - 3 - blind);
        night.ctx.fillStyle = '#000000';
        night.ctx.fillRect(px + pw / 2 - 0.75, py, 1.5, ph);
        if (rand() < 0.25) night.ctx.fillRect(px + (rand() < 0.5 ? 0 : pw / 2), py, pw / 2, ph);
      }
    }
  }

  const finish = (canvas: HTMLCanvasElement) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  };
  return { map: finish(day.canvas), emissiveMap: finish(night.canvas), cols: FACADE_COLS, rows: FACADE_ROWS };
}

/** Cozy warm-window texture for houses and mansions. */
export function houseWindowTexture(rand: () => number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, 64, 48);
  for (let x = 0; x < 3; x += 1) {
    if (rand() < 0.75) {
      ctx.fillStyle = rand() < 0.7 ? '#ffcf87' : '#ffe9c4';
      ctx.fillRect(6 + x * 20, 14, 12, 18);
      ctx.strokeStyle = '#0a0a12';
      ctx.lineWidth = 2;
      ctx.strokeRect(6 + x * 20 + 5, 14, 2, 18);
      ctx.strokeRect(6 + x * 20, 22, 12, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Billboard advertising a project. With `art` it is a printed poster with the
 * title set across the calm lower third; without, a plain lettered board.
 */
export function billboardTexture(
  title: string,
  line: string,
  accent: string,
  footer = '',
  artUrl?: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2); // drawn on a 512 x 256 grid, at twice the resolution
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const upper = title.toUpperCase();

  // Lettered board: what a tower without poster art gets, and what a poster shows
  // until it loads. Set like a letterpress bill: paper stock, the district color
  // as a wide band of ink, and the name as large as the sheet allows.
  ctx.fillStyle = '#f1ecdc';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 512, 34);
  ctx.fillRect(0, 222, 512, 34);
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 34, 512, 5);
  ctx.fillRect(0, 217, 512, 5);
  // The name on one line if it fits large, otherwise broken over two.
  const words = upper.split(' ');
  let rows = [upper];
  ctx.font = `900 76px ${SIGN_FONT}`;
  if (ctx.measureText(upper).width > 470 && words.length > 1) {
    let best = 1;
    let bestGap = Infinity;
    for (let i = 1; i < words.length; i += 1) {
      const gap = Math.abs(ctx.measureText(words.slice(0, i).join(' ')).width - ctx.measureText(words.slice(i).join(' ')).width);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    rows = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  const widest = Math.max(...rows.map((row) => ctx.measureText(row).width));
  const size = Math.min(76, (76 * 468) / widest, rows.length === 1 ? 76 : 60);
  ctx.font = `900 ${size}px ${SIGN_FONT}`;
  ctx.fillStyle = '#16181d';
  const middle = line ? 112 : 128;
  rows.forEach((row, i) => ctx.fillText(row, 256, middle + (i - (rows.length - 1) / 2) * size * 0.98, 480));
  if (line) {
    ctx.fillStyle = '#3b3f49';
    ctx.font = `600 22px ${SIGN_FONT}`;
    ctx.fillText(line, 256, rows.length === 1 ? 176 : 192, 470);
  }
  ctx.fillStyle = '#16181d';
  ctx.font = `800 19px ${SIGN_FONT}`;
  ctx.fillText(footer.toUpperCase(), 256, 240, 480);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  if (artUrl) {
    // Poster: the art fills the board and the title sits in its quiet bottom third.
    loadArt(artUrl, (art) => {
      ctx.drawImage(art, 0, 0, 512, 256);
      ctx.fillStyle = '#fffaf0';
      ctx.font = `800 46px ${SIGN_FONT}`;
      ctx.fillText(upper, 256, 204, 470);
      ctx.fillStyle = accent;
      ctx.font = `700 17px ${SIGN_FONT}`;
      ctx.fillText(footer.toUpperCase(), 256, 238, 470);
      texture.needsUpdate = true;
    });
  }
  return texture;
}

/** A shop fascia: the project's name sign-painted on a long board in the district color. */
export function fasciaTexture(title: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f1ecdc';
  ctx.fillRect(0, 0, 768, 128);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 768, 14);
  ctx.fillRect(0, 114, 768, 14);
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 14, 768, 4);
  ctx.fillRect(0, 110, 768, 4);
  const upper = title.toUpperCase();
  ctx.font = `900 72px ${SIGN_FONT}`;
  const size = Math.min(72, (72 * 720) / ctx.measureText(upper).width);
  ctx.font = `900 ${size}px ${SIGN_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(upper, 384, 68, 730);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const artCache = new Map<string, Promise<HTMLImageElement>>();

/** Loads a piece of art once and hands it to every sign that wants it. */
function loadArt(url: string, paint: (art: HTMLImageElement) => void): void {
  let pending = artCache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    artCache.set(url, pending);
  }
  // A missing poster just leaves the lettered board up.
  pending.then(paint, () => undefined);
}

/**
 * Neutral asphalt with a dashed center line and solid edge lines, repeated along
 * the strip. Materials tint it navy at night and leave it charcoal by day.
 */
export function roadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#343946';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? '#3a3f4c' : '#2f333f';
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  ctx.fillStyle = '#8f93a0';
  ctx.fillRect(3, 0, 1.5, 64);
  ctx.fillRect(59.5, 0, 1.5, 64);
  ctx.fillStyle = '#d6d2b8';
  ctx.fillRect(31, 6, 2, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** District entrance road sign. */
export function signTexture(name: string, color: string, emblem?: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d2418';
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 128, 14);
  ctx.fill();
  ctx.strokeStyle = '#e8ecff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 116, 10);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(18, 18, 14, 92);
  ctx.fillStyle = '#f2f5ff';
  ctx.font = `bold 52px ${SIGN_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 272, 64, 440);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (emblem) {
    // The district's enamel badge replaces the plain color bar once it arrives.
    loadArt(emblem, (art) => {
      ctx.fillStyle = '#0d2418';
      ctx.fillRect(12, 12, 488, 104);
      ctx.drawImage(art, 16, 16, 96, 96);
      ctx.fillStyle = '#f2f5ff';
      ctx.fillText(name.toUpperCase(), 306, 64, 372);
      texture.needsUpdate = true;
    });
  }
  return texture;
}

/** Realtor-style board planted on lots that have no project yet. */
export function vacancyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f1e6';
  ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = '#c8342c';
  ctx.fillRect(0, 0, 256, 62);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 40px ${SIGN_FONT}`;
  ctx.fillText('LOT FOR SALE', 128, 33, 236);
  ctx.fillStyle = '#1c2233';
  ctx.font = 'bold 26px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  ctx.fillText('$ git init', 128, 100, 236);
  ctx.fillStyle = '#5a6074';
  ctx.font = `21px ${SIGN_FONT}`;
  ctx.fillText('Next project builds here', 128, 152, 236);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * A building's name plate, from the same sign family as the interface: a white
 * plate with a black keyline, the district color in a tab down its left end,
 * and the name in capitals. It stands on its anchor point and is opaque, so it
 * reads over sky, glass, and grass alike.
 */
export function labelSprite(text: string, accent: string): THREE.Sprite {
  // Drawn close to the size it is shown at. A heavily supersampled canvas is
  // averaged back down by the GPU, which turns thin black strokes grey.
  const k = 2;
  const label = text.toUpperCase();
  const font = `900 ${13.5 * k}px ${SIGN_FONT}`;
  const tracking = 0.25 * k;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const textWidth = measure.measureText(label).width + tracking * (label.length - 1);

  const tab = 9 * k;
  const padX = 8 * k;
  const edge = 2 * k; // outer paper margin around the keyline, as on a real plate
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(textWidth + padX * 2 + tab + edge * 2);
  canvas.height = 25 * k;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#fbfaf4';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 4.5 * k);
  ctx.fill();
  // District tab inside the keyline.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(edge, edge, w - edge * 2, h - edge * 2, 3 * k);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(edge, edge, tab, h - edge * 2);
  ctx.restore();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.6 * k;
  ctx.beginPath();
  ctx.roundRect(edge, edge, w - edge * 2, h - edge * 2, 3 * k);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(edge + tab, edge);
  ctx.lineTo(edge + tab, h - edge);
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let x = edge + tab + padX;
  for (const ch of label) {
    ctx.fillText(ch, x, h / 2 + 1.2 * k);
    x += ctx.measureText(ch).width + tracking;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  sprite.center.set(0.5, 0);
  // Constant screen-size labels; scale is in view-height units with sizeAttenuation off.
  const screenHeight = 0.0235;
  sprite.scale.set((canvas.width / canvas.height) * screenHeight, screenHeight, 1);
  return sprite;
}

/** Word-wrapped speech bubble for citizens quoting their READMEs. */
export function bubbleSprite(speaker: string, text: string, accent: string): THREE.Sprite {
  const scale = 3;
  const bodyFont = `${13 * scale}px ${SIGN_FONT}`;
  const nameFont = `bold ${11 * scale}px ${SIGN_FONT}`;
  const maxWidth = 220 * scale;

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = bodyFont;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const lineHeight = 19 * scale;
  const padX = 14 * scale;
  const padY = 12 * scale;
  const nameHeight = 16 * scale;
  const width = Math.min(
    maxWidth + padX * 2,
    Math.max(...lines.map((l) => measure.measureText(l).width), measure.measureText(speaker).width) + padX * 2
  );
  const height = padY * 2 + nameHeight + lines.length * lineHeight + 10 * scale;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height) + 10 * scale; // room for the tail
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#16181d';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.roundRect(ctx.lineWidth, ctx.lineWidth, canvas.width - ctx.lineWidth * 2, height - ctx.lineWidth * 2, 4 * scale);
  ctx.fill();
  ctx.stroke();

  // tail
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 7 * scale, height - ctx.lineWidth * 2);
  ctx.lineTo(canvas.width / 2, canvas.height - ctx.lineWidth);
  ctx.lineTo(canvas.width / 2 + 7 * scale, height - ctx.lineWidth * 2);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = nameFont;
  ctx.fillStyle = accent;
  ctx.fillText(speaker.toUpperCase(), padX, padY);
  ctx.font = bodyFont;
  ctx.fillStyle = '#f4f1e6';
  lines.forEach((line, i) => {
    ctx.fillText(line, padX, padY + nameHeight + 6 * scale + i * lineHeight);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: false
  });
  const sprite = new THREE.Sprite(material);
  const screenHeight = 0.052 * (canvas.height / (60 * scale));
  sprite.scale.set((canvas.width / canvas.height) * screenHeight, screenHeight, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 30;
  return sprite;
}
