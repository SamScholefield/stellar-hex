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
            <span class="turns">{{ group.nextTurns }} turn{{ group.nextTurns > 1 ? 's' : '' }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .queue-section {
      padding: 0.25rem;
      background: #111827;
      border-radius: 0.25rem;
    }
    .queue-title {
      font-size: 0.7rem;
      color: #6b7280;
      margin-bottom: 0.15rem;
    }
    .queue-item {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #e0e0e0;
      padding: 0.1rem 0;
    }
    .turns {
      color: #fbbf24;
      font-size: 0.7rem;
    }
    .count {
      color: #9ca3af;
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
