import { describe, it, expect } from 'vitest';
import {
  hexToPixel,
  pixelToHex,
  cubeRound,
  hexNeighbors,
  hexDistance,
  hexRing,
  hexesInRange,
  hexLineDraw,
} from './hex-math';
import { HexCoord } from './hex-coord.type';

describe('hexToPixel / pixelToHex round-trip', () => {
  const testCases: [number, number][] = [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 1],
    [3, -2],
    [-5, 7],
  ];

  testCases.forEach(([q, r]) => {
    it(`round-trips (${q}, ${r}) at size=30`, () => {
      const size = 30;
      const { x, y } = hexToPixel(q, r, size);
      const result = pixelToHex(x, y, size);
      expect(result.q).toBe(q);
      expect(result.r).toBe(r);
      expect(result.q + result.r + result.s).toBe(0);
    });
  });

  it('round-trips with different hex sizes', () => {
    for (const size of [10, 50, 100]) {
      const { x, y } = hexToPixel(4, -3, size);
      const result = pixelToHex(x, y, size);
      expect(result.q).toBe(4);
      expect(result.r).toBe(-3);
    }
  });
});

describe('cubeRound', () => {
  it('enforces q + r + s = 0', () => {
    const result = cubeRound(0.3, 0.5, -0.8);
    expect(result.q + result.r + result.s).toBe(0);
  });

  it('rounds (0, 0, 0) to origin', () => {
    expect(cubeRound(0.1, -0.1, 0.0)).toEqual({ q: 0, r: 0, s: 0 });
  });

  it('rounds to nearest hex for fractional coords', () => {
    const result = cubeRound(0.9, 0.1, -1.0);
    expect(result).toEqual({ q: 1, r: 0, s: -1 });
    expect(result.q + result.r + result.s).toBe(0);
  });
});

describe('hexNeighbors', () => {
  it('returns 6 neighbors', () => {
    const neighbors = hexNeighbors(0, 0);
    expect(neighbors).toHaveLength(6);
  });

  it('all neighbors are at distance 1 from origin', () => {
    const origin: HexCoord = { q: 0, r: 0, s: 0 };
    const neighbors = hexNeighbors(0, 0);
    for (const n of neighbors) {
      expect(hexDistance(origin, n)).toBe(1);
    }
  });

  it('all neighbors satisfy q + r + s = 0', () => {
    const neighbors = hexNeighbors(3, -2);
    for (const n of neighbors) {
      expect(n.q + n.r + n.s).toBe(0);
    }
  });

  it('returns correct neighbors for non-origin hex', () => {
    const neighbors = hexNeighbors(1, -1);
    const center: HexCoord = { q: 1, r: -1, s: 0 };
    for (const n of neighbors) {
      expect(hexDistance(center, n)).toBe(1);
    }
  });
});

describe('hexDistance', () => {
  it('distance from hex to itself is 0', () => {
    const a: HexCoord = { q: 3, r: -1, s: -2 };
    expect(hexDistance(a, a)).toBe(0);
  });

  it('is symmetric', () => {
    const a: HexCoord = { q: 0, r: 0, s: 0 };
    const b: HexCoord = { q: 3, r: -2, s: -1 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it('returns known values', () => {
    const origin: HexCoord = { q: 0, r: 0, s: 0 };
    expect(hexDistance(origin, { q: 1, r: 0, s: -1 })).toBe(1);
    expect(hexDistance(origin, { q: 2, r: -1, s: -1 })).toBe(2);
    expect(hexDistance(origin, { q: 3, r: -3, s: 0 })).toBe(3);
  });
});

describe('hexRing', () => {
  const center: HexCoord = { q: 0, r: 0, s: 0 };

  it('radius 0 returns only the center', () => {
    const ring = hexRing(center, 0);
    expect(ring).toHaveLength(1);
    expect(ring[0]).toEqual(center);
  });

  it('count = 6 * radius for radius > 0', () => {
    for (const radius of [1, 2, 3, 5]) {
      expect(hexRing(center, radius)).toHaveLength(6 * radius);
    }
  });

  it('all hexes in ring are exactly radius distance from center', () => {
    const ring = hexRing(center, 3);
    for (const hex of ring) {
      expect(hexDistance(center, hex)).toBe(3);
    }
  });

  it('has no duplicates', () => {
    const ring = hexRing(center, 2);
    const keys = ring.map((h) => `${h.q},${h.r}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('hexesInRange', () => {
  const center: HexCoord = { q: 0, r: 0, s: 0 };

  it('count = 3r² + 3r + 1', () => {
    for (const range of [0, 1, 2, 3, 4]) {
      const expected = 3 * range * range + 3 * range + 1;
      expect(hexesInRange(center, range)).toHaveLength(expected);
    }
  });

  it('includes center', () => {
    const hexes = hexesInRange(center, 2);
    expect(hexes.some((h) => h.q === 0 && h.r === 0 && h.s === 0)).toBe(true);
  });

  it('all hexes satisfy q + r + s = 0', () => {
    const hexes = hexesInRange(center, 3);
    for (const h of hexes) {
      expect(h.q + h.r + h.s).toBe(0);
    }
  });

  it('no hex exceeds the given range', () => {
    const range = 3;
    const hexes = hexesInRange(center, range);
    for (const h of hexes) {
      expect(hexDistance(center, h)).toBeLessThanOrEqual(range);
    }
  });
});

describe('hexLineDraw', () => {
  it('returns single hex when start equals end', () => {
    const a: HexCoord = { q: 2, r: -1, s: -1 };
    const line = hexLineDraw(a, a);
    expect(line).toHaveLength(1);
    expect(line[0]).toEqual(a);
  });

  it('includes both endpoints', () => {
    const a: HexCoord = { q: 0, r: 0, s: 0 };
    const b: HexCoord = { q: 3, r: -3, s: 0 };
    const line = hexLineDraw(a, b);
    expect(line[0]).toEqual(a);
    expect(line[line.length - 1]).toEqual(b);
  });

  it('length = distance + 1', () => {
    const a: HexCoord = { q: 0, r: 0, s: 0 };
    const b: HexCoord = { q: 4, r: -2, s: -2 };
    const line = hexLineDraw(a, b);
    expect(line).toHaveLength(hexDistance(a, b) + 1);
  });

  it('consecutive hexes are at distance 1', () => {
    const a: HexCoord = { q: -1, r: 3, s: -2 };
    const b: HexCoord = { q: 3, r: -1, s: -2 };
    const line = hexLineDraw(a, b);
    for (let i = 1; i < line.length; i++) {
      expect(hexDistance(line[i - 1], line[i])).toBe(1);
    }
  });

  it('all hexes satisfy q + r + s = 0', () => {
    const a: HexCoord = { q: 0, r: 0, s: 0 };
    const b: HexCoord = { q: 5, r: -3, s: -2 };
    const line = hexLineDraw(a, b);
    for (const h of line) {
      expect(h.q + h.r + h.s).toBe(0);
    }
  });
});
