import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStateService } from '../../core/state/game-state.service';

@Component({
  selector: 'app-resource-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      @if (resources(); as r) {
        <span class="res"><span class="label">Energy</span> {{ r.energy }}</span>
        <span class="res"><span class="label">Minerals</span> {{ r.minerals }}</span>
        <span class="res"><span class="label">Alloys</span> {{ r.alloys }}</span>
        <span class="res"><span class="label">Credits</span> {{ r.credits }}</span>
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
  `,
})
export class ResourceBarComponent {
  private readonly gameState = inject(GameStateService);
  readonly resources = this.gameState.resources;
}
