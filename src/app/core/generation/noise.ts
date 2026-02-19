/**
 * Seeded random number generator and noise functions.
 * All functions are pure and deterministic.
 */

/** Simple mulberry32 PRNG — returns a function that yields 0-1 on each call. */
export function seededRNG(seed: number): { next(): number } {
  let s = seed | 0;
  return {
    next(): number {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Deterministic hash for a pair of coordinates + seed. Returns an integer. */
export function hashCoord(seed: number, cx: number, cy: number): number {
  let h = seed | 0;
  h = (Math.imul(h ^ cx, 0x45d9f3b) + 0x27d4eb2d) | 0;
  h = (Math.imul(h ^ cy, 0x45d9f3b) + 0x27d4eb2d) | 0;
  h = h ^ (h >>> 16);
  return h >>> 0;
}

/** Deterministic hash for seed + two values. Returns an integer. */
export function hash3(seed: number, a: number, b: number): number {
  let h = seed | 0;
  h = (Math.imul(h ^ (a * 374761393), 0x85ebca6b)) | 0;
  h = (Math.imul(h ^ (b * 668265263), 0xc2b2ae35)) | 0;
  h = h ^ (h >>> 16);
  return h >>> 0;
}

// --- Value noise (simple, no dependencies) ---

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoiseHash(ix: number, iy: number, seed: number): number {
  return (hashCoord(seed, ix, iy) & 0xffff) / 0xffff;
}

/** Simple 2D value noise in [0, 1]. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);

  const n00 = valueNoiseHash(ix, iy, seed);
  const n10 = valueNoiseHash(ix + 1, iy, seed);
  const n01 = valueNoiseHash(ix, iy + 1, seed);
  const n11 = valueNoiseHash(ix + 1, iy + 1, seed);

  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

/** Fractal Brownian Motion layered noise. Returns value roughly in [0, 1]. */
export function fbmNoise(
  x: number,
  y: number,
  seed: number,
  octaves: number = 4,
): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, y * frequency, seed + i * 31) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}
