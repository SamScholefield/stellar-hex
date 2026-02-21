import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { BuildingData, BUILDING_STATS } from '../../models/game-state';

@Component({
  selector: 'app-hex-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (info(); as data) {
      <div class="panel">
        <div class="coords">{{ data.hex.q }}, {{ data.hex.r }}</div>
        @if (data.visibility === 'unexplored') {
          <div class="type unknown">Unknown</div>
          <div class="hint">Unexplored region</div>
        } @else if (data.hex.object; as obj) {
          <div class="type">{{ formatType(obj.type) }}</div>
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
            <div class="building-type">{{ formatType(b.type) }}</div>
            <div class="building-owner">Owner: {{ b.ownerId }}</div>
            <div class="building-yield">
              @for (entry of buildingYield(b); track entry.key) {
                <span class="res">+{{ entry.value }} {{ entry.key }}/turn</span>
              }
            </div>
            @if (b.productionQueue && b.productionQueue.length > 0) {
              <div class="building-queue">
                Producing:
                @for (item of b.productionQueue; track $index) {
                  <span class="queue-entry">{{ formatType(item.unitType) }} ({{ item.turnsRemaining }}t)</span>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    .panel {
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      min-width: 160px;
    }
    .coords {
      font-size: 0.75rem;
      color: #6b7280;
      margin-bottom: 0.25rem;
    }
    .type {
      font-size: 1rem;
      font-weight: 600;
      color: #e0e0e0;
      text-transform: capitalize;
    }
    .subtype {
      font-size: 0.85rem;
      color: #9ca3af;
      text-transform: capitalize;
    }
    .size {
      font-size: 0.8rem;
      color: #9ca3af;
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
      color: #5eead4;
    }
    .unknown {
      color: #6b7280;
      font-style: italic;
    }
    .hint {
      font-size: 0.75rem;
      color: #4b5563;
      font-style: italic;
      margin-top: 0.25rem;
    }
    .building-info {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid #374151;
    }
    .building-type {
      font-size: 0.9rem;
      font-weight: 600;
      color: #fbbf24;
      text-transform: capitalize;
    }
    .building-owner {
      font-size: 0.75rem;
      color: #6b7280;
    }
    .building-yield {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      margin-top: 0.25rem;
    }
    .building-queue {
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 0.25rem;
    }
    .queue-entry {
      display: block;
      color: #fbbf24;
      text-transform: capitalize;
    }
  `,
})
export class HexInfoPanelComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);

  readonly info = this.selection.selectedHexData;

  readonly buildingAtHex = computed<BuildingData | null>(() => {
    const coord = this.selection.selectedHexCoord();
    if (!coord) return null;
    return this.gameState.buildingAtHex().get(`${coord.q},${coord.r}`) ?? null;
  });

  formatType(type: string): string {
    return type.replace(/_/g, ' ');
  }

  buildingYield(b: BuildingData): { key: string; value: number }[] {
    const stats = BUILDING_STATS[b.type];
    if (!stats) return [];
    return Object.entries(stats.yield)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k, value: v! }));
  }
}
