import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { hexKey } from '../../shared/hex/hex-math';
import {
  Anomaly,
  ANOMALY_REWARDS,
  BuildingData,
  BUILDING_STATS,
  TECH_TREE,
  TechId,
  TradeHub,
  UnitData,
} from '../../models/game-state';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';
import { ProductionQueueComponent } from './production-queue.component';

type SubPanel = 'units' | 'building' | 'tradeHub' | 'anomaly' | null;

@Component({
  selector: 'app-hex-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe, ProductionQueueComponent],
  host: {
    '(document:pointerdown)': 'onDocumentClick($event)',
  },
  template: `
    <div class="hex-panel-row">
      <div class="panel summary">
        @if (info(); as data) {
          <div class="summary-header">
            <div class="coords">{{ data.hex.q }}, {{ data.hex.r }}</div>
            @if (tradeHubAtHex()) {
              <div class="type trade-hub-label">Trade Hub</div>
            } @else if (anomalyAtHex()) {
              <div class="type anomaly-label">{{ anomalyName() }}</div>
            } @else if (data.visibility === 'unexplored') {
              <div class="type unknown">Unknown</div>
            } @else if (data.hex.object; as obj) {
              <div class="type">{{ obj.type | formatName }}</div>
              @if (data.visibility === 'visible' && obj.resources) {
                <div class="hex-resources">
                  @if (obj.resources.energy) { <span class="res energy">{{ obj.resources.energy }}E</span> }
                  @if (obj.resources.minerals) { <span class="res minerals">{{ obj.resources.minerals }}M</span> }
                  @if (obj.resources.alloys) { <span class="res alloys">{{ obj.resources.alloys }}A</span> }
                  @if (obj.resources.credits) { <span class="res credits">{{ obj.resources.credits }}C</span> }
                </div>
              }
            } @else {
              <div class="type">Empty Space</div>
            }
          </div>
          <div class="badges">
            @if (anomalyAtHex()) {
              <button
                class="badge anomaly"
                [class.active]="openPanel() === 'anomaly'"
                (click)="togglePanel('anomaly')"
              >
                Reward
              </button>
            }
            @if (tradeHubAtHex()) {
              <button
                class="badge trade"
                [class.active]="openPanel() === 'tradeHub'"
                (click)="togglePanel('tradeHub')"
              >
                Stock
              </button>
            }
            @if (buildingAtHex(); as b) {
              <button
                class="badge building"
                [class.active]="openPanel() === 'building'"
                (click)="togglePanel('building')"
              >
                {{ b.type | formatName }}
              </button>
            }
            @if (unitsAtHex().length > 0) {
              <button
                class="badge units"
                [class.active]="openPanel() === 'units'"
                (click)="togglePanel('units')"
              >
                {{ unitsAtHex().length }} unit{{ unitsAtHex().length > 1 ? 's' : '' }}
              </button>
            }
          </div>
        } @else {
          <div class="summary-header">
            <div class="type hint">No hex selected</div>
          </div>
        }
      </div>

      @if (openPanel() === 'units' && unitsAtHex().length > 0) {
        <div class="panel sub-panel">
          <div class="sub-title">Units</div>
          @for (unit of unitsAtHex(); track unit.id) {
            <div class="unit-row" [class.enemy]="isEnemy(unit.ownerId)">
              <span class="unit-name">{{ unit.name }}</span>
              <span class="unit-hp"
                >{{ unit.health }}/{{ unit.maxHealth }}
                @if (unit.maxShields > 0) {
                  · S{{ unit.shields }}
                }
              </span>
            </div>
          }
        </div>
      }

      @if (openPanel() === 'building' && buildingAtHex(); as b) {
        <div class="panel sub-panel">
          <div class="sub-title">{{ b.type | formatName }}</div>
          <div class="detail-row">Owner: {{ ownerName(b.ownerId) }}</div>
          <div class="detail-row">
            HP: {{ b.health }}/{{ b.maxHealth }}
            @if (b.maxShields > 0) {
              · Shield: {{ b.shields }}/{{ b.maxShields }}
            }
          </div>
          <div class="yield-list">
            @for (entry of buildingYield(b); track entry.key) {
              <span class="yield-item">+{{ entry.value }} {{ entry.key }}/t</span>
            }
          </div>
          @if (b.productionQueue && b.productionQueue.length > 0) {
            <app-production-queue [items]="b.productionQueue" />
          }
          @if (b.researchQueue && b.researchQueue.length > 0) {
            <div class="queue-section">
              <div class="queue-title">Researching</div>
              @for (item of b.researchQueue; track item.techId) {
                <div class="queue-item">
                  <span>{{ techName(item.techId) }}</span>
                  <span class="queue-turns">{{ item.turnsRemaining }}T</span>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (openPanel() === 'anomaly' && anomalyAtHex(); as a) {
        <div class="panel sub-panel">
          <div class="sub-title">{{ anomalyName() }}</div>
          <div class="stock-list">
            @if (anomalyReward(a); as reward) {
              @for (entry of reward; track entry.key) {
                <div class="stock-row">
                  <span class="stock-label">{{ entry.key }}</span
                  ><span class="stock-val">+{{ entry.value }}</span>
                </div>
              }
            }
          </div>
        </div>
      }

      @if (openPanel() === 'tradeHub' && tradeHubAtHex(); as hub) {
        <div class="panel sub-panel">
          <div class="sub-title">Trade Hub Stock</div>
          <div class="stock-list">
            <div class="stock-row">
              <span class="stock-label">Energy</span
              ><span class="stock-val">{{ hub.stock.energy }}</span>
            </div>
            <div class="stock-row">
              <span class="stock-label">Minerals</span
              ><span class="stock-val">{{ hub.stock.minerals }}</span>
            </div>
            <div class="stock-row">
              <span class="stock-label">Alloys</span
              ><span class="stock-val">{{ hub.stock.alloys }}</span>
            </div>
            <div class="stock-row">
              <span class="stock-label">Credits</span
              ><span class="stock-val">{{ hub.stock.credits }}</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      pointer-events: auto;
      align-self: end;
    }
    .hex-panel-row {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
    }
    .summary {
      min-width: 160px;
      max-width: 180px;
      padding: 0.6rem 0.75rem;
    }
    .summary-header {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .coords {
      font-size: 0.65rem;
      color: var(--text-muted);
    }
    .type {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary);
      text-transform: capitalize;
    }
    .trade-hub-label {
      color: var(--accent-gold, #fbbf24);
    }
    .hex-resources {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.2rem;
      font-size: 0.7rem;
      font-variant-numeric: tabular-nums;
    }
    .hex-resources .energy { color: var(--res-energy); }
    .hex-resources .minerals { color: var(--res-minerals); }
    .hex-resources .alloys { color: var(--res-alloys); }
    .hex-resources .credits { color: var(--res-credits); }
    .unknown {
      color: var(--text-muted);
      font-style: italic;
    }
    .hint {
      font-size: 0.8rem;
      color: var(--text-dim);
      font-style: italic;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin-top: 0.4rem;
    }
    .badge {
      font-size: 0.68rem;
      padding: 0.15rem 0.45rem;
      border-radius: 0.25rem;
      border: 1px solid var(--btn-border, #374151);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      transition:
        background 0.15s,
        border-color 0.15s,
        color 0.15s;
      white-space: nowrap;
    }
    .badge:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
    }
    .badge.active {
      border-color: var(--accent-teal, #5eead4);
      color: var(--accent-teal, #5eead4);
      background: rgba(94, 234, 212, 0.08);
    }
    .anomaly-label {
      color: var(--accent-amber, #f59e0b);
    }
    .badge.anomaly {
      border-color: rgba(245, 158, 11, 0.3);
      color: var(--accent-amber, #f59e0b);
    }
    .badge.anomaly.active {
      border-color: var(--accent-amber, #f59e0b);
      background: rgba(245, 158, 11, 0.1);
    }
    .badge.trade {
      border-color: rgba(251, 191, 36, 0.3);
      color: var(--accent-gold, #fbbf24);
    }
    .badge.trade.active {
      border-color: var(--accent-gold, #fbbf24);
      background: rgba(251, 191, 36, 0.1);
    }
    .sub-panel {
      min-width: 160px;
      max-width: 200px;
      max-height: 40vh;
      overflow-y: auto;
      padding: 0.6rem 0.75rem;
      scrollbar-width: thin;
      scrollbar-color: rgba(94, 234, 212, 0.2) transparent;
    }
    .sub-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 0.4rem;
      text-transform: capitalize;
    }
    .unit-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.2rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .unit-name {
      font-size: 0.75rem;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .unit-hp {
      font-size: 0.65rem;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .unit-row.enemy .unit-name,
    .unit-row.enemy .unit-hp {
      color: var(--accent-red, #f87171);
    }
    .detail-row {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 0.15rem;
    }
    .yield-list {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      margin-top: 0.25rem;
    }
    .yield-item {
      font-size: 0.75rem;
      color: var(--accent-teal);
    }
    app-production-queue {
      display: block;
      margin-top: 0.4rem;
    }
    .queue-section {
      margin-top: 0.4rem;
    }
    .stock-list {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .stock-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
    }
    .stock-label {
      color: var(--text-secondary);
    }
    .stock-val {
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class HexInfoPanelComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);
  private readonly el = inject(ElementRef);

  readonly openPanel = signal<SubPanel>(null);

  readonly info = computed(() => this.selection.selectedHexData());

  private readonly activeCoord = computed(() => this.selection.selectedHexCoord());

  readonly tradeHubAtHex = computed<TradeHub | null>(() => {
    const coord = this.activeCoord();
    if (!coord) return null;
    const key = `trade_hub_${coord.q}_${coord.r}`;
    return this.gameState.tradeHubs().get(key) ?? null;
  });

  readonly anomalyAtHex = computed<Anomaly | null>(() => {
    const coord = this.activeCoord();
    if (!coord) return null;
    for (const a of this.gameState.anomalies().values()) {
      if (a.q === coord.q && a.r === coord.r) return a;
    }
    return null;
  });

  readonly anomalyName = computed(() => {
    const a = this.anomalyAtHex();
    return a ? (ANOMALY_REWARDS[a.type]?.name ?? a.type) : null;
  });

  readonly buildingAtHex = computed<BuildingData | null>(() => {
    const data = this.info();
    if (!data || data.visibility !== 'visible') return null;
    const coord = this.activeCoord();
    if (!coord) return null;
    return this.gameState.buildingAtHex().get(hexKey(coord.q, coord.r)) ?? null;
  });

  readonly unitsAtHex = computed<UnitData[]>(() => {
    const data = this.info();
    if (!data || data.visibility !== 'visible') return [];
    const coord = this.activeCoord();
    if (!coord) return [];
    const result: UnitData[] = [];
    for (const u of this.gameState.units().values()) {
      if (u.q === coord.q && u.r === coord.r) result.push(u);
    }
    return result;
  });

  constructor() {
    // Auto-update sub-panel when hex changes — close if content no longer relevant
    effect(() => {
      const panel = this.openPanel();
      if (!panel) return;
      if (panel === 'units' && this.unitsAtHex().length === 0) this.openPanel.set(null);
      if (panel === 'building' && !this.buildingAtHex()) this.openPanel.set(null);
      if (panel === 'tradeHub' && !this.tradeHubAtHex()) this.openPanel.set(null);
      if (panel === 'anomaly' && !this.anomalyAtHex()) this.openPanel.set(null);
    });
  }

  onDocumentClick(event: PointerEvent): void {
    if (this.openPanel() && !this.el.nativeElement.contains(event.target)) {
      this.openPanel.set(null);
    }
  }

  togglePanel(panel: SubPanel): void {
    this.openPanel.update((v) => (v === panel ? null : panel));
  }

  isEnemy(ownerId: string): boolean {
    const current = this.gameState.currentPlayer();
    return !!current && current.id !== ownerId;
  }

  ownerName(ownerId: string): string {
    return this.gameState.playerNames().get(ownerId) ?? ownerId;
  }

  techName(techId: TechId): string {
    return TECH_TREE[techId]?.name ?? techId;
  }

  anomalyReward(a: Anomaly): { key: string; value: number }[] {
    const info = ANOMALY_REWARDS[a.type];
    if (!info) return [];
    return Object.entries(info.reward)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k.charAt(0).toUpperCase() + k.slice(1), value: v! }));
  }

  buildingYield(b: BuildingData): { key: string; value: number }[] {
    const stats = BUILDING_STATS[b.type];
    if (!stats) return [];
    return Object.entries(stats.yield)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k, value: v! }));
  }
}
