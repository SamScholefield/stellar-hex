import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core';
import { ResourceBarComponent } from './resource-bar.component';
import { TurnControlsComponent } from './turn-controls.component';
import { HexInfoPanelComponent } from '../panels/hex-info-panel.component';
import { UnitInfoPanelComponent } from '../panels/unit-info-panel.component';
import { EventLogComponent } from '../log/event-log.component';
import { ProductionMenuComponent } from '../panels/production-menu.component';
import { UnitListPanelComponent } from '../panels/unit-list-panel.component';
import { BuildingListPanelComponent } from '../panels/building-list-panel.component';
import { MinimapComponent } from './minimap.component';
import { ToastContainerComponent } from '../overlays/toast-container.component';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { EventLogService } from '../../core/state/event-log.service';
import { AIService } from '../../core/ai/ai.service';
import { AudioService } from '../../core/audio/audio.service';
import { CameraService } from '../../core/camera/camera.service';
import { UndoService } from '../../core/state/undo.service';
import { hexToPixel } from '../../shared/hex/hex-math';
import { BuildingData, UnitType } from '../../models/game-state';

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResourceBarComponent, TurnControlsComponent, HexInfoPanelComponent, UnitInfoPanelComponent, EventLogComponent, ProductionMenuComponent, UnitListPanelComponent, BuildingListPanelComponent, MinimapComponent, ToastContainerComponent],
  template: `
    <app-toast-container />
    <div class="hud-top">
      <app-resource-bar />
      <div class="hud-top-center">
        @if (homeBase(); as hb) {
          <button class="home-btn" (click)="focusHome(hb)">&#8962; Home</button>
        }
        <button class="help-btn" (click)="onHelp()">?</button>
      </div>
    </div>
    <div class="hud-unit-panel">
      <app-unit-info-panel />
      @if (selectedStarbase(); as sb) {
        <app-production-menu [building]="sb" [homeBaseId]="gameState.homeBaseId()" (produceSelected)="onProduce($event)" (setHomeSelected)="onSetHome(sb)" />
      }
    </div>
    <app-turn-controls class="hud-turn" />
    <div class="hud-right-panels">
      <app-unit-list-panel />
      <app-building-list-panel />
    </div>
    <app-event-log class="hud-bottom-right" />
    <div class="hud-bottom-left">
      <app-minimap />
      <app-hex-info-panel />
    </div>
    @if (aiExecuting()) {
      <div class="ai-overlay">
        <div class="ai-popup">
          <span class="ai-icon">&#9881;</span>
          <span>Opponent is acting...</span>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: grid;
      grid-template-rows: auto 1fr auto;
      grid-template-columns: auto 1fr auto;
      padding: 0.75rem;
      gap: 0.5rem;
    }
    app-toast-container {
      display: contents;
    }
    .hud-top {
      grid-row: 1;
      grid-column: 1 / 3;
      display: flex;
      align-items: stretch;
      pointer-events: auto;
    }
    .hud-top-center {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: stretch;
      gap: 0.5rem;
    }
    .hud-unit-panel {
      grid-row: 2;
      grid-column: 1;
      align-self: start;
      pointer-events: auto;
      width: 200px;
    }
    .hud-turn {
      grid-row: 1;
      grid-column: 3;
      pointer-events: auto;
      justify-self: end;
    }
    .hud-right-panels {
      grid-row: 2;
      grid-column: 3;
      align-self: start;
      justify-self: end;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .hud-bottom-left {
      grid-row: 3;
      grid-column: 1;
      pointer-events: auto;
      align-self: end;
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    }
    .hud-bottom-right {
      grid-row: 3;
      grid-column: 3;
      align-self: end;
      justify-self: end;
      pointer-events: auto;
    }
.home-btn {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius);
      padding: 0.4rem 0.75rem;
      color: var(--text-primary);
      font-size: 0.8rem;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .home-btn:hover {
      background: rgba(30, 40, 60, 0.95);
    }
    .help-btn {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius);
      padding: 0.4rem 0.75rem;
      color: var(--text-secondary);
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .help-btn:hover {
      background: rgba(30, 40, 60, 0.95);
      color: var(--text-primary);
    }
    .ai-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .ai-popup {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: var(--panel-bg);
      border: 1px solid var(--accent-amber);
      border-radius: 0.75rem;
      padding: 1rem 2rem;
      color: var(--accent-amber);
      font-size: 1.1rem;
      font-weight: 600;
      animation: pulse 1.2s ease-in-out infinite;
    }
    .ai-icon {
      font-size: 1.4rem;
      animation: spin 2s linear infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `,
})
export class HudComponent {
  private readonly selection = inject(SelectionService);
  readonly gameState = inject(GameStateService);
  readonly helpVisible = model(false);
  private readonly eventLog = inject(EventLogService);
  private readonly ai = inject(AIService);
  private readonly audio = inject(AudioService);
  private readonly camera = inject(CameraService);
  private readonly undo = inject(UndoService);
  private readonly notifications = inject(NotificationService);
  readonly aiExecuting = this.ai.executing;

  readonly homeBase = computed<BuildingData | null>(() => {
    const id = this.gameState.homeBaseId();
    if (!id) return null;
    return this.gameState.buildings().get(id) ?? null;
  });

  readonly selectedStarbase = computed<BuildingData | null>(() => {
    const coord = this.selection.selectedHexCoord();
    if (!coord) return null;
    const currentPlayer = this.gameState.currentPlayer();
    if (!currentPlayer) return null;
    const b = this.gameState.buildingAtHex().get(`${coord.q},${coord.r}`);
    if (b && b.type === 'starbase' && b.ownerId === currentPlayer.id) return b;
    return null;
  });

  focusHome(building: BuildingData): void {
    this.audio.playClick();
    const { x, y } = hexToPixel(building.q, building.r, 30);
    this.camera.centerOn(x, y);
    this.selection.selectHex({ q: building.q, r: building.r, s: -building.q - building.r });
  }

  onSetHome(building: BuildingData): void {
    this.audio.playClick();
    const player = this.gameState.currentPlayer();
    if (!player) return;
    this.undo.dispatch({ type: 'SET_HOME_BASE', playerId: player.id, buildingId: building.id });
    this.eventLog.push({ turn: this.gameState.turn(), message: 'Home base reassigned' });
  }

  onHelp(): void {
    this.helpVisible.update(v => !v);
  }

  onProduce(unitType: UnitType): void {
    this.audio.playClick();
    const starbase = this.selectedStarbase();
    if (!starbase) return;
    this.undo.dispatch({ type: 'PRODUCE_UNIT', buildingId: starbase.id, unitType });
    const turn = this.gameState.turn();
    this.eventLog.push({ turn, message: `Queued ${unitType.replace(/_/g, ' ')} production` });
    this.notifications.show(`Queued ${unitType.replace(/_/g, ' ')} production`, { type: 'success' });
  }
}
