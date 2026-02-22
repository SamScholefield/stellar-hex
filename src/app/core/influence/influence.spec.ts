import { describe, it, expect } from 'vitest';
import { computeInfluenceForPlayer, isNearAnyEnemyUnit } from './influence';
import { BuildingData, UnitData, UNIT_STATS, BUILDING_STATS } from '../../models/game-state';

function makeBuilding(overrides: Partial<BuildingData> & { id: string; ownerId: string; type: BuildingData['type'] }): BuildingData {
  const stats = BUILDING_STATS[overrides.type];
  return {
    q: 0,
    r: 0,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    ...overrides,
  };
}

function makeUnit(overrides: Partial<UnitData> & { id: string; ownerId: string; type: UnitData['type'] }): UnitData {
  const stats = UNIT_STATS[overrides.type];
  return {
    name: `${overrides.type} T001`,
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

describe('computeInfluenceForPlayer', () => {
  it('returns empty set when no buildings', () => {
    const result = computeInfluenceForPlayer(new Map(), 'p1');
    expect(result.size).toBe(0);
  });

  it('returns correct hex keys within building sightRange', () => {
    const buildings = new Map<string, BuildingData>([
      ['b1', makeBuilding({ id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0 })],
    ]);
    const result = computeInfluenceForPlayer(buildings, 'p1');
    // mining_station has sightRange 2
    expect(result.has('0,0')).toBe(true);
    expect(result.has('1,0')).toBe(true);
    expect(result.has('0,1')).toBe(true);
    expect(result.has('2,0')).toBe(true);
    expect(result.has('-2,0')).toBe(true);
    // out of range
    expect(result.has('3,0')).toBe(false);
  });

  it('only includes specified player buildings', () => {
    const buildings = new Map<string, BuildingData>([
      ['b1', makeBuilding({ id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0 })],
      ['b2', makeBuilding({ id: 'b2', ownerId: 'p2', type: 'mining_station', q: 10, r: 10 })],
    ]);
    const result = computeInfluenceForPlayer(buildings, 'p1');
    expect(result.has('0,0')).toBe(true);
    expect(result.has('10,10')).toBe(false);
  });

  it('uses correct sightRange per building type', () => {
    const buildings = new Map<string, BuildingData>([
      ['b1', makeBuilding({ id: 'b1', ownerId: 'p1', type: 'colony', q: 0, r: 0 })],
    ]);
    const result = computeInfluenceForPlayer(buildings, 'p1');
    // colony has sightRange 5
    expect(result.has('5,0')).toBe(true);
    expect(result.has('0,5')).toBe(true);
    expect(result.has('6,0')).toBe(false);
  });

  it('extends influence range when sightRangeBonus is provided', () => {
    const buildings = new Map<string, BuildingData>([
      ['b1', makeBuilding({ id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0 })],
    ]);
    // mining_station base sightRange is 2, bonus of 2 → effective range 4
    const result = computeInfluenceForPlayer(buildings, 'p1', 2);
    expect(result.has('4,0')).toBe(true);
    expect(result.has('0,4')).toBe(true);
    expect(result.has('-4,0')).toBe(true);
    // range 5 still out
    expect(result.has('5,0')).toBe(false);
  });

  it('deduplicates overlapping ranges', () => {
    const buildings = new Map<string, BuildingData>([
      ['b1', makeBuilding({ id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0 })],
      ['b2', makeBuilding({ id: 'b2', ownerId: 'p1', type: 'mining_station', q: 1, r: 0 })],
    ]);
    const result = computeInfluenceForPlayer(buildings, 'p1');
    // Both cover hex (1,0), but it should only appear once in the Set
    expect(result.has('1,0')).toBe(true);
    // Set naturally deduplicates — just ensure it exists and is a Set
    expect(result instanceof Set).toBe(true);
  });
});

describe('isNearAnyEnemyUnit', () => {
  it('returns false with no enemies', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0 })],
    ]);
    expect(isNearAnyEnemyUnit(0, 0, units, 'p1')).toBe(false);
  });

  it('returns true when enemy unit is within sightRange', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p2', type: 'scout', q: 2, r: 0 })],
    ]);
    // scout sightRange is 4, so distance 2 is within range
    expect(isNearAnyEnemyUnit(0, 0, units, 'p1')).toBe(true);
  });

  it('returns false when enemy unit is out of sightRange', () => {
    const units = new Map<string, UnitData>([
      ['u1', makeUnit({ id: 'u1', ownerId: 'p2', type: 'mining_drone', q: 3, r: 0 })],
    ]);
    // mining_drone sightRange is 1, so distance 3 is out of range
    expect(isNearAnyEnemyUnit(0, 0, units, 'p1')).toBe(false);
  });
});
