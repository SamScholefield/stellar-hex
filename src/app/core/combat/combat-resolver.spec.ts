import { describe, it, expect } from 'vitest';
import { resolveCombat } from './combat-resolver';
import { UnitData } from '../../models/game-state';

function makeUnit(overrides: Partial<UnitData> = {}): UnitData {
  return {
    id: 'u1',
    ownerId: 'p1',
    type: 'fighter',
    q: 0,
    r: 0,
    movementPoints: 3,
    maxMovementPoints: 3,
    health: 15,
    maxHealth: 15,
    attack: 6,
    defense: 3,
    range: 1,
    sightRange: 2,
    ...overrides,
  };
}

describe('resolveCombat', () => {
  it('is deterministic — same seed produces same result', () => {
    const attacker = makeUnit({ id: 'a' });
    const defender = makeUnit({ id: 'd', ownerId: 'p2' });
    const r1 = resolveCombat(attacker, defender, 1, 42);
    const r2 = resolveCombat(attacker, defender, 1, 42);
    expect(r1).toEqual(r2);
  });

  it('attacker always deals damage', () => {
    const attacker = makeUnit({ attack: 10 });
    const defender = makeUnit({ defense: 5, ownerId: 'p2' });
    const result = resolveCombat(attacker, defender, 1, 100);
    expect(result.defenderDamage).toBeGreaterThan(0);
  });

  it('defender retaliates when attacker is within range', () => {
    const attacker = makeUnit({ id: 'a', range: 1 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', range: 1, health: 30, maxHealth: 30 });
    const result = resolveCombat(attacker, defender, 1, 99);
    expect(result.attackerDamage).toBeGreaterThan(0);
  });

  it('defender does NOT retaliate when attacker is out of defender range', () => {
    // Cruiser (range 2) attacks fighter (range 1) from distance 2
    const attacker = makeUnit({ id: 'a', type: 'cruiser', attack: 10, range: 2 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', type: 'fighter', range: 1, health: 30, maxHealth: 30 });
    const result = resolveCombat(attacker, defender, 2, 77);
    expect(result.defenderDamage).toBeGreaterThan(0);
    expect(result.attackerDamage).toBe(0);
  });

  it('defender does NOT retaliate if killed', () => {
    const attacker = makeUnit({ id: 'a', attack: 100 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', health: 1, maxHealth: 15, range: 1 });
    const result = resolveCombat(attacker, defender, 1, 55);
    expect(result.defenderDestroyed).toBe(true);
    expect(result.attackerDamage).toBe(0);
  });

  it('non-combat units (attack=0) deal no damage', () => {
    const attacker = makeUnit({ id: 'a', type: 'colony_ship', attack: 0 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2' });
    const result = resolveCombat(attacker, defender, 1, 123);
    expect(result.defenderDamage).toBe(0);
  });

  it('unit destroyed when health reaches 0', () => {
    const attacker = makeUnit({ id: 'a', attack: 50 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', health: 5, maxHealth: 15 });
    const result = resolveCombat(attacker, defender, 1, 200);
    expect(result.defenderDestroyed).toBe(true);
  });

  it('different seeds produce different results', () => {
    const attacker = makeUnit({ id: 'a' });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', health: 30, maxHealth: 30 });
    const r1 = resolveCombat(attacker, defender, 1, 1);
    const r2 = resolveCombat(attacker, defender, 1, 999);
    // At least one damage value should differ (extremely unlikely to be identical with different seeds)
    const same = r1.defenderDamage === r2.defenderDamage && r1.attackerDamage === r2.attackerDamage;
    expect(same).toBe(false);
  });
});
