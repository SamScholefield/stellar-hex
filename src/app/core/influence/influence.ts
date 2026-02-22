import { BuildingData, BUILDING_STATS, UnitData } from '../../models/game-state';

/**
 * Compute the set of hex keys within the sphere of influence for a player's buildings.
 * Uses each building's sightRange from BUILDING_STATS plus any tech bonus as the influence radius.
 */
export function computeInfluenceForPlayer(buildings: Map<string, BuildingData>, playerId: string, sightRangeBonus: number = 0): Set<string> {
  const result = new Set<string>();
  for (const building of buildings.values()) {
    if (building.ownerId !== playerId) continue;
    const range = BUILDING_STATS[building.type].sightRange + sightRangeBonus;
    for (let dq = -range; dq <= range; dq++) {
      const r1 = Math.max(-range, -dq - range);
      const r2 = Math.min(range, -dq + range);
      for (let dr = r1; dr <= r2; dr++) {
        result.add(`${building.q + dq},${building.r + dr}`);
      }
    }
  }
  return result;
}

/**
 * Check if any enemy unit's sightRange reaches the given hex.
 * Uses cube distance: max(|dq|, |dr|, |dq+dr|) <= unit.sightRange
 */
export function isNearAnyEnemyUnit(q: number, r: number, units: Map<string, UnitData>, friendlyPlayerId: string): boolean {
  for (const unit of units.values()) {
    if (unit.ownerId === friendlyPlayerId) continue;
    const dq = q - unit.q;
    const dr = r - unit.r;
    const ds = -dq - dr;
    const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
    if (dist <= unit.sightRange) return true;
  }
  return false;
}
