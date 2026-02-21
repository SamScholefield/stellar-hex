import { inject, Injectable, signal } from '@angular/core';
import { GameStateService } from './game-state.service';
import { SelectionService } from '../selection/selection.service';
import { GameAction } from './actions';
import { GameState } from '../../models/game-state';
import { HexData } from '../../models/hex-data';

const MAX_SNAPSHOTS = 20;

@Injectable({ providedIn: 'root' })
export class UndoService {
  private readonly gameState = inject(GameStateService);
  private readonly selection = inject(SelectionService);
  private snapshots: GameState[] = [];

  readonly canUndo = signal(false);

  /** Push snapshot then dispatch action. */
  dispatch(action: GameAction): void {
    this.pushSnapshot();
    this.gameState.dispatch(action);
  }

  /** Clear undo history then dispatch end turn. */
  dispatchEndTurn(hexLookup: (q: number, r: number) => HexData | null): void {
    this.clearHistory();
    this.gameState.dispatchEndTurn(hexLookup);
  }

  /** Restore previous snapshot. Returns true if undo was performed. */
  undo(): boolean {
    const snapshot = this.snapshots.pop();
    if (!snapshot) return false;
    this.gameState.setState(snapshot);
    this.selection.deselectAll();
    this.canUndo.set(this.snapshots.length > 0);
    return true;
  }

  clearHistory(): void {
    this.snapshots = [];
    this.canUndo.set(false);
  }

  private pushSnapshot(): void {
    this.snapshots.push(this.gameState.getState());
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
    this.canUndo.set(true);
  }
}
