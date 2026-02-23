import { inject, Injectable } from '@angular/core';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexKey, toHexCoord } from '../../shared/hex/hex-math';
import { formatName } from '../../shared/pipes/format-name.pipe';
import { attackWithResult } from './game-reducer';
import { GameStateService } from './game-state.service';
import { UndoService } from './undo.service';
import { EventLogService } from './event-log.service';
import { SelectionService } from '../selection/selection.service';
import { ChunkManagerService } from '../chunks/chunk-manager.service';
import { AnimationService } from '../../game/renderer/animation.service';
import { buildBlockedSet, findPath, getUnitCostOverride, pathCost } from '../pathfinding/hex-pathfinder';

@Injectable({ providedIn: 'root' })
export class ActionExecutionService {
  private readonly gameState = inject(GameStateService);
  private readonly undo = inject(UndoService);
  private readonly eventLog = inject(EventLogService);
  private readonly selection = inject(SelectionService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly animation = inject(AnimationService);

  /**
   * Execute an attack: animate, dispatch, log, and update selection.
   * Returns the combat result or null if the attack was invalid.
   */
  async executeAttack(attackerId: string, targetId: string): Promise<{ attackerDestroyed: boolean } | null> {
    const state = this.gameState.getState();
    const { combat } = attackWithResult(state, attackerId, targetId);
    if (!combat) return null;

    const attacker = state.units.get(attackerId)!;
    const defender = state.units.get(targetId);
    const targetBuilding = !defender ? state.buildings.get(targetId) : null;
    const targetName = defender ? defender.type : (targetBuilding ? formatName(targetBuilding.type) : 'unknown');
    const targetCoord = defender ?? targetBuilding!;

    await this.animation.animateCombat(attackerId, targetId);
    this.undo.dispatch({ type: 'ATTACK', attackerId, targetId });

    const turn = this.gameState.turn();
    const msg = `${attacker.type} attacked ${targetName}: dealt ${combat.defenderDamage} dmg, took ${combat.attackerDamage} dmg`
      + (combat.defenderDestroyed ? ` — ${targetName} destroyed!` : '')
      + (combat.attackerDestroyed ? ` — ${attacker.type} destroyed!` : '');
    this.eventLog.push({ turn, message: msg, q: targetCoord.q, r: targetCoord.r });

    if (!combat.attackerDestroyed) {
      this.selection.selectUnit(attackerId);
    } else {
      this.selection.deselectAll();
    }

    return { attackerDestroyed: combat.attackerDestroyed };
  }

  /**
   * Execute a unit move: build blocked set, find path, animate, dispatch, and re-select.
   * Returns true if the move was executed, false if no valid path was found.
   */
  async executeMove(unitId: string, target: HexCoord): Promise<boolean> {
    const unit = this.gameState.units().get(unitId);
    if (!unit) return false;

    const from = toHexCoord(unit.q, unit.r);
    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    const playerId = this.gameState.currentPlayer()?.id ?? '';
    const blocked = buildBlockedSet(this.gameState.units(), this.gameState.buildings(), playerId, unitId);
    const isBlocked = (q: number, r: number) => blocked.has(hexKey(q, r));
    const override = getUnitCostOverride(unit.type);
    const path = findPath(from, target, unit.movementPoints, hexLookup, isBlocked, override);
    if (!path || path.length <= 1) return false;

    const cost = pathCost(path, hexLookup, override);
    await this.animation.animateUnitMovement(unitId, path);
    this.undo.dispatch({ type: 'MOVE_UNIT', unitId, path, cost });
    this.selection.selectUnit(unitId);
    return true;
  }
}
