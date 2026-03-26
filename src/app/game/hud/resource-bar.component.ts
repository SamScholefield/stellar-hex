import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../core/state/game-state.service';
import { EconomyService } from '../../core/economy/economy.service';

@Component({
  selector: 'app-resource-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      @if (resources(); as r) {
        <span class="res">
          <img class="icon" src="icons/energy.svg" alt="Energy" />
          <span class="val">{{ r.energy }}</span>
          <span class="breakdown">
            <span class="inc">{{ income().energy }}</span>
            @if (upkeep().energy > 0) {
              <span class="upk">{{ upkeep().energy }}</span>
            }
          </span>
        </span>
        <span class="res">
          <img class="icon" src="icons/minerals.svg" alt="Minerals" />
          <span class="val">{{ r.minerals }}</span>
          <span class="breakdown">
            <span class="inc">{{ income().minerals }}</span>
            @if (upkeep().minerals > 0) {
              <span class="upk">{{ upkeep().minerals }}</span>
            }
          </span>
        </span>
        <span class="res">
          <img class="icon" src="icons/alloys.svg" alt="Alloys" />
          <span class="val">{{ r.alloys }}</span>
          <span class="breakdown">
            <span class="inc">{{ income().alloys }}</span>
            @if (upkeep().alloys > 0) {
              <span class="upk">{{ upkeep().alloys }}</span>
            }
          </span>
        </span>
        <span class="res">
          <img class="icon" src="icons/credits.svg" alt="Credits" />
          <span class="val">{{ r.credits }}</span>
          <span class="breakdown">
            <span class="inc">{{ income().credits }}</span>
            @if (upkeep().credits > 0) {
              <span class="upk">{{ upkeep().credits }}</span>
            }
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
    }
    .bar {
      display: grid;
      grid-template-columns: auto auto;
      gap: 0.3rem 1.5rem;
    }
    .res {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .icon {
      width: 14px;
      height: 14px;
    }
    .val {
      min-width: 1.5em;
    }
    .breakdown {
      font-size: 0.65rem;
    }
    .inc {
      color: var(--accent-teal);
    }
    .upk {
      color: var(--accent-red, #f87171);
      margin-left: 0.15rem;
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
