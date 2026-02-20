import { Routes } from '@angular/router';
import { gameGuard } from './game/game.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/menu', pathMatch: 'full' },
  {
    path: 'menu',
    loadComponent: () => import('./menu/menu.component').then((m) => m.MenuComponent),
  },
  {
    path: 'game',
    loadComponent: () => import('./game/game.component').then((m) => m.GameComponent),
    canDeactivate: [gameGuard],
  },
];
