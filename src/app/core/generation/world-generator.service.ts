import { Injectable, signal } from '@angular/core';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance, hexToPixel } from '../../shared/hex/hex-math';
import { Chunk, ChunkCoord } from '../../models/chunk';
import { AnomalyHexType, HexData, StellarObject } from '../../models/hex-data';
import { StarClass, StarSystemAnchor } from '../../models/star-system';
import { fbmNoise, hash3, hashCoord, seededRNG } from './noise';

export const CHUNK_SIZE = 16;
const SYSTEM_SPACING = 32;
const NEBULA_NOISE_THRESHOLD = 0.68;
const SYSTEM_PROBABILITY = 0.4;
const STAR_CLASSES: StarClass[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
const STAR_CLASS_WEIGHTS = [0.02, 0.05, 0.08, 0.15, 0.2, 0.25, 0.25];

@Injectable({ providedIn: 'root' })
export class WorldGeneratorService {
  private readonly _seed = signal(Date.now());
  readonly seed = this._seed.asReadonly();

  setSeed(seed: number): void {
    this._seed.set(seed);
  }

  /** Get star system anchors near a hex position by checking nearby coarse grid cells. */
  getNearbySystems(q: number, r: number): StarSystemAnchor[] {
    const seed = this._seed();
    const { x, y } = hexToPixel(q, r, 1);
    const coarseX = Math.floor(x / SYSTEM_SPACING);
    const coarseY = Math.floor(y / SYSTEM_SPACING);
    const systems: StarSystemAnchor[] = [];

    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const cx = coarseX + dx;
        const cy = coarseY + dy;
        const cellHash = hashCoord(seed, cx, cy);
        const cellRng = seededRNG(cellHash);

        if (cellRng.next() > SYSTEM_PROBABILITY) continue;

        const jitterX = cellRng.next() * SYSTEM_SPACING * 0.6 + SYSTEM_SPACING * 0.2;
        const jitterY = cellRng.next() * SYSTEM_SPACING * 0.6 + SYSTEM_SPACING * 0.2;
        const worldX = cx * SYSTEM_SPACING + jitterX;
        const worldY = cy * SYSTEM_SPACING + jitterY;

        const starQ = Math.round((2 / 3) * worldX);
        const starR = Math.round((-1 / 3) * worldX + (Math.sqrt(3) / 3) * worldY);
        const starS = -starQ - starR;

        const starClass = this.pickStarClass(cellRng.next());
        const planetCount = Math.floor(cellRng.next() * 5) + 1;

        systems.push({
          center: { q: starQ, r: starR, s: starS },
          starClass,
          planetCount,
          seed: cellHash,
        });
      }
    }

    return systems;
  }

  /** Query the stellar object at a single hex coordinate. */
  getHexObject(q: number, r: number): StellarObject | null {
    const systems = this.getNearbySystems(q, r);
    return this.generateHex({ q, r, s: -q - r }, systems, this._seed());
  }

  /** Generate a chunk at the given coordinate. */
  generate(coord: ChunkCoord): Chunk {
    const seed = this._seed();
    const hexes = new Map<string, HexData>();
    const baseQ = coord.cx * CHUNK_SIZE;
    const baseR = coord.cy * CHUNK_SIZE;

    // Gather nearby star systems for this chunk's region
    const centerQ = baseQ + CHUNK_SIZE / 2;
    const centerR = baseR + CHUNK_SIZE / 2;
    const systems = this.getNearbySystems(centerQ, centerR);

    for (let dq = 0; dq < CHUNK_SIZE; dq++) {
      for (let dr = 0; dr < CHUNK_SIZE; dr++) {
        const q = baseQ + dq;
        const r = baseR + dr;
        const s = -q - r;
        const key = `${q},${r}`;
        const hexCoord: HexCoord = { q, r, s };

        const object = this.generateHex(hexCoord, systems, seed);
        const anomaly = object === null ? this.generateAnomaly(q, r, seed) : undefined;

        // Check if this hex falls within a nebula noise region regardless of object type
        const { x: wx, y: wy } = hexToPixel(q, r, 1);
        const nebulaNoise = fbmNoise(wx * 0.01, wy * 0.01, seed + 1000, 3);
        const inNebula = nebulaNoise > NEBULA_NOISE_THRESHOLD;

        hexes.set(key, { q, r, object, ...(anomaly ? { anomaly } : {}), ...(inNebula ? { inNebula } : {}) });
      }
    }

    return { coord, hexes, dirty: true };
  }

  private generateHex(
    hex: HexCoord,
    systems: StarSystemAnchor[],
    seed: number,
  ): StellarObject | null {
    // Check if this hex is a star center
    for (const sys of systems) {
      if (sys.center.q === hex.q && sys.center.r === hex.r) {
        return {
          type: 'star',
          subtype: sys.starClass,
          size: this.starSize(sys.starClass),
          resources: { energy: this.starEnergy(sys.starClass) },
        };
      }
    }

    // Check orbital rings around stars
    for (const sys of systems) {
      const dist = hexDistance(hex, sys.center);

      if (dist >= 2 && dist <= 4) {
        const rng = seededRNG(hash3(sys.seed, hex.q, hex.r));
        const roll = rng.next();

        // Probability of a planet in orbital ring: ~20% per hex
        if (roll < 0.12) {
          const planetRoll = rng.next();
          const subtype =
            planetRoll < 0.3
              ? 'rocky'
              : planetRoll < 0.55
                ? 'gas_giant'
                : planetRoll < 0.8
                  ? 'ice'
                  : 'lava';
          return {
            type: 'planet',
            subtype,
            size: Math.floor(rng.next() * 3) + 1,
            resources: { alloys: Math.floor(rng.next() * 3) + 1, credits: Math.floor(rng.next() * 2) + 1 },
            orbitAnchor: sys.center,
          };
        }

        // Moon: adjacent to a planet-capable hex, lower chance
        if (roll < 0.16) {
          return {
            type: 'moon',
            size: 1,
            resources: { minerals: 1 },
            orbitAnchor: sys.center,
          };
        }
      }
    }

    // Noise-based features
    const { x: wx, y: wy } = hexToPixel(hex.q, hex.r, 1);

    // Nebula regions (large-scale noise)
    const nebulaNoise = fbmNoise(wx * 0.01, wy * 0.01, seed + 1000, 3);
    if (nebulaNoise > NEBULA_NOISE_THRESHOLD) {
      return {
        type: 'nebula',
        subtype: nebulaNoise > 0.78 ? 'dense' : 'sparse',
        size: 1,
      };
    }

    // Asteroid fields (medium-scale noise)
    const asteroidNoise = fbmNoise(wx * 0.04, wy * 0.04, seed + 2000, 3);
    if (asteroidNoise > 0.72) {
      const rng = seededRNG(hash3(seed, hex.q, hex.r));
      if (rng.next() < 0.4) {
        return {
          type: 'asteroid_field',
          size: 1,
          resources: { minerals: Math.floor(rng.next() * 3) + 1 },
        };
      }
      if (rng.next() < 0.3) {
        return {
          type: 'asteroid',
          size: 1,
          resources: { minerals: Math.floor(rng.next() * 2) + 1 },
        };
      }
    }

    // Rare comet (~0.3%)
    const cometHash = hash3(seed + 3000, hex.q, hex.r);
    if ((cometHash & 0x3ff) < 3) {
      const rng = seededRNG(cometHash);
      return {
        type: 'comet',
        size: 1,
        velocity: {
          q: Math.floor(rng.next() * 3) - 1,
          r: Math.floor(rng.next() * 3) - 1,
          s: 0,
        },
      };
    }

    // Rare black hole (~0.1%)
    const bhHash = hash3(seed + 4000, hex.q, hex.r);
    if ((bhHash & 0x3ff) < 1) {
      return { type: 'black_hole', size: 2 };
    }

    return null;
  }

  private pickStarClass(roll: number): StarClass {
    let cumulative = 0;
    for (let i = 0; i < STAR_CLASSES.length; i++) {
      cumulative += STAR_CLASS_WEIGHTS[i];
      if (roll < cumulative) return STAR_CLASSES[i];
    }
    return 'M';
  }

  private starSize(starClass: StarClass): number {
    const sizes: Record<StarClass, number> = {
      O: 5,
      B: 4,
      A: 3,
      F: 3,
      G: 2,
      K: 2,
      M: 1,
    };
    return sizes[starClass];
  }

  private starEnergy(starClass: StarClass): number {
    const energy: Record<StarClass, number> = {
      O: 10,
      B: 8,
      A: 6,
      F: 5,
      G: 4,
      K: 3,
      M: 2,
    };
    return energy[starClass];
  }

  private generateAnomaly(q: number, r: number, seed: number): AnomalyHexType | undefined {
    const h = hash3(seed + 5000, q, r);
    // ~1.5% chance on empty hexes
    if ((h & 0x3ff) >= 15) return undefined;
    const ANOMALY_TYPES: AnomalyHexType[] = ['derelict_ship', 'resource_cache', 'alien_signal', 'wormhole', 'ancient_ruins'];
    const rng = seededRNG(h);
    return ANOMALY_TYPES[Math.floor(rng.next() * ANOMALY_TYPES.length)];
  }
}
