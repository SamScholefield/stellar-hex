import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { getEntriesByCategory, GUIDE_CATEGORIES, GUIDE_COMPARISON_TABLES, GuideCategory } from './guide-data';
import { GuideStatTableComponent } from './guide-stat-table.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-guide-category-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GuideStatTableComponent],
  template: `
    @if (categoryInfo(); as info) {
      <h2 class="page-title">{{ info.title }}</h2>
      <p class="page-desc">{{ info.description }}</p>

      @if (comparisonTable(); as table) {
        <div class="comparison panel-solid">
          <h3>Comparison</h3>
          <app-guide-stat-table [table]="table" (linkClicked)="onLinkClicked($event)" />
        </div>
      }

      <div class="entry-list">
        @for (entry of entries(); track entry.id) {
          <a class="entry-card" [routerLink]="['/guide', category(), entry.id]">
            <span class="entry-title">{{ entry.title }}</span>
            <span class="entry-summary">{{ entry.summary }}</span>
          </a>
        }
      </div>
    }
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
    .comparison {
      margin-bottom: 1.5rem;
      padding: 1rem;
    }
    .comparison h3 {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
      margin: 0 0 0.75rem;
    }
    .entry-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .entry-card {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      border: 1px solid rgba(255, 255, 255, 0.06);
      text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
    }
    .entry-card:hover {
      border-color: rgba(94, 234, 212, 0.25);
      background: rgba(94, 234, 212, 0.04);
    }
    .entry-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
    }
    .entry-summary {
      font-size: 0.78rem;
      color: var(--text-secondary, #9ca3af);
      line-height: 1.4;
    }
  `,
})
export class CategoryListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly category = toSignal(
    this.route.paramMap.pipe(map(p => p.get('category') as GuideCategory)),
    { initialValue: 'units' as GuideCategory }
  );

  readonly categoryInfo = computed(() => {
    const cat = this.category();
    return GUIDE_CATEGORIES.find(c => c.id === cat) ?? null;
  });

  readonly entries = computed(() => {
    const cat = this.category();
    return cat ? getEntriesByCategory(cat) : [];
  });

  readonly comparisonTable = computed(() => {
    const cat = this.category();
    return cat ? (GUIDE_COMPARISON_TABLES[cat] ?? null) : null;
  });

  onLinkClicked(event: { id: string; category?: string }): void {
    const cat = event.category ?? this.category();
    this.router.navigate(['/guide', cat, event.id]);
  }
}
