import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { GameStateService } from '../core/state/game-state.service';
import { GameSaveService } from '../core/state/game-save.service';
import { GameComponent } from './game.component';

export const gameGuard: CanDeactivateFn<GameComponent> = () => {
  const gameState = inject(GameStateService);
  const saveSvc = inject(GameSaveService);

  if (gameState.players().length === 0) return true;

  if (window.confirm('Game in progress. Save before leaving?')) {
    saveSvc.save();
  }

  return true;
};
