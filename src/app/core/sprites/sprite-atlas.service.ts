import { Injectable, signal } from '@angular/core';
import { UnitType, BuildingType } from '../../models/game-state';

interface SpriteRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

const UNIT_REGIONS: Record<UnitType, SpriteRegion> = {
  scout:        { x: 456, y: 8,  w: 48, h: 48 },
  fighter:      { x: 392, y: 8,  w: 48, h: 48 },
  cruiser:      { x: 328, y: 8,  w: 48, h: 48 },
  colony_ship:  { x: 264, y: 8,  w: 48, h: 48 },
  mining_drone: { x: 200, y: 16, w: 48, h: 32 },
};

const BUILDING_REGIONS: Record<BuildingType, SpriteRegion> = {
  starbase:        { x: 456, y: 72, w: 48, h: 48 },
  colony:          { x: 392, y: 72, w: 48, h: 48 },
  mining_station:  { x: 264, y: 72, w: 48, h: 48 },
  solar_collector: { x: 200, y: 72, w: 48, h: 48 },
  research_lab:    { x: 144, y: 72, w: 48, h: 48 },
};

// Atlas is rendered at 2x for crispness
const SCALE = 2;
const SVG_WIDTH = 512;
const SVG_HEIGHT = 384;

export { UNIT_REGIONS, BUILDING_REGIONS };
export type { SpriteRegion };

@Injectable({ providedIn: 'root' })
export class SpriteAtlasService {
  private readonly _ready = signal(false);
  readonly ready = this._ready.asReadonly();

  private masterCanvas: OffscreenCanvas | null = null;
  private tintCache = new Map<string, OffscreenCanvas>();
  private loading = false;

  load(): void {
    if (this.loading || this._ready()) return;
    this.loading = true;
    this.loadAsync();
  }

  private async loadAsync(): Promise<void> {
    try {
      const resp = await fetch('image/simpleSpace_vector.svg');
      let svgText = await resp.text();

      // Inject viewBox if missing
      svgText = svgText.replace(
        /<svg([^>]*)>/,
        (match, attrs) => {
          if (attrs.includes('viewBox')) return match;
          return `<svg${attrs} viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">`;
        },
      );

      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load SVG atlas'));
      });

      URL.revokeObjectURL(url);

      const canvas = new OffscreenCanvas(SVG_WIDTH * SCALE, SVG_HEIGHT * SCALE);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, SVG_WIDTH * SCALE, SVG_HEIGHT * SCALE);

      this.masterCanvas = canvas;
      this._ready.set(true);
    } catch {
      // Atlas failed to load — fallback shapes will be used
    }
  }

  drawUnit(
    ctx: CanvasRenderingContext2D,
    unitType: UnitType,
    color: string,
    cx: number,
    cy: number,
    size: number,
  ): boolean {
    if (!this._ready() || !this.masterCanvas) return false;
    const region = UNIT_REGIONS[unitType];
    if (!region) return false;
    this.drawSprite(ctx, region, color, cx, cy, size);
    return true;
  }

  drawBuilding(
    ctx: CanvasRenderingContext2D,
    buildingType: BuildingType,
    color: string,
    cx: number,
    cy: number,
    size: number,
  ): boolean {
    if (!this._ready() || !this.masterCanvas) return false;
    const region = BUILDING_REGIONS[buildingType];
    if (!region) return false;
    this.drawSprite(ctx, region, color, cx, cy, size);
    return true;
  }

  private drawSprite(
    ctx: CanvasRenderingContext2D,
    region: SpriteRegion,
    color: string,
    cx: number,
    cy: number,
    size: number,
  ): void {
    const tinted = this.getTintedAtlas(color);
    const drawSize = size * 2;

    // Preserve aspect ratio
    const aspect = region.w / region.h;
    let dw: number, dh: number;
    if (aspect >= 1) {
      dw = drawSize;
      dh = drawSize / aspect;
    } else {
      dh = drawSize;
      dw = drawSize * aspect;
    }

    ctx.drawImage(
      tinted,
      region.x * SCALE, region.y * SCALE,
      region.w * SCALE, region.h * SCALE,
      cx - dw / 2, cy - dh / 2,
      dw, dh,
    );
  }

  private getTintedAtlas(color: string): OffscreenCanvas {
    const cached = this.tintCache.get(color);
    if (cached) return cached;

    const master = this.masterCanvas!;
    const w = master.width;
    const h = master.height;

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;

    // Draw master atlas
    ctx.drawImage(master, 0, 0);

    // Multiply with player color (white → color, gray → darker shade)
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);

    // Restore original alpha from master
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(master, 0, 0);

    // Reset composite op
    ctx.globalCompositeOperation = 'source-over';

    this.tintCache.set(color, canvas);
    return canvas;
  }
}
