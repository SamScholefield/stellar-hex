import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { GameViewportComponent } from './viewport/game-viewport.component';
import { HudComponent } from './hud/hud.component';
import { ContextMenuComponent } from './overlays/context-menu.component';
import { SaveModalComponent } from './overlays/save-modal.component';
import { HelpPanelComponent } from './overlays/help-panel.component';
import { CameraService } from '../core/camera/camera.service';
import { SelectionService } from '../core/selection/selection.service';
import { EventLogService } from '../core/state/event-log.service';
import { GameStateService } from '../core/state/game-state.service';
import { AIService } from '../core/ai/ai.service';
import { GameSaveService } from '../core/state/game-save.service';
import { UndoService } from '../core/state/undo.service';
import { VisionService } from '../core/vision/vision.service';
import { ChunkManagerService } from '../core/chunks/chunk-manager.service';
import { NotificationService } from '../core/notifications/notification.service';
import { AudioService } from '../core/audio/audio.service';
import { WaypointService } from '../core/state/waypoint.service';
import { ANOMALY_REWARDS } from '../models/game-state';
import { hexToPixel } from '../shared/hex/hex-math';

const PAN_STEP = 80;
const ZOOM_STEP = 50;

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameViewportComponent, HudComponent, ContextMenuComponent, SaveModalComponent, HelpPanelComponent],
  host: {
    '(contextmenu)': 'onContextMenu($event)',
    '(keydown)': 'onKeyDown($event)',
    '(pointerdown)': 'focus()',
    tabindex: '0',
  },
  template: `
    @if (ready()) {
      <app-game-viewport />
      <app-hud [(helpVisible)]="helpVisible" />
      <app-context-menu />
      <app-save-modal />
      <app-help-panel [(visible)]="helpVisible" />
    } @else {
      <div class="loading">
        <div class="spinner"></div>
        <span>Loading game...</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      position: relative;
      outline: none;
      background: #0a0a1a;
    }
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 1rem;
      color: #9ca3af;
      font-size: 1rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #2a4a5a;
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `,
})
export class GameComponent implements OnDestroy {
  private readonly camera = inject(CameraService);
  private readonly selection = inject(SelectionService);
  private readonly vision = inject(VisionService);
  private readonly eventLog = inject(EventLogService);
  private readonly gameState = inject(GameStateService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly ai = inject(AIService);
  private readonly saveSvc = inject(GameSaveService);
  private readonly undoSvc = inject(UndoService);
  private readonly notifications = inject(NotificationService);
  private readonly audio = inject(AudioService);
  private readonly waypointSvc = inject(WaypointService);
  private readonly el = inject(ElementRef);
  private readonly contextMenu = viewChild(ContextMenuComponent);
  readonly saveModal = viewChild(SaveModalComponent);
  readonly helpVisible = signal(false);
  readonly ready = computed(() => this.gameState.players().length > 0);
  private lastTurnKey = '';
  private lastDiscoveryId = 0;
  private static readonly HEX_SIZE = 30;
  private readonly onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.gameState.players().length === 0) return;
    this.saveSvc.save();
    e.preventDefault();
  };

  constructor() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
    afterNextRender(() => this.el.nativeElement.focus());
    // Log turn start — only when turn/player actually changes
    effect(() => {
      const turn = this.gameState.turn();
      const player = this.gameState.currentPlayer();
      if (!player) return;

      const key = `${turn}:${player.id}`;
      if (key === this.lastTurnKey) return;
      this.lastTurnKey = key;

      untracked(() => this.selection.deselectUnits());

      if (player.isAI) {
        this.eventLog.push({ turn, message: `[AI] ${player.name} is thinking...` });
        untracked(() => this.ai.executeTurn(player.id));
      } else {
        this.eventLog.push({ turn, message: `${player.name}'s turn begins` });
        if (turn > 1 && turn % 5 === 0) {
          untracked(() => this.saveSvc.autoSave());
        }
        // Execute persisted waypoints at the start of the human turn
        if (turn > 1) {
          untracked(() => this.waypointSvc.executeAllWaypoints());
        }
      }
    });

    // Discovery effect — detect newly explored anomalies
    effect(() => {
      const batchId = this.vision.discoveryBatchId();
      if (batchId <= this.lastDiscoveryId) return;
      this.lastDiscoveryId = batchId;

      const turn = this.gameState.turn();
      if (turn <= 1) return;

      const discoveries = this.vision.lastDiscoveries();
      untracked(() => {
        for (const d of discoveries) {
          const hex = this.chunkManager.getHex(d.q, d.r);
          if (!hex?.anomaly) continue;
          const info = ANOMALY_REWARDS[hex.anomaly];
          if (!info) continue;

          const id = `anomaly_${d.q}_${d.r}`;
          if (this.gameState.anomalies().has(id)) continue;

          this.gameState.dispatch({
            type: 'DISCOVER_ANOMALY',
            anomaly: { id, type: hex.anomaly, q: d.q, r: d.r },
          });
          this.eventLog.push({ turn, message: `Discovered ${info.name}`, q: d.q, r: d.r });
          this.notifications.show(`Discovered ${info.name}!`, { type: 'info', q: d.q, r: d.r });
          this.audio.playDiscovery();
        }
      });
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  }

  protected focus(): void {
    this.el.nativeElement.focus();
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenu()?.open(event.clientX, event.clientY);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (this.ai.executing()) return;

    // Help panel toggle (works even during AI)
    if (event.key === '?') {
      this.helpVisible.update(v => !v);
      return;
    }

    if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.undoSvc.undo();
      return;
    }

    switch (event.key) {
      case 'Escape':
        if (this.helpVisible()) {
          this.helpVisible.set(false);
        } else {
          // Cancel waypoint if selected unit has one
          const selectedId = this.selection.selectedUnit();
          if (selectedId && this.waypointSvc.getWaypoint(selectedId)) {
            this.waypointSvc.clearWaypoint(selectedId);
            this.notifications.show('Order cancelled', { type: 'info' });
          } else {
            this.selection.deselectAll();
          }
        }
        break;
      case 'Tab': {
        event.preventDefault();
        const dir = event.shiftKey ? -1 : 1;
        const unit = this.selection.selectNextUnit(dir as 1 | -1);
        if (unit) {
          const { x, y } = hexToPixel(unit.q, unit.r, GameComponent.HEX_SIZE);
          this.camera.centerOn(x, y);
        }
        break;
      }
      case 'b':
      case 'B': {
        const coord = this.selection.selectedHexCoord();
        if (coord) {
          const { x, y } = hexToPixel(coord.q, coord.r, GameComponent.HEX_SIZE);
          const screen = this.camera.worldToScreen(x, y);
          const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
          this.contextMenu()?.open(screen.x / dpr, screen.y / dpr);
        }
        break;
      }
      case 'h':
      case 'H': {
        const homeId = this.gameState.homeBaseId();
        if (homeId) {
          const building = this.gameState.buildings().get(homeId);
          if (building) {
            const { x, y } = hexToPixel(building.q, building.r, GameComponent.HEX_SIZE);
            this.camera.centerOn(x, y);
            this.selection.selectHex({ q: building.q, r: building.r, s: -building.q - building.r });
          }
        }
        break;
      }
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
