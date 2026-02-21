/**
 * Pure procedural sound synthesis functions using Web Audio API.
 * No Angular imports — every function takes (ctx, dest) and creates one-shot sounds.
 * Web Audio garbage-collects stopped nodes automatically.
 */

export interface AmbientHandle {
  stop(fadeMs?: number): void;
  gainNode: GainNode;
}

// ── Utility ──────────────────────────────────────────────────────────

const noiseCache = new WeakMap<AudioContext, Map<number, AudioBuffer>>();

export function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  let ctxCache = noiseCache.get(ctx);
  if (!ctxCache) {
    ctxCache = new Map();
    noiseCache.set(ctx, ctxCache);
  }
  const cached = ctxCache.get(durationSec);
  if (cached) return cached;

  const length = ctx.sampleRate * durationSec;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  ctxCache.set(durationSec, buffer);
  return buffer;
}

// ── SFX Functions ────────────────────────────────────────────────────

/** UI blip — 40ms 880Hz sine with fast gain decay */
export function playClick(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc.connect(gain).connect(dest);
  osc.start(now);
  osc.stop(now + 0.04);
}

/** Two-tone beep — 120ms 660Hz→880Hz sine pair */
export function playUnitSelect(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  gain.connect(dest);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 660;
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + 0.06);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 880;
  osc2.connect(gain);
  osc2.start(now + 0.06);
  osc2.stop(now + 0.12);
}

/** Engine hum — 80Hz saw + bandpass noise + 3Hz LFO; returns GainNode handle for stopping */
export function playMovement(ctx: AudioContext, dest: AudioNode, durationMs: number): GainNode {
  const now = ctx.currentTime;
  const dur = durationMs / 1000;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.2, now);
  master.gain.setValueAtTime(0.2, now + dur - 0.05);
  master.gain.exponentialRampToValueAtTime(0.001, now + dur);
  master.connect(dest);

  // 80Hz saw oscillator
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 80;
  osc.connect(master);
  osc.start(now);
  osc.stop(now + dur);

  // Bandpass noise
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 400;
  bp.Q.value = 2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.08;
  noise.connect(bp).connect(noiseGain).connect(master);
  noise.start(now);
  noise.stop(now + dur);

  // 3Hz LFO on master gain
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.05;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start(now);
  lfo.stop(now + dur);

  return master;
}

/** Laser zap — sine sweep 1200→200Hz over 200ms */
export function playLaserZap(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain).connect(dest);
  osc.start(now);
  osc.stop(now + 0.2);
}

/** Hit impact — 60Hz sine burst + noise burst over 200ms */
export function playImpactThud(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;

  // 60Hz sine burst
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 60;
  oscGain.gain.setValueAtTime(0.4, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(oscGain).connect(dest);
  osc.start(now);
  osc.stop(now + 0.2);

  // Noise burst
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.2);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  noise.connect(noiseGain).connect(dest);
  noise.start(now);
  noise.stop(now + 0.2);
}

/** Build clank — 3 rapid square pings + noise */
export function playBuild(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const freqs = [600, 800, 1000];

  for (let i = 0; i < freqs.length; i++) {
    const t = now + i * 0.07;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freqs[i];
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // Noise tail
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 0.25);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.08, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  noise.connect(noiseGain).connect(dest);
  noise.start(now);
  noise.stop(now + 0.25);
}

/** Production arpeggio — C5-E5-G5 triangle waves, 180ms total */
export function playProduce(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  const step = 0.06;

  for (let i = 0; i < notes.length; i++) {
    const t = now + i * step;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = notes[i];
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + step * 2);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + step * 2);
  }
}

/** End turn chime — 4-note ascending sine, 400ms */
export function playEndTurn(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
  const step = 0.1;

  for (let i = 0; i < notes.length; i++) {
    const t = now + i * step;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = notes[i];
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 0.15);
  }
}

/** Crystal ping — 2400Hz + 2407Hz beating sines, 600ms long decay */
export function playDiscovery(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  gain.connect(dest);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 2400;
  osc1.connect(gain);
  osc1.start(now);
  osc1.stop(now + 0.6);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 2407;
  osc2.connect(gain);
  osc2.start(now);
  osc2.stop(now + 0.6);
}

/** Error buzz — 120Hz square + 5Hz LFO, 300ms */
export function playError(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 120;
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(gain).connect(dest);
  osc.start(now);
  osc.stop(now + 0.3);

  // 5Hz LFO
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.1;
  lfo.connect(lfoGain).connect(gain.gain);
  lfo.start(now);
  lfo.stop(now + 0.3);
}

