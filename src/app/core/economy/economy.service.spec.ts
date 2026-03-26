import { describe, it, expect } from 'vitest';
import { computeIncome, computeMiningDroneIncome, computeUpkeep, computeNetIncome } from './economy.service';
import { BuildingData, Resources, UnitData, UNIT_STATS } from '../../models/game-state';
import { HexData, StellarObjectType } from '../../models/hex-data';

function makeUnit(overrides: Partial<UnitData> & { id: string; ownerId: string; q: number; r: number }): UnitData {
  const type = overrides.type ?? 'mining_drone';
  const stats = UNIT_STATS[type];
  return {
    name: overrides.name ?? 'MD001',
    type,
    movementPoints: stats.maxMovementPoints,
    maxMovementPoints: stats.maxMovementPoints,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    attack: stats.attack,
    defense: stats.defense,
    range: stats.range,
    sightRange: stats.sightRange,
    size: stats.size,
    weapon: stats.weapon,
    armor: stats.armor,
    shields: stats.maxShields,
    maxShields: stats.maxShields,
    xp: 0,
    veteranTier: 'standard',
    hasAttacked: false,
    ...overrides,
  };
}

function makeHex(q: number, r: number, resources?: { energy?: number; minerals?: number; alloys?: number; credits?: number }, objectType: StellarObjectType = 'asteroid'): HexData {
  return {
    q,
    r,
    object: resources
      ? { type: objectType, size: 1, resources }
      : { type: 'empty', size: 0 },
  };
}

describe('computeMiningDroneIncome', () => {
  it('mining drone on asteroid hex with minerals gets minerals', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 3, r: 5 })],
    ]);
    const hexLookup = (q: number, r: number): HexData | null => {
      if (q === 3 && r === 5) return makeHex(3, 5, { minerals: 4 });
      return null;
    };
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income.minerals).toBe(4);
  });

  it('mining drone on hex with energy gets energy', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 0, r: 0 })],
    ]);
    const hexLookup = (q: number, r: number): HexData | null => {
      if (q === 0 && r === 0) return makeHex(0, 0, { energy: 3 }, 'star');
      return null;
    };
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income.energy).toBe(3);
  });

  it('mining drone on empty hex gets nothing', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 1, r: 1 })],
    ]);
    const hexLookup = (q: number, r: number): HexData | null => {
      return makeHex(q, r); // no resources
    };
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income).toEqual({});
  });

  it('mining drone on null hex gets nothing', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 99, r: 99 })],
    ]);
    const hexLookup = (): HexData | null => null;
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income).toEqual({});
  });

  it('non-mining-drone units do not generate income', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 3, r: 5, type: 'scout' })],
      ['u2', makeUnit({ id: 'u2', ownerId: 'p1', q: 4, r: 5, type: 'fighter' })],
      ['u3', makeUnit({ id: 'u3', ownerId: 'p1', q: 5, r: 5, type: 'cruiser' })],
      ['u4', makeUnit({ id: 'u4', ownerId: 'p1', q: 6, r: 5, type: 'colony_ship' })],
    ]);
    const hexLookup = (q: number, r: number): HexData | null => {
      return makeHex(q, r, { minerals: 10 });
    };
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income).toEqual({});
  });

  it('multiple mining drones accumulate income', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 0, r: 0 })],
      ['u2', makeUnit({ id: 'u2', ownerId: 'p1', q: 1, r: 0 })],
      ['u3', makeUnit({ id: 'u3', ownerId: 'p1', q: 2, r: 0 })],
    ]);
    const hexLookup = (q: number, r: number): HexData | null => {
      if (q === 0 && r === 0) return makeHex(0, 0, { minerals: 3 });
      if (q === 1 && r === 0) return makeHex(1, 0, { minerals: 5, energy: 2 });
      if (q === 2 && r === 0) return makeHex(2, 0, { minerals: 1 });
      return null;
    };
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income.minerals).toBe(9); // 3 + 5 + 1
    expect(income.energy).toBe(2);
  });

  it('only counts drones belonging to the specified player', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 0, r: 0 })],
      ['u2', makeUnit({ id: 'u2', ownerId: 'p2', q: 1, r: 0 })],
    ]);
    const hexLookup = (q: number, r: number): HexData | null => {
      return makeHex(q, r, { minerals: 5 });
    };
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income.minerals).toBe(5); // Only p1's drone
  });

  it('handles hex with all resource types', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 0, r: 0 })],
    ]);
    const hexLookup = (): HexData | null => {
      return makeHex(0, 0, { energy: 1, minerals: 2, alloys: 3, credits: 4 }, 'planet');
    };
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income.energy).toBe(1);
    expect(income.minerals).toBe(2);
    expect(income.alloys).toBe(3);
    expect(income.credits).toBe(4);
  });

  it('returns empty object when no units exist', () => {
    const units = new Map<string, UnitData>();
    const hexLookup = (): HexData | null => makeHex(0, 0, { minerals: 5 });
    const income = computeMiningDroneIncome(units, 'p1', hexLookup);
    expect(income).toEqual({});
  });
});

