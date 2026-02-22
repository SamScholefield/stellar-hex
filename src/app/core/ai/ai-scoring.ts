import { HexCoord } from '../../shared/hex/hex-coord.type';
import { HexData, StellarObjectType } from '../../models/hex-data';
import {
  UnitData,
  BuildingData,
  BuildingType,
  UnitType,
  Resources,
  BUILDING_STATS,
  UNIT_STATS,
  UNIT_UPKEEP,
  PlayerState,
  GameState,
  TechId,
  TECH_TREE,
  canResearch,
} from '../../models/game-state';
import { hexDistance, hexNeighbors, hexesInRange } from '../../shared/hex/hex-math';
import { resolveCombat, resolveBuildingCombat } from '../combat/combat-resolver';
import { findPath } from '../pathfinding/hex-pathfinder';
import { HexLookup } from '../pathfinding/hex-pathfinder';

export interface ExploreResult {
  target: HexCoord;
  score: number;
}

export interface AttackScoreResult {
  targetId: string;
  score: number;
}

export interface BuildScoreResult {
  buildingType: BuildingType;
  hex: HexCoord;
  hexType: StellarObjectType;
  score: number;
}

export interface ProductionScoreResult {
  buildingId: string;
  unitType: UnitType;
  score: number;
}

/**
 * Score exploration targets for a unit.
 * Finds the nearest unexplored hex reachable in ~2 turns, preferring
 * directions with clusters of unexplored hexes.
 */
export function scoreExplore(
  unit: UnitData,
  exploredHexes: Set<string>,
  hexLookup: HexLookup,
): ExploreResult | null {
  const unitCoord: HexCoord = { q: unit.q, r: unit.r, s: -unit.q - unit.r };
  const searchRadius = unit.maxMovementPoints * 2;

  let bestTarget: HexCoord | null = null;
  let bestScore = -Infinity;

  // Scan outward in rings to find unexplored frontier hexes
  for (let radius = 1; radius <= searchRadius; radius++) {
    const ring = hexesInRange(unitCoord, radius);
    for (const hex of ring) {
      const key = `${hex.q},${hex.r}`;
      if (exploredHexes.has(key)) continue;

      // Score by number of unexplored neighbors (cluster bonus) and closeness
      let clusterCount = 0;
      for (const neighbor of hexNeighbors(hex.q, hex.r)) {
        if (!exploredHexes.has(`${neighbor.q},${neighbor.r}`)) {
          clusterCount++;
        }
      }

      const dist = hexDistance(unitCoord, hex);
      // Prefer close hexes with many unexplored neighbors
      const score = clusterCount * 2 - dist;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = hex;
      }
    }
  }

  if (!bestTarget) return null;
  return { target: bestTarget, score: bestScore };
}

/**
 * Score attack targets for a unit.
 * Previews combat and returns the best favorable target (units or buildings).
 */
export function scoreAttack(
  attacker: UnitData,
  enemies: UnitData[],
  seed: number,
  enemyBuildings?: BuildingData[],
): AttackScoreResult | null {
  if (attacker.weapon == null || attacker.movementPoints < 0) return null;

  const attackerCoord: HexCoord = { q: attacker.q, r: attacker.r, s: -attacker.q - attacker.r };
  let bestResult: AttackScoreResult | null = null;

  for (const enemy of enemies) {
    const enemyCoord: HexCoord = { q: enemy.q, r: enemy.r, s: -enemy.q - enemy.r };
    const dist = hexDistance(attackerCoord, enemyCoord);
    if (dist > attacker.range) continue;

    const combat = resolveCombat(attacker, enemy, dist, seed);

    // Score: positive means favorable, negative means unfavorable
    // Prioritize kills, penalize self-destruction
    let score = combat.defenderDamage - combat.attackerDamage;
    if (combat.defenderDestroyed) score += 20;
    if (combat.attackerDestroyed) score -= 30;

    // Skip unfavorable attacks (would die or deal less damage than taking)
    if (combat.attackerDestroyed) continue;
    if (score < 0) continue;

    if (!bestResult || score > bestResult.score) {
      bestResult = { targetId: enemy.id, score };
    }
  }

  // Score building targets — no retaliation makes these attractive
  if (enemyBuildings) {
    for (const building of enemyBuildings) {
      const bCoord: HexCoord = { q: building.q, r: building.r, s: -building.q - building.r };
      const dist = hexDistance(attackerCoord, bCoord);
      if (dist > attacker.range) continue;

      const bCombat = resolveBuildingCombat(attacker, building, seed);
      // Buildings can't retaliate — always favorable. Bonus for economic damage.
      let score = bCombat.damage + 5; // +5 bonus for no-risk attack
      if (bCombat.destroyed) score += 25; // big bonus for destroying economic infrastructure

      if (!bestResult || score > bestResult.score) {
        bestResult = { targetId: building.id, score };
      }
    }
  }

  return bestResult;
}

