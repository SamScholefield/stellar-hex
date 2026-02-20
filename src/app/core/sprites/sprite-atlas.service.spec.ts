import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SpriteAtlasService, UNIT_REGIONS, BUILDING_REGIONS } from './sprite-atlas.service';
import { UnitType, BuildingType } from '../../models/game-state';

function mockCtx2d(): any {
  return {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  };
}

class MockOffscreenCanvas {
  width: number;
  height: number;
  private _ctx = mockCtx2d();
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext() { return this._ctx; }
}

describe('SpriteAtlasService', () => {
  let service: SpriteAtlasService;

  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    TestBed.configureTestingModule({});
    service = TestBed.inject(SpriteAtlasService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('ready() is false before load()', () => {
    expect(service.ready()).toBe(false);
  });

  describe('sprite region lookups', () => {
    const unitTypes: UnitType[] = ['scout', 'fighter', 'cruiser', 'colony_ship', 'mining_drone'];
    const buildingTypes: BuildingType[] = ['starbase', 'colony', 'mining_station', 'solar_collector', 'research_lab'];

    it('has regions for every unit type', () => {
      for (const type of unitTypes) {
        const region = UNIT_REGIONS[type];
        expect(region).toBeDefined();
        expect(region.w).toBeGreaterThan(0);
        expect(region.h).toBeGreaterThan(0);
      }
    });

    it('has regions for every building type', () => {
      for (const type of buildingTypes) {
        const region = BUILDING_REGIONS[type];
        expect(region).toBeDefined();
        expect(region.w).toBeGreaterThan(0);
        expect(region.h).toBeGreaterThan(0);
      }
    });

    it('scout region matches expected coordinates', () => {
      expect(UNIT_REGIONS.scout).toEqual({ x: 456, y: 8, w: 48, h: 48 });
    });

    it('starbase region matches expected coordinates', () => {
      expect(BUILDING_REGIONS.starbase).toEqual({ x: 456, y: 72, w: 48, h: 48 });
    });
  });

  describe('drawUnit/drawBuilding before load', () => {
    it('drawUnit returns false when not ready', () => {
      const ctx = mockCtx2d();
      expect(service.drawUnit(ctx, 'scout', '#ff0000', 100, 100, 10)).toBe(false);
    });

    it('drawBuilding returns false when not ready', () => {
      const ctx = mockCtx2d();
      expect(service.drawBuilding(ctx, 'colony', '#ff0000', 100, 100, 10)).toBe(false);
    });
  });

  describe('after atlas loaded', () => {
    let ctx: any;

    beforeEach(() => {
      // Simulate loaded atlas via reflection
      (service as any).masterCanvas = new MockOffscreenCanvas(1024, 768);
      (service as any)._ready.set(true);

      ctx = { drawImage: vi.fn() };
    });

    it('drawUnit returns true when ready', () => {
      expect(service.drawUnit(ctx, 'scout', '#ff0000', 50, 50, 10)).toBe(true);
    });

    it('drawBuilding returns true when ready', () => {
      expect(service.drawBuilding(ctx, 'colony', '#00ff00', 50, 50, 8)).toBe(true);
    });

    it('drawUnit calls ctx.drawImage with correct source region', () => {
      service.drawUnit(ctx, 'fighter', '#ff0000', 100, 100, 15);
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);

      const args = ctx.drawImage.mock.calls[0];
      const region = UNIT_REGIONS.fighter;
      expect(args[1]).toBe(region.x * 2);
      expect(args[2]).toBe(region.y * 2);
      expect(args[3]).toBe(region.w * 2);
      expect(args[4]).toBe(region.h * 2);
    });

    it('drawBuilding calls ctx.drawImage with correct source region', () => {
      service.drawBuilding(ctx, 'mining_station', '#0000ff', 80, 80, 12);
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);

      const args = ctx.drawImage.mock.calls[0];
      const region = BUILDING_REGIONS.mining_station;
      expect(args[1]).toBe(region.x * 2);
      expect(args[2]).toBe(region.y * 2);
      expect(args[3]).toBe(region.w * 2);
      expect(args[4]).toBe(region.h * 2);
    });

    it('tinted atlas cache returns same canvas for same color', () => {
      service.drawUnit(ctx, 'scout', '#ff0000', 0, 0, 10);
      service.drawUnit(ctx, 'fighter', '#ff0000', 0, 0, 10);

      const canvas1 = ctx.drawImage.mock.calls[0][0];
      const canvas2 = ctx.drawImage.mock.calls[1][0];
      expect(canvas1).toBe(canvas2);
    });

    it('tinted atlas cache creates different canvas for different color', () => {
      service.drawUnit(ctx, 'scout', '#ff0000', 0, 0, 10);
      service.drawUnit(ctx, 'scout', '#00ff00', 0, 0, 10);

      const canvas1 = ctx.drawImage.mock.calls[0][0];
      const canvas2 = ctx.drawImage.mock.calls[1][0];
      expect(canvas1).not.toBe(canvas2);
    });

    it('draw size is based on size param (size * 2)', () => {
      service.drawUnit(ctx, 'scout', '#ff0000', 100, 100, 15);
      const args = ctx.drawImage.mock.calls[0];
      // scout is 48x48 (aspect 1), so dw = dh = size*2 = 30
      const drawSize = 15 * 2;
      expect(args[7]).toBe(drawSize);
      expect(args[8]).toBe(drawSize);
    });

    it('mining_drone preserves non-square aspect ratio', () => {
      service.drawUnit(ctx, 'mining_drone', '#ff0000', 100, 100, 15);
      const args = ctx.drawImage.mock.calls[0];
      // mining_drone is 48x32 (aspect 1.5), so dw = 30, dh = 20
      const drawSize = 15 * 2;
      expect(args[7]).toBe(drawSize);
      expect(args[8]).toBe(drawSize / 1.5);
    });
  });

  describe('load()', () => {
    it('does not load twice', () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('<svg></svg>'),
      }));
      vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test'), revokeObjectURL: vi.fn() });

      service.load();
      service.load(); // second call should be no-op

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
