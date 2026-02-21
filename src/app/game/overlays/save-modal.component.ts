import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

export type SaveModalResult = 'save' | 'discard' | 'cancel';

@Component({
  selector: 'app-save-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
  template: `
    @if (visible()) {
      <div class="backdrop" (click)="onCancel()">
        <div class="panel" (click)="$event.stopPropagation()">
          <h2>Game in progress</h2>
          <p>Save before leaving?</p>
          <div class="actions">
            <button class="btn save" (click)="onSave()">Save & Leave</button>
            <button class="btn discard" (click)="onDiscard()">Leave without saving</button>
            <button class="btn cancel" (click)="onCancel()">Cancel</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.6);
    }
    .panel {
      background: var(--panel-bg-solid);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius);
      padding: 1.5rem 2rem;
      min-width: 320px;
      max-width: 400px;
      text-align: center;
    }
    h2 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      color: var(--text-primary);
    }
    p {
      margin: 0 0 1.25rem;
      font-size: 0.9rem;
      color: var(--text-secondary);
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .btn {
      padding: 0.5rem 1rem;
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius-sm);
      font-size: 0.85rem;
      cursor: pointer;
      background: var(--hover-bg);
      color: var(--text-primary);
      transition: background 0.15s;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    .btn.save {
      background: rgba(56, 189, 248, 0.15);
      border-color: #38bdf8;
      color: #38bdf8;
    }
    .btn.save:hover {
      background: rgba(56, 189, 248, 0.25);
    }
    .btn.discard {
      color: var(--accent-red);
      border-color: var(--accent-red);
      background: rgba(248, 113, 113, 0.08);
    }
    .btn.discard:hover {
      background: rgba(248, 113, 113, 0.18);
    }
    .btn.cancel {
      color: var(--text-secondary);
      border-color: transparent;
      background: none;
    }
    .btn.cancel:hover {
      background: rgba(255, 255, 255, 0.05);
    }
  `,
})
export class SaveModalComponent {
  readonly visible = signal(false);
  private resolver: ((result: SaveModalResult) => void) | null = null;

  open(): Promise<SaveModalResult> {
    this.visible.set(true);
    return new Promise<SaveModalResult>((resolve) => {
      this.resolver = resolve;
    });
  }

  protected onSave(): void {
    this.resolve('save');
  }

  protected onDiscard(): void {
    this.resolve('discard');
  }

  protected onCancel(): void {
    this.resolve('cancel');
  }

  private resolve(result: SaveModalResult): void {
    if (!this.resolver) return;
    this.visible.set(false);
    this.resolver(result);
    this.resolver = null;
  }
}
