import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { GameStateService } from '../../core/state/game-state.service';
import { AIService } from '../../core/ai/ai.service';
import { AudioService } from '../../core/audio/audio.service';
import { UndoService } from '../../core/state/undo.service';
import { EventLogService } from '../../core/state/event-log.service';
import { TECH_TREE } from '../../models/game-state';

@Component({
  selector: 'app-turn-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel controls">
      @if (currentPlayer(); as player) {
        <span class="player-dot" [style.background]="player.color"></span>
        <span class="player-name">{{ player.name }}</span>
      }
      <span class="turn">Turn {{ turn() }}</span>
      <div class="action-slot">
        @if (undo.canUndo()) {
          <button class="undo-btn" (click)="undoAction()">Undo</button>
        }
        <button class="btn-primary end-turn" [style.visibility]="aiExecuting() ? 'hidden' : 'visible'" [disabled]="!!gameOver()" (click)="endTurn()">End Turn</button>
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
      color: var(--text-primary);
    }
    .turn {
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .end-turn {
      padding: 0.3rem 0.75rem;
      font-size: 0.8rem;
    }
    .undo-btn {
      padding: 0.3rem 0.6rem;
      font-size: 0.75rem;
      color: var(--accent-amber);
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
      color: var(--accent-amber);
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
  private readonly eventLog = inject(EventLogService);
  readonly undo = inject(UndoService);

  readonly turn = this.gameState.turn;
  readonly currentPlayer = this.gameState.currentPlayer;
  readonly aiExecuting = this.ai.executing;
  readonly gameOver = this.gameState.gameOver;

  undoAction(): void {
    this.audio.playClick();
    this.undo.undo();
  }

  endTurn(): void {
    this.audio.playClick();
    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);

    // Snapshot production queues before END_TURN to detect completions
    const turn = this.gameState.turn();
    const completing: { unitType: string; q: number; r: number }[] = [];
    const researchCompleting: { techName: string; q: number; r: number }[] = [];
    for (const [, b] of this.gameState.buildings()) {
      if (b.productionQueue) {
        for (const item of b.productionQueue) {
          if (item.turnsRemaining === 1) {
            completing.push({ unitType: item.unitType, q: b.q, r: b.r });
          }
        }
      }
      if (b.researchQueue) {
        for (const item of b.researchQueue) {
          if (item.turnsRemaining === 1) {
            researchCompleting.push({
              techName: TECH_TREE[item.techId]?.name ?? item.techId,
              q: b.q,
              r: b.r,
            });
          }
        }
      }
    }

    this.undo.dispatchEndTurn(hexLookup);

    // Log completed production items
    for (const c of completing) {
      const label = c.unitType.replace(/_/g, ' ');
      this.eventLog.push({ turn, message: `${label} construction complete`, q: c.q, r: c.r });
    }

    // Log completed research items
    for (const r of researchCompleting) {
      this.eventLog.push({ turn, message: `Research complete: ${r.techName}`, q: r.q, r: r.r });
    }
  }
}
