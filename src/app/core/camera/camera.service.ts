import { computed, Injectable, signal } from '@angular/core';

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.0;

@Injectable({ providedIn: 'root' })
export class CameraService {
  private readonly _panX = signal(0);
  private readonly _panY = signal(0);
  private readonly _zoom = signal(2);
  private readonly _canvasWidth = signal(0);
  private readonly _canvasHeight = signal(0);

  readonly panX = this._panX.asReadonly();
  readonly panY = this._panY.asReadonly();
  readonly zoom = this._zoom.asReadonly();
  readonly canvasWidth = this._canvasWidth.asReadonly();
  readonly canvasHeight = this._canvasHeight.asReadonly();

  readonly viewport = computed(() => {
    const z = this._zoom();
    const px = this._panX();
    const py = this._panY();
    const halfW = this._canvasWidth() / 2 / z;
    const halfH = this._canvasHeight() / 2 / z;
    return {
      left: px - halfW,
      top: py - halfH,
      right: px + halfW,
      bottom: py + halfH,
    };
  });

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const z = this._zoom();
    return {
      x: (sx - this._canvasWidth() / 2) / z + this._panX(),
      y: (sy - this._canvasHeight() / 2) / z + this._panY(),
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const z = this._zoom();
    return {
      x: (wx - this._panX()) * z + this._canvasWidth() / 2,
      y: (wy - this._panY()) * z + this._canvasHeight() / 2,
    };
  }

  panBy(dx: number, dy: number): void {
    const z = this._zoom();
    this._panX.update((v) => v - dx / z);
    this._panY.update((v) => v - dy / z);
  }

  zoomAt(screenX: number, screenY: number, delta: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY);
    const factor = delta > 0 ? 0.9 : 1.1;
    this._zoom.update((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
    const worldAfter = this.screenToWorld(screenX, screenY);
    this._panX.update((v) => v - (worldAfter.x - worldBefore.x));
    this._panY.update((v) => v - (worldAfter.y - worldBefore.y));
  }

  centerOn(worldX: number, worldY: number): void {
    this._panX.set(worldX);
    this._panY.set(worldY);
  }

  setCanvasSize(w: number, h: number): void {
    this._canvasWidth.set(w);
    this._canvasHeight.set(h);
  }
}
