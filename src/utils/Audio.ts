const STORAGE_KEY = 'ryan-audio-muted';

export class AudioController {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private muted = false;

  constructor() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      this.muted = stored === 'true';
    } catch (error) {
      console.warn('Unable to read audio preference', error);
    }
  }

  async resume(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.muted ? 0 : 0.2;
      this.gain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.gain) {
      this.gain.gain.setTargetAtTime(value ? 0 : 0.2, this.context!.currentTime, 0.05);
    }
    try {
      localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    } catch (error) {
      console.warn('Unable to store audio preference', error);
    }
  }

  toggle(): boolean {
    const next = !this.muted;
    this.setMuted(next);
    return next;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async playHoverBleep(): Promise<void> {
    await this.resume();
    if (!this.context || !this.gain || this.muted) {
      return;
    }
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 880;
    envelope.gain.value = 0;
    oscillator.connect(envelope);
    envelope.connect(this.gain);
    const now = this.context.currentTime;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.15, now + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  }
}
