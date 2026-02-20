import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { GameViewportComponent } from './viewport/game-viewport.component';
import { HudComponent } from './hud/hud.component';
import { ContextMenuComponent } from './overlays/context-menu.component';
import { CameraService } from '../core/camera/camera.service';
import { SelectionService } from '../core/selection/selection.service';

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
  private readonly contextMenu = viewChild(ContextMenuComponent);

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
