import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BuildingData, Resources, UnitType, UNIT_STATS, UnitStats } from '../../models/game-state';
import { GameStateService } from '../../core/state/game-state.service';
import { AudioService } from '../../core/audio/audio.service';
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
      <div class="menu-panel">
        <div class="menu-title">Production — {{ b.type | formatName }}</div>
        @if (isHome()) {
          <div class="home-label">&#9733; Home Base</div>
        } @else {
          <button class="set-home-btn" (click)="setHomeSelected.emit()">Set as Home</button>
        }

        <app-production-queue [items]="queue()" />

        <div class="produce-title">Produce Unit</div>
        @for (opt of options(); track opt.unitType) {
          <button
            class="menu-option"
            [class.disabled]="!opt.affordable"
            [disabled]="!opt.affordable"
            (click)="onProduce(opt.unitType)"
          >
            <span class="menu-option-name">{{ opt.unitType | formatName }}</span>
            <span class="cost-row">
              @for (c of costEntries(opt.stats); track c.key) {
                <span class="cost-item">{{ c.value }} {{ c.key }}</span>
              }
              <span class="build-turns">{{ opt.stats.buildTurns }}T</span>
            </span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    app-production-queue {
      display: block;
      margin-bottom: 0.5rem;
    }
    .produce-title {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-bottom: 0.15rem;
      padding: 0 0.25rem;
    }
    .menu-option-name {
      text-transform: capitalize;
    }
    .home-label {
      font-size: 0.75rem;
      color: var(--accent-gold);
      padding: 0.2rem 0.25rem;
      margin-bottom: 0.25rem;
    }
    .set-home-btn {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      margin-bottom: 0.25rem;
      background: var(--btn-bg);
      border: 1px solid var(--btn-border);
      border-radius: var(--panel-radius-sm);
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 0.15s;
    }
    .set-home-btn:hover {
      background: var(--btn-border);
      color: var(--text-primary);
    }
  `,
})
export class ProductionMenuComponent {
  private readonly gameState = inject(GameStateService);
  private readonly audio = inject(AudioService);

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
    this.audio.playClick();
    this.produceSelected.emit(unitType);
  }
}

function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (resources.energy >= (cost.energy ?? 0))
    && (resources.minerals >= (cost.minerals ?? 0))
    && (resources.alloys >= (cost.alloys ?? 0))
    && (resources.credits >= (cost.credits ?? 0));
}
