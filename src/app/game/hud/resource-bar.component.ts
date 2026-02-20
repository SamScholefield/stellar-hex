import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-resource-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <span class="res">Energy: --</span>
      <span class="res">Minerals: --</span>
      <span class="res">Alloys: --</span>
      <span class="res">Credits: --</span>
    </div>
  `,
  styles: `
    .bar {
      display: flex;
      gap: 1.25rem;
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.4rem 1rem;
    }
    .res {
      font-size: 0.8rem;
      color: #9ca3af;
    }
  `,
})
export class ResourceBarComponent {}
