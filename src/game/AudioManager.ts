export type SoundName = 'build' | 'shot' | 'hit' | 'spell' | 'death' | 'wave' | 'boss' | 'victory' | 'defeat';

export class AudioManager {
  private context: AudioContext | null = null;
  private musicTimer: number | null = null;
  musicEnabled = localStorage.getItem('rift-music') !== 'off';
  effectsEnabled = localStorage.getItem('rift-effects') !== 'off';

  unlock(): void {
    this.context ??= new AudioContext();
    void this.context.resume();
    this.syncMusic();
  }

  setMusic(enabled: boolean): void {
    this.musicEnabled = enabled;
    localStorage.setItem('rift-music', enabled ? 'on' : 'off');
    this.syncMusic();
  }

  setEffects(enabled: boolean): void {
    this.effectsEnabled = enabled;
    localStorage.setItem('rift-effects', enabled ? 'on' : 'off');
  }

  play(name: SoundName): void {
    if (!this.effectsEnabled || !this.context) return;
    if (name === 'build') this.chord([330, 440, 660], 0.18, 'triangle', 0.026);
    if (name === 'shot') this.tone(880, 0.055, 'square', 0.018, 520);
    if (name === 'hit') { this.noise(0.06, 0.025, 900); this.tone(150, 0.07, 'sine', 0.02, 85); }
    if (name === 'spell') { this.chord([392, 587, 784], 0.24, 'sine', 0.025); this.tone(220, 0.3, 'triangle', 0.018, 980); }
    if (name === 'death') { this.noise(0.14, 0.034, 430); this.tone(130, 0.22, 'sawtooth', 0.02, 46); }
    if (name === 'wave') this.sequence([262, 330, 392, 523], 0.11, 'triangle', 0.035);
    if (name === 'boss') { this.chord([49, 73.5, 98], 1.1, 'sawtooth', 0.028); this.noise(0.65, 0.025, 180); }
    if (name === 'victory') this.sequence([392, 494, 587, 784, 988], 0.18, 'triangle', 0.04);
    if (name === 'defeat') this.sequence([196, 165, 131, 98], 0.22, 'sine', 0.035);
  }

  private syncMusic(): void {
    if (!this.context || !this.musicEnabled) {
      if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
      this.musicTimer = null;
      return;
    }
    if (this.musicTimer !== null) return;
    let step = 0;
    const pulse = () => {
      const roots = [82.4, 98, 110, 73.4];
      const root = roots[step % roots.length];
      this.tone(root, 2.7, 'sine', 0.007);
      this.tone(root * 1.5, 2.3, 'triangle', 0.0045);
      this.tone(root * 2, 1.8, 'sine', 0.0035);
      step += 1;
    };
    pulse();
    this.musicTimer = window.setInterval(pulse, 2400);
  }

  private chord(frequencies: number[], duration: number, type: OscillatorType, volume: number): void {
    frequencies.forEach((frequency, index) => this.tone(frequency, duration + index * 0.025, type, volume / Math.sqrt(frequencies.length)));
  }

  private sequence(frequencies: number[], stepDuration: number, type: OscillatorType, volume: number): void {
    frequencies.forEach((frequency, index) => this.tone(frequency, stepDuration * 1.5, type, volume, frequency, index * stepDuration));
  }

  private noise(duration: number, volume: number, lowpass: number): void {
    if (!this.context) return;
    const frames = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) channel[index] = (Math.random() * 2 - 1) * (1 - index / frames);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.context.destination);
    source.start();
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, endFrequency = frequency, delay = 0): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}
