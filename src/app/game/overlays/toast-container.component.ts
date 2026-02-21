import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService, Toast } from '../../core/notifications/notification.service';
import { CameraService } from '../../core/camera/camera.service';
import { hexToPixel } from '../../shared/hex/hex-math';

@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack">
      @for (toast of notifications.toasts(); track toast.id) {
        <div
          class="toast"
          [class]="'toast toast-' + toast.type"
          [class.clickable]="toast.q != null"
          (click)="onToastClick(toast)"
        >
          <span class="toast-msg">{{ toast.message }}</span>
          <button class="toast-close" (click)="onDismiss($event, toast.id)">&times;</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-stack {
      position: fixed;
      top: 3.5rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 50;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      color: #e0e0e0;
      background: rgba(10, 10, 26, 0.92);
      border: 1px solid #2a4a5a;
      animation: slideIn 0.2s ease-out;
      max-width: 360px;
    }
    .toast.clickable {
      cursor: pointer;
    }
    .toast.clickable:hover {
      background: rgba(20, 20, 40, 0.95);
    }
    .toast-info { border-color: #60a5fa; }
    .toast-success { border-color: #34d399; }
    .toast-warning { border-color: #f59e0b; }
    .toast-danger { border-color: #f87171; }
    .toast-msg { flex: 1; }
    .toast-close {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 1rem;
      padding: 0;
      line-height: 1;
    }
    .toast-close:hover { color: #e0e0e0; }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `,
})
export class ToastContainerComponent {
  readonly notifications = inject(NotificationService);
  private readonly camera = inject(CameraService);

  onToastClick(toast: Toast): void {
    if (toast.q != null && toast.r != null) {
      const { x, y } = hexToPixel(toast.q, toast.r, 30);
      this.camera.centerOn(x, y);
      this.notifications.dismiss(toast.id);
    }
  }

  onDismiss(event: Event, id: number): void {
    event.stopPropagation();
    this.notifications.dismiss(id);
  }
}