/**
 * Score building placements for the AI player.
 * Checks explored hexes near units/buildings for buildable locations.
 */
export function scoreBuild(
  player: PlayerState,
  buildings: Map<string, BuildingData>,
  units: Map<string, UnitData>,
  hexLookup: HexLookup,
): BuildScoreResult | null {
  const ownedPositions: HexCoord[] = [];

  // Collect positions of owned units and buildings
  for (const unit of units.values()) {
    if (unit.ownerId === player.id) {
      ownedPositions.push({ q: unit.q, r: unit.r, s: -unit.q - unit.r });
    }
  }
  for (const building of buildings.values()) {
    if (building.ownerId === player.id) {
      ownedPositions.push({ q: building.q, r: building.r, s: -building.q - building.r });
    }
  }

  // Occupied building positions
  const buildingPositions = new Set<string>();
  for (const b of buildings.values()) {
    buildingPositions.add(`${b.q},${b.r}`);
  }

  let bestResult: BuildScoreResult | null = null;

  // Search hexes near owned positions
  for (const pos of ownedPositions) {
    const nearby = hexesInRange(pos, 2);
    for (const hex of nearby) {
      const key = `${hex.q},${hex.r}`;
      if (!player.exploredHexes.has(key)) continue;
      if (buildingPositions.has(key)) continue;

      // Require friendly unit at hex
      let hasUnitAtHex = false;
      for (const u of units.values()) {
        if (u.ownerId === player.id && u.q === hex.q && u.r === hex.r) {
          hasUnitAtHex = true;
          break;
        }
      }
      if (!hasUnitAtHex) continue;

      const hexData = hexLookup(hex.q, hex.r);
      if (!hexData) continue;
      const hexType = hexData.object?.type ?? 'empty';

      // Try each building type
      for (const [btStr, stats] of Object.entries(BUILDING_STATS)) {
        const bt = btStr as BuildingType;
        if (!stats.allowedHexTypes.includes(hexType as StellarObjectType)) continue;
        if (!hasResources(player.resources, stats.cost)) continue;

        // Colony requires colony_ship at location
        if (bt === 'colony') {
          let hasColonyShip = false;
          for (const u of units.values()) {
            if (u.ownerId === player.id && u.type === 'colony_ship' && u.q === hex.q && u.r === hex.r) {
              hasColonyShip = true;
              break;
            }
          }
          if (!hasColonyShip) continue;
        }

        // Starbase requires scout at location + planet within 8 hexes
        if (bt === 'starbase') {
          let hasScout = false;
          for (const u of units.values()) {
            if (u.ownerId === player.id && u.type === 'scout' && u.q === hex.q && u.r === hex.r) {
              hasScout = true;
              break;
            }
          }
          if (!hasScout) continue;
          const nearby = hexesInRange(hex, 8);
          const hasPlanet = nearby.some(h => {
            const hd = hexLookup(h.q, h.r);
            return hd?.object?.type === 'planet';
          });
          if (!hasPlanet) continue;
        }

        // Solar collector requires adjacent star
        if (bt === 'solar_collector') {
          const hasAdjacentStar = hexNeighbors(hex.q, hex.r).some(n => {
            const hd = hexLookup(n.q, n.r);
            return hd?.object?.type === 'star';
          });
          if (!hasAdjacentStar) continue;
        }

        // Score: yield per cost ratio
        const totalYield = (stats.yield.energy ?? 0) + (stats.yield.minerals ?? 0)
          + (stats.yield.alloys ?? 0) + (stats.yield.credits ?? 0);
        const totalCost = (stats.cost.energy ?? 0) + (stats.cost.minerals ?? 0)
          + (stats.cost.alloys ?? 0) + (stats.cost.credits ?? 0);
        const score = totalCost > 0 ? (totalYield / totalCost) * 100 : 0;

        if (!bestResult || score > bestResult.score) {
          bestResult = {
            buildingType: bt,
            hex,
            hexType: hexType as StellarObjectType,
            score,
          };
        }
      }
    }
  }

  return bestResult;
}

/**
 * Score unit production for starbases.
 * netEnergyIncome: current net energy income (income - existing upkeep).
 * If adding a unit's upkeep would push net energy below -5, skip it.
 */
