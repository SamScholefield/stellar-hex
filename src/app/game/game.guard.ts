import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { GameStateService } from '../core/state/game-state.service';
import { GameSaveService } from '../core/state/game-save.service';
import { GameComponent } from './game.component';

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

export const gameGuard: CanDeactivateFn<GameComponent> = async (component) => {
  const gameState = inject(GameStateService);
  const saveSvc = inject(GameSaveService);

  if (gameState.players().length === 0) return true;

  const modal = component.saveModal();
  if (!modal) return true;

  const result = await modal.open();

  if (result === 'save') {
    saveSvc.save();
    return true;
  }

  return result === 'discard';
};
