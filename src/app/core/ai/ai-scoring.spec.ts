import { describe, it, expect } from 'vitest';
import { scoreAttack, scoreExplore, scoreBuild, scoreProduction } from './ai-scoring';
import { UnitData, PlayerState, BuildingData, Resources, UNIT_STATS } from '../../models/game-state';
import { HexData } from '../../models/hex-data';

function makeUnit(overrides: Partial<UnitData> & { id: string; ownerId: string; type: UnitData['type'] }): UnitData {
  const stats = UNIT_STATS[overrides.type];
  return {
    name: overrides.name ?? `${overrides.type} T001`,
    q: 0,
    r: 0,
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
    ...overrides,
  };
}

function makePlayer(overrides: Partial<PlayerState> & { id: string }): PlayerState {
  return {
    name: 'AI',
    color: '#ff0000',
    resources: { energy: 100, minerals: 50, alloys: 30, credits: 30 },
    isAI: true,
    exploredHexes: new Set(),
    eliminated: false,
    researchedTechs: new Set<import('../../models/game-state').TechId>(),
    ...overrides,
  };
}

function makeHexLookup(hexes: Map<string, HexData>) {
  return (q: number, r: number) => hexes.get(`${q},${r}`) ?? null;
}

describe('scoreAttack', () => {
  it('returns favorable target when attacker would win', () => {
    const attacker = makeUnit({ id: 'a1', ownerId: 'p1', type: 'fighter', q: 0, r: 0 });
    const enemy = makeUnit({ id: 'e1', ownerId: 'p2', type: 'scout', q: 1, r: 0 });

    const result = scoreAttack(attacker, [enemy], 42);
    expect(result).not.toBeNull();
    expect(result!.targetId).toBe('e1');
    expect(result!.score).toBeGreaterThan(0);
  });

  it('returns null when no enemies in range', () => {
    const attacker = makeUnit({ id: 'a1', ownerId: 'p1', type: 'fighter', q: 0, r: 0 });
    const enemy = makeUnit({ id: 'e1', ownerId: 'p2', type: 'scout', q: 10, r: 0 });

    const result = scoreAttack(attacker, [enemy], 42);
    expect(result).toBeNull();
  });

  it('returns null when attack is unfavorable (would die)', () => {
    const attacker = makeUnit({ id: 'a1', ownerId: 'p1', type: 'scout', q: 0, r: 0, health: 1, shields: 0 });
    const enemy = makeUnit({ id: 'e1', ownerId: 'p2', type: 'cruiser', q: 1, r: 0 });

    const result = scoreAttack(attacker, [enemy], 42);
    expect(result).toBeNull();
  });

  it('returns null for units with no weapon', () => {
    const attacker = makeUnit({ id: 'a1', ownerId: 'p1', type: 'colony_ship', q: 0, r: 0 });
    const enemy = makeUnit({ id: 'e1', ownerId: 'p2', type: 'scout', q: 1, r: 0 });

    const result = scoreAttack(attacker, [enemy], 42);
    expect(result).toBeNull();
  });
});

describe('scoreBuild', () => {
  it('picks mining_station on asteroid hex with friendly unit', () => {
    const player = makePlayer({
      id: 'p1',
      exploredHexes: new Set(['1,0', '0,0']),
    });

    const hexes = new Map<string, HexData>();
    hexes.set('1,0', { q: 1, r: 0, object: { type: 'asteroid', size: 1 } });
    hexes.set('0,0', { q: 0, r: 0, object: { type: 'empty', size: 0 } });

    const units = new Map([['u1', makeUnit({ id: 'u1', ownerId: 'p1', type: 'scout', q: 1, r: 0 })]]);
    const buildings = new Map<string, BuildingData>();

    const result = scoreBuild(player, buildings, units, makeHexLookup(hexes));
    expect(result).not.toBeNull();
    expect(result!.buildingType).toBe('mining_station');
    expect(result!.hex.q).toBe(1);
    expect(result!.hex.r).toBe(0);
  });

  it('returns null when no friendly unit at candidate hex', () => {
    const player = makePlayer({
      id: 'p1',
      exploredHexes: new Set(['1,0', '0,0']),
    });

    const hexes = new Map<string, HexData>();
    hexes.set('1,0', { q: 1, r: 0, object: { type: 'asteroid', size: 1 } });
    const units = new Map([['u1', makeUnit({ id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0 })]]);
    const buildings = new Map<string, BuildingData>();

    const result = scoreBuild(player, buildings, units, makeHexLookup(hexes));
    expect(result).toBeNull();
  });

  it('returns null when insufficient resources', () => {
    const player = makePlayer({
      id: 'p1',
      resources: { energy: 0, minerals: 0, alloys: 0, credits: 0 },
      exploredHexes: new Set(['1,0', '0,0']),
    });

    const hexes = new Map<string, HexData>();
    hexes.set('1,0', { q: 1, r: 0, object: { type: 'asteroid', size: 1 } });

    const units = new Map([['u1', makeUnit({ id: 'u1', ownerId: 'p1', type: 'scout', q: 1, r: 0 })]]);
    const buildings = new Map<string, BuildingData>();

    const result = scoreBuild(player, buildings, units, makeHexLookup(hexes));
    expect(result).toBeNull();
  });
});

