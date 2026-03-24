import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { ResourceBarComponent } from './resource-bar.component';
import { TurnControlsComponent } from './turn-controls.component';
import { HexInfoPanelComponent } from '../panels/hex-info-panel.component';
import { UnitInfoPanelComponent } from '../panels/unit-info-panel.component';
import { EventLogComponent } from '../log/event-log.component';
import { EventFeedComponent } from '../log/event-feed.component';
import { ProductionMenuComponent } from '../panels/production-menu.component';
import { ResearchMenuComponent } from '../panels/research-menu.component';
import { UnitListPanelComponent } from '../panels/unit-list-panel.component';
import { BuildingListPanelComponent } from '../panels/building-list-panel.component';
import { MinimapComponent } from './minimap.component';
import { GameOverOverlayComponent } from '../overlays/game-over-overlay.component';

import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { EventLogService } from '../../core/state/event-log.service';
import { AIService } from '../../core/ai/ai.service';
import { AudioService } from '../../core/audio/audio.service';
import { CameraService } from '../../core/camera/camera.service';
import { UndoService } from '../../core/state/undo.service';
import { InfluenceService } from '../../core/influence/influence.service';
import { hexKey, hexToPixel } from '../../shared/hex/hex-math';
import { BuildingData, TechId, TECH_TREE, UnitType } from '../../models/game-state';
import { formatName } from '../../shared/pipes/format-name.pipe';

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResourceBarComponent, TurnControlsComponent, HexInfoPanelComponent, UnitInfoPanelComponent, EventLogComponent, EventFeedComponent, ProductionMenuComponent, ResearchMenuComponent, UnitListPanelComponent, BuildingListPanelComponent, MinimapComponent, GameOverOverlayComponent],
  template: `
    <div class="hud-top">
      <app-resource-bar />
      <div class="hud-top-center">
        @if (homeBase(); as hb) {
          <button class="btn-toolbar home-btn" (click)="focusHome(hb)">&#8962; Home</button>
        }
        <button class="btn-toolbar overlay-btn" [class.active]="influenceActive()" (click)="toggleInfluence()">Influence</button>
        <button class="btn-toolbar overlay-btn" [class.active]="attackRangeActive()" (click)="toggleAttackRange()">Attack Range</button>
        <button class="btn-toolbar help-btn" (click)="onHelp()">?</button>
      </div>
    </div>
    <div class="hud-unit-panel">
      <app-unit-info-panel />
      @if (!spectate()) {
        @if (selectedStarbase(); as sb) {
          <app-production-menu [building]="sb" [homeBaseId]="gameState.homeBaseId()" (produceSelected)="onProduce($event)" (setHomeSelected)="onSetHome(sb)" />
        }
        @if (selectedResearchLab(); as rl) {
          <app-research-menu [building]="rl" (researchSelected)="onResearch($event)" />
        }
      }
    </div>
    @if (!spectate()) {
      <app-turn-controls class="hud-turn" />
    } @else {
      <div class="hud-turn spectate-label">
        <div class="panel controls">
          @if (currentPlayer(); as player) {
            <span class="player-dot" [style.background]="player.color"></span>
            <span class="player-name">{{ player.name }}</span>
          }
          <span class="turn-label">Turn {{ gameState.turn() }}</span>
          <span class="spectate-badge">SPECTATING</span>
        </div>
      </div>
    }
    <div class="hud-right-panels">
      <app-unit-list-panel />
      <app-building-list-panel />
    </div>
    <div class="hud-bottom-right">
      <app-event-feed />
      <app-event-log />
    </div>
    <div class="hud-bottom-left">
      <app-minimap />
      <app-hex-info-panel />
    </div>
    @if (aiExecuting() && !spectate()) {
      <div class="ai-overlay">
        <div class="ai-popup">
          <span class="ai-icon">&#9881;</span>
          <span>Opponent is acting...</span>
        </div>
      </div>
    }
    @if (gameOver()) {
      <app-game-over-overlay />
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
      grid-row: 1;
      grid-column: 1 / 3;
      display: flex;
      align-items: stretch;
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
      width: 200px;
    }
    .hud-turn {
      grid-row: 1;
      grid-column: 3;
      justify-self: end;
    }
    .hud-right-panels {
      grid-row: 2;
      grid-column: 3;
      align-self: start;
      justify-self: end;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .hud-bottom-left {
      grid-row: 3;
      grid-column: 1;
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
      width: 400px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
.home-btn {
      color: var(--text-primary);
      font-size: 0.8rem;
    }
    .overlay-btn {
      color: var(--text-secondary);
      font-size: 0.75rem;
      transition: background 0.15s, border-color 0.15s;
    }
    .overlay-btn.active {
      border-color: var(--accent-blue);
      background: rgba(59, 130, 246, 0.15);
      color: var(--text-primary);
    }
    .help-btn {
      color: var(--text-secondary);
      font-size: 0.85rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
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
    .spectate-label {
      pointer-events: auto;
    }
    .spectate-label .controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.4rem 1rem;
    }
    .spectate-label .player-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .spectate-label .player-name {
      font-size: 0.85rem;
      color: var(--text-primary);
    }
    .spectate-label .turn-label {
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .spectate-badge {
      font-size: 0.7rem;
      font-weight: 700;
      color: #5eead4;
      letter-spacing: 0.1em;
      padding: 0.15rem 0.5rem;
      border: 1px solid rgba(94, 234, 212, 0.3);
      border-radius: 0.25rem;
      background: rgba(94, 234, 212, 0.1);
    }
  `,
})
export class HudComponent {
  private readonly selection = inject(SelectionService);
  readonly gameState = inject(GameStateService);
  readonly spectate = input(false);
  readonly helpVisible = model(false);
  readonly currentPlayer = this.gameState.currentPlayer;
  private readonly eventLog = inject(EventLogService);
  private readonly ai = inject(AIService);
  private readonly audio = inject(AudioService);
  private readonly camera = inject(CameraService);
  private readonly undo = inject(UndoService);
  private readonly influenceSvc = inject(InfluenceService);

