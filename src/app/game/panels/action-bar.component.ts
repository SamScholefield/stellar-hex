import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';

@Component({
  selector: 'app-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      @if (hasUnit()) {
        <button class="action move" [class.active]="true">Move</button>
        <button class="action attack" disabled>Attack</button>
      }
      <button class="action end-turn" (click)="endTurn()">End Turn</button>
    </div>
  `,
  styles: `
    .bar {
      display: flex;
      gap: 0.5rem;
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.4rem 0.75rem;
    }
    .action {
      padding: 0.3rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #e0e0e0;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .action:hover:not(:disabled) {
      background: #374151;
    }
    .action:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .action.active {
      border-color: #3b82f6;
      background: #1e3a5f;
    }
    .end-turn {
      margin-left: auto;
    }
  `,
})
export class ActionBarComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);

  readonly hasUnit = computed(() => this.selection.selectedUnit() !== null);

  endTurn(): void {
    this.gameState.dispatch({ type: 'END_TURN' });
    this.selection.deselectAll();
  }
}
