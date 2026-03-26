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
          <span class="res-header"><img class="icon" src="icons/energy.svg" alt="" /><span class="label energy">Energy</span></span>
          <span class="res-values">
            <span class="val">{{ r.energy }}</span>
            <span class="breakdown"><span class="inc">{{ income().energy }}</span>@if (upkeep().energy > 0) {<span class="upk">{{ upkeep().energy }}</span>}</span>
          </span>
        </span>
        <span class="res">
          <span class="res-header"><img class="icon" src="icons/minerals.svg" alt="" /><span class="label minerals">Minerals</span></span>
          <span class="res-values">
            <span class="val">{{ r.minerals }}</span>
            <span class="breakdown"><span class="inc">{{ income().minerals }}</span>@if (upkeep().minerals > 0) {<span class="upk">{{ upkeep().minerals }}</span>}</span>
          </span>
        </span>
        <span class="res">
          <span class="res-header"><img class="icon" src="icons/alloys.svg" alt="" /><span class="label alloys">Alloys</span></span>
          <span class="res-values">
            <span class="val">{{ r.alloys }}</span>
            <span class="breakdown"><span class="inc">{{ income().alloys }}</span>@if (upkeep().alloys > 0) {<span class="upk">{{ upkeep().alloys }}</span>}</span>
          </span>
        </span>
        <span class="res">
          <span class="res-header"><img class="icon" src="icons/credits.svg" alt="" /><span class="label credits">Credits</span></span>
          <span class="res-values">
            <span class="val">{{ r.credits }}</span>
            <span class="breakdown"><span class="inc">{{ income().credits }}</span>@if (upkeep().credits > 0) {<span class="upk">{{ upkeep().credits }}</span>}</span>
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
      display: flex;
      gap: 1.25rem;
    }
    .res {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-variant-numeric: tabular-nums;
    }
    .res-header {
      display: flex;
      align-items: center;
      gap: 0.2rem;
    }
    .icon {
      width: 12px;
      height: 12px;
    }
    .label {
      font-size: 0.6rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .label.energy { color: var(--res-energy); }
    .label.minerals { color: var(--res-minerals); }
    .label.alloys { color: var(--res-alloys); }
    .label.credits { color: var(--res-credits); }
    .res-values {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
    }
    .val {
      font-size: 0.85rem;
      color: var(--text-primary);
      font-weight: 600;
    }
    .breakdown {
      font-size: 0.6rem;
    }
    .inc {
      color: var(--accent-teal);
    }
    .upk {
      color: var(--accent-red, #f87171);
      margin-left: 0.1rem;
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
