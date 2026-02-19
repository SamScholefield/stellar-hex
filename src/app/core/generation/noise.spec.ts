import { describe, it, expect } from 'vitest';
import { seededRNG, hashCoord, hash3, fbmNoise } from './noise';

describe('seededRNG', () => {
  it('produces deterministic sequence from same seed', () => {
    const rng1 = seededRNG(42);
    const rng2 = seededRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('produces different sequences from different seeds', () => {
    const rng1 = seededRNG(42);
    const rng2 = seededRNG(99);
    const values1 = Array.from({ length: 10 }, () => rng1.next());
    const values2 = Array.from({ length: 10 }, () => rng2.next());
    expect(values1).not.toEqual(values2);
  });

  it('produces values in [0, 1)', () => {
    const rng = seededRNG(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashCoord', () => {
  it('is deterministic', () => {
    expect(hashCoord(42, 10, -5)).toBe(hashCoord(42, 10, -5));
  });

  it('varies with different inputs', () => {
    const a = hashCoord(42, 0, 0);
    const b = hashCoord(42, 1, 0);
    const c = hashCoord(42, 0, 1);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('varies with different seeds', () => {
    expect(hashCoord(1, 5, 5)).not.toBe(hashCoord(2, 5, 5));
  });
});

describe('hash3', () => {
  it('is deterministic', () => {
    expect(hash3(42, 3, 7)).toBe(hash3(42, 3, 7));
  });

  it('varies with different inputs', () => {
    const a = hash3(42, 1, 2);
    const b = hash3(42, 2, 1);
    expect(a).not.toBe(b);
  });
});

describe('fbmNoise', () => {
  it('is deterministic', () => {
    expect(fbmNoise(1.5, 2.3, 42, 4)).toBe(fbmNoise(1.5, 2.3, 42, 4));
  });

  it('produces values in [0, 1]', () => {
    for (let x = -10; x <= 10; x += 0.7) {
      for (let y = -10; y <= 10; y += 0.7) {
        const v = fbmNoise(x, y, 42, 4);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('varies spatially', () => {
    const a = fbmNoise(0, 0, 42, 4);
    const b = fbmNoise(5, 5, 42, 4);
    expect(a).not.toBe(b);
  });

  it('varies with seed', () => {
    const a = fbmNoise(1, 1, 42, 4);
    const b = fbmNoise(1, 1, 99, 4);
    expect(a).not.toBe(b);
  });
});
