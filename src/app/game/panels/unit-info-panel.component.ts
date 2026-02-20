import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';

@Component({
  selector: 'app-unit-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (unitData(); as unit) {
      <div class="panel">
        <div class="header">
          <span class="unit-type">{{ formatType(unit.type) }}</span>
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
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
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
      color: #e0e0e0;
      text-transform: capitalize;
    }
    .owner {
      font-size: 0.7rem;
      color: #6b7280;
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
      color: #9ca3af;
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
      color: #9ca3af;
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
      color: #9ca3af;
      font-weight: 600;
    }
    .coords {
      font-size: 0.7rem;
      color: #6b7280;
    }
  `,
})
export class UnitInfoPanelComponent {
  private readonly selection = inject(SelectionService);

  readonly unitData = this.selection.selectedUnitData;

  formatType(type: string): string {
    return type.replace(/_/g, ' ');
  }
}
