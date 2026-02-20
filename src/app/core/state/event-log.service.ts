import { Injectable, signal } from '@angular/core';

export interface GameEvent {
  turn: number;
  message: string;
  q?: number;
  r?: number;
}

@Injectable({ providedIn: 'root' })
export class EventLogService {
  private readonly _events = signal<GameEvent[]>([]);
  readonly events = this._events.asReadonly();

  push(event: GameEvent): void {
    this._events.update((list) => [...list, event]);
  }

  clear(): void {
    this._events.set([]);
  }
}
