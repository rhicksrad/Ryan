import {
  DataTexture,
  FloatType,
  RedFormat,
  NearestFilter,
  RGBAFormat,
  LinearFilter,
  RepeatWrapping,
  Texture,
  TextureLoader
} from 'three';
import type { LoadedAssets } from '../types';

export class AssetLoader {
  private textureLoader = new TextureLoader();

  async load(): Promise<LoadedAssets> {
    const [noiseTexture, smokeTexture] = await Promise.all([
      this.generateNoiseTexture(),
      this.generateSmokeTexture()
    ]);

    noiseTexture.generateMipmaps = false;
    smokeTexture.generateMipmaps = false;

    return {
      noiseTexture,
      smokeTexture
    };
  }

  async loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture: Texture) => {
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.needsUpdate = true;
          resolve(texture);
        },
        undefined,
        (err: unknown) => reject(err)
      );
    });
  }

  private async generateNoiseTexture(size = 128): Promise<DataTexture> {
    const data = new Float32Array(size * size);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random();
    }
    const texture = new DataTexture(data, size, size, RedFormat, FloatType);
    texture.magFilter = texture.minFilter = NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private async generateSmokeTexture(size = 64): Promise<DataTexture> {
    const channels = 4;
    const data = new Uint8Array(size * size * channels);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const idx = (i * size + j) * channels;
        const dx = (i / size) * 2 - 1;
        const dy = (j / size) * 2 - 1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const alpha = Math.max(0, 1 - dist * dist);
        const value = Math.floor(alpha * 255);
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = Math.floor(alpha * 255);
      }
    }
    const texture = new DataTexture(data, size, size, RGBAFormat);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }
}
