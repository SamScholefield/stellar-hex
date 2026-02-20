import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { ResourceBarComponent } from './resource-bar.component';
import { TurnControlsComponent } from './turn-controls.component';
import { HexInfoPanelComponent } from '../panels/hex-info-panel.component';
import { UnitInfoPanelComponent } from '../panels/unit-info-panel.component';
import { ActionBarComponent } from '../panels/action-bar.component';
import { EventLogComponent } from '../log/event-log.component';
import { BuildMenuComponent } from '../panels/build-menu.component';
import { ProductionMenuComponent } from '../panels/production-menu.component';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { EventLogService } from '../../core/state/event-log.service';
import { BuildingData, BuildingType, UnitType } from '../../models/game-state';
import { StellarObjectType } from '../../models/hex-data';

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResourceBarComponent, TurnControlsComponent, HexInfoPanelComponent, UnitInfoPanelComponent, ActionBarComponent, EventLogComponent, BuildMenuComponent, ProductionMenuComponent],
  template: `
    <div class="hud-top">
      <app-resource-bar />
      <app-turn-controls />
    </div>
    <div class="hud-bottom-left">
      <app-unit-info-panel />
      <app-hex-info-panel />
      @if (actionBar()?.showBuildMenu() && selectedHexType()) {
        <app-build-menu [hexType]="selectedHexType()!" (buildSelected)="onBuild($event)" />
      }
      @if (selectedStarbase(); as sb) {
        <app-production-menu [building]="sb" (produceSelected)="onProduce($event)" />
      }
    </div>
    <div class="hud-bottom-center">
      <app-action-bar />
    </div>
    <div class="hud-bottom-right">
      <app-event-log />
    </div>
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
    .hud-bottom-center {
      grid-row: 3;
      grid-column: 2;
      justify-self: center;
      align-self: end;
      pointer-events: auto;
    }
    .hud-bottom-right {
      grid-row: 3;
      grid-column: 3;
      align-self: end;
      pointer-events: auto;
    }
  `,
})
export class HudComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);
  private readonly eventLog = inject(EventLogService);
  readonly actionBar = viewChild(ActionBarComponent);

  readonly selectedHexType = computed<StellarObjectType | null>(() => {
    const hexData = this.selection.selectedHexData();
    if (!hexData || hexData.visibility !== 'visible') return null;
    return hexData.hex.object?.type ?? 'empty';
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

  onBuild(buildingType: BuildingType): void {
    const coord = this.selection.selectedHexCoord();
    const player = this.gameState.currentPlayer();
    const hexType = this.selectedHexType();
    if (!coord || !player || !hexType) return;
    this.gameState.dispatch({ type: 'BUILD', playerId: player.id, buildingType, hex: coord, hexType });
    this.actionBar()?.showBuildMenu.set(false);
    const turn = this.gameState.turn();
    this.eventLog.push({ turn, message: `Built ${buildingType.replace(/_/g, ' ')} at (${coord.q}, ${coord.r})`, q: coord.q, r: coord.r });
  }

  onProduce(unitType: UnitType): void {
    const starbase = this.selectedStarbase();
    if (!starbase) return;
    this.gameState.dispatch({ type: 'PRODUCE_UNIT', buildingId: starbase.id, unitType });
    const turn = this.gameState.turn();
    this.eventLog.push({ turn, message: `Queued ${unitType.replace(/_/g, ' ')} production` });
  }
}
