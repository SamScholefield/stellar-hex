import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GuideStatTable } from './guide-data';

@Component({
  selector: 'app-guide-stat-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            @for (h of table().headers; track h) {
              <th>{{ h }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of table().rows; track $index) {
            <tr [class.linked]="!!row.linkId" (click)="row.linkId ? linkClicked.emit({ id: row.linkId, category: row.linkCategory }) : null">
              @for (cell of row.cells; track $index) {
                <td>{{ cell }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }
    th {
      text-align: left;
      color: var(--text-secondary, #9ca3af);
      font-weight: 500;
      padding: 0.4rem 0.6rem;
      border-bottom: 1px solid var(--divider, #374151);
      white-space: nowrap;
    }
    td {
      padding: 0.4rem 0.6rem;
      color: var(--text-primary, #e0e0e0);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    tr:nth-child(even) td {
      background: rgba(255, 255, 255, 0.02);
    }
    tr.linked {
      cursor: pointer;
    }
    tr.linked:hover td {
      background: rgba(94, 234, 212, 0.06);
    }
    tr.linked td:first-child {
      color: var(--accent-teal, #5eead4);
    }
  `,
})
export class GuideStatTableComponent {
  readonly table = input.required<GuideStatTable>();
  readonly linkClicked = output<{ id: string; category?: string }>();
}
