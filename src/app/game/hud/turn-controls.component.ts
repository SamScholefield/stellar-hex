import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-turn-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="controls">
      <span class="turn">Turn 1</span>
      <button class="end-turn" disabled>End Turn</button>
    </div>
  `,
  styles: `
    .controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.4rem 1rem;
    }
    .turn {
      font-size: 0.85rem;
      color: #e0e0e0;
      font-weight: 600;
    }
    .end-turn {
      padding: 0.3rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #6b7280;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 0.375rem;
      cursor: not-allowed;
    }
  `,
})
export class TurnControlsComponent {}
