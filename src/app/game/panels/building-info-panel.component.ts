import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { CameraService } from '../../core/camera/camera.service';
import { hexKey, hexToPixel } from '../../shared/hex/hex-math';
import { BuildingData, BUILDING_STATS, TECH_TREE, TechId } from '../../models/game-state';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';
import { ProductionQueueComponent } from './production-queue.component';

@Component({
  selector: 'app-building-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe, ProductionQueueComponent],
  template: `
    @if (building(); as b) {
      <div class="hud-display" (click)="centerOn(b.q, b.r)">
        <div class="section identity">
          <span class="building-name">{{ b.type | formatName }}</span>
          <div class="sub-info">
            <span class="loc">{{ b.q }},{{ b.r }}</span>
            @if (isEnemy(b.ownerId)) {
              <span class="tag enemy">{{ ownerName(b.ownerId) }}</span>
            }
          </div>
        </div>

        <div class="section gauges">
          <div class="gauge">
            <div class="gauge-ring">
              <svg viewBox="0 0 40 40">
                <circle class="gauge-track" cx="20" cy="20" r="17" />
                <circle class="gauge-fill hp-fill" cx="20" cy="20" r="17"
                  [style.stroke-dasharray]="circ" [style.stroke-dashoffset]="hpOffset()" />
              </svg>
              <span class="gauge-val">{{ b.health }}</span>
            </div>
            <span class="gauge-label">HP</span>
          </div>
          @if (b.maxShields > 0) {
            <div class="gauge">
              <div class="gauge-ring">
                <svg viewBox="0 0 40 40">
                  <circle class="gauge-track" cx="20" cy="20" r="17" />
                  <circle class="gauge-fill sh-fill" cx="20" cy="20" r="17"
                    [style.stroke-dasharray]="circ" [style.stroke-dashoffset]="shOffset()" />
                </svg>
                <span class="gauge-val">{{ b.shields }}</span>
              </div>
              <span class="gauge-label">SH</span>
            </div>
          }
        </div>

        @if (yieldEntries().length > 0) {
          <div class="section yield">
            <span class="section-title">Yield</span>
            @for (entry of yieldEntries(); track entry.key) {
              <div class="yield-row">
                <span class="yield-label">{{ entry.key }}</span>
                <span class="yield-val">+{{ entry.value }}</span>
              </div>
            }
          </div>
        }

        @if (b.productionQueue && b.productionQueue.length > 0) {
          <div class="section queue-section">
            <span class="section-title">Production</span>
            <app-production-queue [items]="b.productionQueue" />
          </div>
        }

        @if (b.researchQueue && b.researchQueue.length > 0) {
          <div class="section queue-section">
            <span class="section-title">Research</span>
            @for (item of b.researchQueue; track item.techId) {
              <div class="queue-row">
                <span class="queue-name">{{ techName(item.techId) }}</span>
                <span class="queue-turns">{{ item.turnsRemaining }}T</span>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host { pointer-events: auto; }
    .hud-display {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      padding: 0.5rem 1rem;
      background: rgba(10, 10, 26, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 0.5rem;
      cursor: pointer;
    }
    .section { display: flex; flex-direction: column; }
    .identity { gap: 0.15rem; min-width: 80px; }
    .building-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--accent-gold, #fbbf24);
      text-transform: capitalize;
    }
    .sub-info {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .loc {
      font-size: 0.6rem;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .tag {
      font-size: 0.55rem;
      font-weight: 700;
      padding: 0.05rem 0.3rem;
      border-radius: 0.2rem;
      border: 1px solid;
    }
    .tag.enemy { color: var(--accent-red); border-color: rgba(248,113,113,0.3); }
    .gauges {
      flex-direction: row;
      gap: 0.75rem;
    }
    .gauge {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.1rem;
    }
    .gauge-ring {
      position: relative;
      width: 42px;
      height: 42px;
    }
    .gauge-ring svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .gauge-track {
      fill: none;
      stroke: rgba(255, 255, 255, 0.06);
      stroke-width: 3;
    }
    .gauge-fill {
      fill: none;
      stroke-width: 3;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.3s;
    }
    .hp-fill { stroke: #22c55e; }
    .sh-fill { stroke: #60a5fa; }
    .gauge-val {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .gauge-label {
      font-size: 0.55rem;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    }
    .section-title {
      font-size: 0.6rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.15rem;
    }
    .yield {
      gap: 0.1rem;
      min-width: 70px;
    }
    .yield-row {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .yield-label {
      font-size: 0.65rem;
      color: var(--text-secondary);
      text-transform: capitalize;
    }
    .yield-val {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--accent-teal);
      font-variant-numeric: tabular-nums;
    }
    .queue-section {
      gap: 0.1rem;
      min-width: 100px;
    }
    .queue-row {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .queue-name {
      font-size: 0.65rem;
      color: var(--text-secondary);
    }
    .queue-turns {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--accent-amber);
    }
    app-production-queue { display: block; }
  `,
})
export class BuildingInfoPanelComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);
  private readonly camera = inject(CameraService);

  private static readonly CIRCUMFERENCE = 2 * Math.PI * 17;
  readonly circ = `${BuildingInfoPanelComponent.CIRCUMFERENCE}`;

  readonly building = computed<BuildingData | null>(() => {
    if (this.selection.selectedUnitData()) return null;
    const coord = this.selection.selectedHexCoord();
    if (!coord) return null;
    return this.gameState.buildingAtHex().get(hexKey(coord.q, coord.r)) ?? null;
  });

  private offset(current: number, max: number): string {
    const c = BuildingInfoPanelComponent.CIRCUMFERENCE;
    return `${c * (1 - (max > 0 ? current / max : 0))}`;
  }

  readonly hpOffset = computed(() => this.offset(this.building()?.health ?? 0, this.building()?.maxHealth ?? 1));
  readonly shOffset = computed(() => this.offset(this.building()?.shields ?? 0, this.building()?.maxShields ?? 1));

  readonly yieldEntries = computed(() => {
    const b = this.building();
    if (!b) return [];
    const stats = BUILDING_STATS[b.type];
    if (!stats) return [];
    return Object.entries(stats.yield)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k, value: v! }));
  });

  centerOn(q: number, r: number): void {
    const { x, y } = hexToPixel(q, r, 30);
    this.camera.centerOn(x, y);
  }

  isEnemy(ownerId: string): boolean {
    return ownerId !== this.gameState.humanPlayer()?.id;
  }

  ownerName(ownerId: string): string {
    return this.gameState.playerNames().get(ownerId) ?? ownerId;
  }

  techName(techId: TechId): string {
    return TECH_TREE[techId]?.name ?? techId;
  }
}
