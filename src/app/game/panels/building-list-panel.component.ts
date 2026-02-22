import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GameStateService } from '../../core/state/game-state.service';
import { CameraService } from '../../core/camera/camera.service';
import { AudioService } from '../../core/audio/audio.service';
import { SelectionService } from '../../core/selection/selection.service';
import { BuildingData, BUILDING_STATS, Resources } from '../../models/game-state';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';
import { hexToPixel } from '../../shared/hex/hex-math';

interface BuildingEntry {
  building: BuildingData;
  yield: Partial<Resources>;
}

@Component({
  selector: 'app-building-list-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe],
  template: `
    <div class="panel">
      <button class="collapsible-header" (click)="toggle()">
        <span class="collapsible-arrow">{{ collapsed() ? '\u25B6' : '\u25BC' }}</span>
        Buildings ({{ totalCount() }})
      </button>
      @if (!collapsed()) {
        <div class="list">
          @if (totalIncome(); as income) {
            <div class="income-summary">
              @if (income.energy) { <span class="res energy">+{{ income.energy }}E</span> }
              @if (income.minerals) { <span class="res minerals">+{{ income.minerals }}M</span> }
              @if (income.alloys) { <span class="res alloys">+{{ income.alloys }}A</span> }
              @if (income.credits) { <span class="res credits">+{{ income.credits }}C</span> }
            </div>
          }
          @for (entry of buildingEntries(); track entry.building.id) {
            <button class="building-row" (click)="selectBuilding(entry.building)">
              <span class="type">{{ entry.building.type | formatName }}</span>
              <span class="yields">
                @if (entry.yield.energy) { <span class="res energy">+{{ entry.yield.energy }}E</span> }
                @if (entry.yield.minerals) { <span class="res minerals">+{{ entry.yield.minerals }}M</span> }
                @if (entry.yield.alloys) { <span class="res alloys">+{{ entry.yield.alloys }}A</span> }
                @if (entry.yield.credits) { <span class="res credits">+{{ entry.yield.credits }}C</span> }
              </span>
              <span class="coords">({{ entry.building.q }},{{ entry.building.r }})</span>
            </button>
          }
          @empty {
            <div class="panel-empty">No buildings</div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .panel {
      overflow: hidden;
      width: 100%;
    }
    .list {
      max-height: 200px;
      overflow-y: auto;
      padding: 0.15rem;
    }
    .income-summary {
      display: flex;
      gap: 0.4rem;
      padding: 0.25rem 0.4rem;
      font-size: 0.7rem;
      font-weight: 600;
      border-bottom: 1px solid var(--divider);
    }
    .building-row {
      display: flex;
      gap: 0.3rem;
      width: 100%;
      padding: 0.2rem 0.4rem;
      font-size: 0.7rem;
      color: var(--text-body);
      background: none;
      border: none;
      border-bottom: 1px solid var(--divider-light);
      cursor: pointer;
      text-align: left;
      align-items: center;
    }
    .building-row:hover { background: var(--hover-bg); }
    .type { color: var(--accent-teal); flex-shrink: 0; }
    .yields { display: flex; gap: 0.2rem; }
    .coords { color: var(--text-muted); margin-left: auto; flex-shrink: 0; }
    .res { font-size: 0.65rem; }
    .energy { color: var(--res-energy); }
    .minerals { color: var(--res-minerals); }
    .alloys { color: var(--res-alloys); }
    .credits { color: var(--res-credits); }
  `,
})
export class BuildingListPanelComponent {
  private readonly gameState = inject(GameStateService);
  private readonly camera = inject(CameraService);
  private readonly audio = inject(AudioService);
  private readonly selection = inject(SelectionService);

  readonly collapsed = signal(true);

  readonly buildingEntries = computed<BuildingEntry[]>(() => {
    const human = this.gameState.humanPlayer();
    if (!human) return [];
    const entries: BuildingEntry[] = [];
    for (const b of this.gameState.buildings().values()) {
      if (b.ownerId === human.id) {
        const stats = BUILDING_STATS[b.type];
        entries.push({ building: b, yield: stats?.yield ?? {} });
      }
    }
    return entries;
  });

  readonly totalCount = computed(() => this.buildingEntries().length);

  readonly totalIncome = computed<Partial<Resources> | null>(() => {
    const entries = this.buildingEntries();
    if (entries.length === 0) return null;
    const total: Resources = { energy: 0, minerals: 0, alloys: 0, credits: 0 };
    for (const e of entries) {
      total.energy += e.yield.energy ?? 0;
      total.minerals += e.yield.minerals ?? 0;
      total.alloys += e.yield.alloys ?? 0;
      total.credits += e.yield.credits ?? 0;
    }
    const result: Partial<Resources> = {};
    if (total.energy) result.energy = total.energy;
    if (total.minerals) result.minerals = total.minerals;
    if (total.alloys) result.alloys = total.alloys;
    if (total.credits) result.credits = total.credits;
    return Object.keys(result).length > 0 ? result : null;
  });

  toggle(): void {
    this.audio.playClick();
    this.collapsed.update(v => !v);
  }

  selectBuilding(building: BuildingData): void {
    this.audio.playClick();
    const { x, y } = hexToPixel(building.q, building.r, 30);
    this.camera.centerOn(x, y);
    this.selection.selectHex({ q: building.q, r: building.r, s: -building.q - building.r });
  }
}
