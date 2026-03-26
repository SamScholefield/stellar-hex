import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { GameViewportComponent } from './viewport/game-viewport.component';
import { HudComponent } from './hud/hud.component';
import { ClickPopupComponent } from './overlays/click-popup.component';
import { ContextMenuComponent } from './overlays/context-menu.component';
import { HelpPanelComponent } from './overlays/help-panel.component';
import { TradeModalComponent } from './overlays/trade-modal.component';
import { CameraService } from '../core/camera/camera.service';
import { SelectionService } from '../core/selection/selection.service';
import { EventLogService } from '../core/state/event-log.service';
import { GameStateService } from '../core/state/game-state.service';
import { AIService } from '../core/ai/ai.service';
import { GameSaveService } from '../core/state/game-save.service';
import { UndoService } from '../core/state/undo.service';
import { VisionService } from '../core/vision/vision.service';
import { ChunkManagerService } from '../core/chunks/chunk-manager.service';

import { AudioService } from '../core/audio/audio.service';
import { WaypointService } from '../core/state/waypoint.service';
import { InfluenceService } from '../core/influence/influence.service';
import { Router } from '@angular/router';
import { ANOMALY_REWARDS, TRADE_HUB_STARTING_STOCK } from '../models/game-state';
import { HEX_SIZE, hexToPixel, toHexCoord } from '../shared/hex/hex-math';

