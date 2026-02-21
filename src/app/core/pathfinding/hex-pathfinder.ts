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

// --- Binary min-heap ---

interface HeapNode {
  key: string;
  coord: HexCoord;
  priority: number;
}

class MinHeap {
  private data: HeapNode[] = [];

  get length(): number { return this.data.length; }

  push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode {
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    const node = this.data[i];
    while (i > 0) {
      const parentI = (i - 1) >> 1;
      if (this.data[parentI].priority <= node.priority) break;
      this.data[i] = this.data[parentI];
      i = parentI;
    }
    this.data[i] = node;
  }

  private sinkDown(i: number): void {
    const length = this.data.length;
    const node = this.data[i];
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < length && this.data[left].priority < this.data[smallest].priority) smallest = left;
      if (right < length && this.data[right].priority < this.data[smallest].priority) smallest = right;
      if (smallest === i) break;
      this.data[i] = this.data[smallest];
      this.data[smallest] = node;
      i = smallest;
    }
  }
}

// Max-heap variant for getReachableHexes (highest remaining MP first)
class MaxHeap {
  private data: { key: string; coord: HexCoord; remaining: number }[] = [];

  get length(): number { return this.data.length; }

  push(node: { key: string; coord: HexCoord; remaining: number }): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): { key: string; coord: HexCoord; remaining: number } {
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    const node = this.data[i];
    while (i > 0) {
      const parentI = (i - 1) >> 1;
      if (this.data[parentI].remaining >= node.remaining) break;
      this.data[i] = this.data[parentI];
      i = parentI;
    }
    this.data[i] = node;
  }

  private sinkDown(i: number): void {
    const length = this.data.length;
    const node = this.data[i];
    while (true) {
      let largest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < length && this.data[left].remaining > this.data[largest].remaining) largest = left;
      if (right < length && this.data[right].remaining > this.data[largest].remaining) largest = right;
      if (largest === i) break;
      this.data[i] = this.data[largest];
      this.data[largest] = node;
      i = largest;
    }
  }
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
  const startF = hexDistance(from, to);
  fScore.set(startKey, startF);

  const cameFrom = new Map<string, HexCoord>();

  const open = new MinHeap();
  open.push({ key: startKey, coord: from, priority: startF });
  const openSet = new Set<string>([startKey]);
  const closed = new Set<string>();

  while (open.length > 0) {
    const current = open.pop();
    openSet.delete(current.key);

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
    const currentG = gScore.get(current.key) ?? Infinity;

    for (const neighbor of hexNeighbors(current.coord.q, current.coord.r)) {
      const nKey = hexKey(neighbor.q, neighbor.r);
      if (closed.has(nKey)) continue;

      // Check passability
      const hex = hexLookup(neighbor.q, neighbor.r);
      const cost = costOverride?.(hex) ?? moveCost(hex);
      if (!isFinite(cost)) continue;
      if (isBlocked && isBlocked(neighbor.q, neighbor.r)) continue;

      const tentativeG = currentG + cost;
      if (tentativeG > movementPoints) continue;

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current.coord);
        gScore.set(nKey, tentativeG);
        const f = tentativeG + hexDistance(neighbor, to);
        fScore.set(nKey, f);

        if (!openSet.has(nKey)) {
          open.push({ key: nKey, coord: neighbor, priority: f });
          openSet.add(nKey);
        } else {
          // Node already in heap with worse score — add duplicate, closed-set will filter it
          open.push({ key: nKey, coord: neighbor, priority: f });
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

  // Dijkstra flood fill using max-heap (highest remaining MP first)
  const frontier = new MaxHeap();
  frontier.push({ key: startKey, coord: from, remaining: movementPoints });

  while (frontier.length > 0) {
    const current = frontier.pop();

    // Skip if we've already found a better path to this node
    const bestRemaining = reachable.get(current.key) ?? -1;
    if (current.remaining < bestRemaining) continue;

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
        frontier.push({ key: nKey, coord: neighbor, remaining });
      }
    }
  }

  return reachable;
}

/**
 * A* pathfinding without movement-point constraint.
 * Used for multi-turn waypoint navigation.
 * Returns the full path from `from` to `to`, or null if unreachable.
 */
export function findUnboundedPath(
  from: HexCoord,
  to: HexCoord,
  hexLookup: HexLookup,
  isBlocked?: UnitBlockCheck,
  costOverride?: MoveCostOverride,
): HexCoord[] | null {
  const dist = hexDistance(from, to);
  const maxSearch = dist * 2 + 50;

  const toKey = hexKey(to.q, to.r);
  const startKey = hexKey(from.q, from.r);

  const gScore = new Map<string, number>();
  gScore.set(startKey, 0);

  const cameFrom = new Map<string, HexCoord>();

  const open = new MinHeap();
  open.push({ key: startKey, coord: from, priority: dist });
  const openSet = new Set<string>([startKey]);
  const closed = new Set<string>();

  while (open.length > 0) {
    const current = open.pop();
    openSet.delete(current.key);

    if (current.key === toKey) {
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
    const currentG = gScore.get(current.key) ?? Infinity;

    if (currentG > maxSearch) continue;

    for (const neighbor of hexNeighbors(current.coord.q, current.coord.r)) {
      const nKey = hexKey(neighbor.q, neighbor.r);
      if (closed.has(nKey)) continue;

      const hex = hexLookup(neighbor.q, neighbor.r);
      const cost = costOverride?.(hex) ?? moveCost(hex);
      if (!isFinite(cost)) continue;
      if (isBlocked && isBlocked(neighbor.q, neighbor.r)) continue;

      const tentativeG = currentG + cost;

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current.coord);
        gScore.set(nKey, tentativeG);
        const f = tentativeG + hexDistance(neighbor, to);

        if (!openSet.has(nKey)) {
          open.push({ key: nKey, coord: neighbor, priority: f });
          openSet.add(nKey);
        } else {
          open.push({ key: nKey, coord: neighbor, priority: f });
        }
      }
    }
  }

  return null;
}

/**
 * Find a partial path toward `to` that fits within `movementPoints`.
 * Computes the full unbounded path, then walks it hex-by-hex until MP exhausted.
 * Returns the sub-path (from → farthest reachable hex), or null if no movement possible.
 */
export function findPartialPath(
  from: HexCoord,
  to: HexCoord,
  movementPoints: number,
  hexLookup: HexLookup,
  isBlocked?: UnitBlockCheck,
  costOverride?: MoveCostOverride,
): HexCoord[] | null {
  const fullPath = findUnboundedPath(from, to, hexLookup, isBlocked, costOverride);
  if (!fullPath || fullPath.length < 2) return null;

  const partial: HexCoord[] = [fullPath[0]];
  let spent = 0;

  for (let i = 1; i < fullPath.length; i++) {
    const hex = hexLookup(fullPath[i].q, fullPath[i].r);
    const cost = costOverride?.(hex) ?? moveCost(hex);
    if (spent + cost > movementPoints) break;
    spent += cost;
    partial.push(fullPath[i]);
  }

  return partial.length > 1 ? partial : null;
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
