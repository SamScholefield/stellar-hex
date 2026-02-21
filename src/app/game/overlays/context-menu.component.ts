import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { CameraService } from '../../core/camera/camera.service';
import { GameStateService } from '../../core/state/game-state.service';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { AudioService } from '../../core/audio/audio.service';
import { EventLogService } from '../../core/state/event-log.service';
import { AnimationService } from '../renderer/animation.service';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance, pixelToHex } from '../../shared/hex/hex-math';
import { attackWithResult } from '../../core/state/game-reducer';
import { BuildingType, BuildingStats, BUILDING_STATS } from '../../models/game-state';
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
        @if (s.canAttack) {
          <button class="item attack" (click)="onAttack()">Attack</button>
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
      background: rgba(10, 10, 26, 0.95);
      border: 1px solid #2a4a5a;
      border-radius: 0.375rem;
      padding: 0.25rem 0;
      min-width: 130px;
      pointer-events: auto;
    }
    .item {
      display: block;
      width: 100%;
      padding: 0.4rem 0.75rem;
      font-size: 0.85rem;
      color: #e0e0e0;
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
    }
    .item:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
    }
    .item:disabled {
      color: #4b5563;
      cursor: not-allowed;
    }
    .item.attack {
      color: #f87171;
    }
    .item.build {
      color: #5eead4;
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
    const unitIndex = this.gameState.unitAtHex();
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
        const unitAtTarget = unitIndex.get(hexKeyStr);
        if (unitAtTarget && unitAtTarget.ownerId !== currentPlayer.id) {
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

    const unitAtHex = unitIndex.get(hexKeyStr);
    const hasFriendlyUnit = unitAtHex != null && unitAtHex.ownerId === currentPlayer.id;

    if (hasFriendlyUnit) {
      const hasBuilding = buildingIndex.has(hexKeyStr);

      if (!hasBuilding) {
        const hexData = this.chunkManager.getHex(hex.q, hex.r);
        if (hexData) {
          hexType = hexData.object?.type ?? 'empty';
          const resources = currentPlayer.resources;

          for (const [type, stats] of Object.entries(BUILDING_STATS) as [BuildingType, BuildingStats][]) {
            if (!stats.allowedHexTypes.includes(hexType)) continue;
            const affordable = resources.energy >= (stats.cost.energy ?? 0)
              && resources.minerals >= (stats.cost.minerals ?? 0)
              && resources.alloys >= (stats.cost.alloys ?? 0)
              && resources.credits >= (stats.cost.credits ?? 0);
            buildOptions.push({ type, stats, affordable });
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
    });
  }

  close(): void {
    this._state.set(null);
  }

  onInspect(): void {
    const s = this._state();
    if (s) {
      this.selection.selectHex(s.hex);
    }
    this.close();
  }

  onAttack(): void {
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
      this.gameState.dispatch({ type: 'ATTACK', attackerId, targetId });

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

  onBuild(buildingType: BuildingType): void {
    const s = this._state();
    if (!s || !s.hexType) return;
    this.close();

    const player = this.gameState.currentPlayer();
    if (!player) return;

    this.gameState.dispatch({ type: 'BUILD', playerId: player.id, buildingType, hex: s.hex, hexType: s.hexType });
    const turn = this.gameState.turn();
    this.eventLog.push({ turn, message: `Built ${buildingType.replace(/_/g, ' ')} at (${s.hex.q}, ${s.hex.r})`, q: s.hex.q, r: s.hex.r });
  }

}
