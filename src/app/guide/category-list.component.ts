import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { getEntriesByCategory, GUIDE_CATEGORIES, GUIDE_COMPARISON_TABLES, GuideCategory } from './guide-data';
import { GuideStatTableComponent } from './guide-stat-table.component';

@Component({
  selector: 'app-guide-category-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GuideStatTableComponent],
  styleUrl: './guide.component.scss',
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
