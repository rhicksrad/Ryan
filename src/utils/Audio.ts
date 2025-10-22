export class AudioController {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private muted = false;

  constructor() {
    const stored = localStorage.getItem('ryan.audio.muted');
    this.muted = stored === 'true';
  }

  private ensureContext() {
    if (this.context) return;
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = this.muted ? 0 : 0.3;
    this.gain.connect(this.context.destination);
  }

  async resume(): Promise<void> {
    this.ensureContext();
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  get destination(): GainNode | null {
    this.ensureContext();
    return this.gain;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('ryan.audio.muted', String(this.muted));
    if (this.gain) {
      this.gain.gain.value = this.muted ? 0 : 0.3;
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  createOscillator(frequency: number): OscillatorNode {
    this.ensureContext();
    const osc = this.context!.createOscillator();
    osc.frequency.value = frequency;
    osc.type = 'sine';
    const gain = this.context!.createGain();
    gain.gain.value = 0.02;
    osc.connect(gain).connect(this.gain!);
    return osc;
  }

  createBufferSource(buffer: AudioBuffer): AudioBufferSourceNode {
    this.ensureContext();
    const source = this.context!.createBufferSource();
    source.connect(this.gain!);
    source.buffer = buffer;
    return source;
  }
}
