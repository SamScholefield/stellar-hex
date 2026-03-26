import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'stellar-hex-audio';

interface AudioPrefs {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { masterVolume: 0.7, sfxVolume: 0.8, musicVolume: 0.5, muted: false };
}

@Injectable({ providedIn: 'root' })
export class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private clickBuffer: AudioBuffer | null = null;

  private readonly prefs = loadPrefs();
  readonly masterVolume = signal(this.prefs.masterVolume);
  readonly sfxVolume = signal(this.prefs.sfxVolume);
  readonly musicVolume = signal(this.prefs.musicVolume);
  readonly muted = signal(this.prefs.muted);

  constructor() {
    effect(() => {
      const master = this.masterVolume();
      const sfx = this.sfxVolume();
      const music = this.musicVolume();
      const isMuted = this.muted();

      if (this.masterGain) this.masterGain.gain.value = isMuted ? 0 : master;
      if (this.sfxGain) this.sfxGain.gain.value = sfx;

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          masterVolume: master, sfxVolume: sfx, musicVolume: music, muted: isMuted,
        }));
      } catch { /* ignore */ }
    });
  }

  async ensureContext(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted() ? 0 : this.masterVolume();
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume();
    this.sfxGain.connect(this.masterGain);

    this.loadClickBuffer();
  }

  private async loadClickBuffer(): Promise<void> {
    if (!this.ctx || this.clickBuffer) return;
    try {
      const res = await fetch('audio/click_003.ogg');
      const buf = await res.arrayBuffer();
      this.clickBuffer = await this.ctx.decodeAudioData(buf);
    } catch { /* ignore — click will silently fail */ }
  }

  playClick(): void {
  }

  playDiscovery(): void { /* disabled */ }
}
