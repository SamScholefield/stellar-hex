import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ResourceBarComponent } from './resource-bar.component';
import { TurnControlsComponent } from './turn-controls.component';
import { HexInfoPanelComponent } from '../panels/hex-info-panel.component';
import { UnitInfoPanelComponent } from '../panels/unit-info-panel.component';
import { EventLogComponent } from '../log/event-log.component';
import { ProductionMenuComponent } from '../panels/production-menu.component';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { EventLogService } from '../../core/state/event-log.service';
import { AIService } from '../../core/ai/ai.service';
import { CameraService } from '../../core/camera/camera.service';
import { hexToPixel } from '../../shared/hex/hex-math';
import { BuildingData, UnitType } from '../../models/game-state';

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResourceBarComponent, TurnControlsComponent, HexInfoPanelComponent, UnitInfoPanelComponent, EventLogComponent, ProductionMenuComponent],
  template: `
    <div class="hud-top">
      <app-resource-bar />
      @if (homeBase(); as hb) {
        <button class="home-btn" (click)="focusHome(hb)">&#8962; Home</button>
      }
      <app-turn-controls />
    </div>
    <div class="hud-bottom-left">
      <app-unit-info-panel />
      <app-hex-info-panel />
      @if (selectedStarbase(); as sb) {
        <app-production-menu [building]="sb" [homeBaseId]="gameState.homeBaseId()" (produceSelected)="onProduce($event)" (setHomeSelected)="onSetHome(sb)" />
      }
    </div>
    <div class="hud-bottom-right">
      <app-event-log />
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
    .hud-top {
      grid-column: 1 / -1;
      display: flex;
      justify-content: space-between;
      pointer-events: auto;
    }
    .hud-bottom-left {
      grid-row: 3;
      grid-column: 1;
      pointer-events: auto;
      align-self: end;
    }
    .hud-bottom-right {
      grid-row: 3;
      grid-column: 3;
      align-self: end;
      pointer-events: auto;
    }
    .home-btn {
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.4rem 0.75rem;
      color: #e0e0e0;
      font-size: 0.8rem;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .home-btn:hover {
      background: rgba(30, 40, 60, 0.95);
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
      background: rgba(10, 10, 26, 0.9);
      border: 1px solid #f59e0b;
      border-radius: 0.75rem;
      padding: 1rem 2rem;
      color: #f59e0b;
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
  private readonly eventLog = inject(EventLogService);
  private readonly ai = inject(AIService);
  private readonly camera = inject(CameraService);
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
    for (const b of this.gameState.buildings().values()) {
      if (b.q === coord.q && b.r === coord.r && b.type === 'starbase' && b.ownerId === currentPlayer.id) return b;
    }
    return null;
  });

  focusHome(building: BuildingData): void {
    const { x, y } = hexToPixel(building.q, building.r, 30);
    this.camera.centerOn(x, y);
    this.selection.selectHex({ q: building.q, r: building.r, s: -building.q - building.r });
  }

  onSetHome(building: BuildingData): void {
    const player = this.gameState.currentPlayer();
    if (!player) return;
    this.gameState.dispatch({ type: 'SET_HOME_BASE', playerId: player.id, buildingId: building.id });
    this.eventLog.push({ turn: this.gameState.turn(), message: 'Home base reassigned' });
  }

  onProduce(unitType: UnitType): void {
    const starbase = this.selectedStarbase();
    if (!starbase) return;
    this.gameState.dispatch({ type: 'PRODUCE_UNIT', buildingId: starbase.id, unitType });
    const turn = this.gameState.turn();
    this.eventLog.push({ turn, message: `Queued ${unitType.replace(/_/g, ' ')} production` });
  }
}
