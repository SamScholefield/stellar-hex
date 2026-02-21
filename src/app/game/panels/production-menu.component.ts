import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BuildingData, Resources, UnitType, UNIT_STATS, UnitStats } from '../../models/game-state';
import { GameStateService } from '../../core/state/game-state.service';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';
import { ProductionQueueComponent } from './production-queue.component';

interface ProductionOption {
  unitType: UnitType;
  stats: UnitStats;
  affordable: boolean;
}

@Component({
  selector: 'app-production-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe, ProductionQueueComponent],
  template: `
    @if (building(); as b) {
      <div class="menu">
        <div class="title">Production — {{ b.type | formatName }}</div>
        @if (isHome()) {
          <div class="home-label">&#9733; Home Base</div>
        } @else {
          <button class="set-home-btn" (click)="setHomeSelected.emit()">Set as Home</button>
        }

        <app-production-queue [items]="queue()" />

        <div class="produce-title">Produce Unit</div>
        @for (opt of options(); track opt.unitType) {
          <button
            class="produce-option"
            [class.disabled]="!opt.affordable"
            [disabled]="!opt.affordable"
            (click)="onProduce(opt.unitType)"
          >
            <span class="name">{{ opt.unitType | formatName }}</span>
            <span class="cost">
              @for (c of costEntries(opt.stats); track c.key) {
                <span class="cost-item">{{ c.value }} {{ c.key }}</span>
              }
            </span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    .menu {
      background: rgba(10, 10, 26, 0.92);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.5rem;
      min-width: 180px;
      margin-top: 0.5rem;
    }
    .title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
      padding: 0 0.25rem;
    }
    app-production-queue {
      display: block;
      margin-bottom: 0.5rem;
    }
    .produce-title {
      font-size: 0.7rem;
      color: #6b7280;
      margin-bottom: 0.15rem;
      padding: 0 0.25rem;
    }
    .produce-option {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      width: 100%;
      padding: 0.35rem 0.5rem;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 0.375rem;
      cursor: pointer;
      color: #e0e0e0;
      text-align: left;
      margin-bottom: 0.25rem;
      transition: background 0.15s;
    }
    .produce-option:hover:not(:disabled) {
      background: #374151;
    }
    .produce-option.disabled {
      opacity: 0.4;
      cursor: default;
    }
    .name {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: capitalize;
    }
    .cost {
      display: flex;
      gap: 0.5rem;
    }
    .cost-item {
      font-size: 0.7rem;
      color: #f87171;
    }
    .home-label {
      font-size: 0.75rem;
      color: #fbbf24;
      padding: 0.2rem 0.25rem;
      margin-bottom: 0.25rem;
    }
    .set-home-btn {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      margin-bottom: 0.25rem;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 0.375rem;
      color: #9ca3af;
      cursor: pointer;
      transition: background 0.15s;
    }
    .set-home-btn:hover {
      background: #374151;
      color: #e0e0e0;
    }
  `,
})
export class ProductionMenuComponent {
  private readonly gameState = inject(GameStateService);

  readonly building = input.required<BuildingData | null>();
  readonly homeBaseId = input<string | null>(null);
  readonly produceSelected = output<UnitType>();
  readonly setHomeSelected = output<void>();

  readonly isHome = computed(() => {
    const b = this.building();
    const hid = this.homeBaseId();
    return b != null && hid != null && b.id === hid;
  });

  readonly queue = computed(() => this.building()?.productionQueue ?? []);

  readonly options = computed<ProductionOption[]>(() => {
    const resources = this.gameState.resources();
    const result: ProductionOption[] = [];
    for (const [unitType, stats] of Object.entries(UNIT_STATS) as [UnitType, UnitStats][]) {
      const affordable = resources != null && canAfford(resources, stats.cost);
      result.push({ unitType, stats, affordable });
    }
    return result;
  });

  costEntries(stats: UnitStats): { key: string; value: number }[] {
    return Object.entries(stats.cost)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k, value: v! }));
  }

  onProduce(unitType: UnitType): void {
    this.produceSelected.emit(unitType);
  }
}

function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (resources.energy >= (cost.energy ?? 0))
    && (resources.minerals >= (cost.minerals ?? 0))
    && (resources.alloys >= (cost.alloys ?? 0))
    && (resources.credits >= (cost.credits ?? 0));
}
