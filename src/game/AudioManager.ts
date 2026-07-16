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
    const notes: Record<SoundName, [number, number, OscillatorType]> = {
      build: [420, 0.08, 'triangle'], shot: [760, 0.035, 'square'], hit: [170, 0.045, 'sine'],
      spell: [540, 0.14, 'sine'], death: [110, 0.11, 'sawtooth'], wave: [330, 0.28, 'triangle'],
      boss: [74, 0.75, 'sawtooth'], victory: [660, 0.65, 'triangle'], defeat: [92, 0.8, 'sine'],
    };
    this.tone(...notes[name], 0.035);
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
      const notes = [110, 138.6, 164.8, 138.6];
      this.tone(notes[step % notes.length], 1.4, 'sine', 0.009);
      step += 1;
    };
    pulse();
    this.musicTimer = window.setInterval(pulse, 1600);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }
}
