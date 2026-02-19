import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { CameraService } from '../../core/camera/camera.service';
import { HexCanvasRendererService } from '../renderer/hex-canvas-renderer.service';

const HEX_SIZE = 30;

@Component({
  selector: 'app-game-viewport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp()',
    '(pointerleave)': 'onPointerUp()',
    '(wheel)': 'onWheel($event)',
  },
  template: `<canvas #gameCanvas></canvas>`,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class GameViewportComponent implements OnDestroy {
  private readonly camera = inject(CameraService);
  private readonly renderer = inject(HexCanvasRendererService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  private panning = false;
  private lastX = 0;
  private lastY = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
        this.camera.setCanvasSize(canvas.width, canvas.height);
      });
      this.resizeObserver.observe(canvas);
    });

    effect(() => {
      // Read reactive dependencies to trigger re-render
      this.camera.viewport();

      const canvas = this.canvasRef().nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.renderer.draw(ctx, this.camera, HEX_SIZE);
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected onPointerDown(event: PointerEvent): void {
    this.panning = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.panning) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.camera.panBy(dx * devicePixelRatio, dy * devicePixelRatio);
  }

  protected onPointerUp(): void {
    this.panning = false;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * devicePixelRatio;
    const screenY = (event.clientY - rect.top) * devicePixelRatio;
    this.camera.zoomAt(screenX, screenY, event.deltaY);
  }
}
