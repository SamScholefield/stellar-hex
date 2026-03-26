import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { ResourceBarComponent } from './resource-bar.component';
import { TurnControlsComponent } from './turn-controls.component';
import { HexInfoPanelComponent } from '../panels/hex-info-panel.component';
import { UnitInfoPanelComponent } from '../panels/unit-info-panel.component';
import { EventLogComponent } from '../log/event-log.component';
import { EventFeedComponent } from '../log/event-feed.component';
import { ProductionMenuComponent } from '../panels/production-menu.component';
import { ResearchMenuComponent } from '../panels/research-menu.component';
import { FleetPanelComponent } from '../panels/fleet-panel.component';
import { MinimapComponent } from './minimap.component';
import { GameOverOverlayComponent } from '../overlays/game-over-overlay.component';

import { Router } from '@angular/router';
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
import { PlayerState } from '../../models/game-state';

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResourceBarComponent, TurnControlsComponent, HexInfoPanelComponent, UnitInfoPanelComponent, EventLogComponent, EventFeedComponent, ProductionMenuComponent, ResearchMenuComponent, FleetPanelComponent, MinimapComponent, GameOverOverlayComponent],
  template: `
    <header class="hud-header">
      @if (!spectate()) {
        <app-resource-bar />
      } @else {
        <div class="spectate-resources">
          @for (p of alivePlayers(); track p.id) {
            <div class="sp-player" [class.eliminated]="p.eliminated">
              <span class="sp-dot" [style.background]="p.color"></span>
              <span class="sp-name">{{ p.name }}</span>
              <span class="sp-res">{{ p.resources.energy }}E</span>
              <span class="sp-res">{{ p.resources.minerals }}M</span>
              <span class="sp-res">{{ p.resources.alloys }}A</span>
              <span class="sp-res">{{ p.resources.credits }}C</span>
            </div>
          }
        </div>
      }
      <div class="hud-toolbar">
        @if (homeBase(); as hb) {
          <button class="icon-btn" title="Home" (click)="focusHome(hb)"><svg class="hex-icon" viewBox="0 0 24 24"><polygon points="12,2 22,7 22,17 12,22 2,17 2,7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
        }
        <button class="icon-btn influence" [class.active]="influenceActive()" title="Influence" (click)="toggleInfluence()"><span class="material-symbols-outlined">radar</span></button>
        <button class="icon-btn attack-range" [class.active]="attackRangeActive()" title="Attack Range" (click)="toggleAttackRange()"><span class="material-symbols-outlined">radar</span></button>
        <button class="icon-btn" title="Guide" (click)="onGuide()"><span class="material-symbols-outlined">help</span></button>
        <button class="icon-btn" title="Keyboard Shortcuts" (click)="onHelp()"><span class="material-symbols-outlined">keyboard</span></button>
      </div>
      @if (!spectate()) {
        <app-turn-controls class="hud-turn-section" />
      } @else {
        <div class="hud-turn-section spectate-label">
          <div class="spectate-controls-inner">
            @if (currentPlayer(); as player) {
              <span class="player-dot" [style.background]="player.color"></span>
              <span class="player-name">{{ player.name }}</span>
            }
            <span class="turn-label">Turn {{ gameState.turn() }}</span>
            <span class="spectate-badge">SPECTATING</span>
          </div>
          @if (selectedEntityLabel(); as label) {
            <div class="sp-selected">
              <span class="sp-sel-dot" [style.background]="label.color"></span>
              <span class="sp-sel-name">{{ label.name }}</span>
              <span class="sp-sel-owner">{{ label.owner }}</span>
            </div>
          }
        </div>
      }
    </header>
    <div class="hud-left-panels">
      @if (!spectate()) {
        @if (selectedStarbase(); as sb) {
          <app-production-menu [building]="sb" [homeBaseId]="gameState.homeBaseId()" (produceSelected)="onProduce($event)" (setHomeSelected)="onSetHome(sb)" />
        }
        @if (selectedResearchLab(); as rl) {
          <app-research-menu [building]="rl" (researchSelected)="onResearch($event)" />
        }
      }
    </div>
    <div class="hud-bottom-center">
      <app-unit-info-panel />
    </div>
    <div class="hud-right-panels">
      <app-fleet-panel />
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
      gap: 0.5rem;
    }
    .hud-header {
      grid-row: 1;
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      background: var(--panel-bg, rgba(10, 10, 26, 0.85));
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      pointer-events: auto;
    }
    .hud-toolbar {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.75rem;
    }
    .hud-turn-section {
      margin-left: auto;
    }
    .hud-left-panels {
      grid-row: 2;
      grid-column: 1;
      align-self: start;
      width: 200px;
      margin-left: 0.75rem;
    }
    .hud-bottom-center {
      grid-row: 3;
      grid-column: 2;
      justify-self: center;
      align-self: end;
      margin-bottom: 0.75rem;
    }
    .hud-right-panels {
      grid-row: 2;
      grid-column: 3;
      align-self: start;
      justify-self: end;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-right: 0.75rem;
    }
    .hud-bottom-left {
      grid-row: 3;
      grid-column: 1;
      align-self: end;
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
      margin: 0 0 0.75rem 0.75rem;
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
      margin: 0 0.75rem 0.75rem 0;
    }
    .icon-btn {
      background: none;
      border: none;
      color: var(--text-muted, #6b7280);
      cursor: pointer;
      padding: 0.3rem;
      line-height: 1;
      transition: color 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn .material-symbols-outlined {
      font-size: 22px;
      font-weight: 600;
    }
    .hex-icon {
      width: 22px;
      height: 22px;
    }
    .icon-btn:hover {
      color: var(--text-primary, #e0e0e0);
    }
    .icon-btn.influence.active {
      color: var(--accent-green, #34d399);
    }
    .icon-btn.attack-range.active {
      color: var(--accent-red, #f87171);
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
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .spectate-controls-inner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
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
    .spectate-resources {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.25rem;
    }
    .sp-player {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      color: var(--text-primary);
    }
    .sp-player.eliminated {
      opacity: 0.3;
      text-decoration: line-through;
    }
    .sp-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sp-name {
      font-weight: 600;
      margin-right: 0.15rem;
    }
    .sp-res {
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .sp-selected {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding-left: 0.75rem;
      border-left: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 0.8rem;
    }
    .sp-sel-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sp-sel-name {
      color: var(--text-primary);
      font-weight: 600;
    }
    .sp-sel-owner {
      color: var(--text-secondary);
      font-size: 0.72rem;
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
  private readonly router = inject(Router);
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

  readonly alivePlayers = computed<PlayerState[]>(() => this.gameState.players());

  readonly selectedEntityLabel = computed<{ name: string; owner: string; color: string } | null>(() => {
    const unit = this.selection.selectedUnitData();
    if (unit) {
      const color = this.gameState.playerColors().get(unit.ownerId) ?? '#888';
      const owner = this.gameState.playerNames().get(unit.ownerId) ?? '';
      return { name: `${formatName(unit.type)} — ${unit.name}`, owner, color };
    }
    const coord = this.selection.selectedHexCoord();
    if (coord) {
      const b = this.gameState.buildingAtHex().get(hexKey(coord.q, coord.r));
      if (b) {
        const color = this.gameState.playerColors().get(b.ownerId) ?? '#888';
        const owner = this.gameState.playerNames().get(b.ownerId) ?? '';
        return { name: formatName(b.type), owner, color };
      }
    }
    return null;
  });

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
    if (!player || building.type !== 'starbase') return;
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

  onGuide(): void {
    this.audio.playClick();
    this.router.navigate(['/guide'], { queryParams: { from: 'game' } });
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
