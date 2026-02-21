import { worldToMinimap, minimapToWorld, MinimapBounds } from './minimap.component';

describe('Minimap coordinate conversion', () => {
  const bounds: MinimapBounds = {
    minX: -100,
    minY: -100,
    maxX: 100,
    maxY: 100,
    width: 200,
    height: 200,
    scale: 0.9,
    offsetX: 10,
    offsetY: 10,
  };

  it('worldToMinimap and minimapToWorld are inverse', () => {
    const wx = 50, wy = -30;
    const { mx, my } = worldToMinimap(wx, wy, bounds);
    const { wx: wx2, wy: wy2 } = minimapToWorld(mx, my, bounds);

    expect(wx2).toBeCloseTo(wx, 5);
    expect(wy2).toBeCloseTo(wy, 5);
  });

  it('worldToMinimap maps minX/minY to offset', () => {
    const zeroBounds: MinimapBounds = {
      minX: 0, minY: 0, maxX: 200, maxY: 200,
      width: 200, height: 200, scale: 0.9, offsetX: 10, offsetY: 10,
    };
    const { mx, my } = worldToMinimap(0, 0, zeroBounds);
    expect(mx).toBe(10);
    expect(my).toBe(10);
  });

  it('worldToMinimap maps maxX/maxY correctly', () => {
    const zeroBounds: MinimapBounds = {
      minX: 0, minY: 0, maxX: 200, maxY: 200,
      width: 200, height: 200, scale: 0.9, offsetX: 10, offsetY: 10,
    };
    const { mx, my } = worldToMinimap(200, 200, zeroBounds);
    expect(mx).toBe(10 + 200 * 0.9);
    expect(my).toBe(10 + 200 * 0.9);
  });

  it('minimapToWorld maps offset to minX/minY', () => {
    const zeroBounds: MinimapBounds = {
      minX: 0, minY: 0, maxX: 200, maxY: 200,
      width: 200, height: 200, scale: 0.9, offsetX: 10, offsetY: 10,
    };
    const { wx, wy } = minimapToWorld(10, 10, zeroBounds);
    expect(wx).toBeCloseTo(0, 5);
    expect(wy).toBeCloseTo(0, 5);
  });
});