const PAN_STEP = 80;
const ZOOM_STEP = 50;

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameViewportComponent, HudComponent, ClickPopupComponent, ContextMenuComponent, HelpPanelComponent, TradeModalComponent],
  host: {
    '(contextmenu)': 'onContextMenu($event)',
    '(window:keydown)': 'onKeyDown($event)',
  },
  template: `
    @if (ready()) {
      <app-game-viewport (showClickPopup)="onShowClickPopup($event)" />
      <app-hud [(helpVisible)]="helpVisible" [spectate]="spectate()" />
      @if (spectate()) {
        <div class="spectate-controls">
          <button class="btn-spectate" (click)="gameState.togglePause()">
            {{ paused() ? 'Resume' : 'Pause' }}
          </button>
          <button class="btn-spectate abort" (click)="abortSpectate()">Abort</button>
          <span class="spectate-hint">Space to pause</span>
        </div>
      }
      <app-click-popup />
      <app-context-menu (openTrade)="openTradeModal($event.hubId, $event.unitId)" />
      <app-help-panel [(visible)]="helpVisible" />
      <app-trade-modal [(visible)]="tradeModalVisible" [hubId]="tradeHubId()" [unitId]="tradeUnitId()" />
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
    .spectate-controls {
      position: absolute;
      bottom: 1rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid #374151;
      border-radius: 0.5rem;
      padding: 0.5rem 1rem;
      pointer-events: auto;
      z-index: 10;
    }
    .btn-spectate {
      padding: 0.35rem 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: #e0e0e0;
      background: rgba(94, 234, 212, 0.15);
      border: 1px solid #5eead4;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-spectate:hover {
      background: rgba(94, 234, 212, 0.25);
    }
    .btn-spectate.abort {
      color: #f87171;
      background: rgba(248, 113, 113, 0.1);
      border-color: #f87171;
    }
    .btn-spectate.abort:hover {
      background: rgba(248, 113, 113, 0.2);
    }
    .spectate-hint {
      font-size: 0.72rem;
      color: #6b7280;
    }
  `,
})
export class GameComponent implements OnDestroy {
  private readonly camera = inject(CameraService);
  private readonly selection = inject(SelectionService);
  private readonly vision = inject(VisionService);
  private readonly eventLog = inject(EventLogService);
  protected readonly gameState = inject(GameStateService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly ai = inject(AIService);
  private readonly saveSvc = inject(GameSaveService);
  private readonly undoSvc = inject(UndoService);

  private readonly audio = inject(AudioService);
  private readonly waypointSvc = inject(WaypointService);
  private readonly influenceSvc = inject(InfluenceService);
  private readonly router = inject(Router);
  private readonly el = inject(ElementRef);
  private readonly clickPopup = viewChild(ClickPopupComponent);
  private readonly contextMenu = viewChild(ContextMenuComponent);
  private readonly viewport = viewChild(GameViewportComponent);
  readonly helpVisible = signal(false);
  readonly tradeModalVisible = signal(false);
  readonly tradeHubId = signal<string | null>(null);
  readonly tradeUnitId = signal<string | null>(null);
  readonly ready = computed(() => this.gameState.players().length > 0);
  readonly rendered = computed(() => this.viewport()?.firstDrawComplete() ?? false);
  readonly spectate = this.gameState.spectate;
  readonly paused = this.gameState.paused;
  private lastTurnKey = '';
  private lastDiscoveryId = 0;
  private pendingAI: { playerId: string; turn: number } | null = null;
  private readonly onBeforeUnload = () => {
    if (this.gameState.players().length === 0) return;
    this.saveSvc.autoSave();
  };

  constructor() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
    afterNextRender(() => this.el.nativeElement.focus());

    // Show loading overlay until first canvas paint
    {
      let loader = document.getElementById('app-loader');
      if (!loader) {
        loader = document.createElement('div');
        loader.id = 'app-loader';
        loader.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;background:#0a0a1a;color:#9ca3af;font-family:sans-serif;font-size:1rem;z-index:9999;transition:opacity 0.3s';
        loader.innerHTML = '<div style="width:40px;height:40px;border:3px solid #2a4a5a;border-top-color:#5eead4;border-radius:50%;animation:l-spin 0.8s linear infinite"></div><span>Loading...</span>';
        document.body.appendChild(loader);
      }
      effect(() => {
        if (this.rendered()) {
          untracked(() => {
            // Chain: yield to browser → wait for paint → yield again → fade out
            // This ensures the canvas is actually composited on screen
            setTimeout(() => {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  const el = document.getElementById('app-loader');
                  if (el) {
                    el.style.opacity = '0';
                    setTimeout(() => el.remove(), 300);
                  }
                }, 100);
              });
            }, 0);
          });
        }
      });
    }
    // Log turn start — only when turn/player actually changes
    effect(() => {
      const turn = this.gameState.turn();
      const player = this.gameState.currentPlayer();
      if (!player) return;

      const key = `${turn}:${player.id}`;
      if (key === this.lastTurnKey) return;
      this.lastTurnKey = key;

      // Skip if game is over
      const gameOver = this.gameState.gameOver();
      if (gameOver) {
        const winnerName = this.gameState.playerNames().get(gameOver.winnerId) ?? 'Unknown';
        const reason = gameOver.reason === 'domination' ? 'Domination' : 'Economic';
        untracked(() => {
          this.eventLog.push({ turn, message: `Game Over: ${winnerName} wins by ${reason} Victory!` });
        });
        return;
      }

      untracked(() => this.selection.deselectUnits());

      if (player.isAI) {
        if (player.eliminated) {
          // Skip eliminated AI players — just end their turn
          untracked(() => {
            const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
            this.gameState.dispatchEndTurn(hexLookup);
          });
        } else {
          this.eventLog.push({ turn, message: `[AI] ${player.name} is thinking...` });
          // In spectate mode, defer AI execution if paused
          untracked(() => {
            if (this.gameState.spectate() && this.gameState.paused()) {
              this.pendingAI = { playerId: player.id, turn };
            } else {
              this.pendingAI = null;
              this.ai.executeTurn(player.id);
            }
          });
        }
      } else {
        this.eventLog.push({ turn, message: `${player.name}'s turn begins` });
        if (turn > 1) {
          untracked(() => this.saveSvc.autoSave());
        }
        // Execute persisted waypoints at the start of the human turn
        if (turn > 1) {
          untracked(() => this.waypointSvc.executeAllWaypoints());
        }
      }
    });

    // Resume pending AI when unpaused in spectate mode
    effect(() => {
      const paused = this.gameState.paused();
      if (paused) return;
      untracked(() => {
        if (this.pendingAI) {
          const { playerId } = this.pendingAI;
          this.pendingAI = null;
          this.ai.executeTurn(playerId);
        }
      });
    });

    // Discovery effect — detect newly explored anomalies
    effect(() => {
      const batchId = this.vision.discoveryBatchId();
      if (batchId <= this.lastDiscoveryId) return;
      this.lastDiscoveryId = batchId;

      const turn = this.gameState.turn();
      if (turn <= 1) return;

      const player = this.gameState.currentPlayer();
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
          const prefix = player?.isAI ? '[AI] ' : '';
          this.eventLog.push({ turn, message: `${prefix}Discovered ${info.name}`, q: d.q, r: d.r });
          if (!player?.isAI) this.audio.playDiscovery();
        }

        // Discover trade hubs
        for (const d of discoveries) {
          const hex = this.chunkManager.getHex(d.q, d.r);
          if (!hex?.tradeHub) continue;

          const id = `trade_hub_${d.q}_${d.r}`;
          if (this.gameState.tradeHubs().has(id)) continue;

          this.gameState.dispatch({
            type: 'DISCOVER_TRADE_HUB',
            tradeHub: { id, q: d.q, r: d.r, stock: { ...TRADE_HUB_STARTING_STOCK } },
          });
          const prefix = player?.isAI ? '[AI] ' : '';
          this.eventLog.push({ turn, message: `${prefix}Discovered a Trade Hub`, q: d.q, r: d.r });
          if (!player?.isAI) this.audio.playDiscovery();
        }
      });
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.gameState.setPaused(false);
  }

  openTradeModal(hubId: string, unitId: string): void {
    this.tradeHubId.set(hubId);
    this.tradeUnitId.set(unitId);
    this.tradeModalVisible.set(true);
  }

  abortSpectate(): void {
    this.gameState.setPaused(true);
    this.router.navigate(['/menu']);
  }

  protected focus(): void {
    this.el.nativeElement.focus();
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.clickPopup()?.close();
    this.contextMenu()?.open(event.clientX, event.clientY);
  }

  protected onShowClickPopup(event: { clientX: number; clientY: number }): void {
    this.contextMenu()?.close();
    const shown = this.clickPopup()?.open(event.clientX, event.clientY);
    if (!shown) {
      // No valid options — fallback to hex select (viewport already played click SFX)
    }
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

    // Space toggles pause in spectate mode
    if (event.key === ' ' && this.gameState.spectate()) {
      event.preventDefault();
      this.gameState.togglePause();
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
        } else if (this.clickPopup()?.state()) {
          this.clickPopup()!.close();
        } else {
          // Cancel waypoint if selected unit has one
          const selectedId = this.selection.selectedUnit();
          if (selectedId && this.waypointSvc.getWaypoint(selectedId)) {
            this.waypointSvc.clearWaypoint(selectedId);
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
          const { x, y } = hexToPixel(unit.q, unit.r, HEX_SIZE);
          this.camera.centerOn(x, y);
        }
        break;
      }
      case 'b':
      case 'B': {
        const coord = this.selection.selectedHexCoord();
        if (coord) {
          const { x, y } = hexToPixel(coord.q, coord.r, HEX_SIZE);
          const screen = this.camera.worldToScreen(x, y);
          const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
          this.contextMenu()?.open(screen.x / dpr, screen.y / dpr);
        }
        break;
      }
      case 'g':
      case 'G':
        this.router.navigate(['/guide'], { queryParams: { from: 'game' } });
        break;
      case 'i':
      case 'I':
        this.influenceSvc.toggleInfluenceOverlay();
        break;
      case 'r':
      case 'R':
        this.influenceSvc.toggleAttackRangeOverlay();
        break;
      case 'h':
      case 'H': {
        const homeId = this.gameState.homeBaseId();
        if (homeId) {
          const building = this.gameState.buildings().get(homeId);
          if (building) {
            const { x, y } = hexToPixel(building.q, building.r, HEX_SIZE);
            this.camera.centerOn(x, y);
            this.selection.selectHex(toHexCoord(building.q, building.r));
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
