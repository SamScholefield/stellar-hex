import { describe, it, expect } from 'vitest';
import { findPath, getReachableHexes, pathCost, HexLookup, UnitBlockCheck, miningDroneCostOverride, lightUnitCostOverride, getUnitCostOverride } from './hex-pathfinder';
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

/** Lookup with a star at specific coords (returns proper star HexData). */
function starAt(...coords: [number, number][]): HexLookup {
  const stars = new Set(coords.map(([q, r]) => `${q},${r}`));
  return (q, r) => {
    if (stars.has(`${q},${r}`)) {
      return { q, r, object: { type: 'star', size: 3, resources: { energy: 5 } } };
    }
    return { q, r, object: null };
  };
}

/** Lookup with a black hole at specific coords. */
function blackHoleAt(...coords: [number, number][]): HexLookup {
  const holes = new Set(coords.map(([q, r]) => `${q},${r}`));
  return (q, r) => {
    if (holes.has(`${q},${r}`)) {
      return { q, r, object: { type: 'black_hole', size: 5 } };
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

    it('uses costOverride when provided', () => {
      const lookup = starAt([1, 0]);
      const path = [coord(0, 0), coord(1, 0), coord(2, 0)];
      // Without override, star is Infinity
      expect(pathCost(path, lookup)).toBe(Infinity);
      // With mining drone override, star costs 2
      expect(pathCost(path, lookup, miningDroneCostOverride)).toBe(3); // 2 (star) + 1 (open)
    });
  });

  describe('miningDroneCostOverride', () => {
    it('returns 2 for star hexes', () => {
      const starHex = { q: 0, r: 0, object: { type: 'star' as const, size: 3, resources: { energy: 5 } } };
      expect(miningDroneCostOverride(starHex)).toBe(2);
    });

    it('returns undefined for non-star hexes', () => {
      const emptyHex = { q: 0, r: 0, object: null };
      expect(miningDroneCostOverride(emptyHex)).toBeUndefined();
    });

    it('returns undefined for null hex', () => {
      expect(miningDroneCostOverride(null)).toBeUndefined();
    });

    it('returns undefined for nebula hexes', () => {
      const nebulaHex = { q: 0, r: 0, object: { type: 'nebula' as const, subtype: 'dense', size: 1 } };
      expect(miningDroneCostOverride(nebulaHex)).toBeUndefined();
    });

    it('returns undefined for black hole hexes', () => {
      const bhHex = { q: 0, r: 0, object: { type: 'black_hole' as const, size: 5 } };
      expect(miningDroneCostOverride(bhHex)).toBeUndefined();
    });
  });

  describe('lightUnitCostOverride', () => {
    it('returns 1 for nebula hexes', () => {
      const nebulaHex = { q: 0, r: 0, object: { type: 'nebula' as const, subtype: 'dense', size: 1 } };
      expect(lightUnitCostOverride(nebulaHex)).toBe(1);
    });

    it('returns undefined for non-nebula hexes', () => {
      const emptyHex = { q: 0, r: 0, object: null };
      expect(lightUnitCostOverride(emptyHex)).toBeUndefined();
    });

    it('returns undefined for null hex', () => {
      expect(lightUnitCostOverride(null)).toBeUndefined();
    });

    it('returns undefined for star hexes', () => {
      const starHex = { q: 0, r: 0, object: { type: 'star' as const, size: 3, resources: { energy: 5 } } };
      expect(lightUnitCostOverride(starHex)).toBeUndefined();
    });
  });

  describe('getUnitCostOverride', () => {
    it('returns miningDroneCostOverride for mining_drone', () => {
      expect(getUnitCostOverride('mining_drone')).toBe(miningDroneCostOverride);
    });

    it('returns lightUnitCostOverride for scout', () => {
      expect(getUnitCostOverride('scout')).toBe(lightUnitCostOverride);
    });

    it('returns lightUnitCostOverride for colony_ship', () => {
      expect(getUnitCostOverride('colony_ship')).toBe(lightUnitCostOverride);
    });

    it('returns undefined for fighter', () => {
      expect(getUnitCostOverride('fighter')).toBeUndefined();
    });

    it('returns undefined for cruiser', () => {
      expect(getUnitCostOverride('cruiser')).toBeUndefined();
    });
  });

  describe('lightUnitCostOverride integration', () => {
    it('scout can path through nebula at cost 1', () => {
      const lookup = nebulaAt([1, 0]);
      // Without override: nebula costs 2, so 2+1=3 to reach (2,0)
      const pathWithout = findPath(coord(0, 0), coord(2, 0), 2, lookup);
      expect(pathWithout).toBeNull();

      // With override: nebula costs 1, so 1+1=2 to reach (2,0)
      const pathWith = findPath(coord(0, 0), coord(2, 0), 2, lookup, undefined, lightUnitCostOverride);
      expect(pathWith).not.toBeNull();
      expect(pathWith!.some(h => h.q === 1 && h.r === 0)).toBe(true);
    });

    it('getReachableHexes with lightUnitCostOverride treats nebula as cost 1', () => {
      const lookup = nebulaAt([1, 0]);
      // Without override: nebula at (1,0) costs 2
      const reachableWithout = getReachableHexes(coord(0, 0), 2, lookup);
      expect(reachableWithout.get('1,0')).toBe(0); // 2 - 2 = 0

      // With override: nebula at (1,0) costs 1
      const reachableWith = getReachableHexes(coord(0, 0), 2, lookup, undefined, lightUnitCostOverride);
      expect(reachableWith.get('1,0')).toBe(1); // 2 - 1 = 1
    });

    it('lightUnitCostOverride does not affect star passability', () => {
      const lookup = starAt([1, 0]);
      const path = findPath(coord(0, 0), coord(2, 0), 10, lookup, undefined, lightUnitCostOverride);
      // Star is still impassable for scouts
      if (path) {
        expect(path.some(h => h.q === 1 && h.r === 0)).toBe(false);
      }
    });
  });

  describe('costOverride integration', () => {
    it('findPath with miningDroneCostOverride can path through stars', () => {
      const lookup = starAt([1, 0]);
      // Without override: star is impassable, must route around
      const pathWithout = findPath(coord(0, 0), coord(2, 0), 10, lookup);
      if (pathWithout) {
        expect(pathWithout.some(h => h.q === 1 && h.r === 0)).toBe(false);
      }

      // With override: star costs 2, can path through
      const pathWith = findPath(coord(0, 0), coord(2, 0), 10, lookup, undefined, miningDroneCostOverride);
      expect(pathWith).not.toBeNull();
      expect(pathWith!.some(h => h.q === 1 && h.r === 0)).toBe(true);
      expect(pathWith![pathWith!.length - 1]).toEqual(coord(2, 0));
    });

    it('findPath without override cannot path through stars (when surrounded)', () => {
      // Surround (2,0) so only path goes through a star at (1,0)
      const lookup = blockedAt([1, -1], [0, 1], [1, 1], [2, -1], [2, 1], [3, -1], [3, 0]);
      // Add star at (1,0) too via a combined lookup
      const combinedLookup: HexLookup = (q, r) => {
        if (q === 1 && r === 0) return { q, r, object: { type: 'star', size: 3, resources: { energy: 5 } } };
        return lookup(q, r);
      };
      const path = findPath(coord(0, 0), coord(2, 0), 10, combinedLookup);
      expect(path).toBeNull();
    });

    it('findPath with override still blocks black holes', () => {
      const lookup = blackHoleAt([1, 0]);
      // miningDroneCostOverride does not override black holes
      const path = findPath(coord(0, 0), coord(2, 0), 10, lookup, undefined, miningDroneCostOverride);
      expect(path).not.toBeNull();
      // Path should route around the black hole
      expect(path!.some(h => h.q === 1 && h.r === 0)).toBe(false);
    });

    it('findPath with override respects MP limits for star traversal', () => {
      const lookup = starAt([1, 0]);
      // Star costs 2 with override, so total to reach (2,0) is 2+1=3
      const path = findPath(coord(0, 0), coord(2, 0), 2, lookup, undefined, miningDroneCostOverride);
      expect(path).toBeNull(); // Not enough MP

      const path2 = findPath(coord(0, 0), coord(2, 0), 3, lookup, undefined, miningDroneCostOverride);
      expect(path2).not.toBeNull();
    });

    it('getReachableHexes with miningDroneCostOverride includes star hexes', () => {
      const lookup = starAt([1, 0]);
      // Without override: star excluded
      const reachableWithout = getReachableHexes(coord(0, 0), 3, lookup);
      expect(reachableWithout.has('1,0')).toBe(false);

      // With override: star included at cost 2
      const reachableWith = getReachableHexes(coord(0, 0), 3, lookup, undefined, miningDroneCostOverride);
      expect(reachableWith.has('1,0')).toBe(true);
      expect(reachableWith.get('1,0')).toBe(1); // 3 MP - 2 cost = 1 remaining
    });

    it('getReachableHexes with override excludes star when insufficient MP', () => {
      const lookup = starAt([1, 0]);
      // Star costs 2 with override, but only 1 MP available
      const reachable = getReachableHexes(coord(0, 0), 1, lookup, undefined, miningDroneCostOverride);
      expect(reachable.has('1,0')).toBe(false);
    });

    it('getReachableHexes with override still excludes black holes', () => {
      const lookup = blackHoleAt([1, 0]);
      const reachable = getReachableHexes(coord(0, 0), 5, lookup, undefined, miningDroneCostOverride);
      expect(reachable.has('1,0')).toBe(false);
    });
  });
});
