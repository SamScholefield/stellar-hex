import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
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
      <div class="menu-panel">
        <button class="collapsible-header" (click)="toggle()">
          <span class="collapsible-arrow">{{ collapsed() ? '\u25B6' : '\u25BC' }}</span>
          Build
        </button>
        @if (!collapsed()) {
          @for (opt of options(); track opt.type) {
            <button
              class="menu-option"
              [class.disabled]="!opt.affordable"
              [disabled]="!opt.affordable"
              (click)="onBuild(opt.type)"
            >
              <span class="menu-option-name">{{ opt.type | formatName }}</span>
              <span class="yield">
                @for (y of yieldEntries(opt.stats); track y.key) {
                  <span class="yield-item">+{{ y.value }} {{ y.key }}</span>
                }
              </span>
              <span class="cost-row">
                @for (c of costEntries(opt.stats); track c.key) {
                  <span class="cost-item" [class.sufficient]="c.current >= c.value">{{ c.current }}/{{ c.value }} {{ c.key }}</span>
                }
              </span>
            </button>
          }
        }
      </div>
    }
  `,
  styles: `
    .menu-option-name {
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
  `,
})
export class BuildMenuComponent {
  private readonly gameState = inject(GameStateService);
  private readonly audio = inject(AudioService);

  readonly collapsed = signal(false);
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

  toggle(): void {
    this.audio.playClick();
    this.collapsed.update(v => !v);
  }

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
