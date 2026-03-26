import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GUIDE_CATEGORIES, getEntriesByCategory } from './guide-data';

@Component({
  selector: 'app-guide-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
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
  styles: `
    .page-title {
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--text-primary, #e0e0e0);
      margin: 0 0 0.5rem;
    }
    .page-desc {
      font-size: 0.85rem;
      color: var(--text-secondary, #9ca3af);
      margin: 0 0 1.5rem;
    }
    .category-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
    }
    .category-card {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding: 1.25rem;
      text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
    }
    .category-card:hover {
      border-color: rgba(94, 234, 212, 0.3);
      background: rgba(94, 234, 212, 0.04);
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-primary, #e0e0e0);
    }
    .card-desc {
      font-size: 0.8rem;
      color: var(--text-secondary, #9ca3af);
      line-height: 1.4;
    }
    .card-count {
      font-size: 0.72rem;
      color: var(--accent-teal, #5eead4);
      margin-top: 0.25rem;
    }
  `,
})
export class GuideIndexComponent {
  readonly categories = GUIDE_CATEGORIES;
  readonly entryCounts: Record<string, number> = Object.fromEntries(
    GUIDE_CATEGORIES.map(c => [c.id, getEntriesByCategory(c.id).length])
  );
}
