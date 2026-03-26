import { Routes } from '@angular/router';
import { GuideLayoutComponent } from './guide-layout.component';

export const guideRoutes: Routes = [
  {
    path: '',
    component: GuideLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./guide-index.component').then(m => m.GuideIndexComponent),
      },
      {
        path: ':category',
        loadComponent: () => import('./category-list.component').then(m => m.CategoryListComponent),
      },
      {
        path: ':category/:id',
        loadComponent: () => import('./entry-detail.component').then(m => m.EntryDetailComponent),
      },
    ],
  },
];
