import { Injectable } from '@angular/core';
import { CameraService } from '../../core/camera/camera.service';
import { hexToPixel } from '../../shared/hex/hex-math';

const GRID_HALF = 10;

@Injectable({ providedIn: 'root' })
export class HexCanvasRendererService {
  draw(ctx: CanvasRenderingContext2D, camera: CameraService, hexSize: number): void {
    const w = camera.canvasWidth();
    const h = camera.canvasHeight();
    const zoom = camera.zoom();
    const panX = camera.panX();
    const panY = camera.panY();

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 - panX * zoom, h / 2 - panY * zoom);
    ctx.scale(zoom, zoom);

    ctx.strokeStyle = '#2a4a5a';
    ctx.fillStyle = '#0d1117';
    ctx.lineWidth = 1;

    for (let q = -GRID_HALF; q <= GRID_HALF; q++) {
      for (let r = -GRID_HALF; r <= GRID_HALF; r++) {
        const { x, y } = hexToPixel(q, r, hexSize);
        this.drawHex(ctx, x, y, hexSize);
      }
    }

    ctx.restore();
  }

  private drawHex(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
  ): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
