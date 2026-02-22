import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { EventLogService, GameEvent } from '../../core/state/event-log.service';
import { AudioService } from '../../core/audio/audio.service';
import { CameraService } from '../../core/camera/camera.service';
import { hexToPixel } from '../../shared/hex/hex-math';

interface FeedItem {
  id: number;
  event: GameEvent;
  expiring: boolean;
}

const FEED_MAX = 4;
const DISPLAY_MS = 3000;
const FADE_MS = 300;
const STAGGER_MS = 600;

let nextId = 0;

@Component({
  selector: 'app-event-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="feed">
      @for (item of items(); track item.id) {
        <div class="feed-item" [class.expiring]="item.expiring" [class.ai]="isAI(item.event)">
          @if (item.event.q != null) {
            <a class="msg link" (click)="goTo(item.event)">{{ item.event.message }}</a>
          } @else {
            <span class="msg">{{ item.event.message }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .feed {
      display: flex;
      flex-direction: column-reverse;
      align-items: end;
      gap: 2px;
      pointer-events: none;
    }
    .feed-item {
      padding: 0.2rem 0.5rem;
      font-size: 1.5rem;
      background: transparent;
      color: var(--text-body);
      pointer-events: auto;
      animation: slide-in 0.33s ease-in;
      transition: opacity 0.66s ease-out;
      opacity: 0.5;
    }
    .feed-item.expiring {
      opacity: 0;
    }
    .turn {
      color: var(--accent-blue);
      margin-right: 0.35rem;
      font-weight: 600;
    }
    .msg {
      color: var(--text-body);
    }
    .feed-item.ai .msg {
      color: var(--accent-amber);
    }
    .msg.link {
      cursor: pointer;
      color: var(--accent-teal);
      text-decoration: none;
    }
    .feed-item.ai .msg.link {
      color: var(--accent-amber);
    }
    .msg.link:hover {
      text-decoration: underline;
    }
    @keyframes slide-in {
      from {
        text-shadow:
          0 0 5px #fff,
          0 0 10px #fff,
          0 0 20px #0f0;
        opacity: 1;
      }
      to {
        text-shadow:
          0 0 2px #fff,
          0 0 5px #fff,
          0 0 10px #0f0;
        opacity: 0.6;
      }
    }
  `,
})
export class EventFeedComponent {
  private readonly eventLog = inject(EventLogService);
  private readonly audio = inject(AudioService);
  private readonly camera = inject(CameraService);

  private readonly _items = signal<FeedItem[]>([]);
  readonly items = this._items.asReadonly();

  private prevLength = 0;
  private readonly queue: GameEvent[] = [];
  private draining = false;

  constructor() {
    effect(() => {
      const events = this.eventLog.events();
      const newCount = events.length - this.prevLength;
      if (newCount <= 0) {
        if (events.length === 0) {
          this._items.set([]);
          this.queue.length = 0;
        }
        this.prevLength = events.length;
        return;
      }
      this.prevLength = events.length;

      const newEvents = events.slice(-newCount);
      this.queue.push(...newEvents);
      this.drainQueue();
    });
  }

  private drainQueue(): void {
    if (this.draining || this.queue.length === 0) return;
    this.draining = true;
    this.showNext();
  }

  private showNext(): void {
    const event = this.queue.shift();
    if (!event) {
      this.draining = false;
      return;
    }

    const id = nextId++;
    const item: FeedItem = { id, event, expiring: false };

    this._items.update((list) => {
      const next = [...list, item];
      return next.length > FEED_MAX ? next.slice(-FEED_MAX) : next;
    });

    // Start fade-out after display time
    setTimeout(() => {
      this._items.update((list) => list.map((i) => (i.id === id ? { ...i, expiring: true } : i)));
      setTimeout(() => {
        this._items.update((list) => list.filter((i) => i.id !== id));
      }, FADE_MS);
    }, DISPLAY_MS);

    // Stagger: show next item after a delay
    setTimeout(() => this.showNext(), STAGGER_MS);
  }

  isAI(event: GameEvent): boolean {
    return event.message.startsWith('[AI]');
  }

  goTo(event: GameEvent): void {
    if (event.q != null && event.r != null) {
      this.audio.playClick();
      const { x, y } = hexToPixel(event.q, event.r, 30);
      this.camera.centerOn(x, y);
    }
  }
}
