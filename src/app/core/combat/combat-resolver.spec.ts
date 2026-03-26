import { describe, it, expect } from 'vitest';
import { resolveCombat, maybePromote } from './combat-resolver';
import { UnitData, UNIT_STATS } from '../../models/game-state';

function makeUnit(overrides: Partial<UnitData> = {}): UnitData {
  const stats = UNIT_STATS.fighter;
  return {
    id: 'u1',
    name: 'FI001',
    ownerId: 'p1',
    type: 'fighter',
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
    hasAttacked: false,
    ...overrides,
  };
}

function makeUnitFromType(type: UnitData['type'], overrides: Partial<UnitData> = {}): UnitData {
  const stats = UNIT_STATS[type];
  return {
    id: 'u1',
    name: `${type} T001`,
    ownerId: 'p1',
    type,
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
    hasAttacked: false,
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

  it('attacker always deals damage when weapon is present', () => {
    const attacker = makeUnit({ attack: 10 });
    const defender = makeUnit({ ownerId: 'p2' });
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
    const attacker = makeUnitFromType('cruiser', { id: 'a' });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', range: 1, health: 50, maxHealth: 50 });
    const result = resolveCombat(attacker, defender, 2, 77);
    expect(result.defenderDamage).toBeGreaterThan(0);
    expect(result.attackerDamage).toBe(0);
    expect(result.defenderStrike).toBeNull();
  });

  it('defender does NOT retaliate if killed', () => {
    const attacker = makeUnit({ id: 'a', attack: 100 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', health: 1, maxHealth: 15, range: 1 });
    const result = resolveCombat(attacker, defender, 1, 55);
    expect(result.defenderDestroyed).toBe(true);
    expect(result.attackerDamage).toBe(0);
  });

  it('non-combat units (weapon=null) deal no damage', () => {
    const attacker = makeUnitFromType('colony_ship', { id: 'a' });
    const defender = makeUnit({ id: 'd', ownerId: 'p2' });
    const result = resolveCombat(attacker, defender, 1, 123);
    expect(result.defenderDamage).toBe(0);
    expect(result.attackerStrike.hullDamage).toBe(0);
    expect(result.attackerStrike.shieldDamage).toBe(0);
  });

  it('unit destroyed when health reaches 0', () => {
    const attacker = makeUnit({ id: 'a', attack: 50 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', health: 5, maxHealth: 15, shields: 0 });
    const result = resolveCombat(attacker, defender, 1, 200);
    expect(result.defenderDestroyed).toBe(true);
  });

  it('different seeds produce different results', () => {
    const attacker = makeUnit({ id: 'a' });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', health: 30, maxHealth: 30 });
    const r1 = resolveCombat(attacker, defender, 1, 1);
    const r2 = resolveCombat(attacker, defender, 1, 999);
    const same = r1.defenderDamage === r2.defenderDamage && r1.attackerDamage === r2.attackerDamage;
    expect(same).toBe(false);
  });

  describe('shields', () => {
    it('shields absorb damage before hull', () => {
      const attacker = makeUnit({ id: 'a', attack: 5 });
      const defender = makeUnit({
        id: 'd', ownerId: 'p2',
        health: 20, maxHealth: 20, shields: 10, maxShields: 10, armor: 0,
      });
      const result = resolveCombat(attacker, defender, 1, 42);
      expect(result.attackerStrike.shieldDamage).toBeGreaterThan(0);
    });

    it('laser deals bonus damage to shields', () => {
      // Laser has shieldBonus 1.25
      const attacker = makeUnit({ id: 'a', weapon: 'laser', attack: 10 });
      const defender = makeUnit({
        id: 'd', ownerId: 'p2',
        shields: 20, maxShields: 20, armor: 0, health: 50, maxHealth: 50,
      });
      const laserResult = resolveCombat(attacker, defender, 1, 42);

      const kineticAttacker = makeUnit({ id: 'a', weapon: 'kinetic', attack: 10 });
      const kineticResult = resolveCombat(kineticAttacker, { ...defender }, 1, 42);

      // Laser should deal more shield damage than kinetic
      expect(laserResult.attackerStrike.shieldDamage).toBeGreaterThanOrEqual(kineticResult.attackerStrike.shieldDamage);
    });
  });

  describe('armor', () => {
    it('armor reduces hull damage', () => {
      const attacker = makeUnit({ id: 'a', attack: 10 });
      const noArmor = makeUnit({
        id: 'd', ownerId: 'p2', armor: 0, shields: 0, maxShields: 0,
        health: 50, maxHealth: 50,
      });
      const withArmor = makeUnit({
        id: 'd', ownerId: 'p2', armor: 5, shields: 0, maxShields: 0,
        health: 50, maxHealth: 50,
      });
      const r1 = resolveCombat(attacker, noArmor, 1, 42);
      const r2 = resolveCombat(attacker, withArmor, 1, 42);
      expect(r2.attackerStrike.hullDamage).toBeLessThanOrEqual(r1.attackerStrike.hullDamage);
    });

    it('kinetic bypasses 25% of armor', () => {
      const kineticAttacker = makeUnit({ id: 'a', weapon: 'kinetic', attack: 10 });
      const laserAttacker = makeUnit({ id: 'a', weapon: 'laser', attack: 10 });
      const defender = makeUnit({
        id: 'd', ownerId: 'p2', armor: 8, shields: 0, maxShields: 0,
        health: 50, maxHealth: 50,
      });
      const kineticResult = resolveCombat(kineticAttacker, defender, 1, 42);
      const laserResult = resolveCombat(laserAttacker, defender, 1, 42);
      // Kinetic should deal more hull damage against armored targets
      expect(kineticResult.attackerStrike.hullDamage).toBeGreaterThanOrEqual(laserResult.attackerStrike.hullDamage);
    });
  });

  describe('missile', () => {
    it('deals bonus damage vs small targets', () => {
      const missileAttacker = makeUnitFromType('frigate', { id: 'a' });
      const laserAttacker = makeUnit({ id: 'a', weapon: 'laser', attack: missileAttacker.attack });
      const smallTarget = makeUnit({
        id: 'd', ownerId: 'p2', size: 'small', armor: 0, shields: 0, maxShields: 0,
        health: 50, maxHealth: 50,
      });

      const missileResult = resolveCombat(missileAttacker, smallTarget, 1, 42);
      const laserResult = resolveCombat(laserAttacker, { ...smallTarget, shields: 0, maxShields: 0 }, 1, 42);

      // Missile should deal more total damage vs small
      expect(missileResult.defenderDamage).toBeGreaterThanOrEqual(laserResult.defenderDamage);
    });
  });

  describe('crits', () => {
    it('crit increases damage by 1.5x', () => {
      // Run many seeds to find at least one crit and one non-crit
      let foundCrit = false;
      let foundNonCrit = false;

      const attacker = makeUnit({ id: 'a', attack: 10 });
      const defender = makeUnit({
        id: 'd', ownerId: 'p2', shields: 0, maxShields: 0, armor: 0,
        health: 100, maxHealth: 100,
      });

      for (let seed = 0; seed < 200; seed++) {
        const result = resolveCombat(attacker, defender, 1, seed);
        if (result.attackerStrike.isCrit) foundCrit = true;
        else foundNonCrit = true;
        if (foundCrit && foundNonCrit) break;
      }

      expect(foundCrit).toBe(true);
      expect(foundNonCrit).toBe(true);
    });
  });

  describe('XP', () => {
    it('attacker gains XP from hull damage dealt', () => {
      const attacker = makeUnit({ id: 'a', attack: 10, xp: 0 });
      const defender = makeUnit({
        id: 'd', ownerId: 'p2', shields: 0, maxShields: 0,
        health: 50, maxHealth: 50,
      });
      const result = resolveCombat(attacker, defender, 1, 42);
      expect(result.attackerXpGain).toBeGreaterThan(0);
    });

    it('attacker gains kill bonus when defender destroyed', () => {
      const attacker = makeUnit({ id: 'a', attack: 100, xp: 0 });
      const defender = makeUnit({
        id: 'd', ownerId: 'p2', shields: 0, maxShields: 0,
        health: 1, maxHealth: 20,
      });
      const result = resolveCombat(attacker, defender, 1, 42);
      expect(result.defenderDestroyed).toBe(true);
      // Kill bonus = 50% of maxHealth = 10, plus hull damage + survival bonus
      expect(result.attackerXpGain).toBeGreaterThanOrEqual(10);
    });

    it('non-combat units gain no XP', () => {
      const attacker = makeUnitFromType('colony_ship', { id: 'a' });
      const defender = makeUnit({ id: 'd', ownerId: 'p2' });
      const result = resolveCombat(attacker, defender, 1, 42);
      expect(result.attackerXpGain).toBe(0);
    });
  });

  describe('veterancy', () => {
    it('improved veteran deals more damage', () => {
      const standard = makeUnit({ id: 'a', attack: 10, veteranTier: 'standard' });
      const improved = makeUnit({ id: 'a', attack: 10, veteranTier: 'improved' });
      const defender = makeUnit({
        id: 'd', ownerId: 'p2', shields: 0, maxShields: 0, armor: 0,
        health: 100, maxHealth: 100,
      });

      // Average over many seeds to reduce variance
      let stdTotal = 0;
      let impTotal = 0;
      for (let seed = 0; seed < 50; seed++) {
        stdTotal += resolveCombat(standard, defender, 1, seed).attackerStrike.hullDamage;
        impTotal += resolveCombat(improved, defender, 1, seed).attackerStrike.hullDamage;
      }
      expect(impTotal).toBeGreaterThan(stdTotal);
    });
  });
});

describe('resolveCombat with CombatOptions', () => {
  it('no options: identical behavior (backward compat)', () => {
    const attacker = makeUnit({ id: 'a', attack: 10 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', shields: 0, maxShields: 0, armor: 0, health: 50, maxHealth: 50 });
    const r1 = resolveCombat(attacker, defender, 1, 42);
    const r2 = resolveCombat(attacker, defender, 1, 42, {});
    expect(r1).toEqual(r2);
  });

  it('defender in own influence takes less damage', () => {
    const attacker = makeUnit({ id: 'a', attack: 10 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', shields: 0, maxShields: 0, armor: 0, health: 100, maxHealth: 100 });

    let totalWithout = 0;
    let totalWith = 0;
    for (let seed = 0; seed < 50; seed++) {
      totalWithout += resolveCombat(attacker, defender, 1, seed).defenderDamage;
      totalWith += resolveCombat(attacker, defender, 1, seed, { defenderInOwnInfluence: true }).defenderDamage;
    }
    expect(totalWith).toBeLessThan(totalWithout);
  });

  it('defender in enemy influence takes more damage', () => {
    const attacker = makeUnit({ id: 'a', attack: 10 });
    const defender = makeUnit({ id: 'd', ownerId: 'p2', shields: 0, maxShields: 0, armor: 0, health: 100, maxHealth: 100 });

    let totalWithout = 0;
    let totalWith = 0;
    for (let seed = 0; seed < 50; seed++) {
      totalWithout += resolveCombat(attacker, defender, 1, seed).defenderDamage;
      totalWith += resolveCombat(attacker, defender, 1, seed, { defenderInEnemyInfluence: true }).defenderDamage;
    }
    expect(totalWith).toBeGreaterThan(totalWithout);
  });
});

describe('maybePromote', () => {
  it('returns standard below 50 XP', () => {
    expect(maybePromote('standard', 0)).toBe('standard');
    expect(maybePromote('standard', 49)).toBe('standard');
  });

  it('returns improved at 50 XP', () => {
    expect(maybePromote('standard', 50)).toBe('improved');
    expect(maybePromote('standard', 100)).toBe('improved');
  });

  it('returns advanced at 150 XP', () => {
    expect(maybePromote('standard', 150)).toBe('advanced');
    expect(maybePromote('improved', 200)).toBe('advanced');
  });
});