describe('computeIncome', () => {
  it('sums building yields for the specified player', () => {
    const buildings = new Map<string, BuildingData>([
      ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
      ['b2', { id: 'b2', ownerId: 'p1', type: 'colony', q: 1, r: 0, health: 30, maxHealth: 30, shields: 10, maxShields: 10 }],
    ]);
    const income = computeIncome(buildings, 'p1');
    expect(income.minerals).toBe(3);
    expect(income.alloys).toBe(2);
    expect(income.credits).toBe(2);
  });

  it('ignores buildings owned by other players', () => {
    const buildings = new Map<string, BuildingData>([
      ['b1', { id: 'b1', ownerId: 'p2', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
    ]);
    const income = computeIncome(buildings, 'p1');
    expect(income.minerals).toBe(0);
  });

  it('returns zero income with no buildings', () => {
    const income = computeIncome(new Map(), 'p1');
    expect(income).toEqual({ energy: 0, minerals: 0, alloys: 0, credits: 0 });
  });
});

describe('computeUpkeep', () => {
  it('sums correct costs for player units', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 0, r: 0, type: 'fighter' })],
      ['u2', makeUnit({ id: 'u2', ownerId: 'p1', q: 1, r: 0, type: 'cruiser' })],
    ]);
    const upkeep = computeUpkeep(units, 'p1');
    // fighter: 2 energy, cruiser: 5 energy + 2 credits
    expect(upkeep.energy).toBe(7);
    expect(upkeep.credits).toBe(2);
    expect(upkeep.minerals).toBe(0);
    expect(upkeep.alloys).toBe(0);
  });

  it('returns zeros for scouts and mining_drones', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', q: 0, r: 0, type: 'scout' })],
      ['u2', makeUnit({ id: 'u2', ownerId: 'p1', q: 1, r: 0, type: 'mining_drone' })],
    ]);
    const upkeep = computeUpkeep(units, 'p1');
    expect(upkeep).toEqual({ energy: 0, minerals: 0, alloys: 0, credits: 0 });
  });

  it('ignores units belonging to other players', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p2', q: 0, r: 0, type: 'battleship' })],
    ]);
    const upkeep = computeUpkeep(units, 'p1');
    expect(upkeep).toEqual({ energy: 0, minerals: 0, alloys: 0, credits: 0 });
  });
});

describe('computeNetIncome', () => {
  it('produces correct deltas including negative values', () => {
    const income: Resources = { energy: 5, minerals: 3, alloys: 2, credits: 1 };
    const upkeep: Resources = { energy: 8, minerals: 0, alloys: 0, credits: 4 };
    const net = computeNetIncome(income, upkeep);
    expect(net.energy).toBe(-3);
    expect(net.minerals).toBe(3);
    expect(net.alloys).toBe(2);
    expect(net.credits).toBe(-3);
  });

  it('returns zero net when income equals upkeep', () => {
    const res: Resources = { energy: 5, minerals: 3, alloys: 2, credits: 1 };
    const net = computeNetIncome(res, res);
    expect(net).toEqual({ energy: 0, minerals: 0, alloys: 0, credits: 0 });
  });
});
