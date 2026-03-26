import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { CameraService } from '../../core/camera/camera.service';
import { AudioService } from '../../core/audio/audio.service';
import { BuildingData, BUILDING_STATS, Resources, UnitData, ZERO_RESOURCES } from '../../models/game-state';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';
import { hexToPixel } from '../../shared/hex/hex-math';

type ActiveList = 'military' | 'industrial' | 'buildings' | null;

const INDUSTRIAL_TYPES = new Set(['scout', 'colony_ship', 'mining_drone']);

interface UnitGroup {
  type: string;
  units: UnitData[];
}

interface BuildingEntry {
  building: BuildingData;
  yield: Partial<Resources>;
}

@Component({
  selector: 'app-fleet-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe],
  host: {
    '(document:pointerdown)': 'onDocumentClick($event)',
  },
  template: `
    <div class="fleet-row">
      @if (activeList() === 'military' && militaryGroups().length > 0) {
        <div class="panel expand-list">
          @for (group of militaryGroups(); track group.type) {
            <div class="group-header">{{ group.type | formatName }} ({{ group.units.length }})</div>
            @for (unit of group.units; track unit.id) {
              <button
                class="item-row"
                [class.selected]="unit.id === selectedUnitId()"
                [class.has-mp]="unit.movementPoints > 0"
                (click)="selectUnit(unit)"
              >
                <span class="item-name">{{ unit.name }}</span>
                <span class="hp">{{ unit.health }}/{{ unit.maxHealth }}</span>
                <span class="mp" [class.active]="unit.movementPoints > 0">{{ unit.movementPoints }}MP</span>
              </button>
            }
          }
        </div>
      }

      @if (activeList() === 'industrial' && industrialGroups().length > 0) {
        <div class="panel expand-list">
          @for (group of industrialGroups(); track group.type) {
            <div class="group-header">{{ group.type | formatName }} ({{ group.units.length }})</div>
            @for (unit of group.units; track unit.id) {
              <button
                class="item-row"
                [class.selected]="unit.id === selectedUnitId()"
                [class.has-mp]="unit.movementPoints > 0"
                (click)="selectUnit(unit)"
              >
                <span class="item-name">{{ unit.name }}</span>
                <span class="hp">{{ unit.health }}/{{ unit.maxHealth }}</span>
                <span class="mp" [class.active]="unit.movementPoints > 0">{{ unit.movementPoints }}MP</span>
              </button>
            }
          }
        </div>
      }

      @if (activeList() === 'buildings' && buildingEntries().length > 0) {
        <div class="panel expand-list">
          <div class="building-header">
            <span class="bh-name"></span>
            <span class="bh-col energy">E</span>
            <span class="bh-col minerals">M</span>
            <span class="bh-col alloys">A</span>
            <span class="bh-col credits">C</span>
          </div>
          @if (totalIncome(); as income) {
            <div class="building-grid total-row">
              <span class="bg-name">Total</span>
              <span class="bg-val energy">{{ income.energy || 0 }}</span>
              <span class="bg-val minerals">{{ income.minerals || 0 }}</span>
              <span class="bg-val alloys">{{ income.alloys || 0 }}</span>
              <span class="bg-val credits">{{ income.credits || 0 }}</span>
            </div>
          }
          @for (entry of buildingEntries(); track entry.building.id) {
            <button class="building-grid" (click)="selectBuilding(entry.building)">
              <span class="bg-name building-name">{{ entry.building.type | formatName }}</span>
              <span class="bg-val energy">{{ entry.yield.energy || 0 }}</span>
              <span class="bg-val minerals">{{ entry.yield.minerals || 0 }}</span>
              <span class="bg-val alloys">{{ entry.yield.alloys || 0 }}</span>
              <span class="bg-val credits">{{ entry.yield.credits || 0 }}</span>
            </button>
          }
        </div>
      }

      <div class="panel summary">
        <button class="badge" [class.active]="activeList() === 'military'" (click)="toggle('military')">
          Military<span class="count">{{ militaryCount() }}</span>
        </button>
        <button class="badge" [class.active]="activeList() === 'industrial'" (click)="toggle('industrial')">
          Industrial<span class="count">{{ industrialCount() }}</span>
        </button>
        <button class="badge" [class.active]="activeList() === 'buildings'" (click)="toggle('buildings')">
          Buildings<span class="count">{{ buildingCount() }}</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      pointer-events: auto;
    }
    .fleet-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .summary {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding: 0.5rem;
      min-width: 90px;
    }
    .badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
      padding: 0.3rem 0.5rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--btn-border, #374151);
      border-radius: 0.25rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      text-align: left;
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
    .count {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .expand-list {
      min-width: 200px;
      max-height: 40vh;
      overflow-y: auto;
      padding: 0.3rem;
      scrollbar-width: thin;
      scrollbar-color: rgba(94, 234, 212, 0.2) transparent;
    }
    .group-header {
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--accent-blue);
      padding: 0.2rem 0.4rem;
      text-transform: capitalize;
    }
    .item-row {
      display: flex;
      gap: 0.35rem;
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
    .item-row:hover { background: var(--hover-bg); }
    .item-row.selected { background: var(--selected-bg); }
    .item-row.has-mp { color: var(--text-primary); }
    .item-name { font-weight: 600; min-width: 70px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .building-name { color: var(--accent-teal); }
    .hp { color: var(--accent-green); }
    .mp { color: var(--text-muted); }
    .mp.active { color: var(--accent-amber); }
    .building-header {
      display: grid;
      grid-template-columns: auto 32px 32px 32px 32px;
      gap: 0;
      padding: 0.15rem 0.4rem;
      border-bottom: 1px solid var(--divider);
    }
    .bh-name { font-size: 0; }
    .bh-col {
      font-size: 0.6rem;
      font-weight: 600;
      text-align: right;
    }
    .building-grid {
      display: grid;
      grid-template-columns: auto 32px 32px 32px 32px;
      gap: 0;
      width: 100%;
      padding: 0.2rem 0.4rem;
      font-size: 0.7rem;
      color: var(--text-body);
      background: none;
      border: none;
      border-bottom: 1px solid var(--divider-light);
      cursor: pointer;
      text-align: left;
    }
    .building-grid:hover { background: var(--hover-bg); }
    .bg-name {
      font-weight: 600;
      white-space: nowrap;
      padding-right: 0.5rem;
    }
    .bg-val {
      font-size: 0.65rem;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .total-row {
      font-weight: 600;
      cursor: default;
    }
    .total-row:hover { background: none; }
    .energy { color: var(--res-energy); }
    .minerals { color: var(--res-minerals); }
    .alloys { color: var(--res-alloys); }
    .credits { color: var(--res-credits); }
  `,
})
export class FleetPanelComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);
  private readonly camera = inject(CameraService);
  private readonly audio = inject(AudioService);
  private readonly el = inject(ElementRef);

  readonly activeList = signal<ActiveList>(null);
  readonly selectedUnitId = this.selection.selectedUnit;

  private groupUnits(filter: (type: string) => boolean): UnitGroup[] {
    const units = this.selection.ownedUnits();
    const groups = new Map<string, UnitData[]>();
    for (const u of units) {
      if (!filter(u.type)) continue;
      const list = groups.get(u.type);
      if (list) list.push(u);
      else groups.set(u.type, [u]);
    }
    return [...groups.entries()].map(([type, units]) => ({ type, units }));
  }

  readonly militaryGroups = computed(() => this.groupUnits(t => !INDUSTRIAL_TYPES.has(t)));
  readonly industrialGroups = computed(() => this.groupUnits(t => INDUSTRIAL_TYPES.has(t)));
  readonly militaryCount = computed(() => this.militaryGroups().reduce((n, g) => n + g.units.length, 0));
  readonly industrialCount = computed(() => this.industrialGroups().reduce((n, g) => n + g.units.length, 0));

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

  readonly buildingCount = computed(() => this.buildingEntries().length);

  readonly totalIncome = computed<Partial<Resources> | null>(() => {
    const entries = this.buildingEntries();
    if (entries.length === 0) return null;
    const total: Resources = { ...ZERO_RESOURCES };
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

  onDocumentClick(event: PointerEvent): void {
    if (this.activeList() && !this.el.nativeElement.contains(event.target)) {
      this.activeList.set(null);
    }
  }

  toggle(list: ActiveList): void {
    this.audio.playClick();
    this.activeList.update(v => v === list ? null : list);
  }

  selectUnit(unit: UnitData): void {
    this.audio.playClick();
    this.selection.selectUnit(unit.id);
    const { x, y } = hexToPixel(unit.q, unit.r, 30);
    this.camera.centerOn(x, y);
  }

  selectBuilding(building: BuildingData): void {
    this.audio.playClick();
    const { x, y } = hexToPixel(building.q, building.r, 30);
    this.camera.centerOn(x, y);
    this.selection.selectHex({ q: building.q, r: building.r, s: -building.q - building.r });
  }
}
