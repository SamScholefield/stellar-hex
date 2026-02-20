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
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { SelectionService } from '../../core/selection/selection.service';
import { HexCanvasRendererService } from '../renderer/hex-canvas-renderer.service';
import { pixelToHex } from '../../shared/hex/hex-math';

const HEX_SIZE = 30;
const CLICK_THRESHOLD = 4;

@Component({
  selector: 'app-game-viewport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointerleave)': 'onPointerLeave()',
    '(wheel)': 'onWheel($event)',
    '(contextmenu)': 'onContextMenu($event)',
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
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly selection = inject(SelectionService);
  private readonly renderer = inject(HexCanvasRendererService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  private panning = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
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
      const chunks = this.chunkManager.visibleChunks();
      const hoveredHex = this.selection.hoveredHexCoord();
      const selectedHex = this.selection.selectedHexCoord();

      const canvas = this.canvasRef().nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.renderer.draw(ctx, this.camera, HEX_SIZE, chunks, hoveredHex, selectedHex);
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.panning = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.downX = event.clientX;
    this.downY = event.clientY;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.panning) {
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.camera.panBy(dx * devicePixelRatio, dy * devicePixelRatio);
    } else {
      this.updateHover(event);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.panning && event.button === 0) {
      const movedX = Math.abs(event.clientX - this.downX);
      const movedY = Math.abs(event.clientY - this.downY);
      if (movedX < CLICK_THRESHOLD && movedY < CLICK_THRESHOLD) {
        this.handleClick(event);
      }
    }
    this.panning = false;
  }

  protected onPointerLeave(): void {
    this.panning = false;
    this.selection.hoverHex(null);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * devicePixelRatio;
    const screenY = (event.clientY - rect.top) * devicePixelRatio;
    this.camera.zoomAt(screenX, screenY, event.deltaY);
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  private handleClick(event: PointerEvent): void {
    const hex = this.screenEventToHex(event);
    this.selection.selectHex(hex);
  }

  private updateHover(event: PointerEvent): void {
    const hex = this.screenEventToHex(event);
    this.selection.hoverHex(hex);
  }

  private screenEventToHex(event: PointerEvent) {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * devicePixelRatio;
    const screenY = (event.clientY - rect.top) * devicePixelRatio;
    const { x, y } = this.camera.screenToWorld(screenX, screenY);
    return pixelToHex(x, y, HEX_SIZE);
  }
}
