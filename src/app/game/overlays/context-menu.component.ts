import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { CameraService } from '../../core/camera/camera.service';
import { GameStateService } from '../../core/state/game-state.service';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { AudioService } from '../../core/audio/audio.service';
import { EventLogService } from '../../core/state/event-log.service';
import { UndoService } from '../../core/state/undo.service';
import { ActionExecutionService } from '../../core/state/action-execution.service';

import { WaypointService } from '../../core/state/waypoint.service';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { HEX_SIZE, hexDistance, hexesInRange, hexKey, hexNeighbors, pixelToHex, toHexCoord } from '../../shared/hex/hex-math';
import { buildBlockedSet, getReachableHexes, getUnitCostOverride } from '../../core/pathfinding/hex-pathfinder';
import { BuildingType, BuildingStats, BUILDING_STATS, ANOMALY_REWARDS, canAfford, costEntries } from '../../models/game-state';
import { StellarObjectType } from '../../models/hex-data';
import { VisionService } from '../../core/vision/vision.service';
import { FormatNamePipe, formatName } from '../../shared/pipes/format-name.pipe';

interface BuildOption {
  type: BuildingType;
  stats: BuildingStats;
  affordable: boolean;
}

interface AttackOption {
  attackerId: string;
  targetId: string;
  label: string;
}

export interface ContextMenuState {
  screenX: number;
  screenY: number;
  hex: HexCoord;
  attackOptions: AttackOption[];
  buildOptions: BuildOption[];
  hexType: StellarObjectType | null;
  canCollect: boolean;
  collectAnomalyId: string | null;
  collectAnomalyName: string | null;
  collectUnitId: string | null;
  canMoveHere: boolean;
  moveHereUnitId: string | null;
  moveHereInRange: boolean;
  canAttackHere: boolean;
  attackHereUnitId: string | null;
  attackHereTargetId: string | null;
  canCancelMove: boolean;
  cancelMoveUnitId: string | null;
  canTrade: boolean;
  tradeHubId: string | null;
  tradeUnitId: string | null;
}

