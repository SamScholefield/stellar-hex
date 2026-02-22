import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BuildingType, BUILDING_STATS, BuildingStats, Resources } from '../../models/game-state';
import { StellarObjectType } from '../../models/hex-data';
import { GameStateService } from '../../core/state/game-state.service';
import { AudioService } from '../../core/audio/audio.service';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';

interface BuildOption {
  type: BuildingType;
  stats: BuildingStats;
  affordable: boolean;
}

@Component({
  selector: 'app-build-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe],
  template: `
    @if (options().length > 0) {
      <div class="menu">
        <div class="title">Build</div>
        @for (opt of options(); track opt.type) {
          <button
            class="build-option"
            [class.disabled]="!opt.affordable"
            [disabled]="!opt.affordable"
            (click)="onBuild(opt.type)"
          >
            <span class="name">{{ opt.type | formatName }}</span>
            <span class="yield">
              @for (y of yieldEntries(opt.stats); track y.key) {
                <span class="yield-item">+{{ y.value }} {{ y.key }}</span>
              }
            </span>
            <span class="cost">
              @for (c of costEntries(opt.stats); track c.key) {
                <span class="cost-item" [class.sufficient]="c.current >= c.value">{{ c.current }}/{{ c.value }} {{ c.key }}</span>
              }
            </span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    .menu {
      background: var(--panel-bg-solid);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius);
      padding: 0.5rem;
      min-width: 180px;
      margin-top: 0.5rem;
    }
    .title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
      padding: 0 0.25rem;
    }
    .build-option {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      width: 100%;
      padding: 0.35rem 0.5rem;
      background: var(--btn-bg);
      border: 1px solid var(--btn-border);
      border-radius: var(--panel-radius-sm);
      cursor: pointer;
      color: var(--text-primary);
      text-align: left;
      margin-bottom: 0.25rem;
      transition: background 0.15s;
    }
    .build-option:hover:not(:disabled) {
      background: var(--btn-border);
    }
    .build-option.disabled {
      opacity: 0.4;
      cursor: default;
    }
    .name {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: capitalize;
    }
    .yield {
      display: flex;
      gap: 0.5rem;
    }
    .yield-item {
      font-size: 0.7rem;
      color: var(--accent-teal);
    }
    .cost {
      display: flex;
      gap: 0.5rem;
    }
    .cost-item {
      font-size: 0.7rem;
      color: var(--accent-red);
    }
    .cost-item.sufficient {
      color: var(--accent-teal);
    }
  `,
})
export class BuildMenuComponent {
  private readonly gameState = inject(GameStateService);
  private readonly audio = inject(AudioService);

  readonly hexType = input.required<StellarObjectType>();
  readonly buildSelected = output<BuildingType>();

  readonly options = computed<BuildOption[]>(() => {
    const ht = this.hexType();
    const resources = this.gameState.resources();
    const result: BuildOption[] = [];
    for (const [type, stats] of Object.entries(BUILDING_STATS) as [BuildingType, BuildingStats][]) {
      if (!stats.allowedHexTypes.includes(ht)) continue;
      const affordable = resources != null && canAfford(resources, stats.cost);
      result.push({ type, stats, affordable });
    }
    return result;
  });

  yieldEntries(stats: BuildingStats): { key: string; value: number }[] {
    return Object.entries(stats.yield)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k, value: v! }));
  }

  costEntries(stats: BuildingStats): { key: string; value: number; current: number }[] {
    const resources = this.gameState.resources();
    return Object.entries(stats.cost)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k, value: v!, current: (resources as Record<string, number> | null)?.[k] ?? 0 }));
  }

  onBuild(type: BuildingType): void {
    this.audio.playClick();
    this.buildSelected.emit(type);
  }
}

function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (resources.energy >= (cost.energy ?? 0))
    && (resources.minerals >= (cost.minerals ?? 0))
    && (resources.alloys >= (cost.alloys ?? 0))
    && (resources.credits >= (cost.credits ?? 0));
}