/** Start game sweep — saw+sine 80→2000Hz sweep + final hit, 1500ms */
export function playStartGame(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.2, now);
  master.gain.setValueAtTime(0.2, now + 1.3);
  master.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  master.connect(dest);

  // Saw sweep
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.setValueAtTime(80, now);
  saw.frequency.exponentialRampToValueAtTime(2000, now + 1.2);
  const sawGain = ctx.createGain();
  sawGain.gain.value = 0.5;
  saw.connect(sawGain).connect(master);
  saw.start(now);
  saw.stop(now + 1.3);

  // Sine sweep layered
  const sine = ctx.createOscillator();
  sine.type = 'sine';
  sine.frequency.setValueAtTime(80, now);
  sine.frequency.exponentialRampToValueAtTime(2000, now + 1.2);
  const sineGain = ctx.createGain();
  sineGain.gain.value = 0.5;
  sine.connect(sineGain).connect(master);
  sine.start(now);
  sine.stop(now + 1.3);

  // Final hit at 1.2s
  const hitOsc = ctx.createOscillator();
  hitOsc.type = 'sine';
  hitOsc.frequency.value = 80;
  const hitGain = ctx.createGain();
  hitGain.gain.setValueAtTime(0.001, now);
  hitGain.gain.setValueAtTime(0.4, now + 1.2);
  hitGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  hitOsc.connect(hitGain).connect(dest);
  hitOsc.start(now + 1.2);
  hitOsc.stop(now + 1.5);
}

// ── Ambient Functions ────────────────────────────────────────────────

/** Deep space drone — 40Hz saw + lowpass noise + slow sine sweep with slow LFOs */
export function startMenuAmbient(ctx: AudioContext, dest: AudioNode): AmbientHandle {
  const master = ctx.createGain();
  master.gain.value = 0.15;
  master.connect(dest);
  const now = ctx.currentTime;

  // 40Hz saw drone
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = 40;
  const sawGain = ctx.createGain();
  sawGain.gain.value = 0.4;
  saw.connect(sawGain).connect(master);
  saw.start(now);

  // Lowpass noise
  const noiseNode = ctx.createBufferSource();
  noiseNode.buffer = createNoiseBuffer(ctx, 4);
  noiseNode.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.3;
  noiseNode.connect(lp).connect(noiseGain).connect(master);
  noiseNode.start(now);

  // Slow sine sweep LFO on lowpass
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.1;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 80;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start(now);

  return {
    gainNode: master,
    stop(fadeMs = 1500) {
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
      const stopTime = t + fadeMs / 1000 + 0.1;
      saw.stop(stopTime);
      noiseNode.stop(stopTime);
      lfo.stop(stopTime);
    },
  };
}

/** Space atmosphere — bandpass noise + 30Hz sub pulse + random high pings every 3-8s */
export function startGameAmbient(ctx: AudioContext, dest: AudioNode): AmbientHandle {
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(dest);
  const now = ctx.currentTime;
  let stopped = false;

  // Bandpass noise layer
  const noiseNode = ctx.createBufferSource();
  noiseNode.buffer = createNoiseBuffer(ctx, 4);
  noiseNode.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 600;
  bp.Q.value = 0.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.4;
  noiseNode.connect(bp).connect(noiseGain).connect(master);
  noiseNode.start(now);

  // 30Hz sub pulse
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 30;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.3;
  sub.connect(subGain).connect(master);
  sub.start(now);

  // Sub LFO
  const subLfo = ctx.createOscillator();
  subLfo.type = 'sine';
  subLfo.frequency.value = 0.15;
  const subLfoGain = ctx.createGain();
  subLfoGain.gain.value = 0.15;
  subLfo.connect(subLfoGain).connect(subGain.gain);
  subLfo.start(now);

  // Random high pings
  let pingTimeout: ReturnType<typeof setTimeout>;
  function schedulePing() {
    if (stopped) return;
    const delay = 3000 + Math.random() * 5000;
    pingTimeout = setTimeout(() => {
      if (stopped) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1800 + Math.random() * 1200;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.8);
      schedulePing();
    }, delay);
  }
  schedulePing();

  return {
    gainNode: master,
    stop(fadeMs = 1500) {
      stopped = true;
      clearTimeout(pingTimeout);
      const t = ctx.currentTime;
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
      const stopTime = t + fadeMs / 1000 + 0.1;
      noiseNode.stop(stopTime);
      sub.stop(stopTime);
      subLfo.stop(stopTime);
    },
  };
}
