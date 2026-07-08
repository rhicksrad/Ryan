import * as THREE from 'three';

/** Emissive office-window texture. Lit windows tinted toward the district color. */
export function windowTexture(accent: string, rand: () => number): THREE.CanvasTexture {
  const cols = 6;
  const rows = 14;
  const cell = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#04050a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const accentColor = new THREE.Color(accent);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const lit = rand() < 0.42;
      if (!lit) continue;
      const warm = rand() < 0.5;
      const base = warm ? new THREE.Color('#ffd9a0') : accentColor.clone();
      const brightness = 0.55 + rand() * 0.45;
      base.multiplyScalar(brightness);
      ctx.fillStyle = `#${base.getHexString()}`;
      ctx.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 7);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

/** Times-Square style billboard advertising a project. */
export function billboardTexture(title: string, line: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 512, 256);
  bg.addColorStop(0, '#0c1022');
  bg.addColorStop(1, '#1a1030');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 512 - 16, 256 - 16);

  ctx.fillStyle = accent;
  ctx.font = 'bold 56px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const upper = title.toUpperCase();
  ctx.fillText(upper, 256, 92, 460);

  ctx.fillStyle = '#eef2ff';
  ctx.font = '30px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(line, 256, 168, 460);

  ctx.fillStyle = '#9aa7cc';
  ctx.font = '22px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('★ ★ ★  NOW SHOWING  ★ ★ ★', 256, 218, 460);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Road surface with a dashed center line, repeated along the strip. */
export function roadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1c2138';
  ctx.fillRect(0, 0, 64, 64);
  // speckle
  for (let i = 0; i < 40; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? '#20263e' : '#171b30';
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  // dashed center line
  ctx.fillStyle = '#8890b8';
  ctx.fillRect(30, 6, 4, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** District entrance road sign. */
export function signTexture(name: string, color: string): THREE.CanvasTexture {
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
  ctx.font = 'bold 52px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 272, 64, 440);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Crisp floating name label rendered to a sprite texture. */
export function labelSprite(text: string, accent: string): THREE.Sprite {
  const scaleFactor = 4;
  const font = `${13 * scaleFactor}px 'Segoe UI', system-ui, sans-serif`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const textWidth = measure.measureText(text.toUpperCase()).width;

  const padX = 14 * scaleFactor;
  const padY = 8 * scaleFactor;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(textWidth + padX * 2);
  canvas.height = 26 * scaleFactor + padY;
  const ctx = canvas.getContext('2d')!;

  const r = 10 * scaleFactor;
  ctx.fillStyle = 'rgba(8, 11, 24, 0.82)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = scaleFactor;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.roundRect(scaleFactor, scaleFactor, canvas.width - scaleFactor * 2, canvas.height - scaleFactor * 2, r);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = font;
  ctx.fillStyle = '#eef2ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2 + scaleFactor);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    sizeAttenuation: false
  });
  const sprite = new THREE.Sprite(material);
  // Constant screen-size labels; scale is in NDC-ish units with sizeAttenuation off.
  const screenHeight = 0.045;
  sprite.scale.set((canvas.width / canvas.height) * screenHeight, screenHeight, 1);
  return sprite;
}

/** Word-wrapped speech bubble for citizens quoting their READMEs. */
export function bubbleSprite(speaker: string, text: string, accent: string): THREE.Sprite {
  const scale = 3;
  const bodyFont = `${13 * scale}px 'Segoe UI', system-ui, sans-serif`;
  const nameFont = `bold ${11 * scale}px 'Segoe UI', system-ui, sans-serif`;
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

  ctx.fillStyle = 'rgba(12, 16, 32, 0.94)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.roundRect(ctx.lineWidth, ctx.lineWidth, canvas.width - ctx.lineWidth * 2, height - ctx.lineWidth * 2, 10 * scale);
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
  ctx.fillStyle = '#eef2ff';
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
