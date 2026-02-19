import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GameViewportComponent } from './viewport/game-viewport.component';

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameViewportComponent],
  template: `<app-game-viewport />`,
  styles: `
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
    }
  `,
})
export class GameComponent {}
