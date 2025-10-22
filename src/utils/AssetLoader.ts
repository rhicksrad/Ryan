import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  RepeatWrapping,
  Texture
} from 'three';

export class AssetLoader {
  private textures = new Map<string, Texture>();
  async preload(): Promise<void> {
    return Promise.resolve();
  }

  getSmokeTexture(): Texture {
    if (this.textures.has('smoke')) {
      return this.textures.get('smoke')!;
    }
    const size = 16;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - size / 2) / (size / 2);
        const dy = (y - size / 2) / (size / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const alpha = Math.max(0, 1 - dist);
        const idx = (y * size + x) * 4;
        data[idx] = 220;
        data[idx + 1] = 220;
        data[idx + 2] = 220;
        data[idx + 3] = Math.floor(alpha * 255);
      }
    }
    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    this.textures.set('smoke', texture);
    return texture;
  }
}
