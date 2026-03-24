import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { GameStateService } from '../../core/state/game-state.service';
import { AIService } from '../../core/ai/ai.service';
import { AudioService } from '../../core/audio/audio.service';
import { UndoService } from '../../core/state/undo.service';
import { EventLogService } from '../../core/state/event-log.service';
import { TECH_TREE } from '../../models/game-state';
import { formatName } from '../../shared/pipes/format-name.pipe';

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
        <button
          class="btn-primary end-turn"
          [style.visibility]="aiExecuting() ? 'hidden' : 'visible'"
          [disabled]="!!gameOver()"
          (click)="endTurn()"
        >
          End Turn
        </button>
        @if (aiExecuting()) {
          <span class="ai-thinking">AI thinking...</span>
        }
      </div>
      <button class="exit-btn" (click)="showExitConfirm.set(true)">Menu</button>
    </div>
    @if (showExitConfirm()) {
      <div class="backdrop" (click)="showExitConfirm.set(false)">
        <div class="panel-solid confirm-modal" (click)="$event.stopPropagation()">
          <p>Are you sure you want to leave?</p>
          <div class="confirm-actions mt-2">
            <button class="confirm-cancel" (click)="showExitConfirm.set(false)">Cancel</button>
            <button class="confirm-exit" (click)="confirmExit()">Exit</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      pointer-events: auto;
    }
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
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.4;
      }
    }
    .exit-btn {
      padding: 0.3rem 0.6rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
      background: transparent;
      border: 1px solid #374151;
      border-radius: 0.375rem;
      cursor: pointer;
      transition:
        background 0.15s,
        color 0.15s;
    }
    .exit-btn:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.05);
    }
    .confirm-modal {
      padding: 1.5rem 2rem;
      text-align: center;
      min-width: 260px;
    }
    .confirm-modal p {
      margin: 0 0 0.25rem;
      font-size: 1rem;
      color: var(--text-primary);
      font-weight: 600;
    }
    .confirm-sub {
      font-size: 0.8rem !important;
      font-weight: 400 !important;
      color: var(--text-secondary) !important;
      margin-bottom: 1.25rem !important;
    }
    .confirm-actions {
      margin-top: 1rem;
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .confirm-cancel {
      padding: 0.35rem 1rem;
      font-size: 0.85rem;
      color: var(--text-secondary);
      background: transparent;
      border: 1px solid #4b5563;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .confirm-cancel:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .confirm-exit {
      padding: 0.35rem 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: #f87171;
      background: rgba(248, 113, 113, 0.1);
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .confirm-exit:hover {
      background: rgba(248, 113, 113, 0.2);
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
  private readonly router = inject(Router);
  readonly showExitConfirm = signal(false);

  confirmExit(): void {
    this.audio.playClick();
    this.router.navigate(['/menu']);
  }

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
      const label = formatName(c.unitType);
      this.eventLog.push({ turn, message: `${label} construction complete`, q: c.q, r: c.r });
    }

    // Log completed research items
    for (const r of researchCompleting) {
      this.eventLog.push({ turn, message: `Research complete: ${r.techName}`, q: r.q, r: r.r });
    }
  }
}
