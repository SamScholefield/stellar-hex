import { describe, it, expect } from 'vitest';
import { findPath, getReachableHexes, pathCost, HexLookup, UnitBlockCheck } from './hex-pathfinder';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { HexData } from '../../models/hex-data';

function coord(q: number, r: number): HexCoord {
  return { q, r, s: -q - r };
}

/** Default lookup: everything is open space. */
const openSpace: HexLookup = (q, r) => ({ q, r, object: null });

/** Lookup with a star (impassable) at specific coords. */
function blockedAt(...coords: [number, number][]): HexLookup {
  const blocked = new Set(coords.map(([q, r]) => `${q},${r}`));
  return (q, r) => {
    if (blocked.has(`${q},${r}`)) {
      return { q, r, object: { type: 'star', size: 3, resources: { energy: 5 } } };
    }
    return { q, r, object: null };
  };
}

/** Lookup with nebula (cost 2) at specific coords. */
function nebulaAt(...coords: [number, number][]): HexLookup {
  const nebulas = new Set(coords.map(([q, r]) => `${q},${r}`));
  return (q, r) => {
    if (nebulas.has(`${q},${r}`)) {
      return { q, r, object: { type: 'nebula', subtype: 'dense', size: 1 } };
    }
    return { q, r, object: null };
  };
}

describe('hex-pathfinder', () => {
  describe('findPath', () => {
    it('finds a straight-line path in open space', () => {
      const path = findPath(coord(0, 0), coord(3, 0), 10, openSpace);
      expect(path).not.toBeNull();
      expect(path!.length).toBe(4); // start + 3 steps
      expect(path![0]).toEqual(coord(0, 0));
      expect(path![path!.length - 1]).toEqual(coord(3, 0));
    });

    it('returns null when destination is out of movement range', () => {
      const path = findPath(coord(0, 0), coord(5, 0), 3, openSpace);
      expect(path).toBeNull();
    });

    it('returns path of length 1 when start equals destination', () => {
      const path = findPath(coord(0, 0), coord(0, 0), 5, openSpace);
      expect(path).not.toBeNull();
      expect(path!.length).toBe(1);
    });

    it('routes around impassable terrain', () => {
      // Block the direct path at (1,0) and (2,0)
      const lookup = blockedAt([1, 0], [2, 0]);
      const path = findPath(coord(0, 0), coord(3, 0), 10, lookup);
      expect(path).not.toBeNull();
      // Path must avoid blocked hexes
      for (const hex of path!) {
        expect(hex.q === 1 && hex.r === 0).toBe(false);
        expect(hex.q === 2 && hex.r === 0).toBe(false);
      }
      expect(path![path!.length - 1]).toEqual(coord(3, 0));
    });

    it('returns null when destination is fully surrounded by impassable', () => {
      // Surround (2,0) with stars
      const lookup = blockedAt([1, 0], [1, 1], [2, -1], [3, -1], [3, 0], [2, 1]);
      const path = findPath(coord(0, 0), coord(2, 0), 10, lookup);
      expect(path).toBeNull();
    });

    it('respects unit blocking', () => {
      const isBlocked: UnitBlockCheck = (q, r) => q === 1 && r === 0;
      const path = findPath(coord(0, 0), coord(2, 0), 10, openSpace, isBlocked);
      expect(path).not.toBeNull();
      // Must route around the blocked unit at (1,0)
      expect(path!.some((h) => h.q === 1 && h.r === 0)).toBe(false);
    });

    it('accounts for nebula movement cost', () => {
      const lookup = nebulaAt([1, 0]);
      const path = findPath(coord(0, 0), coord(2, 0), 2, lookup);
      // Cost would be 2 (nebula) + 1 = 3, but we only have 2 MP
      expect(path).toBeNull();

      // With enough MP it should work
      const path2 = findPath(coord(0, 0), coord(2, 0), 3, lookup);
      expect(path2).not.toBeNull();
    });
  });

  describe('getReachableHexes', () => {
    it('returns hexes within movement range', () => {
      const reachable = getReachableHexes(coord(0, 0), 2, openSpace);
      // With 2 MP in open space, should reach distance 2: 3(4) + 3(2) + 1 = 19 hexes
      expect(reachable.size).toBe(19);
      // Center should have full MP remaining
      expect(reachable.get('0,0')).toBe(2);
    });

    it('excludes impassable hexes', () => {
      const lookup = blockedAt([1, 0]);
      const reachable = getReachableHexes(coord(0, 0), 2, lookup);
      expect(reachable.has('1,0')).toBe(false);
    });

    it('remaining MP reflects movement cost', () => {
      const reachable = getReachableHexes(coord(0, 0), 3, openSpace);
      // Adjacent hex costs 1, so remaining = 2
      expect(reachable.get('1,0')).toBe(2);
      // Two steps away, remaining = 1
      expect(reachable.get('2,0')).toBe(1);
    });

    it('nebula costs more movement', () => {
      const lookup = nebulaAt([1, 0]);
      const reachable = getReachableHexes(coord(0, 0), 2, lookup);
      // Going through nebula at (1,0) costs 2 MP, so 0 remaining
      expect(reachable.get('1,0')).toBe(0);
      // Can't reach (2,0) via (1,0) with only 2 MP
      // But might reach via another route if one exists at cost <= 2
    });

    it('returns only start when 0 movement points', () => {
      const reachable = getReachableHexes(coord(0, 0), 0, openSpace);
      expect(reachable.size).toBe(1);
      expect(reachable.get('0,0')).toBe(0);
    });
  });

  describe('pathCost', () => {
    it('sums movement costs along path', () => {
      const path = [coord(0, 0), coord(1, 0), coord(2, 0)];
      expect(pathCost(path, openSpace)).toBe(2);
    });

    it('accounts for nebula cost', () => {
      const lookup = nebulaAt([1, 0]);
      const path = [coord(0, 0), coord(1, 0), coord(2, 0)];
      expect(pathCost(path, lookup)).toBe(3);
    });

    it('returns 0 for single-hex path', () => {
      expect(pathCost([coord(0, 0)], openSpace)).toBe(0);
    });
  });
});
