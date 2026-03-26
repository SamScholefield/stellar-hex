import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GUIDE_CATEGORIES, getEntriesByCategory } from './guide-data';

@Component({
  selector: 'app-guide-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styleUrl: './guide.component.scss',
  template: `
    <h2 class="page-title">Welcome to the Guide</h2>
    <p class="page-desc">Everything you need to know about Stellar Hex — units, buildings, weapons, research, and game mechanics.</p>
    <div class="category-grid">
      @for (cat of categories; track cat.id) {
        <a class="category-card panel-solid" [routerLink]="['/guide', cat.id]">
          <span class="card-title">{{ cat.title }}</span>
          <span class="card-desc">{{ cat.description }}</span>
          <span class="card-count">{{ entryCounts[cat.id] }} entries</span>
        </a>
      }
    </div>
  `,
})
export class GuideIndexComponent {
  readonly categories = GUIDE_CATEGORIES;
  readonly entryCounts: Record<string, number> = Object.fromEntries(
    GUIDE_CATEGORIES.map(c => [c.id, getEntriesByCategory(c.id).length])
  );
}
