import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../core/state/game-state.service';
import { EconomyService } from '../../core/economy/economy.service';

@Component({
  selector: 'app-resource-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel bar">
      @if (resources(); as r) {
        <span class="res">
          <span class="label">Energy</span> {{ r.energy }}
          <span class="breakdown">
            <span class="inc">+{{ income().energy }}</span>
            @if (upkeep().energy > 0) {
              <span class="upk">-{{ upkeep().energy }}</span>
            }
            <span
              class="net"
              [class.positive]="net().energy > 0"
              [class.negative]="net().energy < 0"
            ></span>
          </span>
        </span>
        <span class="res">
          <span class="label">Minerals</span> {{ r.minerals }}
          <span class="breakdown">
            <span class="inc">+{{ income().minerals }}</span>
            @if (upkeep().minerals > 0) {
              <span class="upk">-{{ upkeep().minerals }}</span>
            }
            <span
              class="net"
              [class.positive]="net().minerals > 0"
              [class.negative]="net().minerals < 0"
            ></span>
          </span>
        </span>
        <span class="res">
          <span class="label">Alloys</span> {{ r.alloys }}
          <span class="breakdown">
            <span class="inc">+{{ income().alloys }}</span>
            @if (upkeep().alloys > 0) {
              <span class="upk">-{{ upkeep().alloys }}</span>
            }
            <span
              class="net"
              [class.positive]="net().alloys > 0"
              [class.negative]="net().alloys < 0"
            ></span>
          </span>
        </span>
        <span class="res">
          <span class="label">Credits</span> {{ r.credits }}
          <span class="breakdown">
            <span class="inc">+{{ income().credits }}</span>
            @if (upkeep().credits > 0) {
              <span class="upk">-{{ upkeep().credits }}</span>
            }
            <span
              class="net"
              [class.positive]="net().credits > 0"
              [class.negative]="net().credits < 0"
            ></span>
          </span>
        </span>
      } @else {
        <span class="res">--</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      pointer-events: auto;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      padding: 0.4rem 1rem;
    }
    .res {
      font-size: 0.8rem;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .label {
      color: var(--text-secondary);
      margin-right: 0.25rem;
    }
    .breakdown {
      font-size: 0.65rem;
      margin-left: 0.2rem;
    }
    .inc {
      color: var(--accent-teal);
    }
    .upk {
      color: var(--accent-red, #f87171);
      margin-left: 0.15rem;
    }
    .net {
      color: var(--text-muted);
      margin-left: 0.15rem;
    }
    .net.positive {
      color: var(--accent-teal);
    }
    .net.negative {
      color: var(--accent-red, #f87171);
    }
  `,
})
export class ResourceBarComponent {
  private readonly gameState = inject(GameStateService);
  private readonly economy = inject(EconomyService);

  readonly resources = computed(() => this.gameState.humanPlayer()?.resources ?? null);
  readonly income = this.economy.humanIncome;
  readonly upkeep = this.economy.humanUpkeep;
  readonly net = this.economy.humanNetIncome;
}
