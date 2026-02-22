import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { AudioService } from '../../core/audio/audio.service';
import { BuildingData, BUILDING_STATS, TECH_TREE, TechId } from '../../models/game-state';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';
import { ProductionQueueComponent } from './production-queue.component';

@Component({
  selector: 'app-hex-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe, ProductionQueueComponent],
  template: `
    <div class="panel" [class.collapsed]="collapsed()">
      <button class="collapsible-header" (click)="toggle()">
        <span class="collapsible-arrow">{{ collapsed() ? '\u25B6' : '\u25BC' }}</span>
        Hex Info
      </button>
      @if (!collapsed()) {
        <div class="panel-body">
          @if (info(); as data) {
            <div class="coords">{{ data.hex.q }}, {{ data.hex.r }}</div>
            @if (data.visibility === 'unexplored') {
              <div class="type unknown">Unknown</div>
              <div class="hint">Unexplored region</div>
            } @else if (data.hex.object; as obj) {
              <div class="type">{{ obj.type | formatName }}</div>
              @if (obj.subtype) {
                <div class="subtype">{{ obj.subtype }}</div>
              }
              @if (data.visibility === 'visible') {
                <div class="size">Size: {{ obj.size }}</div>
                @if (obj.resources) {
                  <div class="resources">
                    @if (obj.resources.energy) {
                      <span class="res">Energy: {{ obj.resources.energy }}</span>
                    }
                    @if (obj.resources.minerals) {
                      <span class="res">Minerals: {{ obj.resources.minerals }}</span>
                    }
                    @if (obj.resources.alloys) {
                      <span class="res">Alloys: {{ obj.resources.alloys }}</span>
                    }
                    @if (obj.resources.credits) {
                      <span class="res">Credits: {{ obj.resources.credits }}</span>
                    }
                  </div>
                }
              } @else {
                <div class="hint">Last seen — no current intel</div>
              }
            } @else {
              <div class="type">Empty Space</div>
            }
            @if (buildingAtHex(); as b) {
              <div class="building-info">
                <div class="building-type">{{ b.type | formatName }}</div>
                <div class="building-owner">Owner: {{ ownerName(b.ownerId) }}</div>
                <div class="building-yield">
                  @for (entry of buildingYield(b); track entry.key) {
                    <span class="res">+{{ entry.value }} {{ entry.key }}/turn</span>
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
          } @else {
            <div class="hint">Hover or select a hex</div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      pointer-events: auto;
      align-self: end;
    }
    .panel {
      min-width: 200px;
      min-height: 200px;
    }
    .panel.collapsed {
      min-height: 0;
    }
    .panel-body {
      padding: 0.75rem 1rem;
    }
    .coords {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
    }
    .type {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      text-transform: capitalize;
    }
    .subtype {
      font-size: 0.85rem;
      color: var(--text-secondary);
      text-transform: capitalize;
    }
    .size {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }
    .resources {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .res {
      font-size: 0.8rem;
      color: var(--accent-teal);
    }
    .unknown {
      color: var(--text-muted);
      font-style: italic;
    }
    .hint {
      font-size: 0.75rem;
      color: var(--text-dim);
      font-style: italic;
      margin-top: 0.25rem;
    }
    .building-info {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--btn-border);
    }
    .building-type {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--accent-gold);
      text-transform: capitalize;
    }
    .building-owner {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .building-yield {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      margin-top: 0.25rem;
    }
    app-production-queue {
      display: block;
      margin-top: 0.5rem;
    }
    .queue-section {
      margin-top: 0.5rem;
    }
  `,
})
export class HexInfoPanelComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);
  private readonly audio = inject(AudioService);

  readonly collapsed = signal(false);

  toggle(): void {
    this.audio.playClick();
    this.collapsed.update(v => !v);
  }

  readonly info = computed(() => this.selection.hoveredHexData() ?? this.selection.selectedHexData());

  private readonly activeCoord = computed(() => this.selection.hoveredHexCoord() ?? this.selection.selectedHexCoord());

  readonly buildingAtHex = computed<BuildingData | null>(() => {
    const coord = this.activeCoord();
    if (!coord) return null;
    return this.gameState.buildingAtHex().get(`${coord.q},${coord.r}`) ?? null;
  });

  ownerName(ownerId: string): string {
    return this.gameState.playerNames().get(ownerId) ?? ownerId;
  }

  techName(techId: TechId): string {
    return TECH_TREE[techId]?.name ?? techId;
  }

  buildingYield(b: BuildingData): { key: string; value: number }[] {
    const stats = BUILDING_STATS[b.type];
    if (!stats) return [];
    return Object.entries(stats.yield)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k, value: v! }));
  }
}
