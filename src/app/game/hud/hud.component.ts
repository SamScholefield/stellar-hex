import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ResourceBarComponent } from './resource-bar.component';
import { TurnControlsComponent } from './turn-controls.component';
import { HexInfoPanelComponent } from '../panels/hex-info-panel.component';
import { UnitInfoPanelComponent } from '../panels/unit-info-panel.component';
import { ActionBarComponent } from '../panels/action-bar.component';

@Component({
  selector: 'app-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResourceBarComponent, TurnControlsComponent, HexInfoPanelComponent, UnitInfoPanelComponent, ActionBarComponent],
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
    <div class="hud-bottom-right minimap-placeholder"></div>
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
    .minimap-placeholder {
      grid-row: 3;
      grid-column: 3;
      width: 180px;
      height: 180px;
      background: rgba(10, 10, 26, 0.5);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      align-self: end;
    }
  `,
})
export class HudComponent {}