describe('scoreProduction', () => {
  it('picks combat unit when enemies nearby', () => {
    const player = makePlayer({ id: 'p1' });
    const starbase: BuildingData = {
      id: 'b1', ownerId: 'p1', type: 'starbase',
      q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15,
    };
    const buildings = new Map([['b1', starbase]]);
    const units = new Map<string, UnitData>();

    const result = scoreProduction(player, buildings, units, true);
    expect(result).not.toBeNull();
    // Should pick the best combat unit the AI can afford
    expect(['fighter', 'corvette', 'frigate', 'cruiser', 'battleship']).toContain(result!.unitType);
    expect(result!.buildingId).toBe('b1');
  });

  it('picks scout when few scouts and no enemies nearby', () => {
    const player = makePlayer({ id: 'p1' });
    const starbase: BuildingData = {
      id: 'b1', ownerId: 'p1', type: 'starbase',
      q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15,
    };
    const buildings = new Map([['b1', starbase]]);
    const units = new Map<string, UnitData>();

    const result = scoreProduction(player, buildings, units, false);
    expect(result).not.toBeNull();
    expect(result!.unitType).toBe('scout');
  });

  it('avoids expensive units when upkeep would bankrupt', () => {
    const player = makePlayer({ id: 'p1', resources: { energy: 200, minerals: 100, alloys: 100, credits: 100 } });
    const starbase: BuildingData = {
      id: 'b1', ownerId: 'p1', type: 'starbase',
      q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15,
    };
    const buildings = new Map([['b1', starbase]]);
    const units = new Map<string, UnitData>();

    // netEnergyIncome = -3 means already running a deficit
    // battleship upkeep = 8 energy → -3 - 8 = -11 < -5, should skip
    // cruiser upkeep = 5 energy → -3 - 5 = -8 < -5, should skip
    // frigate upkeep = 4 energy → -3 - 4 = -7 < -5, should skip
    // corvette upkeep = 3 energy → -3 - 3 = -6 < -5, should skip
    // fighter upkeep = 2 energy → -3 - 2 = -5 >= -5, OK
    const result = scoreProduction(player, buildings, units, true, -3);
    expect(result).not.toBeNull();
    expect(result!.unitType).toBe('fighter');
  });

  it('still picks scout even with low income (scouts have no upkeep)', () => {
    const player = makePlayer({ id: 'p1' });
    const starbase: BuildingData = {
      id: 'b1', ownerId: 'p1', type: 'starbase',
      q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15,
    };
    const buildings = new Map([['b1', starbase]]);
    const units = new Map<string, UnitData>();

    // Very negative net energy — should still pick scout as it has no upkeep
    const result = scoreProduction(player, buildings, units, false, -20);
    expect(result).not.toBeNull();
    expect(result!.unitType).toBe('scout');
  });
});

describe('scoreExplore', () => {
  it('returns target toward unexplored area', () => {
    const unit = makeUnit({ id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0 });
    const explored = new Set<string>();
    explored.add('0,0');
    explored.add('1,0');
    explored.add('0,1');
    explored.add('-1,1');
    explored.add('-1,0');
    explored.add('0,-1');
    explored.add('1,-1');

    const hexes = new Map<string, HexData>();

    const result = scoreExplore(unit, explored, makeHexLookup(hexes));
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(-Infinity);
  });

  it('returns null when all hexes in range are explored', () => {
    const unit = makeUnit({ id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0 });
    const explored = new Set<string>();
    for (let q = -10; q <= 10; q++) {
      for (let r = -10; r <= 10; r++) {
        explored.add(`${q},${r}`);
      }
    }

    const result = scoreExplore(unit, explored, () => null);
    expect(result).toBeNull();
  });
});
