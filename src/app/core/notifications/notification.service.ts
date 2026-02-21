import { Injectable, signal } from '@angular/core';

export type ToastType = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  q?: number;
  r?: number;
  timestamp: number;
}

const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 5000;

let nextId = 1;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly toasts = signal<Toast[]>([]);
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(message: string, opts?: { type?: ToastType; q?: number; r?: number }): void {
    const toast: Toast = {
      id: nextId++,
      message,
      type: opts?.type ?? 'info',
      q: opts?.q,
      r: opts?.r,
      timestamp: Date.now(),
    };

    this.toasts.update(list => {
      const updated = [...list, toast];
      return updated.length > MAX_TOASTS ? updated.slice(-MAX_TOASTS) : updated;
    });

    const timer = setTimeout(() => this.dismiss(toast.id), AUTO_DISMISS_MS);
    this.timers.set(toast.id, timer);
  }

  dismiss(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
