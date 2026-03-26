import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GuideStatTable } from './guide-data';

@Component({
  selector: 'app-guide-stat-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './guide.component.scss',
  template: `
    <div class="table-wrap">
      <table class="guide-table">
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
})
export class GuideStatTableComponent {
  readonly table = input.required<GuideStatTable>();
  readonly linkClicked = output<{ id: string; category?: string }>();
}
