import { describe, it, expect } from 'vitest';
import {
  Waypoint,
  SerializedWaypoint,
  serializeWaypoints,
  deserializeWaypoints,
} from './waypoint.service';

describe('serializeWaypoints / deserializeWaypoints', () => {
  it('round-trips a move waypoint', () => {
    const map = new Map<string, Waypoint>();
    map.set('u1', { unitId: 'u1', target: { q: 3, r: -2, s: -1 } });

    const serialized = serializeWaypoints(map);
    expect(serialized).toEqual([{ unitId: 'u1', q: 3, r: -2 }]);

    const restored = deserializeWaypoints(serialized);
    expect(restored.size).toBe(1);
    const wp = restored.get('u1')!;
    expect(wp.unitId).toBe('u1');
    expect(wp.target).toEqual({ q: 3, r: -2, s: -1 });
    expect(wp.attackTargetId).toBeUndefined();
  });

  it('preserves attackTargetId', () => {
    const map = new Map<string, Waypoint>();
    map.set('u2', {
      unitId: 'u2',
      target: { q: 1, r: -1, s: 0 },
      attackTargetId: 'enemy-1',
    });

    const serialized = serializeWaypoints(map);
    expect(serialized[0].attackTargetId).toBe('enemy-1');

    const restored = deserializeWaypoints(serialized);
    expect(restored.get('u2')!.attackTargetId).toBe('enemy-1');
  });

  it('derives s from q and r', () => {
    const data: SerializedWaypoint[] = [{ unitId: 'u3', q: 4, r: -1 }];
    const restored = deserializeWaypoints(data);
    expect(restored.get('u3')!.target.s).toBe(-3);
  });

  it('normalizes s = -0 to 0', () => {
    const data: SerializedWaypoint[] = [{ unitId: 'u4', q: 0, r: 0 }];
    const restored = deserializeWaypoints(data);
    expect(Object.is(restored.get('u4')!.target.s, 0)).toBe(true);
  });

  it('handles empty map and empty array', () => {
    const serialized = serializeWaypoints(new Map());
    expect(serialized).toEqual([]);

    const restored = deserializeWaypoints([]);
    expect(restored.size).toBe(0);
  });

  it('round-trips multiple waypoints', () => {
    const map = new Map<string, Waypoint>();
    map.set('a', { unitId: 'a', target: { q: 1, r: 2, s: -3 } });
    map.set('b', {
      unitId: 'b',
      target: { q: -5, r: 3, s: 2 },
      attackTargetId: 'x',
    });

    const restored = deserializeWaypoints(serializeWaypoints(map));
    expect(restored.size).toBe(2);
    expect(restored.get('a')!.target).toEqual({ q: 1, r: 2, s: -3 });
    expect(restored.get('b')!.attackTargetId).toBe('x');
  });
});
