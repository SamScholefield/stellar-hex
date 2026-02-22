import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { CameraService } from '../../core/camera/camera.service';
import { AudioService } from '../../core/audio/audio.service';
import { UnitData } from '../../models/game-state';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';
import { hexToPixel } from '../../shared/hex/hex-math';

interface UnitGroup {
  type: string;
  units: UnitData[];
}

@Component({
  selector: 'app-unit-list-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe],
  template: `
    <div class="panel">
      <button class="collapsible-header" (click)="toggle()">
        <span class="collapsible-arrow">{{ collapsed() ? '\u25B6' : '\u25BC' }}</span>
        Units ({{ totalCount() }})
      </button>
      @if (!collapsed()) {
        <div class="list">
          @for (group of unitGroups(); track group.type) {
            <div class="group-header">{{ group.type | formatName }} ({{ group.units.length }})</div>
            @for (unit of group.units; track unit.id) {
              <button
                class="unit-row"
                [class.selected]="unit.id === selectedUnitId()"
                [class.has-mp]="unit.movementPoints > 0"
                (click)="selectUnit(unit)"
              >
                <span class="unit-name">{{ unit.name }}</span>
                <span class="hp">{{ unit.health }}/{{ unit.maxHealth }}</span>
                <span class="mp" [class.active]="unit.movementPoints > 0">{{ unit.movementPoints > 0 ? unit.movementPoints : 0 }}MP</span>
                <span class="coords">({{ unit.q }},{{ unit.r }})</span>
              </button>
            }
          }
          @empty {
            <div class="panel-empty">No units</div>
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
      max-height: 220px;
      overflow-y: auto;
      padding: 0.15rem;
    }
    .group-header {
      font-size: 0.65rem;
      font-weight: 600;
      color: var(--accent-blue);
      padding: 0.2rem 0.4rem;
      text-transform: capitalize;
    }
    .unit-row {
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
    }
    .unit-row:hover { background: var(--hover-bg); }
    .unit-row.selected { background: var(--selected-bg); }
    .unit-row.has-mp { color: var(--text-primary); }
    .unit-name { font-weight: 600; min-width: 70px; }
    .hp { color: var(--accent-green); }
    .mp { color: var(--text-muted); }
    .mp.active { color: var(--accent-amber); }
    .coords { color: var(--text-muted); margin-left: auto; }
  `,
})
export class UnitListPanelComponent {
  private readonly selection = inject(SelectionService);
  private readonly camera = inject(CameraService);
  private readonly audio = inject(AudioService);

  readonly collapsed = signal(true);
  readonly selectedUnitId = this.selection.selectedUnit;

  readonly unitGroups = computed<UnitGroup[]>(() => {
    const units = this.selection.ownedUnits();
    const groups = new Map<string, UnitData[]>();
    for (const u of units) {
      const list = groups.get(u.type);
      if (list) list.push(u);
      else groups.set(u.type, [u]);
    }
    return [...groups.entries()].map(([type, units]) => ({ type, units }));
  });

  readonly totalCount = computed(() => this.selection.ownedUnits().length);

  toggle(): void {
    this.audio.playClick();
    this.collapsed.update(v => !v);
  }

  selectUnit(unit: UnitData): void {
    this.audio.playClick();
    this.selection.selectUnit(unit.id);
    const { x, y } = hexToPixel(unit.q, unit.r, 30);
    this.camera.centerOn(x, y);
  }
}
