import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { CameraService } from '../../core/camera/camera.service';
import { AudioService } from '../../core/audio/audio.service';
import { hexToPixel } from '../../shared/hex/hex-math';

@Component({
  selector: 'app-unit-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UpperCasePipe],
  template: `
    @if (unitData(); as unit) {
      <div class="panel">
        <button class="collapsible-header" (click)="toggle()">
          <span class="collapsible-arrow">{{ collapsed() ? '\u25B6' : '\u25BC' }}</span>
          <span class="unit-name-header" (click)="centerOnUnit(unit.q, unit.r); $event.stopPropagation()">{{ unit.name }}</span>
          @if (isEnemy(unit.ownerId)) {
            <span class="owner">{{ ownerName(unit.ownerId) }}</span>
          }
        </button>
        @if (!collapsed()) {
          <div class="panel-body">
            <div class="stats">
              <div class="stat">
                <span class="label">HP</span>
                <div class="bar-bg">
                  <div class="bar-fill hp" [style.width.%]="(unit.health / unit.maxHealth) * 100"></div>
                </div>
                <span class="val">{{ unit.health }}/{{ unit.maxHealth }}</span>
              </div>
              @if (unit.maxShields > 0) {
                <div class="stat">
                  <span class="label">SH</span>
                  <div class="bar-bg">
                    <div
                      class="bar-fill sh"
                      [style.width.%]="(unit.shields / unit.maxShields) * 100"
                    ></div>
                  </div>
                  <span class="val">{{ unit.shields }}/{{ unit.maxShields }}</span>
                </div>
              }
              <div class="stat">
                <span class="label">MP</span>
                <div class="bar-bg">
                  <div
                    class="bar-fill mp"
                    [style.width.%]="
                      ((unit.movementPoints > 0 ? unit.movementPoints : 0) / unit.maxMovementPoints) *
                      100
                    "
                  ></div>
                </div>
                <span class="val"
                  >{{ unit.movementPoints > 0 ? unit.movementPoints : 0 }}/{{
                    unit.maxMovementPoints
                  }}</span
                >
              </div>
            </div>
            <div class="combat-stats">
              <span class="cs">ATK {{ unit.attack }}</span>
              <span class="cs">ARM {{ unit.armor }}</span>
              <span class="cs">RNG {{ unit.range }}</span>
              <span class="cs">VIS {{ unit.sightRange }}</span>
            </div>
            @if (unit.weapon) {
              <div class="extra-stats">
                <span class="cs">{{ unit.weapon | uppercase }}</span>
                <span class="cs">{{ unit.size | uppercase }}</span>
                @if (unit.veteranTier !== 'standard') {
                  <span class="cs vet">{{ unit.veteranTier === 'improved' ? 'VET I' : 'VET II' }}</span>
                }
                <span class="cs xp">XP {{ unit.xp }}</span>
              </div>
            }
            <div class="coords">{{ unit.q }}, {{ unit.r }}</div>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      pointer-events: auto;
    }
    .panel-body {
      padding: 0.75rem 1rem;
      min-width: 180px;
    }
    .unit-name-header {
      cursor: pointer;
      text-transform: capitalize;
    }
    .unit-name-header:hover {
      color: var(--accent-teal, #5eead4);
    }
    .owner {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-left: auto;
    }
    .stats {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin-bottom: 0.5rem;
    }
    .stat {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .label {
      font-size: 0.7rem;
      color: var(--text-secondary);
      width: 22px;
      font-weight: 600;
    }
    .bar-bg {
      flex: 1;
      height: 6px;
      background: #1a1a2e;
      border-radius: 3px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.2s;
    }
    .bar-fill.hp {
      background: #22c55e;
    }
    .bar-fill.sh {
      background: #60a5fa;
    }
    .bar-fill.mp {
      background: #3b82f6;
    }
    .val {
      font-size: 0.7rem;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      width: 36px;
      text-align: right;
    }
    .combat-stats,
    .extra-stats {
      display: flex;
      gap: 0.6rem;
      margin-bottom: 0.35rem;
    }
    .cs {
      font-size: 0.7rem;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .cs.vet {
      color: var(--accent-gold, #fbbf24);
    }
    .cs.xp {
      color: var(--text-muted);
      font-weight: 400;
    }
    .coords {
      font-size: 0.7rem;
      color: var(--text-muted);
    }
  `,
})
export class UnitInfoPanelComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);
  private readonly camera = inject(CameraService);
  private readonly audio = inject(AudioService);

  readonly collapsed = signal(false);
  readonly unitData = this.selection.selectedUnitData;

  toggle(): void {
    this.audio.playClick();
    this.collapsed.update(v => !v);
  }

  centerOnUnit(q: number, r: number): void {
    const { x, y } = hexToPixel(q, r, 30);
    this.camera.centerOn(x, y);
  }

  isEnemy(ownerId: string): boolean {
    return ownerId !== this.gameState.humanPlayer()?.id;
  }

  ownerName(ownerId: string): string {
    return this.gameState.playerNames().get(ownerId) ?? ownerId;
  }
}
