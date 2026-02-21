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
      <button class="header" (click)="toggle()">
        <span class="arrow">{{ collapsed() ? '\u25B6' : '\u25BC' }}</span>
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
            <div class="empty">No buildings</div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .panel {
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      overflow: hidden;
      max-width: 200px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      padding: 0.3rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #9ca3af;
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
    }
    .header:hover { color: #e0e0e0; }
    .arrow { font-size: 0.6rem; }
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
      border-bottom: 1px solid rgba(42, 74, 90, 0.3);
    }
    .building-row {
      display: flex;
      gap: 0.3rem;
      width: 100%;
      padding: 0.2rem 0.4rem;
      font-size: 0.7rem;
      color: #d1d5db;
      background: none;
      border: none;
      border-bottom: 1px solid rgba(42, 74, 90, 0.2);
      cursor: pointer;
      text-align: left;
      align-items: center;
    }
    .building-row:hover { background: rgba(255, 255, 255, 0.05); }
    .type { color: #5eead4; flex-shrink: 0; }
    .yields { display: flex; gap: 0.2rem; }
    .coords { color: #6b7280; margin-left: auto; flex-shrink: 0; }
    .res { font-size: 0.65rem; }
    .energy { color: #facc15; }
    .minerals { color: #a78bfa; }
    .alloys { color: #60a5fa; }
    .credits { color: #34d399; }
    .empty {
      font-size: 0.7rem;
      color: #6b7280;
      padding: 0.4rem;
      text-align: center;
    }
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