@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe],
  host: {
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @if (state(); as s) {
      @if (s.canCollect || s.canTrade || s.attackOptions.length > 0 || s.canMoveHere || s.canAttackHere || s.canCancelMove || s.buildOptions.length > 0) {
      <div class="dropdown" [style.left.px]="s.screenX" [style.top.px]="s.screenY"
           (pointerenter)="pauseTracking()" (pointerleave)="resumeTracking()">
        @if (s.canCollect) {
          <button class="dropdown-item collect" (pointerdown)="onCollect(); $event.stopPropagation()">Collect {{ s.collectAnomalyName }}</button>
        }
        @if (s.canTrade) {
          <button class="dropdown-item collect" (pointerdown)="onTrade(); $event.stopPropagation()">Trade</button>
        }
        @for (atk of s.attackOptions; track atk.targetId) {
          <button class="dropdown-item attack" (pointerdown)="onAttack(atk); $event.stopPropagation()">Attack {{ atk.label }}</button>
        }
        @if (s.canMoveHere) {
          <button class="dropdown-item move" (pointerdown)="onMoveHere(); $event.stopPropagation()">Move Here</button>
        }
        @if (s.canAttackHere) {
          <button class="dropdown-item attack-here" (pointerdown)="onAttackHere(); $event.stopPropagation()">Attack Here</button>
        }
        @if (s.canCancelMove) {
          <button class="dropdown-item cancel" (pointerdown)="onCancelMove(); $event.stopPropagation()">Cancel Move</button>
        }
        @for (opt of s.buildOptions; track opt.type) {
          <button
            class="dropdown-item build"
            [disabled]="!opt.affordable"
            (pointerdown)="onBuild(opt.type); $event.stopPropagation()"
          >
            <span>Build {{ opt.type | formatName }}</span>
            <span class="cost-row">
              @for (c of costEntries(opt.stats); track c.key) {
                <span class="cost-tag" [class.sufficient]="c.current >= c.value">{{ c.current }}/{{ c.value }} {{ c.key }}</span>
              }
            </span>
          </button>
        }
      </div>
      }
    }
  `,
  styles: `
    .dropdown {
      min-width: 130px;
    }
    .dropdown-item.build {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .cost-tag {
      font-size: 0.65rem;
      color: var(--accent-red);
    }
    .cost-tag.sufficient {
      color: var(--accent-teal);
    }
  `,
})
export class ContextMenuComponent {
  private readonly selection = inject(SelectionService);
  private readonly camera = inject(CameraService);
  private readonly gameState = inject(GameStateService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly audio = inject(AudioService);
  private readonly eventLog = inject(EventLogService);
  private readonly vision = inject(VisionService);
  private readonly undo = inject(UndoService);
  private readonly actionExec = inject(ActionExecutionService);
  private readonly waypointSvc = inject(WaypointService);

  readonly openTrade = output<{ hubId: string; unitId: string }>();
  private readonly _state = signal<ContextMenuState | null>(null);
  readonly state = this._state.asReadonly();

  /** Cached reachable hexes — computed once on open, reused on pointer track. */
  private cachedReachable: Map<string, number> | null = null;
  private cachedSelectedUnitId: string | null = null;
  private lastHexKey: string | null = null;
  private _tracking = false;
  private _paused = false;

  get tracking(): boolean { return this._tracking; }

  open(clientX: number, clientY: number): void {
    this.cacheReachableHexes();
    this._tracking = true;
    this.lastHexKey = null;
    this.updateForPosition(clientX, clientY);
  }

  pauseTracking(): void { this._paused = true; }
  resumeTracking(): void { this._paused = false; }

  /** Update menu options for a new pointer position (called on pointermove). */
  track(clientX: number, clientY: number): void {
    if (!this._tracking || this._paused) return;
    const hex = this.clientToHex(clientX, clientY);
    const hk = hexKey(hex.q, hex.r);
    if (hk === this.lastHexKey) return; // same hex, skip
    this.updateForPosition(clientX, clientY);
  }

  close(): void {
    this._state.set(null);
    this._tracking = false;
    this._paused = false;
    this.cachedReachable = null;
    this.cachedSelectedUnitId = null;
    this.lastHexKey = null;
  }

  private clientToHex(clientX: number, clientY: number): HexCoord {
    const rect = document.querySelector('canvas')?.getBoundingClientRect();
    const canvasX = rect ? (clientX - rect.left) * devicePixelRatio : clientX * devicePixelRatio;
    const canvasY = rect ? (clientY - rect.top) * devicePixelRatio : clientY * devicePixelRatio;
    const { x, y } = this.camera.screenToWorld(canvasX, canvasY);
    return pixelToHex(x, y, HEX_SIZE);
  }

  /** Cache the expensive reachable-hex computation once per open. */
  private cacheReachableHexes(): void {
    const currentPlayer = this.gameState.currentPlayer();
    const selectedUnitId = this.selection.selectedUnit();
    if (!currentPlayer || !selectedUnitId) {
      this.cachedReachable = null;
      this.cachedSelectedUnitId = null;
      return;
    }

    const units = this.gameState.units();
    const selUnit = units.get(selectedUnitId);
    if (!selUnit || selUnit.ownerId !== currentPlayer.id || selUnit.movementPoints <= 0) {
      this.cachedReachable = null;
      this.cachedSelectedUnitId = selectedUnitId;
      return;
    }

    const from: HexCoord = toHexCoord(selUnit.q, selUnit.r);
    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    const blocked = buildBlockedSet(units, this.gameState.buildings(), currentPlayer.id, selectedUnitId);
    const isBlocked = (q: number, r: number) => blocked.has(hexKey(q, r));
    const override = getUnitCostOverride(selUnit.type);
    this.cachedReachable = getReachableHexes(from, selUnit.movementPoints, hexLookup, isBlocked, override);
    this.cachedSelectedUnitId = selectedUnitId;
  }

  private updateForPosition(clientX: number, clientY: number): void {
    const hex = this.clientToHex(clientX, clientY);
    const hexKeyStr = hexKey(hex.q, hex.r);
    this.lastHexKey = hexKeyStr;

    const currentPlayer = this.gameState.currentPlayer();
    if (!currentPlayer) return;

    const units = this.gameState.units();
    const unitIndex = this.gameState.unitsAtHex();
    const buildingIndex = this.gameState.buildingAtHex();
    const selectedUnitId = this.selection.selectedUnit();
    const unitsHere = unitIndex.get(hexKeyStr);

    // --- Attack options (in-range) ---
    const attackOptions: AttackOption[] = [];
    if (selectedUnitId) {
      const attacker = units.get(selectedUnitId);
      if (attacker && attacker.ownerId === currentPlayer.id && !attacker.hasAttacked && attacker.weapon != null) {
        const visHexes = this.vision.visibleHexes();
        if (visHexes.has(hexKeyStr)) {
          const dist = hexDistance(toHexCoord(attacker.q, attacker.r), toHexCoord(hex.q, hex.r));
          if (dist <= attacker.range) {
            const unitsAtTarget = unitIndex.get(hexKeyStr) ?? [];
            for (const enemy of unitsAtTarget) {
              if (enemy.ownerId !== currentPlayer.id) {
                attackOptions.push({ attackerId: selectedUnitId, targetId: enemy.id, label: enemy.name });
              }
            }
            const buildingHere = buildingIndex.get(hexKeyStr);
            if (buildingHere && buildingHere.ownerId !== currentPlayer.id) {
              attackOptions.push({ attackerId: selectedUnitId, targetId: buildingHere.id, label: formatName(buildingHere.type) });
            }
          }
        }
      }
    }

    // --- Build options ---
    let buildOptions: BuildOption[] = [];
    let hexType: StellarObjectType | null = null;
    const hasFriendlyUnit = unitsHere?.some(u => u.ownerId === currentPlayer.id) ?? false;

    if (hasFriendlyUnit) {
      const hasBuilding = buildingIndex.has(hexKeyStr);
      if (!hasBuilding) {
        const hexData = this.chunkManager.getHex(hex.q, hex.r);
        if (hexData) {
          hexType = hexData.object?.type ?? 'empty';
          const resources = currentPlayer.resources;
          const hasScout = unitsHere?.some(u => u.ownerId === currentPlayer.id && u.type === 'scout') ?? false;

          for (const [type, stats] of Object.entries(BUILDING_STATS) as [BuildingType, BuildingStats][]) {
            if (!stats.allowedHexTypes.includes(hexType)) continue;
            if (type === 'starbase' && !hasScout) continue;
            if (type === 'starbase') {
              const nearby = hexesInRange(toHexCoord(hex.q, hex.r), 8);
              const hasPlanet = nearby.some(h => {
                const hd = this.chunkManager.getHex(h.q, h.r);
                return hd?.object?.type === 'planet';
              });
              if (!hasPlanet) continue;
            }
            if (type === 'solar_collector') {
              const hasAdjacentStar = hexNeighbors(hex.q, hex.r).some(n => {
                const hd = this.chunkManager.getHex(n.q, n.r);
                return hd?.object?.type === 'star';
              });
              if (!hasAdjacentStar) continue;
            }
            const affordable = canAfford(resources, stats.cost);
            buildOptions.push({ type, stats, affordable });
          }
        }
      }
    }

    // --- Collect anomaly ---
    let canCollect = false;
    let collectAnomalyId: string | null = null;
    let collectAnomalyName: string | null = null;
    let collectUnitId: string | null = null;

    for (const anomaly of this.gameState.anomalies().values()) {
      if (anomaly.q === hex.q && anomaly.r === hex.r) {
        const scout = unitsHere?.find(u => u.ownerId === currentPlayer.id && u.type === 'scout');
        if (scout) {
          canCollect = true;
          collectAnomalyId = anomaly.id;
          collectAnomalyName = ANOMALY_REWARDS[anomaly.type]?.name ?? anomaly.type;
          collectUnitId = scout.id;
        }
        break;
      }
    }

    // --- Trade Hub ---
    let canTrade = false;
    let tradeHubId: string | null = null;
    let tradeUnitId: string | null = null;
    for (const hub of this.gameState.tradeHubs().values()) {
      if (hub.q === hex.q && hub.r === hex.r) {
        const scout = unitsHere?.find(u => u.ownerId === currentPlayer.id && u.type === 'scout');
        if (scout) {
          const tradedKey = `${currentPlayer.id}:${hub.id}`;
          if (!this.gameState.tradedThisTurn().has(tradedKey)) {
            canTrade = true;
            tradeHubId = hub.id;
            tradeUnitId = scout.id;
          }
        }
        break;
      }
    }

    // --- Move Here / Attack Here / Cancel Move (uses cached reachable) ---
    let canMoveHere = false;
    let moveHereUnitId: string | null = null;
    let moveHereInRange = false;
    let canAttackHere = false;
    let attackHereUnitId: string | null = null;
    let attackHereTargetId: string | null = null;
    let canCancelMove = false;
    let cancelMoveUnitId: string | null = null;

    if (selectedUnitId) {
      const selUnit = units.get(selectedUnitId);
      if (selUnit && selUnit.ownerId === currentPlayer.id) {
        const isSameHex = selUnit.q === hex.q && selUnit.r === hex.r;

        const wp = this.waypointSvc.getWaypoint(selectedUnitId);
        if (wp) {
          canCancelMove = true;
          cancelMoveUnitId = selectedUnitId;
        }

        const isWaypointTarget = wp && wp.target.q === hex.q && wp.target.r === hex.r;

        if (!isSameHex && !isWaypointTarget) {
          const inRange = this.cachedReachable?.has(hexKeyStr) ?? false;

          const enemyAtTarget = unitIndex.get(hexKeyStr)?.find(u => u.ownerId !== currentPlayer.id);
          const enemyBuildingAtTarget = !enemyAtTarget ? buildingIndex.get(hexKeyStr) : null;
          const attackTarget = enemyAtTarget ?? (enemyBuildingAtTarget && enemyBuildingAtTarget.ownerId !== currentPlayer.id ? enemyBuildingAtTarget : null);

          if (attackTarget && selUnit.weapon != null && attackOptions.length === 0) {
            canAttackHere = true;
            attackHereUnitId = selectedUnitId;
            attackHereTargetId = attackTarget.id;
          } else if (!attackTarget) {
            canMoveHere = true;
            moveHereUnitId = selectedUnitId;
            moveHereInRange = inRange;
          }
        }
      }
    }

    this._state.set({
      screenX: clientX,
      screenY: clientY,
      hex,
      attackOptions,
      buildOptions,
      hexType,
      canCollect,
      collectAnomalyId,
      collectAnomalyName,
      collectUnitId,
      canMoveHere,
      moveHereUnitId,
      moveHereInRange,
      canAttackHere,
      attackHereUnitId,
      attackHereTargetId,
      canCancelMove,
      cancelMoveUnitId,
      canTrade,
      tradeHubId,
      tradeUnitId,
    });
  }

  onAttack(atk: AttackOption): void {
    this.audio.playClick();
    this.close();
    this.actionExec.executeAttack(atk.attackerId, atk.targetId);
  }

  onCollect(): void {
    this.audio.playClick();
    const s = this._state();
    if (!s || !s.collectAnomalyId || !s.collectUnitId) return;
    this.close();

    const anomaly = this.gameState.anomalies().get(s.collectAnomalyId);
    if (!anomaly) return;

    const info = ANOMALY_REWARDS[anomaly.type];
    this.undo.dispatch({ type: 'COLLECT_ANOMALY', anomalyId: s.collectAnomalyId, unitId: s.collectUnitId });

    const turn = this.gameState.turn();
    const rewardParts: string[] = [];
    if (info.reward.energy) rewardParts.push(`${info.reward.energy} energy`);
    if (info.reward.minerals) rewardParts.push(`${info.reward.minerals} minerals`);
    if (info.reward.alloys) rewardParts.push(`${info.reward.alloys} alloys`);
    if (info.reward.credits) rewardParts.push(`${info.reward.credits} credits`);
    const rewardStr = rewardParts.join(', ');

    this.eventLog.push({ turn, message: `Collected ${info.name}: +${rewardStr}`, q: anomaly.q, r: anomaly.r });
  }

  onMoveHere(): void {
    this.audio.playClick();
    const s = this._state();
    if (!s || !s.moveHereUnitId) return;
    this.close();

    if (s.moveHereInRange) {
      this.actionExec.executeMove(s.moveHereUnitId, s.hex);
    } else {
      this.waypointSvc.setWaypoint(s.moveHereUnitId, s.hex);
      this.waypointSvc.executeWaypoint(s.moveHereUnitId).then(() => {
        this.selection.selectUnit(s.moveHereUnitId!);
      });
    }
  }

  onAttackHere(): void {
    this.audio.playClick();
    const s = this._state();
    if (!s || !s.attackHereUnitId || !s.attackHereTargetId) return;
    this.close();

    this.waypointSvc.setWaypoint(s.attackHereUnitId, s.hex, s.attackHereTargetId);
    this.waypointSvc.executeWaypoint(s.attackHereUnitId).then(() => {
      const unit = this.gameState.units().get(s.attackHereUnitId!);
      if (unit) {
        this.selection.selectUnit(s.attackHereUnitId!);
      } else {
        this.selection.deselectAll();
      }
    });
  }

  onCancelMove(): void {
    this.audio.playClick();
    const s = this._state();
    if (!s || !s.cancelMoveUnitId) return;
    this.close();
    this.waypointSvc.clearWaypoint(s.cancelMoveUnitId);
  }

  costEntries(stats: BuildingStats) {
    return costEntries(stats.cost, this.gameState.currentPlayer()?.resources);
  }

  onTrade(): void {
    this.audio.playClick();
    const s = this._state();
    if (!s || !s.tradeHubId || !s.tradeUnitId) return;
    this.close();
    this.openTrade.emit({ hubId: s.tradeHubId, unitId: s.tradeUnitId });
  }

  onBuild(buildingType: BuildingType): void {
    this.audio.playClick();
    const s = this._state();
    if (!s || !s.hexType) return;
    this.close();

    const player = this.gameState.currentPlayer();
    if (!player) return;

    const adjacentHexTypes = hexNeighbors(s.hex.q, s.hex.r).map(n => {
      const hd = this.chunkManager.getHex(n.q, n.r);
      return hd?.object?.type ?? 'empty';
    });
    const nearbyHasPlanet = hexesInRange(toHexCoord(s.hex.q, s.hex.r), 8).some(h => {
      const hd = this.chunkManager.getHex(h.q, h.r);
      return hd?.object?.type === 'planet';
    });
    this.undo.dispatch({ type: 'BUILD', playerId: player.id, buildingType, hex: s.hex, hexType: s.hexType, adjacentHexTypes, nearbyHasPlanet });
    const turn = this.gameState.turn();
    this.eventLog.push({ turn, message: `Built ${formatName(buildingType)} at (${s.hex.q}, ${s.hex.r})`, q: s.hex.q, r: s.hex.r });
  }

}
