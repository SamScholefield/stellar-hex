import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { getEntryById, GuideCategory } from './guide-data';
import { GuideStatTableComponent } from './guide-stat-table.component';

@Component({
  selector: 'app-guide-entry-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GuideStatTableComponent],
  template: `
    @if (entry(); as e) {
      <div class="breadcrumb">
        <a routerLink="/guide">Guide</a>
        <span class="sep">/</span>
        <a [routerLink]="['/guide', category()]">{{ categoryLabel() }}</a>
        <span class="sep">/</span>
        <span class="current">{{ e.title }}</span>
      </div>

      <h2 class="entry-title">{{ e.title }}</h2>
      <p class="entry-summary">{{ e.summary }}</p>

      @if (e.prose) {
        <div class="prose">
          @for (p of e.prose; track $index) {
            <p>{{ p }}</p>
          }
        </div>
      }

      @if (e.statTables) {
        @for (table of e.statTables; track $index) {
          <div class="stat-section panel-solid">
            <app-guide-stat-table [table]="table" (linkClicked)="onLinkClicked($event)" />
          </div>
        }
      }

      @if (e.links && e.links.length > 0) {
        <div class="related">
          <span class="related-label">Related:</span>
          @for (link of e.links; track link.id) {
            <a class="related-link" [routerLink]="['/guide', link.category, link.id]">{{ link.label }}</a>
          }
        </div>
      }
    } @else {
      <p class="not-found">Entry not found.</p>
    }
  `,
  styles: `
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      margin-bottom: 1rem;
    }
    .breadcrumb a {
      color: var(--accent-teal, #5eead4);
      text-decoration: none;
    }
    .breadcrumb a:hover {
      text-decoration: underline;
    }
    .sep {
      color: var(--text-muted, #6b7280);
    }
    .current {
      color: var(--text-secondary, #9ca3af);
    }
    .entry-title {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text-primary, #e0e0e0);
      margin: 0 0 0.4rem;
    }
    .entry-summary {
      font-size: 0.9rem;
      color: var(--accent-teal, #5eead4);
      margin: 0 0 1.25rem;
      font-style: italic;
    }
    .prose {
      margin-bottom: 1.25rem;
    }
    .prose p {
      font-size: 0.85rem;
      color: var(--text-primary, #e0e0e0);
      line-height: 1.6;
      margin: 0 0 0.6rem;
    }
    .stat-section {
      padding: 0.75rem 1rem;
      margin-bottom: 1.25rem;
    }
    .related {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .related-label {
      font-size: 0.8rem;
      color: var(--text-secondary, #9ca3af);
      font-weight: 600;
    }
    .related-link {
      font-size: 0.8rem;
      color: var(--accent-teal, #5eead4);
      text-decoration: none;
      padding: 0.2rem 0.6rem;
      border: 1px solid rgba(94, 234, 212, 0.2);
      border-radius: 1rem;
      transition: background 0.15s, border-color 0.15s;
    }
    .related-link:hover {
      background: rgba(94, 234, 212, 0.08);
      border-color: rgba(94, 234, 212, 0.4);
    }
    .not-found {
      color: var(--text-secondary, #9ca3af);
      font-size: 0.9rem;
    }
  `,
})
export class EntryDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(
    this.route.paramMap.pipe(map(p => ({
      category: p.get('category') as GuideCategory,
      id: p.get('id') ?? '',
    }))),
    { initialValue: { category: 'units' as GuideCategory, id: '' } }
  );

  readonly category = computed(() => this.params().category);

  readonly categoryLabel = computed(() => {
    const cat = this.category();
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  });

  readonly entry = computed(() => {
    const { category, id } = this.params();
    return getEntryById(category, id) ?? null;
  });

  onLinkClicked(event: { id: string; category?: string }): void {
    const cat = event.category ?? this.category();
    this.router.navigate(['/guide', cat, event.id]);
  }
}
