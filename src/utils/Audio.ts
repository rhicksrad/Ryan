const STORAGE_KEY = 'ryan-world-audio';

type Listener = (active: boolean) => void;

export class AudioController {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private unlocked = false;
  private enabled = false;
  private listeners = new Set<Listener>();

  constructor() {
    this.enabled = window.localStorage.getItem(STORAGE_KEY) !== 'muted';
    document.addEventListener('pointerdown', () => this.unlock(), { once: true });
    document.addEventListener('keydown', () => this.unlock(), { once: true });
  }

  onChange(listener: Listener) {
    this.listeners.add(listener);
    listener(this.enabled);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.enabled);
    }
  }

  async unlock() {
    if (this.unlocked) return;
    try {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.enabled ? 1 : 0;
      this.gain.connect(this.context.destination);
      this.unlocked = true;
    } catch (error) {
      console.warn('Audio context failed to init', error);
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.gain) {
      this.gain.gain.value = this.enabled ? 1 : 0;
    }
    window.localStorage.setItem(STORAGE_KEY, this.enabled ? 'unmuted' : 'muted');
    this.notify();
    return this.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  playHoverTone() {
    if (!this.enabled || !this.context || !this.gain) return;
    const osc = this.context.createOscillator();
    const envelope = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.value = 480;
    envelope.gain.value = 0.001;
    envelope.gain.exponentialRampToValueAtTime(0.05, this.context.currentTime + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.3);
    osc.connect(envelope);
    envelope.connect(this.gain);
    osc.start();
    osc.stop(this.context.currentTime + 0.35);
  }
}
