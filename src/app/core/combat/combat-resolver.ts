import { UnitData, VeteranTier, VETERAN_BONUSES, VETERAN_XP_THRESHOLDS, WEAPON_STATS } from '../../models/game-state';
import { seededRNG } from '../generation/noise';

export interface StrikeResult {
  rawDamage: number;
  shieldDamage: number;
  hullDamage: number;
  isCrit: boolean;
}

export interface CombatResult {
  attackerDamage: number;
  defenderDamage: number;
  attackerShieldDamage: number;
  defenderShieldDamage: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  attackerXpGain: number;
  defenderXpGain: number;
  attackerStrike: StrikeResult;
  defenderStrike: StrikeResult | null;
}

export interface CombatOptions {
  attackerInOwnInfluence?: boolean;
  defenderInOwnInfluence?: boolean;
  attackerInEnemyInfluence?: boolean;
  defenderInEnemyInfluence?: boolean;
}

/**
 * Resolve combat between attacker and defender.
 */
export function resolveCombat(
  attacker: UnitData,
  defender: UnitData,
  attackerRange: number,
  seed: number,
  options?: CombatOptions,
): CombatResult {
  const rng = seededRNG(seed);

  // Compute influence damage multipliers
  // Defender takes less damage in own influence, more in enemy influence
  let defenderIncomingMul = 1.0;
  if (options?.defenderInOwnInfluence) defenderIncomingMul *= 0.9;
  if (options?.defenderInEnemyInfluence) defenderIncomingMul *= 1.1;

  let attackerIncomingMul = 1.0;
  if (options?.attackerInOwnInfluence) attackerIncomingMul *= 0.9;
  if (options?.attackerInEnemyInfluence) attackerIncomingMul *= 1.1;

  // Attacker strikes
  const attackerStrike = resolveStrike(attacker, defender, rng, defenderIncomingMul);

  // Apply attacker's strike to defender
  const defenderShieldsAfter = Math.max(0, defender.shields - attackerStrike.shieldDamage);
  const defenderHealthAfter = defender.health - attackerStrike.hullDamage;
  const defenderDestroyed = defenderHealthAfter <= 0;

  // Defender retaliates only if alive AND attacker within defender's range
  let defenderStrike: StrikeResult | null = null;
  if (!defenderDestroyed && defender.weapon != null && attackerRange <= defender.range) {
    // Create a temporary defender view with reduced shields for retaliation calc
    const defenderAfterHit: UnitData = {
      ...defender,
      shields: defenderShieldsAfter,
      health: defenderHealthAfter,
    };
    defenderStrike = resolveStrike(defenderAfterHit, attacker, rng, attackerIncomingMul);
  }

  const attackerHullDmg = defenderStrike?.hullDamage ?? 0;
  const attackerShieldDmg = defenderStrike?.shieldDamage ?? 0;
  const attackerHealthAfter = attacker.health - attackerHullDmg;
  const attackerDestroyed = attackerHealthAfter <= 0;

  // XP calculation
  let attackerXpGain = 0;
  let defenderXpGain = 0;

  if (attacker.weapon != null) {
    attackerXpGain += attackerStrike.hullDamage;
    if (defenderDestroyed) attackerXpGain += Math.floor(defender.maxHealth * 0.5);
    if (!attackerDestroyed) attackerXpGain += 10;
  }

  if (defenderStrike && defender.weapon != null) {
    defenderXpGain += defenderStrike.hullDamage;
    if (attackerDestroyed) defenderXpGain += Math.floor(attacker.maxHealth * 0.5);
    if (!defenderDestroyed) defenderXpGain += 10;
  }

  const defenderTotalDamage = attackerStrike.shieldDamage + attackerStrike.hullDamage;
  const attackerTotalDamage = (defenderStrike?.shieldDamage ?? 0) + (defenderStrike?.hullDamage ?? 0);

  return {
    attackerDamage: attackerTotalDamage,
    defenderDamage: defenderTotalDamage,
    attackerShieldDamage: attackerShieldDmg,
    defenderShieldDamage: attackerStrike.shieldDamage,
    attackerDestroyed,
    defenderDestroyed,
    attackerXpGain,
    defenderXpGain,
    attackerStrike,
    defenderStrike,
  };
}

function resolveStrike(
  striker: UnitData,
  target: UnitData,
  rng: { next(): number },
  incomingDamageMul: number = 1.0,
): StrikeResult {
  if (striker.weapon == null) {
    return { rawDamage: 0, shieldDamage: 0, hullDamage: 0, isCrit: false };
  }

  const vetBonus = VETERAN_BONUSES[striker.veteranTier];
  const weaponStats = WEAPON_STATS[striker.weapon];

  // 1. Base damage with vet multiplier
  let damage = striker.attack * vetBonus.attackMul;

  // 2. Size factor: small targets take less, large take more
  const sizeFactor = target.size === 'small' ? 0.75 : target.size === 'large' ? 1.25 : 1.0;

  // 3. Missile bonus vs small
  const missileBonus = weaponStats.sizeBonus[target.size];
  damage *= missileBonus;
  damage *= sizeFactor;

  // 4. Crit check
  const critChance = 0.10 + vetBonus.critBonus;
  const isCrit = rng.next() < critChance;
  if (isCrit) {
    damage *= 1.5;
  }

  // 5. Variance: ±10%
  const variance = damage * 0.10 * (2 * rng.next() - 1);
  damage += variance;

  // 5b. Influence multiplier
  damage *= incomingDamageMul;

  // 6. Shield absorption — laser deals bonus damage to shields
  const shieldDamage = Math.min(Math.ceil(damage * weaponStats.shieldBonus), target.shields);
  let remaining = damage - (shieldDamage / weaponStats.shieldBonus);

  // 7. Armor reduction — kinetic bypasses 25% of armor
  const effectiveArmor = target.armor * (1.0 - weaponStats.armorBypass);
  remaining = Math.max(0, remaining - effectiveArmor);

  // 8. Minimum 1 hull damage if weapon is present
  const hullDamage = Math.max(1, Math.round(remaining));

  return {
    rawDamage: Math.round(damage),
    shieldDamage,
    hullDamage,
    isCrit,
  };
}

/** Check if XP warrants a promotion and return the new tier. */
export function maybePromote(currentTier: VeteranTier, xp: number): VeteranTier {
  if (xp >= VETERAN_XP_THRESHOLDS.advanced) return 'advanced';
  if (xp >= VETERAN_XP_THRESHOLDS.improved) return 'improved';
  return 'standard';
}
