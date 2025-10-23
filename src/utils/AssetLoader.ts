import {
  DataTexture,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3
} from 'three';

export class AssetLoader {
  private smokeTexture: DataTexture | null = null;
  private noiseSize = 64;
  private noiseData: Float32Array | null = null;

  getSmokeTexture(): DataTexture {
    if (!this.smokeTexture) {
      const size = 64;
      const data = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const dx = x / size - 0.5;
          const dy = y / size - 0.5;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const softness = Math.max(0, 1 - distance * 2.2);
          const alpha = Math.pow(softness, 2.5);
          const offset = (y * size + x) * 4;
          data[offset] = 255;
          data[offset + 1] = 255;
          data[offset + 2] = 255;
          data[offset + 3] = Math.floor(alpha * 255);
        }
      }
      this.smokeTexture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
      this.smokeTexture.colorSpace = SRGBColorSpace;
      this.smokeTexture.needsUpdate = true;
    }
    return this.smokeTexture;
  }

  getNoiseValue(position: Vector3): number {
    if (!this.noiseData) {
      this.noiseData = this.generateNoise(this.noiseSize);
    }
    const size = this.noiseSize;
    const x = Math.abs(Math.floor(position.x) % size);
    const y = Math.abs(Math.floor(position.y) % size);
    const z = Math.abs(Math.floor(position.z) % size);
    const index = (z * size * size + y * size + x) % this.noiseData.length;
    return this.noiseData[index];
  }

  private generateNoise(size: number): Float32Array {
    const data = new Float32Array(size * size * size);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random();
    }
    return data;
  }

  async loadAudioBuffer(context: AudioContext, url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return context.decodeAudioData(arrayBuffer);
  }
}
