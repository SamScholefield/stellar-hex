import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { CameraService } from '../../core/camera/camera.service';
import { GameStateService } from '../../core/state/game-state.service';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { AudioService } from '../../core/audio/audio.service';
import { EventLogService } from '../../core/state/event-log.service';
import { AnimationService } from '../renderer/animation.service';
import { UndoService } from '../../core/state/undo.service';

import { WaypointService } from '../../core/state/waypoint.service';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance, pixelToHex } from '../../shared/hex/hex-math';
import { attackWithResult } from '../../core/state/game-reducer';
import { getReachableHexes, getUnitCostOverride } from '../../core/pathfinding/hex-pathfinder';
import { BuildingType, BuildingStats, BUILDING_STATS, ANOMALY_REWARDS } from '../../models/game-state';
import { StellarObjectType } from '../../models/hex-data';
import { VisionService } from '../../core/vision/vision.service';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';

const HEX_SIZE = 30;

interface BuildOption {
  type: BuildingType;
  stats: BuildingStats;
  affordable: boolean;
}

export interface ContextMenuState {
  screenX: number;
  screenY: number;
  hex: HexCoord;
  canAttack: boolean;
  attackerId: string | null;
  targetId: string | null;
  buildOptions: BuildOption[];
  hexType: StellarObjectType | null;
  canCollect: boolean;
  collectAnomalyId: string | null;
  collectAnomalyName: string | null;
  collectUnitId: string | null;
  canMoveHere: boolean;
  moveHereUnitId: string | null;
  canAttackHere: boolean;
  attackHereUnitId: string | null;
  attackHereTargetId: string | null;
}

