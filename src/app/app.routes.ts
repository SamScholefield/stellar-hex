import { Routes } from '@angular/router';
import { gameActivateGuard, gameGuard } from './game/game.guard';
import { authGuard, publicGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/auth', pathMatch: 'full' },
  {
    path: 'auth',
    loadComponent: () => import('./auth/auth-page.component').then((m) => m.AuthPageComponent),
    canActivate: [publicGuard],
  },
  {
    path: 'menu',
    loadComponent: () => import('./menu/menu.component').then((m) => m.MenuComponent),
    canActivate: [authGuard],
  },
  {
    path: 'game',
    loadComponent: () => import('./game/game.component').then((m) => m.GameComponent),
    canActivate: [authGuard, gameActivateGuard],
    canDeactivate: [gameGuard],
  },
  {
    path: 'guide',
    loadChildren: () => import('./guide/guide.routes').then((m) => m.guideRoutes),
  },
  { path: '**', redirectTo: '/auth' },
];
