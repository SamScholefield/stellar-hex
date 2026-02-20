import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance, hexNeighbors } from '../../shared/hex/hex-math';
import { HexData, StellarObjectType } from '../../models/hex-data';
import { UnitType } from '../../models/game-state';

export type HexLookup = (q: number, r: number) => HexData | null;
export type UnitBlockCheck = (q: number, r: number) => boolean;

/**
 * Optional callback to override movement cost for specific hexes.
 * Return a number to override the default cost, or undefined to use the default.
 */
export type MoveCostOverride = (hex: HexData | null) => number | undefined;

const MOVEMENT_COSTS: Partial<Record<StellarObjectType, number>> = {
  star: Infinity,
  black_hole: Infinity,
  nebula: 2,
  asteroid_field: 1.5,
  asteroid: 1.5,
};

function moveCost(hex: HexData | null): number {
  if (!hex) return 1; // unexplored = assume open
  const type = hex.object?.type;
  if (!type || type === 'empty') return 1;
  return MOVEMENT_COSTS[type] ?? 1;
}

/**
 * Cost override for mining drones: stars cost 2 MP instead of being impassable.
 */
export function miningDroneCostOverride(hex: HexData | null): number | undefined {
  if (hex?.object?.type === 'star') return 2;
  return undefined;
}

/**
 * Cost override for scouts and colony ships: nebulae cost 1 MP instead of 2.
 */
export function lightUnitCostOverride(hex: HexData | null): number | undefined {
  if (hex?.object?.type === 'nebula') return 1;
  return undefined;
}

/**
 * Returns the appropriate cost override for a unit type, or undefined if none.
 */
export function getUnitCostOverride(type: UnitType): MoveCostOverride | undefined {
  switch (type) {
    case 'mining_drone': return miningDroneCostOverride;
    case 'scout':
    case 'colony_ship': return lightUnitCostOverride;
    default: return undefined;
  }
}

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/**
 * A* pathfinding over hex grid.
 * Returns the path from `from` to `to` (inclusive), or null if unreachable.
 */
export function findPath(
  from: HexCoord,
  to: HexCoord,
  movementPoints: number,
  hexLookup: HexLookup,
  isBlocked?: UnitBlockCheck,
  costOverride?: MoveCostOverride,
): HexCoord[] | null {
  const maxSearch = movementPoints * 3;
  if (hexDistance(from, to) > maxSearch) return null;

  const toKey = hexKey(to.q, to.r);
  const startKey = hexKey(from.q, from.r);

  const gScore = new Map<string, number>();
  gScore.set(startKey, 0);

  const fScore = new Map<string, number>();
  fScore.set(startKey, hexDistance(from, to));

  const cameFrom = new Map<string, HexCoord>();

  // Simple priority queue using sorted array
  const open: { key: string; coord: HexCoord }[] = [{ key: startKey, coord: from }];
  const closed = new Set<string>();

  while (open.length > 0) {
    // Pick node with lowest fScore
    let bestIdx = 0;
    let bestF = fScore.get(open[0].key) ?? Infinity;
    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i].key) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }

    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    if (current.key === toKey) {
      // Reconstruct path
      const path: HexCoord[] = [];
      let step: HexCoord | undefined = current.coord;
      while (step) {
        path.push(step);
        const k = hexKey(step.q, step.r);
        step = cameFrom.get(k);
      }
      path.reverse();
      return path;
    }

    closed.add(current.key);

    for (const neighbor of hexNeighbors(current.coord.q, current.coord.r)) {
      const nKey = hexKey(neighbor.q, neighbor.r);
      if (closed.has(nKey)) continue;

      // Check passability
      const hex = hexLookup(neighbor.q, neighbor.r);
      const cost = costOverride?.(hex) ?? moveCost(hex);
      if (!isFinite(cost)) continue;
      if (isBlocked && isBlocked(neighbor.q, neighbor.r)) continue;

      const tentativeG = (gScore.get(current.key) ?? Infinity) + cost;
      if (tentativeG > movementPoints) continue;

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current.coord);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + hexDistance(neighbor, to));

        if (!open.some((n) => n.key === nKey)) {
          open.push({ key: nKey, coord: neighbor });
        }
      }
    }
  }

  return null;
}

/**
 * Compute all reachable hexes from a position within the given movement points.
 * Returns a map of hex key -> remaining movement points at that hex.
 */
export function getReachableHexes(
  from: HexCoord,
  movementPoints: number,
  hexLookup: HexLookup,
  isBlocked?: UnitBlockCheck,
  costOverride?: MoveCostOverride,
): Map<string, number> {
  const reachable = new Map<string, number>();
  const startKey = hexKey(from.q, from.r);
  reachable.set(startKey, movementPoints);

  // BFS / Dijkstra flood fill
  const frontier: { coord: HexCoord; remaining: number }[] = [{ coord: from, remaining: movementPoints }];

  while (frontier.length > 0) {
    // Pick node with highest remaining MP (greedy)
    let bestIdx = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i].remaining > frontier[bestIdx].remaining) bestIdx = i;
    }
    const current = frontier[bestIdx];
    frontier.splice(bestIdx, 1);

    for (const neighbor of hexNeighbors(current.coord.q, current.coord.r)) {
      const nKey = hexKey(neighbor.q, neighbor.r);

      const hex = hexLookup(neighbor.q, neighbor.r);
      const cost = costOverride?.(hex) ?? moveCost(hex);
      if (!isFinite(cost)) continue;
      if (isBlocked && isBlocked(neighbor.q, neighbor.r)) continue;

      const remaining = current.remaining - cost;
      if (remaining < 0) continue;

      if (remaining > (reachable.get(nKey) ?? -1)) {
        reachable.set(nKey, remaining);
        frontier.push({ coord: neighbor, remaining });
      }
    }
  }

  return reachable;
}

/**
 * Compute the total movement cost for a path.
 */
export function pathCost(path: HexCoord[], hexLookup: HexLookup, costOverride?: MoveCostOverride): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const hex = hexLookup(path[i].q, path[i].r);
    total += costOverride?.(hex) ?? moveCost(hex);
  }
  return total;
}