@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe],
  host: {
    '(document:click)': 'close()',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @if (state(); as s) {
      <div class="menu" [style.left.px]="s.screenX" [style.top.px]="s.screenY">
        @if (s.canCollect) {
          <button class="item collect" (click)="onCollect()">Collect {{ s.collectAnomalyName }}</button>
        }
        @if (s.canAttack) {
          <button class="item attack" (click)="onAttack()">Attack</button>
        }
        @if (s.canMoveHere) {
          <button class="item move" (click)="onMoveHere()">Move Here</button>
        }
        @if (s.canAttackHere) {
          <button class="item attack-here" (click)="onAttackHere()">Attack Here</button>
        }
        @for (opt of s.buildOptions; track opt.type) {
          <button
            class="item build"
            [disabled]="!opt.affordable"
            (click)="onBuild(opt.type)"
          >Build {{ opt.type | formatName }}</button>
        }
        <button class="item" (click)="onInspect()">Inspect</button>
      </div>
    }
  `,
  styles: `
    .menu {
      position: fixed;
      z-index: 100;
      background: var(--panel-bg-solid);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius-sm);
      padding: 0.25rem 0;
      min-width: 130px;
      pointer-events: auto;
    }
    .item {
      display: block;
      width: 100%;
      padding: 0.4rem 0.75rem;
      font-size: 0.85rem;
      color: var(--text-primary);
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
    }
    .item:hover:not(:disabled) {
      background: var(--hover-bg);
    }
    .item:disabled {
      color: var(--text-dim);
      cursor: not-allowed;
    }
    .item.attack {
      color: var(--accent-red);
    }
    .item.build {
      color: var(--accent-teal);
    }
    .item.collect {
      color: var(--accent-amber);
    }
    .item.move {
      color: var(--accent-blue);
    }
    .item.attack-here {
      color: var(--accent-red);
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
  private readonly animation = inject(AnimationService);
  private readonly vision = inject(VisionService);
  private readonly undo = inject(UndoService);


  private readonly waypointSvc = inject(WaypointService);

  private readonly _state = signal<ContextMenuState | null>(null);
  readonly state = this._state.asReadonly();

  open(clientX: number, clientY: number): void {
    const rect = document.querySelector('canvas')?.getBoundingClientRect();
    const canvasX = rect ? (clientX - rect.left) * devicePixelRatio : clientX * devicePixelRatio;
    const canvasY = rect ? (clientY - rect.top) * devicePixelRatio : clientY * devicePixelRatio;
    const { x, y } = this.camera.screenToWorld(canvasX, canvasY);
    const hex = pixelToHex(x, y, HEX_SIZE);

    const currentPlayer = this.gameState.currentPlayer();
    if (!currentPlayer) return;

    const units = this.gameState.units();
    const unitIndex = this.gameState.unitsAtHex();
    const buildingIndex = this.gameState.buildingAtHex();
    const selectedUnitId = this.selection.selectedUnit();
    const hexKeyStr = `${hex.q},${hex.r}`;

    // Check for enemy unit at hex + friendly unit selected with range/MP → canAttack
    let canAttack = false;
    let attackerId: string | null = null;
    let targetId: string | null = null;

    if (selectedUnitId) {
      const attacker = units.get(selectedUnitId);
      if (attacker && attacker.ownerId === currentPlayer.id && attacker.movementPoints > 0 && attacker.attack > 0) {
        const unitAtTarget = unitIndex.get(hexKeyStr)?.find(u => u.ownerId !== currentPlayer.id);
        if (unitAtTarget) {
          const dist = hexDistance(
            { q: attacker.q, r: attacker.r, s: -attacker.q - attacker.r },
            { q: unitAtTarget.q, r: unitAtTarget.r, s: -unitAtTarget.q - unitAtTarget.r },
          );
          if (dist <= attacker.range) {
            const visHexes = this.vision.visibleHexes();
            if (visHexes.has(hexKeyStr)) {
              canAttack = true;
              attackerId = selectedUnitId;
              targetId = unitAtTarget.id;
            }
          }
        }
      }
    }

    // Check for friendly unit at hex → build options
    let buildOptions: BuildOption[] = [];
    let hexType: StellarObjectType | null = null;

    const unitsHere = unitIndex.get(hexKeyStr);
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
            const affordable = resources.energy >= (stats.cost.energy ?? 0)
              && resources.minerals >= (stats.cost.minerals ?? 0)
              && resources.alloys >= (stats.cost.alloys ?? 0)
              && resources.credits >= (stats.cost.credits ?? 0);
            buildOptions.push({ type, stats, affordable });
          }
        }
      }
    }

    // Check for collectable anomaly at hex — requires friendly scout with MP
    let canCollect = false;
    let collectAnomalyId: string | null = null;
    let collectAnomalyName: string | null = null;
    let collectUnitId: string | null = null;

    const anomalies = this.gameState.anomalies();
    for (const anomaly of anomalies.values()) {
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

    // Move Here — show when unit selected, has MP, hex is outside reachable range
    let canMoveHere = false;
    let moveHereUnitId: string | null = null;

    // Attack Here — show when enemy at hex, outside attack range
    let canAttackHere = false;
    let attackHereUnitId: string | null = null;
    let attackHereTargetId: string | null = null;

    if (selectedUnitId && !canAttack) {
      const attacker = units.get(selectedUnitId);
      if (attacker && attacker.ownerId === currentPlayer.id) {
        const from: HexCoord = { q: attacker.q, r: attacker.r, s: -attacker.q - attacker.r };
        const isSameHex = attacker.q === hex.q && attacker.r === hex.r;

        if (!isSameHex) {
          // Check if hex is within reachable range via normal pathfinding
          const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
          const blocked = new Set<string>();
          for (const u of units.values()) {
            if (u.id !== selectedUnitId && u.ownerId !== currentPlayer.id) {
              blocked.add(`${u.q},${u.r}`);
            }
          }
          const isBlocked = (q: number, r: number) => blocked.has(`${q},${r}`);
          const override = getUnitCostOverride(attacker.type);
          const reachable = attacker.movementPoints > 0
            ? getReachableHexes(from, attacker.movementPoints, hexLookup, isBlocked, override)
            : new Map<string, number>();
          const hexKeyTarget = `${hex.q},${hex.r}`;

          if (!reachable.has(hexKeyTarget)) {
            // Hex is outside reachable range — show Move Here
            canMoveHere = true;
            moveHereUnitId = selectedUnitId;

            // Also check for Attack Here: enemy at hex, outside attack range
            if (attacker.attack > 0) {
              const visHexes = this.vision.visibleHexes();
              if (visHexes.has(hexKeyTarget)) {
                const enemyAtTarget = unitIndex.get(hexKeyTarget)?.find(u => u.ownerId !== currentPlayer.id);
                if (enemyAtTarget) {
                  canAttackHere = true;
                  attackHereUnitId = selectedUnitId;
                  attackHereTargetId = enemyAtTarget.id;
                  // Don't show Move Here when Attack Here is available
                  canMoveHere = false;
                  moveHereUnitId = null;
                }
              }
            }
          }
        }
      }
    }

    this._state.set({
      screenX: clientX,
      screenY: clientY,
      hex,
      canAttack,
      attackerId,
      targetId,
      buildOptions,
      hexType,
      canCollect,
      collectAnomalyId,
      collectAnomalyName,
      collectUnitId,
      canMoveHere,
      moveHereUnitId,
      canAttackHere,
      attackHereUnitId,
      attackHereTargetId,
    });
  }

  close(): void {
    this._state.set(null);
  }

  onInspect(): void {
    this.audio.playClick();
    const s = this._state();
    if (s) {
      this.selection.selectHex(s.hex);
    }
    this.close();
  }

  onAttack(): void {
    this.audio.playClick();
    const s = this._state();
    if (!s || !s.attackerId || !s.targetId) return;
    this.close();

    const { attackerId, targetId } = s;
    const state = this.gameState.getState();
    const { combat } = attackWithResult(state, attackerId, targetId);
    if (!combat) return;

    const attacker = state.units.get(attackerId)!;
    const defender = state.units.get(targetId)!;

    this.animation.animateCombat(attackerId, targetId).then(() => {
      this.undo.dispatch({ type: 'ATTACK', attackerId, targetId });

      const turn = this.gameState.turn();
      const msg = `${attacker.type} attacked ${defender.type}: dealt ${combat.defenderDamage} dmg, took ${combat.attackerDamage} dmg`
        + (combat.defenderDestroyed ? ` — ${defender.type} destroyed!` : '')
        + (combat.attackerDestroyed ? ` — ${attacker.type} destroyed!` : '');
      this.eventLog.push({ turn, message: msg, q: defender.q, r: defender.r });

      if (!combat.attackerDestroyed) {
        this.selection.selectUnit(attackerId);
      } else {
        this.selection.deselectAll();
      }
    });
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

    this.waypointSvc.setWaypoint(s.moveHereUnitId, s.hex);
    this.waypointSvc.executeWaypoint(s.moveHereUnitId).then(() => {
      this.selection.selectUnit(s.moveHereUnitId!);
    });
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

  onBuild(buildingType: BuildingType): void {
    this.audio.playClick();
    const s = this._state();
    if (!s || !s.hexType) return;
    this.close();

    const player = this.gameState.currentPlayer();
    if (!player) return;

    this.undo.dispatch({ type: 'BUILD', playerId: player.id, buildingType, hex: s.hex, hexType: s.hexType });
    const turn = this.gameState.turn();
    this.eventLog.push({ turn, message: `Built ${buildingType.replace(/_/g, ' ')} at (${s.hex.q}, ${s.hex.r})`, q: s.hex.q, r: s.hex.r });
  }

}
