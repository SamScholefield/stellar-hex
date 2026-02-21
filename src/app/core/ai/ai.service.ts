import { inject, Injectable, signal } from '@angular/core';
import { GameStateService } from '../state/game-state.service';
import { ChunkManagerService } from '../chunks/chunk-manager.service';
import { AnimationService } from '../../game/renderer/animation.service';
import { EventLogService } from '../state/event-log.service';
import { UnitData } from '../../models/game-state';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance } from '../../shared/hex/hex-math';
import { findPath, getUnitCostOverride, pathCost } from '../pathfinding/hex-pathfinder';
import { attackWithResult } from '../state/game-reducer';
import { scoreExplore, scoreAttack, scoreBuild, scoreProduction } from './ai-scoring';

const ACTION_DELAY = 300;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class AIService {
  private readonly gameState = inject(GameStateService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly animation = inject(AnimationService);
  private readonly eventLog = inject(EventLogService);

  private readonly _executing = signal(false);
  readonly executing = this._executing.asReadonly();

  async executeTurn(playerId: string): Promise<void> {
    this._executing.set(true);
    try {
      const minWait = delay(1000);
      await this.executeActions(playerId);
      await minWait;
    } finally {
      this._executing.set(false);
    }
  }

  private async executeActions(playerId: string): Promise<void> {
    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);

    // Process units — combat units first, then scouts, then others
    const processedUnits = new Set<string>();
    const maxIterations = 20; // safety limit
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      const state = this.gameState.getState();
      const player = state.players.find(p => p.id === playerId);
      if (!player) break;

      // Get units that still have movement points
      const myUnits = [...state.units.values()]
        .filter(u => u.ownerId === playerId && u.movementPoints > 0 && !processedUnits.has(u.id));

      if (myUnits.length === 0) break;

      // Sort: combat units first, then scouts, then others
      myUnits.sort((a, b) => {
        const priority = (u: UnitData) => {
          if (u.attack > 0 && u.type !== 'scout') return 0;
          if (u.type === 'scout') return 1;
          return 2;
        };
        return priority(a) - priority(b);
      });

      const unit = myUnits[0];
      let acted = false;

      // Try attack
      if (unit.attack > 0 && unit.movementPoints > 0) {
        const enemies = [...state.units.values()].filter(u =>
          u.ownerId !== playerId && player.exploredHexes.has(`${u.q},${u.r}`)
        );
        const attackResult = scoreAttack(unit, enemies, state.seed + state.turn);
        if (attackResult) {
          const target = state.units.get(attackResult.targetId);
          if (target) {
            const { combat } = attackWithResult(state, unit.id, attackResult.targetId);
            if (combat) {
              await this.animation.animateCombat(unit.id, attackResult.targetId);
              this.gameState.dispatch({ type: 'ATTACK', attackerId: unit.id, targetId: attackResult.targetId });

              const turn = this.gameState.getState().turn;
              const msg = `[AI] ${unit.type} attacked ${target.type}: dealt ${combat.defenderDamage} dmg, took ${combat.attackerDamage} dmg`
                + (combat.defenderDestroyed ? ` — ${target.type} destroyed!` : '')
                + (combat.attackerDestroyed ? ` — ${unit.type} destroyed!` : '');
              this.eventLog.push({ turn, message: msg, q: target.q, r: target.r });

              await delay(ACTION_DELAY);
              acted = true;
            }
          }
        }
      }

      // Try move (if didn't attack or still has MP)
      if (!acted) {
        const freshState = this.gameState.getState();
        const freshUnit = freshState.units.get(unit.id);
        if (freshUnit && freshUnit.movementPoints > 0) {
          const moveTarget = this.findMoveTarget(freshUnit, playerId, freshState, hexLookup);
          if (moveTarget) {
            const from: HexCoord = { q: freshUnit.q, r: freshUnit.r, s: -freshUnit.q - freshUnit.r };
            const blockedHexes = new Set<string>();
            for (const u of freshState.units.values()) {
              if (u.id !== freshUnit.id) blockedHexes.add(`${u.q},${u.r}`);
            }
            const isBlocked = (q: number, r: number) => blockedHexes.has(`${q},${r}`);

            const override = getUnitCostOverride(freshUnit.type);
            const path = findPath(from, moveTarget, freshUnit.movementPoints, hexLookup, isBlocked, override);
            if (path && path.length > 1) {
              const cost = pathCost(path, hexLookup, override);
              await this.animation.animateUnitMovement(freshUnit.id, path);
              this.gameState.dispatch({ type: 'MOVE_UNIT', unitId: freshUnit.id, path, cost });
              await delay(ACTION_DELAY);
              acted = true;
            }
          }
        }
      }

      if (!acted) {
        processedUnits.add(unit.id);
      }
    }

    // Try building
    const buildState = this.gameState.getState();
    const buildPlayer = buildState.players.find(p => p.id === playerId);
    if (buildPlayer) {
      const buildResult = scoreBuild(buildPlayer, buildState.buildings, buildState.units, hexLookup);
      if (buildResult) {
        this.gameState.dispatch({
          type: 'BUILD',
          playerId,
          buildingType: buildResult.buildingType,
          hex: buildResult.hex,
          hexType: buildResult.hexType,
        });

        const turn = this.gameState.getState().turn;
        this.eventLog.push({
          turn,
          message: `[AI] Built ${buildResult.buildingType.replace(/_/g, ' ')}`,
          q: buildResult.hex.q,
          r: buildResult.hex.r,
        });
        await delay(ACTION_DELAY);
      }
    }

    // Try production
    const prodState = this.gameState.getState();
    const prodPlayer = prodState.players.find(p => p.id === playerId);
    if (prodPlayer) {
      const enemyNearby = this.hasEnemyNearby(playerId, prodState);
      const prodResult = scoreProduction(prodPlayer, prodState.buildings, prodState.units, enemyNearby);
      if (prodResult) {
        this.gameState.dispatch({
          type: 'PRODUCE_UNIT',
          buildingId: prodResult.buildingId,
          unitType: prodResult.unitType,
        });

        const turn = this.gameState.getState().turn;
        this.eventLog.push({
          turn,
          message: `[AI] Queued ${prodResult.unitType.replace(/_/g, ' ')} production`,
        });
      }
    }

    // End turn
    this.gameState.dispatchEndTurn(hexLookup);
  }

  private findMoveTarget(
    unit: UnitData,
    playerId: string,
    state: import('../../models/game-state').GameState,
    hexLookup: (q: number, r: number) => import('../../models/hex-data').HexData | null,
  ): HexCoord | null {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return null;

    // For combat units: move toward nearest visible enemy
    if (unit.attack > 0 && unit.type !== 'scout') {
      let nearestEnemy: UnitData | null = null;
      let nearestDist = Infinity;
      const unitCoord: HexCoord = { q: unit.q, r: unit.r, s: -unit.q - unit.r };

      for (const u of state.units.values()) {
        if (u.ownerId === playerId) continue;
        if (!player.exploredHexes.has(`${u.q},${u.r}`)) continue;
        const enemyCoord: HexCoord = { q: u.q, r: u.r, s: -u.q - u.r };
        const dist = hexDistance(unitCoord, enemyCoord);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestEnemy = u;
        }
      }

      if (nearestEnemy) {
        return { q: nearestEnemy.q, r: nearestEnemy.r, s: -nearestEnemy.q - nearestEnemy.r };
      }
    }

    // For scouts and units with no enemy target: explore
    const exploreResult = scoreExplore(unit, player.exploredHexes, hexLookup);
    return exploreResult?.target ?? null;
  }

  private hasEnemyNearby(playerId: string, state: import('../../models/game-state').GameState): boolean {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return false;

    for (const u of state.units.values()) {
      if (u.ownerId === playerId) continue;
      if (player.exploredHexes.has(`${u.q},${u.r}`)) return true;
    }
    return false;
  }
}
