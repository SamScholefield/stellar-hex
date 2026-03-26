import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GUIDE_CATEGORIES, GuideCategory, searchEntries } from './guide-data';

@Component({
  selector: 'app-guide-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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
          >Overview</a
        >
        @for (cat of categories; track cat.id) {
          <a class="nav-item" [routerLink]="['/guide', cat.id]" routerLinkActive="active">{{
            cat.title
          }}</a>
        }
      </nav>
      <main class="content">
        @if (searchResults().length > 0) {
          <div class="search-results panel-solid">
            <h2>Search Results</h2>
            @for (entry of searchResults(); track entry.id) {
              <a
                class="search-item"
                [routerLink]="['/guide', entry.category, entry.id]"
                (click)="clearSearch()"
              >
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
  styles: `
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background:
        radial-gradient(ellipse at 70% 60%, rgba(94, 234, 212, 0.03) 0%, transparent 50%),
        radial-gradient(ellipse at 30% 30%, rgba(129, 140, 248, 0.03) 0%, transparent 50%),
        linear-gradient(180deg, #0d1117 0%, #0a0a14 40%, #06060c 100%);
      background-color: #06060c;
    }
    :host::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3Cpath d='M28 0L28 66L0 50' fill='none' stroke='rgba(255,255,255,0.02)' stroke-width='1'/%3E%3C/svg%3E");
      background-size: 56px 100px;
      mask-image: radial-gradient(ellipse at 60% 50%, black 0%, transparent 70%);
      -webkit-mask-image: radial-gradient(ellipse at 60% 50%, black 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    .shell {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 180px 1fr;
      grid-template-rows: auto 1fr;
      height: 100%;
    }
    .top-bar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .back-btn {
      background: none;
      border: 1px solid var(--panel-border, #2a4a5a);
      border-radius: 0.375rem;
      color: var(--text-secondary, #9ca3af);
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      cursor: pointer;
      transition:
        color 0.15s,
        border-color 0.15s;
      white-space: nowrap;
    }
    .back-btn:hover {
      color: var(--text-primary, #e0e0e0);
      border-color: var(--accent-teal, #5eead4);
    }
    .guide-title {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text-primary, #e0e0e0);
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin: 0;
    }
    .search-input {
      margin-left: auto;
      padding: 0.35rem 0.75rem;
      font-size: 0.85rem;
      color: var(--text-primary, #e0e0e0);
      background: rgba(31, 41, 55, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 0.375rem;
      outline: none;
      width: 220px;
    }
    .search-input:focus {
      border-color: var(--accent-teal, #5eead4);
    }
    .sidebar {
      grid-column: 1;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      padding: 1rem 0;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      overflow-y: auto;
    }
    .nav-item {
      display: block;
      padding: 0.5rem 1.25rem;
      font-size: 0.85rem;
      color: var(--text-secondary, #9ca3af);
      text-decoration: none;
      border-left: 3px solid transparent;
      transition:
        color 0.15s,
        border-color 0.15s,
        background 0.15s;
    }
    .nav-item:hover {
      color: var(--text-primary, #e0e0e0);
      background: rgba(255, 255, 255, 0.03);
    }
    .nav-item.active {
      color: var(--accent-teal, #5eead4);
      border-left-color: var(--accent-teal, #5eead4);
      background: rgba(94, 234, 212, 0.05);
    }
    .content {
      grid-column: 2;
      grid-row: 2;
      overflow-y: auto;
      padding: 1.5rem 2rem;
    }
    .search-results h2 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
      margin: 0 0 0.75rem;
    }
    .search-item {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      text-decoration: none;
      transition: background 0.15s;
    }
    .search-item:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    .search-cat {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent-teal, #5eead4);
    }
    .search-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
    }
    .search-summary {
      font-size: 0.78rem;
      color: var(--text-secondary, #9ca3af);
    }
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
