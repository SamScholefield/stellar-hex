import { describe, it, expect } from 'vitest';
import { gameReducer } from './game-reducer';
import { GameState, DynamicObject, Resources, UnitData } from '../../models/game-state';

function makeResources(overrides: Partial<Resources> = {}): Resources {
  return { energy: 100, minerals: 50, alloys: 20, credits: 30, ...overrides };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    currentPlayerIndex: 0,
    players: [
      { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources(), isAI: false },
      { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true },
    ],
    units: new Map(),
    buildings: new Map(),
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    seed: 12345,
    ...overrides,
  };
}

describe('gameReducer', () => {
  describe('END_TURN', () => {
    it('advances to next player', () => {
      const state = makeState();
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.currentPlayerIndex).toBe(1);
    });

    it('wraps back to player 0 and increments turn', () => {
      const state = makeState({ currentPlayerIndex: 1 });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.currentPlayerIndex).toBe(0);
      expect(next.turn).toBe(2);
    });

    it('does not increment turn when not wrapping', () => {
      const state = makeState({ currentPlayerIndex: 0 });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.turn).toBe(1);
    });

    it('refreshes movement points for the next player units', () => {
      const units = new Map<string, UnitData>([
        [
          'u1',
          {
            id: 'u1', ownerId: 'p2', type: 'scout', q: 0, r: 0,
            movementPoints: 0, maxMovementPoints: 3,
            health: 10, maxHealth: 10, attack: 2, defense: 1, range: 1, sightRange: 3,
          },
        ],
        [
          'u2',
          {
            id: 'u2', ownerId: 'p1', type: 'scout', q: 1, r: 0,
            movementPoints: 0, maxMovementPoints: 3,
            health: 10, maxHealth: 10, attack: 2, defense: 1, range: 1, sightRange: 3,
          },
        ],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'END_TURN' });
      // Next player is p2
      expect(next.units.get('u1')!.movementPoints).toBe(3);
      // p1's unit should not be refreshed
      expect(next.units.get('u2')!.movementPoints).toBe(0);
    });

    it('does not mutate the original state', () => {
      const state = makeState();
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(state.currentPlayerIndex).toBe(0);
      expect(next).not.toBe(state);
    });
  });

  describe('ADVANCE_COMETS', () => {
    it('moves comets by their velocity', () => {
      const dynamicObjects = new Map<string, DynamicObject>([
        ['c1', { id: 'c1', type: 'comet', q: 5, r: 3, velocity: { q: 1, r: -1, s: 0 } }],
      ]);
      const state = makeState({ dynamicObjects });
      const next = gameReducer(state, { type: 'ADVANCE_COMETS' });
      const comet = next.dynamicObjects.get('c1')!;
      expect(comet.q).toBe(6);
      expect(comet.r).toBe(2);
    });

    it('does not mutate original dynamic objects', () => {
      const dynamicObjects = new Map<string, DynamicObject>([
        ['c1', { id: 'c1', type: 'comet', q: 0, r: 0, velocity: { q: 1, r: 0, s: -1 } }],
      ]);
      const state = makeState({ dynamicObjects });
      gameReducer(state, { type: 'ADVANCE_COMETS' });
      expect(state.dynamicObjects.get('c1')!.q).toBe(0);
    });

    it('returns same state when no dynamic objects', () => {
      const state = makeState();
      const next = gameReducer(state, { type: 'ADVANCE_COMETS' });
      expect(next).toBe(state);
    });
  });

  describe('END_TURN triggers comet advance on new round', () => {
    it('advances comets when wrapping to player 0', () => {
      const dynamicObjects = new Map<string, DynamicObject>([
        ['c1', { id: 'c1', type: 'comet', q: 10, r: 5, velocity: { q: -1, r: 1, s: 0 } }],
      ]);
      const state = makeState({ currentPlayerIndex: 1, dynamicObjects });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.currentPlayerIndex).toBe(0);
      expect(next.dynamicObjects.get('c1')!.q).toBe(9);
      expect(next.dynamicObjects.get('c1')!.r).toBe(6);
    });

    it('does not advance comets mid-round', () => {
      const dynamicObjects = new Map<string, DynamicObject>([
        ['c1', { id: 'c1', type: 'comet', q: 10, r: 5, velocity: { q: -1, r: 1, s: 0 } }],
      ]);
      const state = makeState({ currentPlayerIndex: 0, dynamicObjects });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.dynamicObjects.get('c1')!.q).toBe(10);
    });
  });

  describe('MOVE_UNIT', () => {
    it('moves unit to destination and deducts movement points', () => {
      const units = new Map<string, UnitData>([
        ['u1', {
          id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0,
          movementPoints: 4, maxMovementPoints: 4,
          health: 8, maxHealth: 8, attack: 2, defense: 1, range: 1, sightRange: 4,
        }],
      ]);
      const state = makeState({ units });
      const path = [
        { q: 0, r: 0, s: 0 },
        { q: 1, r: 0, s: -1 },
        { q: 2, r: 0, s: -2 },
      ];
      const next = gameReducer(state, { type: 'MOVE_UNIT', unitId: 'u1', path });
      const unit = next.units.get('u1')!;
      expect(unit.q).toBe(2);
      expect(unit.r).toBe(0);
      expect(unit.movementPoints).toBe(2);
    });

    it('does not mutate original state', () => {
      const units = new Map<string, UnitData>([
        ['u1', {
          id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0,
          movementPoints: 3, maxMovementPoints: 3,
          health: 8, maxHealth: 8, attack: 2, defense: 1, range: 1, sightRange: 4,
        }],
      ]);
      const state = makeState({ units });
      const path = [{ q: 0, r: 0, s: 0 }, { q: 1, r: 0, s: -1 }];
      gameReducer(state, { type: 'MOVE_UNIT', unitId: 'u1', path });
      expect(state.units.get('u1')!.q).toBe(0);
    });

    it('returns same state for unknown unit', () => {
      const state = makeState();
      const path = [{ q: 0, r: 0, s: 0 }, { q: 1, r: 0, s: -1 }];
      const next = gameReducer(state, { type: 'MOVE_UNIT', unitId: 'missing', path });
      expect(next).toBe(state);
    });

    it('returns same state when not enough movement points', () => {
      const units = new Map<string, UnitData>([
        ['u1', {
          id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0,
          movementPoints: 1, maxMovementPoints: 4,
          health: 8, maxHealth: 8, attack: 2, defense: 1, range: 1, sightRange: 4,
        }],
      ]);
      const state = makeState({ units });
      const path = [
        { q: 0, r: 0, s: 0 },
        { q: 1, r: 0, s: -1 },
        { q: 2, r: 0, s: -2 },
        { q: 3, r: 0, s: -3 },
      ];
      const next = gameReducer(state, { type: 'MOVE_UNIT', unitId: 'u1', path });
      expect(next).toBe(state);
    });
  });

  it('returns same state for unknown action', () => {
    const state = makeState();
    const next = gameReducer(state, { type: 'HARVEST', unitId: 'u1' });
    expect(next).toBe(state);
  });
});
