import { computed, inject, Injectable, signal } from '@angular/core';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance, hexKey, toHexCoord } from '../../shared/hex/hex-math';
import { GameStateService } from './game-state.service';
import { UndoService } from './undo.service';
import { ChunkManagerService } from '../chunks/chunk-manager.service';
import { AnimationService } from '../../game/renderer/animation.service';
import { ActionExecutionService } from './action-execution.service';

import { buildBlockedSet, findPartialPath, getUnitCostOverride, pathCost } from '../pathfinding/hex-pathfinder';

export interface Waypoint {
  unitId: string;
  target: HexCoord;
  attackTargetId?: string;
}

export interface SerializedWaypoint {
  unitId: string;
  q: number;
  r: number;
  attackTargetId?: string;
}

export function serializeWaypoints(map: Map<string, Waypoint>): SerializedWaypoint[] {
  const result: SerializedWaypoint[] = [];
  for (const wp of map.values()) {
    const entry: SerializedWaypoint = { unitId: wp.unitId, q: wp.target.q, r: wp.target.r };
    if (wp.attackTargetId) entry.attackTargetId = wp.attackTargetId;
    result.push(entry);
  }
  return result;
}

export function deserializeWaypoints(data: SerializedWaypoint[]): Map<string, Waypoint> {
  const map = new Map<string, Waypoint>();
  for (const d of data) {
    map.set(d.unitId, {
      unitId: d.unitId,
      target: { q: d.q, r: d.r, s: (-d.q - d.r) || 0 },
      attackTargetId: d.attackTargetId,
    });
  }
  return map;
}

@Injectable({ providedIn: 'root' })
export class WaypointService {
  private readonly gameState = inject(GameStateService);
  private readonly undo = inject(UndoService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly animation = inject(AnimationService);
  private readonly actionExec = inject(ActionExecutionService);

  private readonly _waypoints = signal<Map<string, Waypoint>>(new Map());
  readonly waypoints = computed(() => this._waypoints());

  setWaypoint(unitId: string, target: HexCoord, attackTargetId?: string): void {
    this._waypoints.update(map => {
      const next = new Map(map);
      next.set(unitId, { unitId, target, attackTargetId });
      return next;
    });
  }

  clearWaypoint(unitId: string): void {
    this._waypoints.update(map => {
      if (!map.has(unitId)) return map;
      const next = new Map(map);
      next.delete(unitId);
      return next;
    });
  }

  clearAll(): void {
    this._waypoints.set(new Map());
  }

  getSerializedWaypoints(): SerializedWaypoint[] {
    return serializeWaypoints(this._waypoints());
  }

  loadWaypoints(data: SerializedWaypoint[]): void {
    this._waypoints.set(deserializeWaypoints(data));
  }

  getWaypoint(unitId: string): Waypoint | null {
    return this._waypoints().get(unitId) ?? null;
  }

  /**
   * Execute a single waypoint for a unit.
   * Moves the unit toward its target (as far as MP allows this turn),
   * and auto-attacks if this is an Attack Here order and target is in range.
   * Returns a promise that resolves when animation completes.
   */
  async executeWaypoint(unitId: string): Promise<void> {
    const wp = this.getWaypoint(unitId);
    if (!wp) return;

    const units = this.gameState.units();
    const unit = units.get(unitId);
    if (!unit) {
      this.clearWaypoint(unitId);
      return;
    }
    // Already attacked this turn — keep waypoint, will execute next turn
    if (unit.movementPoints <= 0 && unit.hasAttacked) return;

    // Already at target?
    if (unit.q === wp.target.q && unit.r === wp.target.r && !wp.attackTargetId) {
      this.clearWaypoint(unitId);
      return;
    }

    const currentPlayer = this.gameState.currentPlayer();
    if (!currentPlayer || unit.ownerId !== currentPlayer.id) {
      this.clearWaypoint(unitId);
      return;
    }

    // Attack Here: check if target still exists
    if (wp.attackTargetId) {
      const target = units.get(wp.attackTargetId);
      if (!target) {
        this.clearWaypoint(unitId);
        return;
      }

      // Update target position (it may have moved)
      const targetCoord: HexCoord = toHexCoord(target.q, target.r);
      wp.target = targetCoord;
      // Re-store the updated waypoint
      this.setWaypoint(unitId, targetCoord, wp.attackTargetId);

      // Check if already in attack range
      const dist = hexDistance(
        toHexCoord(unit.q, unit.r),
        targetCoord,
      );
      if (dist <= unit.range && unit.weapon != null && !unit.hasAttacked) {
        await this.performAttack(unitId, wp.attackTargetId);
        this.clearWaypoint(unitId);
        return;
      }
    }

    // Build blocked set (enemy units and buildings block movement)
    // Exclude the attack target so pathfinding can route toward it
    const buildings = this.gameState.buildings();
    const blocked = buildBlockedSet(units, buildings, currentPlayer.id, unitId, wp.attackTargetId);
    const isBlocked = (q: number, r: number) => blocked.has(hexKey(q, r));
    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    const from: HexCoord = toHexCoord(unit.q, unit.r);
    const override = getUnitCostOverride(unit.type);

    const path = findPartialPath(from, wp.target, unit.movementPoints, hexLookup, isBlocked, override);

    // Don't move onto the attack target's hex — stop adjacent instead
    if (path && wp.attackTargetId) {
      const target = units.get(wp.attackTargetId) ?? buildings.get(wp.attackTargetId);
      if (target) {
        const last = path[path.length - 1];
        if (last.q === target.q && last.r === target.r) {
          path.pop();
        }
      }
    }

    if (path && path.length > 1) {
      const cost = pathCost(path, hexLookup, override);
      await this.animation.animateUnitMovement(unitId, path);
      this.undo.dispatch({ type: 'MOVE_UNIT', unitId, path, cost });

      // Check if arrived at final target
      const last = path[path.length - 1];
      if (last.q === wp.target.q && last.r === wp.target.r && !wp.attackTargetId) {
        this.clearWaypoint(unitId);
        return;
      }

      // Attack Here: after moving, check if now in range
      if (wp.attackTargetId) {
        const freshUnits = this.gameState.units();
        const freshUnit = freshUnits.get(unitId);
        const target = freshUnits.get(wp.attackTargetId);
        if (!freshUnit || !target) {
          this.clearWaypoint(unitId);
          return;
        }
        const dist = hexDistance(
          toHexCoord(freshUnit.q, freshUnit.r),
          toHexCoord(target.q, target.r),
        );
        if (dist <= freshUnit.range && freshUnit.weapon != null && !freshUnit.hasAttacked) {
          await this.performAttack(unitId, wp.attackTargetId);
          this.clearWaypoint(unitId);
        }
      }
    }
  }

  /**
   * Execute all waypoints for the current player's units.
   * Called at the start of the human player's turn.
   */
  async executeAllWaypoints(): Promise<void> {
    const waypoints = this._waypoints();
    const currentPlayer = this.gameState.currentPlayer();
    if (!currentPlayer || waypoints.size === 0) return;

    for (const [unitId] of waypoints) {
      const unit = this.gameState.units().get(unitId);
      if (!unit || unit.ownerId !== currentPlayer.id) {
        this.clearWaypoint(unitId);
        continue;
      }
      await this.executeWaypoint(unitId);
      // Small delay between units so player can see each movement
      if (waypoints.size > 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  private async performAttack(attackerId: string, targetId: string): Promise<void> {
    await this.actionExec.executeAttack(attackerId, targetId);
  }
}
