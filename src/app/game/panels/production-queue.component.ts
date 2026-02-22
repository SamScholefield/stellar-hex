import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProductionItem } from '../../models/game-state';
import { FormatNamePipe } from '../../shared/pipes/format-name.pipe';

interface GroupedQueueItem {
  unitType: string;
  count: number;
  nextTurns: number;
}

@Component({
  selector: 'app-production-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNamePipe],
  template: `
    @if (grouped().length > 0) {
      <div class="queue-section">
        <div class="queue-title">Queue</div>
        @for (group of grouped(); track group.unitType) {
          <div class="queue-item">
            <span>{{ group.unitType | formatName }}@if (group.count > 1) { <span class="count">{{ group.count }}</span>}</span>
            <span class="queue-turns">{{ group.nextTurns }} turn{{ group.nextTurns > 1 ? 's' : '' }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .count {
      color: var(--text-secondary);
      font-size: 0.7rem;
      font-weight: 700;
      margin-left: 0.35rem;
    }
  `,
})
export class ProductionQueueComponent {
  readonly items = input.required<ProductionItem[]>();

  readonly grouped = computed<GroupedQueueItem[]>(() => {
    const groups: GroupedQueueItem[] = [];
    for (const item of this.items()) {
      const last = groups[groups.length - 1];
      if (last && last.unitType === item.unitType) {
        last.count++;
      } else {
        groups.push({ unitType: item.unitType, count: 1, nextTurns: item.turnsRemaining });
      }
    }
    return groups;
  });
}
