import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'app-help-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="backdrop" (click)="visible.set(false)">
        <div class="panel" (click)="$event.stopPropagation()">
          <h2>Keyboard Shortcuts</h2>
          <table>
            <tbody>
              @for (row of shortcuts; track row.key) {
                <tr>
                  <td class="key">{{ row.key }}</td>
                  <td class="desc">{{ row.action }}</td>
                </tr>
              }
            </tbody>
          </table>
          <button class="close-btn" (click)="visible.set(false)">Close</button>
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
      pointer-events: auto;
    }
    .panel {
      background: var(--panel-bg-solid);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius);
      padding: 1.5rem 2rem;
      min-width: 340px;
      max-width: 440px;
    }
    h2 {
      margin: 0 0 1rem;
      font-size: 1.1rem;
      color: var(--text-primary);
      text-align: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    tr {
      border-bottom: 1px solid var(--divider);
    }
    td {
      padding: 0.35rem 0.5rem;
      font-size: 0.8rem;
    }
    .key {
      color: var(--accent-blue);
      font-weight: 600;
      white-space: nowrap;
      width: 40%;
    }
    .desc {
      color: var(--text-body);
    }
    .close-btn {
      display: block;
      margin: 1rem auto 0;
      padding: 0.4rem 1.25rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius-sm);
      cursor: pointer;
    }
    .close-btn:hover {
      background: var(--hover-bg);
      color: var(--text-primary);
    }
  `,
})
export class HelpPanelComponent {
  readonly visible = model(false);

  readonly shortcuts = [
    { key: 'WASD / Arrows', action: 'Pan camera' },
    { key: '+ / -', action: 'Zoom in / out' },
    { key: 'Space (hold)', action: 'Pan mode (drag to pan)' },
    { key: 'Tab / Shift+Tab', action: 'Cycle through owned units' },
    { key: 'B', action: 'Open build menu at selected hex' },
    { key: 'H', action: 'Center on home base' },
    { key: 'Escape', action: 'Deselect / close panels' },
    { key: 'Ctrl+Z', action: 'Undo last action' },
    { key: '?', action: 'Toggle this help panel' },
    { key: 'Double-click', action: 'Center camera on hex' },
  ];
}
