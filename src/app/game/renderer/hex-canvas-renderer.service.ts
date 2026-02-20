import { Injectable } from '@angular/core';
import { CameraService } from '../../core/camera/camera.service';
import { Chunk } from '../../models/chunk';
import { UnitData, UnitType } from '../../models/game-state';
import { StellarObjectType } from '../../models/hex-data';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexToPixel } from '../../shared/hex/hex-math';
import { CHUNK_SIZE } from '../../core/generation/world-generator.service';
import { UnitAnimation } from './animation.service';

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
    hoveredHex: HexCoord | null,
    selectedHex: HexCoord | null,
    units?: Map<string, UnitData>,
    playerColors?: Map<string, string>,
    selectedUnitId?: string | null,
    reachableHexes?: Map<string, number> | null,
    pathPreview?: HexCoord[] | null,
    unitAnimation?: UnitAnimation | null,
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
      this.blitChunk(ctx, chunk);
    }

    // Movement range overlay
    if (reachableHexes) {
      for (const key of reachableHexes.keys()) {
        const [q, r] = key.split(',').map(Number);
        this.drawHexOverlay(ctx, { q, r, s: -q - r }, hexSize, 'rgba(59, 130, 246, 0.15)', null);
      }
    }

    // Path preview
    if (pathPreview && pathPreview.length > 1) {
      this.drawPathLine(ctx, pathPreview, hexSize);
    }

    // Draw units
    if (units) {
      for (const unit of units.values()) {
        const color = playerColors?.get(unit.ownerId) ?? '#ffffff';
        const isSelected = unit.id === selectedUnitId;

        // If this unit is animating, draw at interpolated position
        if (unitAnimation && unitAnimation.unitId === unit.id) {
          const fromHex = unitAnimation.path[unitAnimation.currentStep];
          const toHex = unitAnimation.path[unitAnimation.currentStep + 1];
          if (fromHex && toHex) {
            const from = hexToPixel(fromHex.q, fromHex.r, hexSize);
            const to = hexToPixel(toHex.q, toHex.r, hexSize);
            const ax = from.x + (to.x - from.x) * unitAnimation.t;
            const ay = from.y + (to.y - from.y) * unitAnimation.t;
            this.drawUnitAt(ctx, unit, hexSize, color, isSelected, ax, ay);
            continue;
          }
        }

        this.drawUnit(ctx, unit, hexSize, color, isSelected);
      }
    }

    // Overlays drawn on main canvas, not chunk textures
    if (hoveredHex) {
      this.drawHexOverlay(ctx, hoveredHex, hexSize, 'rgba(255, 255, 255, 0.1)', null);
    }
    if (selectedHex) {
      this.drawHexOverlay(ctx, selectedHex, hexSize, 'rgba(0, 255, 255, 0.15)', '#00e5ff');
    }

    ctx.restore();
  }

  private drawHexOverlay(
    ctx: CanvasRenderingContext2D,
    hex: HexCoord,
    hexSize: number,
    fillColor: string | null,
    strokeColor: string | null,
  ): void {
    const { x, y } = hexToPixel(hex.q, hex.r, hexSize);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const vx = x + hexSize * Math.cos(angle);
      const vy = y + hexSize * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(vx, vy);
      } else {
        ctx.lineTo(vx, vy);
      }
    }
    ctx.closePath();
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawPathLine(ctx: CanvasRenderingContext2D, path: HexCoord[], hexSize: number): void {
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const { x, y } = hexToPixel(path[i].q, path[i].r, hexSize);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow at destination
    const dest = path[path.length - 1];
    const { x, y } = hexToPixel(dest.q, dest.r, hexSize);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.fill();
  }

  private renderChunkTexture(chunk: Chunk, hexSize: number): void {
    if (!chunk.dirty && chunk.texture) return;

    const padding = hexSize * 2;
    const sampleHexes = [
      { dq: 0, dr: 0 },
      { dq: CHUNK_SIZE - 1, dr: 0 },
      { dq: 0, dr: CHUNK_SIZE - 1 },
      { dq: CHUNK_SIZE - 1, dr: CHUNK_SIZE - 1 },
    ];
    const baseQ = chunk.coord.cx * CHUNK_SIZE;
    const baseR = chunk.coord.cy * CHUNK_SIZE;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
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
    (chunk as any)._texOffsetX = offsetX;
    (chunk as any)._texOffsetY = offsetY;
  }

  private blitChunk(ctx: CanvasRenderingContext2D, chunk: Chunk): void {
    if (!chunk.texture) return;
    const offsetX = (chunk as any)._texOffsetX ?? 0;
    const offsetY = (chunk as any)._texOffsetY ?? 0;
    ctx.drawImage(chunk.texture, offsetX, offsetY);
  }

  private drawUnit(
    ctx: CanvasRenderingContext2D,
    unit: UnitData,
    hexSize: number,
    color: string,
    isSelected: boolean,
  ): void {
    const { x, y } = hexToPixel(unit.q, unit.r, hexSize);
    this.drawUnitAt(ctx, unit, hexSize, color, isSelected, x, y);
  }

  private drawUnitAt(
    ctx: CanvasRenderingContext2D,
    unit: UnitData,
    hexSize: number,
    color: string,
    isSelected: boolean,
    x: number,
    y: number,
  ): void {
    const r = hexSize * 0.35;

    // Selected unit highlight ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Type-specific shape
    ctx.beginPath();
    this.traceUnitShape(ctx, x, y, r, unit.type);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Health bar (only when damaged)
    if (unit.health < unit.maxHealth) {
      const barW = r * 2;
      const barH = 3;
      const barX = x - r;
      const barY = y + r + 4;
      const ratio = unit.health / unit.maxHealth;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(barX, barY, barW * ratio, barH);
    }
  }

  private traceUnitShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    type: UnitType,
  ): void {
    switch (type) {
      case 'scout':
        // Triangle pointing up
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.85, y + r * 0.6);
        ctx.lineTo(x - r * 0.85, y + r * 0.6);
        break;
      case 'fighter':
        // Diamond
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        break;
      case 'cruiser':
        // Pentagon
        for (let i = 0; i < 5; i++) {
          const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          const px = x + r * Math.cos(angle);
          const py = y + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        break;
      case 'colony_ship':
        // Rounded square (draw as octagon approximation)
        const s = r * 0.75;
        ctx.moveTo(x - s, y - s * 0.5);
        ctx.lineTo(x - s * 0.5, y - s);
        ctx.lineTo(x + s * 0.5, y - s);
        ctx.lineTo(x + s, y - s * 0.5);
        ctx.lineTo(x + s, y + s * 0.5);
        ctx.lineTo(x + s * 0.5, y + s);
        ctx.lineTo(x - s * 0.5, y + s);
        ctx.lineTo(x - s, y + s * 0.5);
        break;
      case 'mining_drone':
        // Small circle
        ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
        break;
    }
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
