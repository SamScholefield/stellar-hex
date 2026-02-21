import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';

@Component({
  selector: 'app-unit-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe],
  template: `
    @if (unitData(); as unit) {
      <div class="panel">
        <div class="header">
          <span class="unit-type">{{ unit.type | formatName }}</span>
          <span class="owner">{{ unit.ownerId }}</span>
        </div>
        <div class="stats">
          <div class="stat">
            <span class="label">HP</span>
            <div class="bar-bg">
              <div class="bar-fill hp" [style.width.%]="(unit.health / unit.maxHealth) * 100"></div>
            </div>
            <span class="val">{{ unit.health }}/{{ unit.maxHealth }}</span>
          </div>
          <div class="stat">
            <span class="label">MP</span>
            <div class="bar-bg">
              <div class="bar-fill mp" [style.width.%]="(unit.movementPoints / unit.maxMovementPoints) * 100"></div>
            </div>
            <span class="val">{{ unit.movementPoints }}/{{ unit.maxMovementPoints }}</span>
          </div>
        </div>
        <div class="combat-stats">
          <span class="cs">ATK {{ unit.attack }}</span>
          <span class="cs">DEF {{ unit.defense }}</span>
          <span class="cs">RNG {{ unit.range }}</span>
          <span class="cs">VIS {{ unit.sightRange }}</span>
        </div>
        <div class="coords">{{ unit.q }}, {{ unit.r }}</div>
      </div>
    }
  `,
  styles: `
    .panel {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius);
      padding: 0.75rem 1rem;
      min-width: 180px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .unit-type {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      text-transform: capitalize;
    }
    .owner {
      font-size: 0.7rem;
      color: var(--text-muted);
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
    .bar-fill.hp { background: #22c55e; }
    .bar-fill.mp { background: #3b82f6; }
    .val {
      font-size: 0.7rem;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      width: 36px;
      text-align: right;
    }
    .combat-stats {
      display: flex;
      gap: 0.6rem;
      margin-bottom: 0.35rem;
    }
    .cs {
      font-size: 0.7rem;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .coords {
      font-size: 0.7rem;
      color: var(--text-muted);
    }
  `,
})
export class UnitInfoPanelComponent {
  private readonly selection = inject(SelectionService);

  readonly unitData = this.selection.selectedUnitData;

}
