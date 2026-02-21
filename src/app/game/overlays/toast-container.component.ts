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
      border-radius: var(--panel-radius-sm);
      font-size: 0.8rem;
      color: var(--text-primary);
      background: var(--panel-bg-solid);
      border: 1px solid var(--panel-border);
      animation: slideIn 0.2s ease-out;
      max-width: 360px;
    }
    .toast.clickable {
      cursor: pointer;
    }
    .toast.clickable:hover {
      background: rgba(20, 20, 40, 0.95);
    }
    .toast-info { border-color: var(--accent-blue); }
    .toast-success { border-color: var(--accent-green); }
    .toast-warning { border-color: var(--accent-amber); }
    .toast-danger { border-color: var(--accent-red); }
    .toast-msg { flex: 1; }
    .toast-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 1rem;
      padding: 0;
      line-height: 1;
    }
    .toast-close:hover { color: var(--text-primary); }
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
