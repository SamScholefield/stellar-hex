import { Injectable, signal } from '@angular/core';

export interface GameEvent {
  turn: number;
  message: string;
  q?: number;
  r?: number;
}

const MAX_EVENTS = 100;

export interface GraduatedEvent {
  id: number;
  event: GameEvent;
}

let _gradId = 0;

@Injectable({ providedIn: 'root' })
export class EventLogService {
  private readonly _events = signal<GameEvent[]>([]);
  readonly events = this._events.asReadonly();

  private readonly _pushCount = signal(0);
  /** Monotonic counter incremented on each push. Use to detect new events regardless of array length. */
  readonly pushCount = this._pushCount.asReadonly();

  private readonly _graduatedEvents = signal<GraduatedEvent[]>([]);
  readonly graduatedEvents = this._graduatedEvents.asReadonly();

  push(event: GameEvent): void {
    this._events.update((list) => {
      const updated = [...list, event];
      return updated.length > MAX_EVENTS ? updated.slice(-MAX_EVENTS) : updated;
    });
    this._pushCount.update(n => n + 1);
  }

  graduate(event: GameEvent): void {
    this._graduatedEvents.update((list) => {
      const updated = [{ id: _gradId++, event }, ...list];
      return updated.length > MAX_EVENTS ? updated.slice(0, MAX_EVENTS) : updated;
    });
  }

  clear(): void {
    this._events.set([]);
    this._graduatedEvents.set([]);
  }
}
