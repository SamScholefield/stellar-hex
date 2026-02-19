import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { WorldGeneratorService, CHUNK_SIZE } from './world-generator.service';
import { ChunkCoord } from '../../models/chunk';

describe('WorldGeneratorService', () => {
  let service: WorldGeneratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorldGeneratorService);
    service.setSeed(12345);
  });

  it('generates a chunk with the correct number of hexes', () => {
    const chunk = service.generate({ cx: 0, cy: 0 });
    expect(chunk.hexes.size).toBe(CHUNK_SIZE * CHUNK_SIZE);
  });

  it('generates deterministic chunks (same seed + coord = same output)', () => {
    const coord: ChunkCoord = { cx: 3, cy: -2 };
    const chunk1 = service.generate(coord);
    const chunk2 = service.generate(coord);

    for (const [key, hex1] of chunk1.hexes) {
      const hex2 = chunk2.hexes.get(key)!;
      expect(hex2).toBeDefined();
      expect(hex1.q).toBe(hex2.q);
      expect(hex1.r).toBe(hex2.r);
      if (hex1.object === null) {
        expect(hex2.object).toBeNull();
      } else {
        expect(hex2.object).not.toBeNull();
        expect(hex1.object.type).toBe(hex2.object!.type);
        expect(hex1.object.subtype).toBe(hex2.object!.subtype);
      }
    }
  });

  it('marks new chunks as dirty', () => {
    const chunk = service.generate({ cx: 0, cy: 0 });
    expect(chunk.dirty).toBe(true);
  });

  it('generates hexes with correct q,r values for the chunk', () => {
    const coord: ChunkCoord = { cx: 2, cy: -1 };
    const chunk = service.generate(coord);
    const baseQ = coord.cx * CHUNK_SIZE;
    const baseR = coord.cy * CHUNK_SIZE;

    for (const [key, hex] of chunk.hexes) {
      expect(hex.q).toBeGreaterThanOrEqual(baseQ);
      expect(hex.q).toBeLessThan(baseQ + CHUNK_SIZE);
      expect(hex.r).toBeGreaterThanOrEqual(baseR);
      expect(hex.r).toBeLessThan(baseR + CHUNK_SIZE);
      expect(key).toBe(`${hex.q},${hex.r}`);
    }
  });

  it('generates some non-empty hexes across multiple chunks', () => {
    let totalObjects = 0;
    for (let cx = -3; cx <= 3; cx++) {
      for (let cy = -3; cy <= 3; cy++) {
        const chunk = service.generate({ cx, cy });
        for (const hex of chunk.hexes.values()) {
          if (hex.object !== null) totalObjects++;
        }
      }
    }
    expect(totalObjects).toBeGreaterThan(0);
  });

  it('all stellar objects have valid types', () => {
    const validTypes = new Set([
      'star', 'planet', 'moon', 'asteroid', 'asteroid_field',
      'comet', 'nebula', 'black_hole', 'empty',
    ]);
    for (let cx = -2; cx <= 2; cx++) {
      for (let cy = -2; cy <= 2; cy++) {
        const chunk = service.generate({ cx, cy });
        for (const hex of chunk.hexes.values()) {
          if (hex.object !== null) {
            expect(validTypes.has(hex.object.type)).toBe(true);
          }
        }
      }
    }
  });

  it('different seeds produce different terrain', () => {
    const coord: ChunkCoord = { cx: 0, cy: 0 };
    service.setSeed(11111);
    const chunk1 = service.generate(coord);
    service.setSeed(99999);
    const chunk2 = service.generate(coord);

    let differences = 0;
    for (const [key, hex1] of chunk1.hexes) {
      const hex2 = chunk2.hexes.get(key)!;
      const type1 = hex1.object?.type ?? 'empty';
      const type2 = hex2.object?.type ?? 'empty';
      if (type1 !== type2) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });
});
