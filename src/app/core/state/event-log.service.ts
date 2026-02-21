import { Injectable, signal } from '@angular/core';

export interface GameEvent {
  turn: number;
  message: string;
  q?: number;
  r?: number;
}

const MAX_EVENTS = 100;

@Injectable({ providedIn: 'root' })
export class EventLogService {
  private readonly _events = signal<GameEvent[]>([]);
  readonly events = this._events.asReadonly();

  push(event: GameEvent): void {
    this._events.update((list) => {
      const updated = [...list, event];
      return updated.length > MAX_EVENTS ? updated.slice(-MAX_EVENTS) : updated;
    });
  }

  clear(): void {
    this._events.set([]);
  }
}
