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
    const floorLit = floorMood < 0.12 ? 0.85 : floorMood < 0.3 ? style.lit * 1.8 : style.lit * 0.7;
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
        const pick = rand();
        const base = (pick < 0.62 ? warm : pick < 0.86 ? cool : accent).clone();
        base.multiplyScalar(0.5 + rand() * 0.5);
        night.ctx.fillStyle = hex(base);
        night.ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
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

  // Lettered board: what every tower gets, and what a poster shows until it loads.
  ctx.fillStyle = '#10131c';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillStyle = '#fffaf0';
  ctx.font = `800 58px ${SIGN_FONT}`;
  ctx.fillText(upper, 256, 96, 460);
  ctx.fillStyle = '#c9cbd3';
  ctx.font = `500 27px ${SIGN_FONT}`;
  ctx.fillText(line, 256, 160, 460);
  ctx.fillStyle = accent;
  ctx.font = `700 20px ${SIGN_FONT}`;
  ctx.fillText(footer.toUpperCase(), 256, 216, 460);

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

/** Floating name tag: a small enamel plate with the district color down its edge. */
export function labelSprite(text: string, accent: string): THREE.Sprite {
  const k = 4; // supersample for crisp text
  const font = `700 ${13 * k}px ${SIGN_FONT}`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const textWidth = measure.measureText(text).width;

  const bar = 5 * k;
  const padX = 9 * k;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(textWidth + padX * 2 + bar);
  canvas.height = 24 * k;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#16181d';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 3 * k);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, bar, canvas.height);
  ctx.restore();

  ctx.font = font;
  ctx.fillStyle = '#f4f1e6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bar + padX, canvas.height / 2 + k);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

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
  // Constant screen-size labels; scale is in view-height units with sizeAttenuation off.
  const screenHeight = 0.027;
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