  readonly influenceActive = this.influenceSvc.showInfluenceOverlay;
  readonly attackRangeActive = this.influenceSvc.showAttackRangeOverlay;

  readonly aiExecuting = this.ai.executing;
  readonly gameOver = this.gameState.gameOver;

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
    const b = this.gameState.buildingAtHex().get(hexKey(coord.q, coord.r));
    if (b && b.type === 'starbase' && b.ownerId === currentPlayer.id) return b;
    return null;
  });

  readonly selectedResearchLab = computed<BuildingData | null>(() => {
    const coord = this.selection.selectedHexCoord();
    if (!coord) return null;
    const currentPlayer = this.gameState.currentPlayer();
    if (!currentPlayer) return null;
    const b = this.gameState.buildingAtHex().get(hexKey(coord.q, coord.r));
    if (b && b.type === 'research_lab' && b.ownerId === currentPlayer.id) return b;
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

  toggleInfluence(): void {
    this.audio.playClick();
    this.influenceSvc.toggleInfluenceOverlay();
  }

  toggleAttackRange(): void {
    this.audio.playClick();
    this.influenceSvc.toggleAttackRangeOverlay();
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
    this.eventLog.push({ turn, message: `Queued ${formatName(unitType)} production` });
  }

  onResearch(techId: TechId): void {
    this.audio.playClick();
    const lab = this.selectedResearchLab();
    if (!lab) return;
    this.undo.dispatch({ type: 'QUEUE_RESEARCH', buildingId: lab.id, techId });
    const turn = this.gameState.turn();
    const techName = TECH_TREE[techId]?.name ?? techId;
    this.eventLog.push({ turn, message: `Began researching ${techName}` });
  }
}
