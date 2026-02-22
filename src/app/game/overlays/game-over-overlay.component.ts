import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameStateService } from '../../core/state/game-state.service';

@Component({
  selector: 'app-game-over-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (gameOver(); as go) {
      <div class="backdrop">
        <div class="panel-solid card">
          <h1 [class.victory]="isVictory()" [class.defeat]="!isVictory()">
            {{ isVictory() ? 'VICTORY' : 'DEFEAT' }}
          </h1>
          <p class="winner">{{ winnerName() }}</p>
          <p class="reason">{{ go.reason === 'domination' ? 'Domination Victory' : 'Economic Victory' }}</p>
          <button class="btn-primary menu-btn" (click)="returnToMenu()">Return to Menu</button>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      z-index: 300;
      background: rgba(0, 0, 0, 0.7);
    }
    .card {
      padding: 2.5rem 3rem;
      text-align: center;
      min-width: 320px;
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: 2rem;
      letter-spacing: 0.15em;
    }
    h1.victory {
      color: var(--accent-teal, #5eead4);
    }
    h1.defeat {
      color: var(--accent-red, #f87171);
    }
    .winner {
      margin: 0 0 0.25rem;
      font-size: 1.1rem;
      color: var(--text-primary);
      font-weight: 600;
    }
    .reason {
      margin: 0 0 1.5rem;
      font-size: 0.9rem;
      color: var(--text-secondary);
    }
    .menu-btn {
      padding: 0.5rem 1.5rem;
      font-size: 0.9rem;
    }
  `,
})
export class GameOverOverlayComponent {
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);

  readonly gameOver = computed(() => this.gameState.getState().gameOver);

  readonly winnerName = computed(() => {
    const go = this.gameOver();
    if (!go) return '';
    return this.gameState.playerNames().get(go.winnerId) ?? 'Unknown';
  });

  readonly isVictory = computed(() => {
    const go = this.gameOver();
    if (!go) return false;
    const human = this.gameState.humanPlayer();
    return human ? go.winnerId === human.id : false;
  });

  returnToMenu(): void {
    this.router.navigate(['/menu']);
  }
}
