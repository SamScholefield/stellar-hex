import { Injectable } from '@angular/core';
import { CameraService } from '../../core/camera/camera.service';
import { Chunk } from '../../models/chunk';
import { StellarObjectType } from '../../models/hex-data';
import { hexToPixel } from '../../shared/hex/hex-math';
import { CHUNK_SIZE } from '../../core/generation/world-generator.service';

const FILL_COLORS: Record<StellarObjectType, string> = {
  star: '#f0c040',
  planet: '#4080d0',
  moon: '#c0c0c0',
  asteroid: '#808080',
  asteroid_field: '#606060',
  comet: '#40e0d0',
  nebula: '#6a0dad',
  black_hole: '#8b0000',
  empty: '#0d1117',
};

@Injectable({ providedIn: 'root' })
export class HexCanvasRendererService {
  draw(
    ctx: CanvasRenderingContext2D,
    camera: CameraService,
    hexSize: number,
    chunks: Chunk[],
  ): void {
    const w = camera.canvasWidth();
    const h = camera.canvasHeight();
    const zoom = camera.zoom();
    const panX = camera.panX();
    const panY = camera.panY();

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 - panX * zoom, h / 2 - panY * zoom);
    ctx.scale(zoom, zoom);

    for (const chunk of chunks) {
      this.renderChunkTexture(chunk, hexSize);
      this.blitChunk(ctx, chunk, hexSize);
    }

    ctx.restore();
  }

  private renderChunkTexture(chunk: Chunk, hexSize: number): void {
    if (!chunk.dirty && chunk.texture) return;

    // Compute chunk pixel dimensions with generous padding
    const padding = hexSize * 2;
    const sampleHexes = [
      { dq: 0, dr: 0 },
      { dq: CHUNK_SIZE - 1, dr: 0 },
      { dq: 0, dr: CHUNK_SIZE - 1 },
      { dq: CHUNK_SIZE - 1, dr: CHUNK_SIZE - 1 },
    ];
    const baseQ = chunk.coord.cx * CHUNK_SIZE;
    const baseR = chunk.coord.cy * CHUNK_SIZE;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of sampleHexes) {
      const { x, y } = hexToPixel(baseQ + s.dq, baseR + s.dr, hexSize);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    const texW = Math.ceil(maxX - minX + padding * 2);
    const texH = Math.ceil(maxY - minY + padding * 2);
    const offsetX = minX - padding;
    const offsetY = minY - padding;

    if (!chunk.texture || chunk.texture.width !== texW || chunk.texture.height !== texH) {
      chunk.texture = new OffscreenCanvas(texW, texH);
    }

    const tctx = chunk.texture.getContext('2d')!;
    tctx.clearRect(0, 0, texW, texH);

    tctx.strokeStyle = '#2a4a5a';
    tctx.lineWidth = 1;

    for (const hex of chunk.hexes.values()) {
      const { x, y } = hexToPixel(hex.q, hex.r, hexSize);
      const lx = x - offsetX;
      const ly = y - offsetY;

      const objType = hex.object?.type ?? 'empty';
      tctx.fillStyle = FILL_COLORS[objType] ?? FILL_COLORS.empty;
      this.drawHex(tctx, lx, ly, hexSize);
    }

    chunk.dirty = false;
    // Store offset for blitting
    (chunk as any)._texOffsetX = offsetX;
    (chunk as any)._texOffsetY = offsetY;
  }

  private blitChunk(
    ctx: CanvasRenderingContext2D,
    chunk: Chunk,
    _hexSize: number,
  ): void {
    if (!chunk.texture) return;
    const offsetX = (chunk as any)._texOffsetX ?? 0;
    const offsetY = (chunk as any)._texOffsetY ?? 0;
    ctx.drawImage(chunk.texture, offsetX, offsetY);
  }

  private drawHex(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
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
