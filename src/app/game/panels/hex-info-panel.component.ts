import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';

@Component({
  selector: 'app-hex-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hexData(); as data) {
      <div class="panel">
        <div class="coords">{{ data.q }}, {{ data.r }}</div>
        @if (data.object; as obj) {
          <div class="type">{{ formatType(obj.type) }}</div>
          @if (obj.subtype) {
            <div class="subtype">{{ obj.subtype }}</div>
          }
          <div class="size">Size: {{ obj.size }}</div>
          @if (obj.resources) {
            <div class="resources">
              @if (obj.resources.energy) {
                <span class="res">Energy: {{ obj.resources.energy }}</span>
              }
              @if (obj.resources.minerals) {
                <span class="res">Minerals: {{ obj.resources.minerals }}</span>
              }
              @if (obj.resources.alloys) {
                <span class="res">Alloys: {{ obj.resources.alloys }}</span>
              }
              @if (obj.resources.credits) {
                <span class="res">Credits: {{ obj.resources.credits }}</span>
              }
            </div>
          }
        } @else {
          <div class="type">Empty Space</div>
        }
      </div>
    }
  `,
  styles: `
    .panel {
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      min-width: 160px;
    }
    .coords {
      font-size: 0.75rem;
      color: #6b7280;
      margin-bottom: 0.25rem;
    }
    .type {
      font-size: 1rem;
      font-weight: 600;
      color: #e0e0e0;
      text-transform: capitalize;
    }
    .subtype {
      font-size: 0.85rem;
      color: #9ca3af;
      text-transform: capitalize;
    }
    .size {
      font-size: 0.8rem;
      color: #9ca3af;
      margin-top: 0.25rem;
    }
    .resources {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .res {
      font-size: 0.8rem;
      color: #5eead4;
    }
  `,
})
export class HexInfoPanelComponent {
  private readonly selection = inject(SelectionService);

  readonly hexData = this.selection.selectedHexData;

  formatType(type: string): string {
    return type.replace(/_/g, ' ');
  }
}
