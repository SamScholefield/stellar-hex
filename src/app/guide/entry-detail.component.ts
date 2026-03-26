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
  styleUrl: './guide.component.scss',
  template: `
    @if (entry(); as e) {
      <div class="breadcrumb">
        <a routerLink="/guide">Guide</a>
        <span class="sep">/</span>
        <a [routerLink]="['/guide', category()]">{{ categoryLabel() }}</a>
        <span class="sep">/</span>
        <span class="current">{{ e.title }}</span>
      </div>

      <h2 class="detail-title">{{ e.title }}</h2>
      <p class="detail-summary">{{ e.summary }}</p>

      @if (e.prose) {
        <div class="prose">
          @for (p of e.prose; track $index) {
            @if (p.startsWith('## ')) {
              <h3 class="prose-heading">{{ p.slice(3) }}</h3>
            } @else if (p.startsWith('• ')) {
              <div class="prose-bullet">
                <span class="bullet-dot"></span>
                <span>{{ p.slice(2) }}</span>
              </div>
            } @else {
              <p>{{ p }}</p>
            }
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
