import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { GameStateService } from '../core/state/game-state.service';
import { GameSaveService } from '../core/state/game-save.service';

export const gameActivateGuard: CanActivateFn = () => {
  const gameState = inject(GameStateService);
  if (gameState.players().length > 0) return true;

  const saveSvc = inject(GameSaveService);
  if (saveSvc.hasSave()) {
    saveSvc.load(false);
    return true;
  }

  return inject(Router).createUrlTree(['/menu']);
};

export const gameGuard: CanDeactivateFn<unknown> = () => {
  const gameState = inject(GameStateService);
  const saveSvc = inject(GameSaveService);

  if (gameState.players().length > 0) {
    saveSvc.autoSave();
  }
  return true;
};
