import { ChangeDetectionStrategy, Component, effect, inject, untracked, viewChild } from '@angular/core';
import { GameViewportComponent } from './viewport/game-viewport.component';
import { HudComponent } from './hud/hud.component';
import { ContextMenuComponent } from './overlays/context-menu.component';
import { CameraService } from '../core/camera/camera.service';
import { SelectionService } from '../core/selection/selection.service';
import { VisionService } from '../core/vision/vision.service';
import { EventLogService } from '../core/state/event-log.service';
import { GameStateService } from '../core/state/game-state.service';
import { ChunkManagerService } from '../core/chunks/chunk-manager.service';

const PAN_STEP = 80;
const ZOOM_STEP = 50;

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameViewportComponent, HudComponent, ContextMenuComponent],
  host: {
    '(contextmenu)': 'onContextMenu($event)',
    '(keydown)': 'onKeyDown($event)',
    tabindex: '0',
  },
  template: `
    <app-game-viewport />
    <app-hud />
    <app-context-menu />
  `,
  styles: `
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      position: relative;
      outline: none;
    }
  `,
})
export class GameComponent {
  private readonly camera = inject(CameraService);
  private readonly selection = inject(SelectionService);
  private readonly vision = inject(VisionService);
  private readonly eventLog = inject(EventLogService);
  private readonly gameState = inject(GameStateService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly contextMenu = viewChild(ContextMenuComponent);
  private lastTurnKey = '';
  private lastDiscoveryId = 0;

  constructor() {
    // Log turn start — only when turn/player actually changes
    effect(() => {
      const turn = this.gameState.turn();
      const player = this.gameState.currentPlayer();
      if (!player) return;

      const key = `${turn}:${player.id}`;
      if (key === this.lastTurnKey) return;
      this.lastTurnKey = key;

      if (player.isAI) {
        this.eventLog.push({ turn, message: `[AI] ${player.name} is thinking...` });
      } else {
        this.eventLog.push({ turn, message: `${player.name}'s turn begins` });
      }
    });

    // Log discovery events — only for human players
    effect(() => {
      const discoveries = this.vision.lastDiscoveries();
      const id = this.vision.discoveryBatchId();
      if (discoveries.length === 0 || id === this.lastDiscoveryId) return;
      this.lastDiscoveryId = id;

      const player = untracked(() => this.gameState.currentPlayer());
      if (!player || player.isAI) return;

      const turn = untracked(() => this.gameState.turn());
      for (const d of discoveries) {
        const hex = untracked(() => this.chunkManager.getHex(d.q, d.r));
        if (hex?.anomaly) {
          const label = hex.anomaly.replace(/_/g, ' ');
          this.eventLog.push({ turn, message: `Discovered ${label}`, q: d.q, r: d.r });
        } else if (hex?.object && hex.object.type !== 'empty') {
          const label = hex.object.subtype
            ? `${hex.object.subtype} ${hex.object.type}`
            : hex.object.type;
          this.eventLog.push({ turn, message: `Discovered ${label.replace(/_/g, ' ')}`, q: d.q, r: d.r });
        }
      }
    });
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu()?.open(event.clientX, event.clientY);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.selection.deselectAll();
        break;
      case 'w':
      case 'W':
      case 'ArrowUp':
        this.camera.panBy(0, PAN_STEP);
        break;
      case 's':
      case 'S':
      case 'ArrowDown':
        this.camera.panBy(0, -PAN_STEP);
        break;
      case 'a':
      case 'A':
      case 'ArrowLeft':
        this.camera.panBy(PAN_STEP, 0);
        break;
      case 'd':
      case 'D':
      case 'ArrowRight':
        this.camera.panBy(-PAN_STEP, 0);
        break;
      case '+':
      case '=':
        this.camera.zoomAt(
          this.camera.canvasWidth() / 2,
          this.camera.canvasHeight() / 2,
          -ZOOM_STEP,
        );
        break;
      case '-':
        this.camera.zoomAt(
          this.camera.canvasWidth() / 2,
          this.camera.canvasHeight() / 2,
          ZOOM_STEP,
        );
        break;
    }
  }
}
