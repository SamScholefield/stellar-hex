import { computed, inject, Injectable, signal } from '@angular/core';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance } from '../../shared/hex/hex-math';
import { GameStateService } from './game-state.service';
import { UndoService } from './undo.service';
import { ChunkManagerService } from '../chunks/chunk-manager.service';
import { AnimationService } from '../../game/renderer/animation.service';
import { EventLogService } from './event-log.service';
import { NotificationService } from '../notifications/notification.service';
import { AudioService } from '../audio/audio.service';
import { findPartialPath, getUnitCostOverride, pathCost } from '../pathfinding/hex-pathfinder';
import { attackWithResult } from './game-reducer';

export interface Waypoint {
  unitId: string;
  target: HexCoord;
  attackTargetId?: string;
}

@Injectable({ providedIn: 'root' })
export class WaypointService {
  private readonly gameState = inject(GameStateService);
  private readonly undo = inject(UndoService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly animation = inject(AnimationService);
  private readonly eventLog = inject(EventLogService);
  private readonly notifications = inject(NotificationService);
  private readonly audio = inject(AudioService);

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
    // No MP yet — keep waypoint, will execute next turn
    if (unit.movementPoints <= 0) return;

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
      const targetCoord: HexCoord = { q: target.q, r: target.r, s: -target.q - target.r };
      wp.target = targetCoord;
      // Re-store the updated waypoint
      this.setWaypoint(unitId, targetCoord, wp.attackTargetId);

      // Check if already in attack range
      const dist = hexDistance(
        { q: unit.q, r: unit.r, s: -unit.q - unit.r },
        targetCoord,
      );
      if (dist <= unit.range && unit.attack > 0) {
        await this.performAttack(unitId, wp.attackTargetId);
        this.clearWaypoint(unitId);
        return;
      }
    }

    // Build blocked set (enemy units block movement)
    const blocked = new Set<string>();
    for (const u of units.values()) {
      if (u.id !== unitId && u.ownerId !== currentPlayer.id) {
        blocked.add(`${u.q},${u.r}`);
      }
    }
    const isBlocked = (q: number, r: number) => blocked.has(`${q},${r}`);
    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    const from: HexCoord = { q: unit.q, r: unit.r, s: -unit.q - unit.r };
    const override = getUnitCostOverride(unit.type);

    const path = findPartialPath(from, wp.target, unit.movementPoints, hexLookup, isBlocked, override);
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
          { q: freshUnit.q, r: freshUnit.r, s: -freshUnit.q - freshUnit.r },
          { q: target.q, r: target.r, s: -target.q - target.r },
        );
        if (dist <= freshUnit.range && freshUnit.attack > 0 && freshUnit.movementPoints > 0) {
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
    const state = this.gameState.getState();
    const { combat } = attackWithResult(state, attackerId, targetId);
    if (!combat) return;

    const attacker = state.units.get(attackerId)!;
    const defender = state.units.get(targetId)!;

    await this.animation.animateCombat(attackerId, targetId);
    this.undo.dispatch({ type: 'ATTACK', attackerId, targetId });

    const turn = this.gameState.turn();
    const msg = `${attacker.type} attacked ${defender.type}: dealt ${combat.defenderDamage} dmg, took ${combat.attackerDamage} dmg`
      + (combat.defenderDestroyed ? ` — ${defender.type} destroyed!` : '')
      + (combat.attackerDestroyed ? ` — ${attacker.type} destroyed!` : '');
    this.eventLog.push({ turn, message: msg, q: defender.q, r: defender.r });

    const toastType = combat.defenderDestroyed || combat.attackerDestroyed ? 'danger' : 'warning';
    this.notifications.show(msg, { type: toastType, q: defender.q, r: defender.r });
  }
}
