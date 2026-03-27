import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CameraService } from '../../core/camera/camera.service';
import { GameStateService } from '../../core/state/game-state.service';
import { VisionService } from '../../core/vision/vision.service';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { HEX_SIZE, hexToPixel } from '../../shared/hex/hex-math';
import { StellarObjectType } from '../../models/hex-data';

const SIZE = 200;
const PADDING = 10;

const MINIMAP_COLORS: Record<StellarObjectType, string> = {
  star: '#f0c040',
  planet: '#4080d0',
  moon: '#c0c0c0',
  asteroid: '#808080',
  asteroid_field: '#606060',
  comet: '#40e0d0',
  nebula: '#6a0dad',
  black_hole: '#8b0000',
  empty: '#1a1a2e',
};

export interface MinimapBounds {
  minX: number; minY: number;
  maxX: number; maxY: number;
  width: number; height: number;
  scale: number;
  offsetX: number; offsetY: number;
}

export function worldToMinimap(wx: number, wy: number, b: MinimapBounds): { mx: number; my: number } {
  return {
    mx: (wx - b.minX) * b.scale + b.offsetX,
    my: (wy - b.minY) * b.scale + b.offsetY,
  };
}

export function minimapToWorld(mx: number, my: number, b: MinimapBounds): { wx: number; wy: number } {
  return {
    wx: (mx - b.offsetX) / b.scale + b.minX,
    wy: (my - b.offsetY) / b.scale + b.minY,
  };
}

@Component({
  selector: 'app-minimap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'onClick($event)',
  },
  template: `<canvas #minimapCanvas width="${SIZE}" height="${SIZE}"></canvas>`,
  styles: `
    :host {
      display: block;
      pointer-events: auto;
      cursor: crosshair;
    }
    canvas {
      display: block;
      width: ${SIZE}px;
      height: ${SIZE}px;
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: var(--panel-radius-sm);
    }
  `,
})
export class MinimapComponent {
  private readonly camera = inject(CameraService);
  private readonly gameState = inject(GameStateService);
  private readonly vision = inject(VisionService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('minimapCanvas');

  private terrainCache: OffscreenCanvas | null = null;
  private terrainExploredId: Set<string> | null = null;
  private readonly ready = signal(false);

  /** Bounding box of explored area in world coords. */
  private readonly bounds = computed<MinimapBounds | null>(() => {
    const explored = this.vision.humanExploredHexes();
    if (explored.size === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const key of explored) {
      const sep = key.indexOf(',');
      const q = +key.slice(0, sep);
      const r = +key.slice(sep + 1);
      const { x, y } = hexToPixel(q, r, HEX_SIZE);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const usable = SIZE - PADDING * 2;
    const scale = Math.min(usable / width, usable / height);
    const offsetX = (SIZE - width * scale) / 2;
    const offsetY = (SIZE - height * scale) / 2;
    return { minX, minY, maxX, maxY, width, height, scale, offsetX, offsetY };
  });

  constructor() {
    afterNextRender(() => { this.ready.set(true); });

    effect(() => {
      const bounds = this.bounds();
      if (!bounds || !this.ready()) return;
      this.render(bounds);
    });
  }

  onClick(event: MouseEvent): void {
    const b = this.bounds();
    if (!b) return;
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const { wx, wy } = minimapToWorld(mx, my, b);
    this.camera.centerOn(wx, wy);
  }

  private render(b: MinimapBounds): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Terrain layer (cached)
    this.renderTerrainCached(b);
    if (this.terrainCache) {
      ctx.drawImage(this.terrainCache, 0, 0);
    }

    // Dynamic layer: units (only show enemies within current vision)
    const units = this.gameState.units();
    const playerColors = this.gameState.playerColors();
    const humanPlayerId = this.gameState.humanPlayer()?.id;
    const visible = this.vision.humanVisibleHexes();
    for (const unit of units.values()) {
      if (unit.ownerId !== humanPlayerId && !visible.has(`${unit.q},${unit.r}`)) continue;
      const { x, y } = hexToPixel(unit.q, unit.r, HEX_SIZE);
      const { mx, my } = worldToMinimap(x, y, b);
      ctx.fillStyle = playerColors.get(unit.ownerId) ?? '#ffffff';
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }

    // Dynamic layer: buildings (only show enemies within current vision)
    const buildings = this.gameState.buildings();
    for (const building of buildings.values()) {
      if (building.ownerId !== humanPlayerId && !visible.has(`${building.q},${building.r}`)) continue;
      const { x, y } = hexToPixel(building.q, building.r, HEX_SIZE);
      const { mx, my } = worldToMinimap(x, y, b);
      ctx.fillStyle = playerColors.get(building.ownerId) ?? '#ffffff';
      ctx.globalAlpha = 0.6;
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Viewport rectangle (clamped to canvas)
    const vp = this.camera.viewport();
    const tl = worldToMinimap(vp.left, vp.top, b);
    const br = worldToMinimap(vp.right, vp.bottom, b);
    const x1 = Math.max(0, tl.mx);
    const y1 = Math.max(0, tl.my);
    const x2 = Math.min(SIZE, br.mx);
    const y2 = Math.min(SIZE, br.my);
    if (x2 > x1 && y2 > y1) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
  }

  private renderTerrainCached(b: MinimapBounds): void {
    const explored = this.vision.humanExploredHexes();
    if (this.terrainExploredId === explored && this.terrainCache) return;

    if (!this.terrainCache) {
      this.terrainCache = new OffscreenCanvas(SIZE, SIZE);
    }
    const ctx = this.terrainCache.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    for (const key of explored) {
      const sep = key.indexOf(',');
      const q = +key.slice(0, sep);
      const r = +key.slice(sep + 1);
      const hex = this.chunkManager.getHex(q, r);
      const objType = hex?.object?.type ?? 'empty';
      const { x, y } = hexToPixel(q, r, HEX_SIZE);
      const { mx, my } = worldToMinimap(x, y, b);

      ctx.fillStyle = MINIMAP_COLORS[objType] ?? MINIMAP_COLORS.empty;
      const dotSize = objType === 'empty' ? 1 : 2;
      ctx.fillRect(mx - dotSize / 2, my - dotSize / 2, dotSize, dotSize);
    }

    this.terrainExploredId = explored;
  }
}
