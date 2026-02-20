import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { CameraService } from '../../core/camera/camera.service';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { pixelToHex } from '../../shared/hex/hex-math';

const HEX_SIZE = 30;

export interface ContextMenuState {
  screenX: number;
  screenY: number;
  hex: HexCoord;
}

@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'close()',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @if (state(); as s) {
      <div class="menu" [style.left.px]="s.screenX" [style.top.px]="s.screenY">
        <button class="item" (click)="onInspect()">Inspect</button>
        <button class="item" disabled>Move Here</button>
        <button class="item" disabled>Build</button>
      </div>
    }
  `,
  styles: `
    .menu {
      position: fixed;
      z-index: 100;
      background: rgba(10, 10, 26, 0.95);
      border: 1px solid #2a4a5a;
      border-radius: 0.375rem;
      padding: 0.25rem 0;
      min-width: 130px;
      pointer-events: auto;
    }
    .item {
      display: block;
      width: 100%;
      padding: 0.4rem 0.75rem;
      font-size: 0.85rem;
      color: #e0e0e0;
      background: none;
      border: none;
      text-align: left;
      cursor: pointer;
    }
    .item:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
    }
    .item:disabled {
      color: #4b5563;
      cursor: not-allowed;
    }
  `,
})
export class ContextMenuComponent {
  private readonly selection = inject(SelectionService);
  private readonly camera = inject(CameraService);

  private readonly _state = signal<ContextMenuState | null>(null);
  readonly state = this._state.asReadonly();

  open(clientX: number, clientY: number): void {
    const screenX = (clientX - 0) * devicePixelRatio;
    const screenY = (clientY - 0) * devicePixelRatio;
    const rect = document.querySelector('canvas')?.getBoundingClientRect();
    const canvasX = rect ? (clientX - rect.left) * devicePixelRatio : screenX;
    const canvasY = rect ? (clientY - rect.top) * devicePixelRatio : screenY;
    const { x, y } = this.camera.screenToWorld(canvasX, canvasY);
    const hex = pixelToHex(x, y, HEX_SIZE);
    this._state.set({ screenX: clientX, screenY: clientY, hex });
  }

  close(): void {
    this._state.set(null);
  }

  onInspect(): void {
    const s = this._state();
    if (s) {
      this.selection.selectHex(s.hex);
    }
    this.close();
  }
}
