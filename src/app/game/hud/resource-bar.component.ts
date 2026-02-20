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
    .bar {
      display: flex;
      gap: 1.25rem;
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.4rem 1rem;
    }
    .res {
      font-size: 0.8rem;
      color: #e0e0e0;
      font-variant-numeric: tabular-nums;
    }
    .label {
      color: #9ca3af;
      margin-right: 0.25rem;
    }
    .income {
      font-size: 0.7rem;
      color: #6b7280;
      margin-left: 0.15rem;
    }
    .income.positive {
      color: #5eead4;
    }
  `,
})
export class ResourceBarComponent {
  private readonly gameState = inject(GameStateService);
  private readonly economy = inject(EconomyService);
  readonly resources = this.gameState.resources;
  readonly inc = this.economy.income;
}
