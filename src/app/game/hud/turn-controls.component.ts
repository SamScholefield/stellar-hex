import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { GameStateService } from '../../core/state/game-state.service';
import { AIService } from '../../core/ai/ai.service';
import { AudioService } from '../../core/audio/audio.service';
import { UndoService } from '../../core/state/undo.service';

@Component({
  selector: 'app-turn-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="controls">
      @if (currentPlayer(); as player) {
        <span class="player-dot" [style.background]="player.color"></span>
        <span class="player-name">{{ player.name }}</span>
      }
      <span class="turn">Turn {{ turn() }}</span>
      <div class="action-slot">
        @if (undo.canUndo()) {
          <button class="undo-btn" (click)="undoAction()">Undo</button>
        }
        <button class="end-turn" [style.visibility]="aiExecuting() ? 'hidden' : 'visible'" (click)="endTurn()">End Turn</button>
        @if (aiExecuting()) {
          <span class="ai-thinking">AI thinking...</span>
        }
      </div>
    </div>
  `,
  styles: `
    .controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.4rem 1rem;
    }
    .player-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .player-name {
      font-size: 0.85rem;
      color: #e0e0e0;
    }
    .turn {
      font-size: 0.85rem;
      color: #9ca3af;
      font-weight: 600;
    }
    .end-turn {
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
    .end-turn:hover {
      background: #374151;
    }
    .undo-btn {
      padding: 0.3rem 0.6rem;
      font-size: 0.75rem;
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .undo-btn:hover {
      background: rgba(245, 158, 11, 0.2);
    }
    .action-slot {
      display: grid;
    }
    .action-slot > * {
      grid-area: 1 / 1;
      place-self: center;
    }
    .ai-thinking {
      font-size: 0.8rem;
      color: #f59e0b;
      font-weight: 600;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `,
})
export class TurnControlsComponent {
  private readonly gameState = inject(GameStateService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly ai = inject(AIService);
  private readonly audio = inject(AudioService);
  readonly undo = inject(UndoService);

  readonly turn = this.gameState.turn;
  readonly currentPlayer = this.gameState.currentPlayer;
  readonly aiExecuting = this.ai.executing;

  undoAction(): void {
    this.audio.playClick();
    this.undo.undo();
  }

  endTurn(): void {
    this.audio.playClick();
    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    this.undo.dispatchEndTurn(hexLookup);
  }
}
