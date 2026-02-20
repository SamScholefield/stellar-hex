import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ResourceBarComponent } from './resource-bar.component';
import { TurnControlsComponent } from './turn-controls.component';
import { HexInfoPanelComponent } from '../panels/hex-info-panel.component';
import { UnitInfoPanelComponent } from '../panels/unit-info-panel.component';
import { ActionBarComponent } from '../panels/action-bar.component';
import { EventLogComponent } from '../log/event-log.component';

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResourceBarComponent, TurnControlsComponent, HexInfoPanelComponent, UnitInfoPanelComponent, ActionBarComponent, EventLogComponent],
  template: `
    <div class="hud-top">
      <app-resource-bar />
      <app-turn-controls />
    </div>
    <div class="hud-bottom-left">
      <app-unit-info-panel />
      <app-hex-info-panel />
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
export class HudComponent {}
