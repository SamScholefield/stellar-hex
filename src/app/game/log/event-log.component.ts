import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { EventLogService, GameEvent } from '../../core/state/event-log.service';
import { AudioService } from '../../core/audio/audio.service';
import { CameraService } from '../../core/camera/camera.service';
import { hexToPixel } from '../../shared/hex/hex-math';

@Component({
  selector: 'app-event-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="log-panel" [class.collapsed]="collapsed()">
      <button class="toggle" (click)="toggle()">
        @if (collapsed()) {
          Log
        } @else {
          Hide
        }
      </button>
      @if (!collapsed()) {
        <div class="entries" #scrollContainer>
          @for (event of recentEvents(); track $index) {
            <div class="entry">
              <span class="turn">T{{ event.turn }}</span>
              @if (event.q != null) {
                <a class="msg link" [class.ai]="isAI(event)" (click)="goTo(event)">{{ event.message }}</a>
              } @else {
                <span class="msg" [class.ai]="isAI(event)">{{ event.message }}</span>
              }
            </div>
          }
          @empty {
            <div class="empty">No events yet.</div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .log-panel {
      width: 100%;
      max-height: 200px;
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .log-panel.collapsed {
      max-height: none;
      width: auto;
    }
    .toggle {
      padding: 0.25rem 0.5rem;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--panel-border);
      cursor: pointer;
      text-align: left;
    }
    .toggle:hover {
      color: var(--text-primary);
    }
    .collapsed .toggle {
      border-bottom: none;
    }
    .entries {
      flex: 1;
      overflow-y: auto;
      padding: 0.25rem;
    }
    .entry {
      font-size: 0.7rem;
      padding: 0.15rem 0.25rem;
      border-bottom: 1px solid var(--divider);
    }
    .turn {
      color: var(--accent-blue);
      margin-right: 0.35rem;
      font-weight: 600;
    }
    .msg {
      color: var(--text-body);
    }
    .msg.ai {
      color: var(--accent-amber);
    }
    .msg.link {
      cursor: pointer;
      color: var(--accent-teal);
      text-decoration: none;
    }
    .msg.link.ai {
      color: var(--accent-amber);
    }
    .msg.link:hover {
      text-decoration: underline;
      color: #99f6e4;
    }
    .msg.link.ai:hover {
      color: #fbbf24;
    }
    .empty {
      font-size: 0.7rem;
      color: var(--text-muted);
      padding: 0.5rem;
      text-align: center;
    }
  `,
})
export class EventLogComponent {
  private readonly eventLog = inject(EventLogService);
  private readonly audio = inject(AudioService);
  private readonly camera = inject(CameraService);
  private readonly scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');

  readonly collapsed = signal(false);
  readonly recentEvents = computed(() => {
    const events = this.eventLog.events();
    return events.slice(-50);
  });

  constructor() {
    effect(() => {
      this.recentEvents();
      const container = this.scrollContainer()?.nativeElement;
      if (container) {
        queueMicrotask(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    });
  }

  toggle(): void {
    this.audio.playClick();
    this.collapsed.update((v) => !v);
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
