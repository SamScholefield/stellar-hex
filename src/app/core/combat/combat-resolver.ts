import { UnitData } from '../../models/game-state';
import { seededRNG } from '../generation/noise';

export interface CombatResult {
  attackerDamage: number;
  defenderDamage: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
}

/**
 * Resolve combat between attacker and defender.
 * @param attacker - The attacking unit
 * @param defender - The defending unit
 * @param attackerRange - Hex distance between the two units
 * @param seed - Deterministic seed for variance
 */
export function resolveCombat(
  attacker: UnitData,
  defender: UnitData,
  attackerRange: number,
  seed: number,
): CombatResult {
  const rng = seededRNG(seed);

  // Attacker deals damage
  const defenderDamage = computeDamage(attacker.attack, defender.defense, rng.next());

  // Check if defender survives and can retaliate
  const defenderSurvives = defender.health - defenderDamage > 0;
  const defenderInRange = attackerRange <= defender.range;

  let attackerDamage = 0;
  if (defenderSurvives && defenderInRange) {
    attackerDamage = computeDamage(defender.attack, attacker.defense, rng.next());
  }

  return {
    attackerDamage,
    defenderDamage,
    attackerDestroyed: attacker.health - attackerDamage <= 0,
    defenderDestroyed: defender.health - defenderDamage <= 0,
  };
}

function computeDamage(attack: number, defense: number, roll: number): number {
  if (attack <= 0) return 0;
  const base = attack * (1 - defense / (defense + 100));
  // Variance: ±15% of base damage
  const variance = base * 0.15 * (2 * roll - 1);
  return Math.max(1, Math.round(base + variance));
}
