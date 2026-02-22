import { inject, Injectable, signal } from '@angular/core';
import { GameStateService } from '../state/game-state.service';
import { ChunkManagerService } from '../chunks/chunk-manager.service';
import { AnimationService } from '../../game/renderer/animation.service';
import { EventLogService } from '../state/event-log.service';
import { ANOMALY_REWARDS, BuildingData, BUILDING_STATS, PlayerState, UnitData, UNIT_UPKEEP, TECH_TREE } from '../../models/game-state';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance } from '../../shared/hex/hex-math';
import { findPartialPath, getUnitCostOverride, pathCost } from '../pathfinding/hex-pathfinder';
import { attackWithResult } from '../state/game-reducer';
import { scoreExplore, scoreAttack, scoreBuild, scoreProduction, scoreResearch } from './ai-scoring';

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
    // Skip if game is over or player is eliminated
    const state = this.gameState.getState();
    if (state.gameOver) return;
    const player = state.players.find(p => p.id === playerId);
    if (!player || player.eliminated) return;

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

      // Build unit lists by iterating once instead of spread+filter
      const myUnits: UnitData[] = [];
      const visibleEnemies: UnitData[] = [];
      for (const u of state.units.values()) {
        if (u.ownerId === playerId) {
          if (u.movementPoints >= 0 && !processedUnits.has(u.id)) {
            myUnits.push(u);
          }
        } else if (player.exploredHexes.has(`${u.q},${u.r}`)) {
          visibleEnemies.push(u);
        }
      }

      // Gather visible enemy buildings
      const visibleEnemyBuildings: BuildingData[] = [];
      for (const b of state.buildings.values()) {
        if (b.ownerId !== playerId && player.exploredHexes.has(`${b.q},${b.r}`)) {
          visibleEnemyBuildings.push(b);
        }
      }

      if (myUnits.length === 0) break;

      // Sort: combat units first, then scouts, then others
      myUnits.sort((a, b) => {
        const priority = (u: UnitData) => {
          if (u.weapon != null && u.type !== 'scout') return 0;
          if (u.type === 'scout') return 1;
          return 2;
        };
        return priority(a) - priority(b);
      });

      const unit = myUnits[0];
      let acted = false;

      // Try attack
      if (unit.weapon != null && unit.movementPoints >= 0) {
        const attackResult = scoreAttack(unit, visibleEnemies, state.seed + state.turn, visibleEnemyBuildings);
        if (attackResult) {
          const target = state.units.get(attackResult.targetId);
          const targetBuilding = !target ? state.buildings.get(attackResult.targetId) : null;
          if (target || targetBuilding) {
            const { combat } = attackWithResult(state, unit.id, attackResult.targetId);
            if (combat) {
              await this.animation.animateCombat(unit.id, attackResult.targetId);
              this.gameState.dispatch({ type: 'ATTACK', attackerId: unit.id, targetId: attackResult.targetId });

              const targetName = target ? target.type : (targetBuilding!.type.replace(/_/g, ' '));
              const targetCoord = target ?? targetBuilding!;
              const turn = this.gameState.getState().turn;
              const msg = `[AI] ${unit.type} attacked ${targetName}: dealt ${combat.defenderDamage} dmg, took ${combat.attackerDamage} dmg`
                + (combat.defenderDestroyed ? ` — ${targetName} destroyed!` : '')
                + (combat.attackerDestroyed ? ` — ${unit.type} destroyed!` : '');
              this.eventLog.push({ turn, message: msg, q: targetCoord.q, r: targetCoord.r });

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
          const freshPlayer = freshState.players.find(p => p.id === playerId);
          const moveTarget = freshPlayer ? this.findMoveTarget(freshUnit, freshPlayer, freshState, hexLookup) : null;
          if (moveTarget) {
            const from: HexCoord = { q: freshUnit.q, r: freshUnit.r, s: -freshUnit.q - freshUnit.r };
            const blockedHexes = new Set<string>();
            const targetKey = `${moveTarget.q},${moveTarget.r}`;
            for (const u of freshState.units.values()) {
              if (u.id !== freshUnit.id) blockedHexes.add(`${u.q},${u.r}`);
            }
            // Exclude the move target so pathfinding can route toward enemy units
            blockedHexes.delete(targetKey);
            const isBlocked = (q: number, r: number) => blockedHexes.has(`${q},${r}`);

            const override = getUnitCostOverride(freshUnit.type);
            const path = findPartialPath(from, moveTarget, freshUnit.movementPoints, hexLookup, isBlocked, override);

            // Don't move onto an occupied hex — trim if path ends on another unit
            if (path && path.length > 1) {
              const last = path[path.length - 1];
              const occupied = freshState.units.has(targetKey) && last.q === moveTarget.q && last.r === moveTarget.r;
              if (occupied) path.pop();
            }

            if (path && path.length > 1) {
              const cost = pathCost(path, hexLookup, override);
              await this.animation.animateUnitMovement(freshUnit.id, path);
              this.gameState.dispatch({ type: 'MOVE_UNIT', unitId: freshUnit.id, path, cost });

              // After moving, try to collect anomaly at destination
              this.tryCollectAnomaly(freshUnit.id, playerId);

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
      const netEnergy = this.computeNetEnergyIncome(prodPlayer, prodState);
      const prodResult = scoreProduction(prodPlayer, prodState.buildings, prodState.units, enemyNearby, netEnergy);
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

    // Try research
    const resState = this.gameState.getState();
    const resPlayer = resState.players.find(p => p.id === playerId);
    if (resPlayer) {
      const resEnemyNearby = this.hasEnemyNearby(playerId, resState);
      const resResult = scoreResearch(resPlayer, resState.buildings, resEnemyNearby);
      if (resResult) {
        this.gameState.dispatch({
          type: 'QUEUE_RESEARCH',
          buildingId: resResult.buildingId,
          techId: resResult.techId,
        });

        const turn = this.gameState.getState().turn;
        const techName = TECH_TREE[resResult.techId]?.name ?? resResult.techId;
        this.eventLog.push({
          turn,
          message: `[AI] Began researching ${techName}`,
        });
      }
    }

    // End turn
    this.gameState.dispatchEndTurn(hexLookup);
  }

  private findMoveTarget(
    unit: UnitData,
    player: PlayerState,
    state: import('../../models/game-state').GameState,
    hexLookup: (q: number, r: number) => import('../../models/hex-data').HexData | null,
  ): HexCoord | null {
    // For combat units: move toward nearest visible enemy
    if (unit.weapon != null && unit.type !== 'scout') {
      let nearestEnemy: UnitData | null = null;
      let nearestDist = Infinity;
      const unitCoord: HexCoord = { q: unit.q, r: unit.r, s: -unit.q - unit.r };

      for (const u of state.units.values()) {
        if (u.ownerId === player.id) continue;
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

    // For scouts: prefer moving toward visible anomalies
    if (unit.type === 'scout') {
      const anomalyTarget = this.findNearestAnomaly(unit, state);
      if (anomalyTarget) return anomalyTarget;
    }

    // Explore
    const exploreResult = scoreExplore(unit, player.exploredHexes, hexLookup);
    return exploreResult?.target ?? null;
  }

  private findNearestAnomaly(
    unit: UnitData,
    state: import('../../models/game-state').GameState,
  ): HexCoord | null {
    const unitCoord: HexCoord = { q: unit.q, r: unit.r, s: -unit.q - unit.r };
    let nearest: HexCoord | null = null;
    let nearestDist = Infinity;

    for (const anomaly of state.anomalies.values()) {
      const coord: HexCoord = { q: anomaly.q, r: anomaly.r, s: -anomaly.q - anomaly.r };
      const dist = hexDistance(unitCoord, coord);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = coord;
      }
    }

    return nearest;
  }

  private tryCollectAnomaly(unitId: string, playerId: string): void {
    const state = this.gameState.getState();
    const unit = state.units.get(unitId);
    if (!unit || unit.type !== 'scout') return;

    for (const anomaly of state.anomalies.values()) {
      if (anomaly.q === unit.q && anomaly.r === unit.r) {
        const info = ANOMALY_REWARDS[anomaly.type];
        this.gameState.dispatch({ type: 'COLLECT_ANOMALY', anomalyId: anomaly.id, unitId });
        const turn = state.turn;
        this.eventLog.push({ turn, message: `[AI] Scout collected ${info?.name ?? anomaly.type}`, q: anomaly.q, r: anomaly.r });
        break;
      }
    }
  }

  private computeNetEnergyIncome(player: PlayerState, state: import('../../models/game-state').GameState): number {
    let income = 0;
    for (const b of state.buildings.values()) {
      if (b.ownerId !== player.id) continue;
      const stats = BUILDING_STATS[b.type];
      if (stats?.yield.energy) income += stats.yield.energy;
    }
    let upkeep = 0;
    for (const u of state.units.values()) {
      if (u.ownerId !== player.id) continue;
      const cost = UNIT_UPKEEP[u.type];
      if (cost?.energy) upkeep += cost.energy;
    }
    return income - upkeep;
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
