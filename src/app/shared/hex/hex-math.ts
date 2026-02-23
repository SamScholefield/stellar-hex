import { HexCoord } from './hex-coord.type';

const SQRT3 = Math.sqrt(3);

export const HEX_SIZE = 30;

/** Create a string key from axial coordinates for use as a Map/Set key. */
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Create a HexCoord from axial (q, r), computing s automatically. */
export function toHexCoord(q: number, r: number): HexCoord {
  return { q, r, s: -q - r };
}

/** Flat-top hex: convert axial (q, r) to pixel center. */
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * ((3 / 2) * q),
    y: size * ((SQRT3 / 2) * q + SQRT3 * r),
  };
}

/** Inverse of hexToPixel — returns fractional cube coords, then rounds. */
export function pixelToHex(x: number, y: number, size: number): HexCoord {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * y) / size;
  return cubeRound(q, r, -q - r);
}

/** Round fractional cube coordinates to the nearest hex, enforcing q+r+s=0. */
export function cubeRound(q: number, r: number, s: number): HexCoord {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }

  return { q: rq || 0, r: rr || 0, s: rs || 0 };
}

const DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0, s: -1 },
  { q: 1, r: -1, s: 0 },
  { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 },
  { q: -1, r: 1, s: 0 },
  { q: 0, r: 1, s: -1 },
];

/** Return the 6 cube-coordinate neighbors of (q, r). */
export function hexNeighbors(q: number, r: number): HexCoord[] {
  const s = -q - r;
  return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r, s: s + d.s }));
}

/** Manhattan distance in cube coordinates. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

/** All hexes exactly `radius` steps from center, walking the ring. */
export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) return [{ ...center }];

  const results: HexCoord[] = [];
  let hex: HexCoord = {
    q: center.q + DIRECTIONS[4].q * radius,
    r: center.r + DIRECTIONS[4].r * radius,
    s: center.s + DIRECTIONS[4].s * radius,
  };

  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push({ ...hex });
      hex = {
        q: hex.q + DIRECTIONS[side].q,
        r: hex.r + DIRECTIONS[side].r,
        s: hex.s + DIRECTIONS[side].s,
      };
    }
  }

  return results;
}

/** All hexes within `range` steps of center (inclusive). */
export function hexesInRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
      const s = -q - r;
      results.push({ q: center.q + q, r: center.r + r, s: center.s + s });
    }
  }
  return results;
}

/** Linear interpolation between two hexes, returning all hexes along the line. */
export function hexLineDraw(a: HexCoord, b: HexCoord): HexCoord[] {
  const dist = hexDistance(a, b);
  if (dist === 0) return [{ ...a }];

  const results: HexCoord[] = [];
  for (let i = 0; i <= dist; i++) {
    const t = i / dist;
    results.push(
      cubeRound(
        a.q + (b.q - a.q) * t,
        a.r + (b.r - a.r) * t,
        a.s + (b.s - a.s) * t,
      ),
    );
  }
  return results;
}