export function scoreProduction(
  player: PlayerState,
  buildings: Map<string, BuildingData>,
  units: Map<string, UnitData>,
  enemyNearby: boolean,
  netEnergyIncome?: number,
): ProductionScoreResult | null {
  let bestResult: ProductionScoreResult | null = null;

  for (const [bId, building] of buildings) {
    if (building.ownerId !== player.id) continue;
    if (building.type !== 'starbase') continue;
    // Skip starbases already producing
    if (building.productionQueue && building.productionQueue.length > 0) continue;

    // Count owned units by type
    let scoutCount = 0;
    let combatCount = 0;
    for (const u of units.values()) {
      if (u.ownerId !== player.id) continue;
      if (u.type === 'scout') scoutCount++;
      if (u.type === 'fighter' || u.type === 'corvette' || u.type === 'frigate' || u.type === 'cruiser' || u.type === 'battleship') combatCount++;
    }

    let unitType: UnitType;
    let score: number;

    if (enemyNearby) {
      // Escalate: try battleship > cruiser > frigate > corvette > fighter
      if (hasResources(player.resources, UNIT_STATS.battleship.cost) && canSustainUpkeep('battleship', netEnergyIncome)) {
        unitType = 'battleship';
        score = 90;
      } else if (hasResources(player.resources, UNIT_STATS.cruiser.cost) && canSustainUpkeep('cruiser', netEnergyIncome)) {
        unitType = 'cruiser';
        score = 85;
      } else if (hasResources(player.resources, UNIT_STATS.frigate.cost) && canSustainUpkeep('frigate', netEnergyIncome)) {
        unitType = 'frigate';
        score = 82;
      } else if (hasResources(player.resources, UNIT_STATS.corvette.cost) && canSustainUpkeep('corvette', netEnergyIncome)) {
        unitType = 'corvette';
        score = 80;
      } else if (hasResources(player.resources, UNIT_STATS.fighter.cost) && canSustainUpkeep('fighter', netEnergyIncome)) {
        unitType = 'fighter';
        score = 78;
      } else {
        continue;
      }
    } else if (scoutCount < 2 && hasResources(player.resources, UNIT_STATS.scout.cost)) {
      unitType = 'scout';
      score = 60;
    } else if (combatCount < 2 && hasResources(player.resources, UNIT_STATS.corvette.cost) && canSustainUpkeep('corvette', netEnergyIncome)) {
      unitType = 'corvette';
      score = 50;
    } else if (combatCount < 2 && hasResources(player.resources, UNIT_STATS.fighter.cost) && canSustainUpkeep('fighter', netEnergyIncome)) {
      unitType = 'fighter';
      score = 45;
    } else if (hasResources(player.resources, UNIT_STATS.scout.cost)) {
      unitType = 'scout';
      score = 30;
    } else {
      continue;
    }

    if (!bestResult || score > bestResult.score) {
      bestResult = { buildingId: bId, unitType, score };
    }
  }

  return bestResult;
}

export interface ResearchScoreResult {
  buildingId: string;
  techId: TechId;
  score: number;
}

/**
 * Score research options for the AI.
 * Prefers weapons/armor if enemies are visible, systems/drive otherwise.
 */
export function scoreResearch(
  player: PlayerState,
  buildings: Map<string, BuildingData>,
  enemyNearby: boolean,
): ResearchScoreResult | null {
  let bestResult: ResearchScoreResult | null = null;

  // Collect all techs already queued across all labs
  const queuedTechs = new Set<TechId>();
  for (const b of buildings.values()) {
    if (b.ownerId !== player.id || b.type !== 'research_lab') continue;
    if (b.researchQueue) {
      for (const item of b.researchQueue) {
        queuedTechs.add(item.techId);
      }
    }
  }

  for (const [bId, building] of buildings) {
    if (building.ownerId !== player.id) continue;
    if (building.type !== 'research_lab') continue;
    // Skip labs already researching
    if (building.researchQueue && building.researchQueue.length > 0) continue;

    for (const [techIdStr, def] of Object.entries(TECH_TREE)) {
      const techId = techIdStr as TechId;
      if (queuedTechs.has(techId)) continue;
      if (!canResearch(techId, player.researchedTechs)) continue;
      if (!hasResources(player.resources, def.cost)) continue;

      // Score by branch priority and tier
      let score: number;
      if (enemyNearby) {
        // Prefer combat techs
        const branchPriority: Record<string, number> = { weapons: 50, armor: 45, shields: 40, drive: 30, systems: 25 };
        score = (branchPriority[def.branch] ?? 20) + def.tier * 5;
      } else {
        // Prefer exploration techs
        const branchPriority: Record<string, number> = { systems: 50, drive: 45, shields: 30, weapons: 25, armor: 20 };
        score = (branchPriority[def.branch] ?? 20) + def.tier * 5;
      }

      if (!bestResult || score > bestResult.score) {
        bestResult = { buildingId: bId, techId, score };
      }
    }
  }

  return bestResult;
}

function canSustainUpkeep(unitType: UnitType, netEnergyIncome?: number): boolean {
  if (netEnergyIncome === undefined) return true;
  const upkeep = UNIT_UPKEEP[unitType];
  const additionalEnergy = upkeep?.energy ?? 0;
  return (netEnergyIncome - additionalEnergy) >= -5;
}

function hasResources(resources: Resources, cost: Partial<Resources>): boolean {
  return (resources.energy >= (cost.energy ?? 0))
    && (resources.minerals >= (cost.minerals ?? 0))
    && (resources.alloys >= (cost.alloys ?? 0))
    && (resources.credits >= (cost.credits ?? 0));
}
