import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../core/state/game-state.service';
import { EconomyService } from '../../core/economy/economy.service';

@Component({
  selector: 'app-resource-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      @if (resources(); as r) {
        <span class="res"><span class="label">Energy</span> {{ r.energy }} <span class="income" [class.positive]="inc().energy > 0">+{{ inc().energy }}</span></span>
        <span class="res"><span class="label">Minerals</span> {{ r.minerals }} <span class="income" [class.positive]="inc().minerals > 0">+{{ inc().minerals }}</span></span>
        <span class="res"><span class="label">Alloys</span> {{ r.alloys }} <span class="income" [class.positive]="inc().alloys > 0">+{{ inc().alloys }}</span></span>
        <span class="res"><span class="label">Credits</span> {{ r.credits }} <span class="income" [class.positive]="inc().credits > 0">+{{ inc().credits }}</span></span>
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
      align-items: center;
      gap: 1.25rem;
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius);
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
    .income {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-left: 0.15rem;
    }
    .income.positive {
      color: var(--accent-teal);
    }
  `,
})
export class ResourceBarComponent {
  private readonly gameState = inject(GameStateService);
  private readonly economy = inject(EconomyService);
  readonly resources = this.gameState.resources;
  readonly inc = this.economy.income;
}
