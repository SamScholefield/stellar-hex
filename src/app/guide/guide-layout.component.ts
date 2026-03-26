import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GUIDE_CATEGORIES, searchEntries } from './guide-data';

@Component({
  selector: 'app-guide-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styleUrl: './guide-layout.component.scss',
  template: `
    <div class="shell">
      <header class="top-bar">
        <button class="back-btn" (click)="goBack()">&larr;</button>
        <h1 class="guide-title">Guide</h1>
        <input
          class="search-input"
          type="text"
          placeholder="Search..."
          [value]="searchQuery()"
          (input)="onSearch($event)"
        />
      </header>
      <nav class="sidebar">
        <a
          class="nav-item"
          routerLink="/guide"
          [routerLinkActiveOptions]="{ exact: true }"
          routerLinkActive="active"
        >Overview</a>
        @for (cat of categories; track cat.id) {
          <a class="nav-item" [routerLink]="['/guide', cat.id]" routerLinkActive="active">{{ cat.title }}</a>
        }
      </nav>
      <main class="content">
        @if (searchResults().length > 0) {
          <div class="search-results panel-solid">
            <h2>Search Results</h2>
            @for (entry of searchResults(); track entry.id) {
              <a class="search-item" [routerLink]="['/guide', entry.category, entry.id]" (click)="clearSearch()">
                <span class="search-cat">{{ entry.category }}</span>
                <span class="search-title">{{ entry.title }}</span>
                <span class="search-summary">{{ entry.summary }}</span>
              </a>
            }
          </div>
        } @else {
          <router-outlet />
        }
      </main>
    </div>
  `,
})
export class GuideLayoutComponent {
  private readonly router = inject(Router);
  readonly categories = GUIDE_CATEGORIES;
  readonly searchQuery = signal('');

  readonly fromGame = computed(() => {
    const url = this.router.url;
    return url.includes('from=game');
  });

  readonly searchResults = computed(() => {
    const q = this.searchQuery();
    return q.length >= 2 ? searchEntries(q) : [];
  });

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  goBack(): void {
    if (this.fromGame()) {
      this.router.navigate(['/game']);
    } else {
      this.router.navigate(['/menu']);
    }
  }
}
