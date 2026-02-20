import { describe, it, expect } from 'vitest';
import { gameReducer } from './game-reducer';
import { GameState, DynamicObject, Resources, UnitData, BuildingData, BUILDING_STATS } from '../../models/game-state';

function makeResources(overrides: Partial<Resources> = {}): Resources {
  return { energy: 100, minerals: 50, alloys: 20, credits: 30, ...overrides };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    currentPlayerIndex: 0,
    players: [
      { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources(), isAI: false, exploredHexes: new Set<string>() },
      { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set<string>() },
    ],
    units: new Map(),
    buildings: new Map(),
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    anomalies: new Map(),
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

  describe('BUILD', () => {
    it('places building and deducts resources', () => {
      const state = makeState();
      const hex = { q: 5, r: 3, s: -8 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'mining_station', hex, hexType: 'asteroid' });
      const buildings = [...next.buildings.values()];
      expect(buildings.length).toBe(1);
      expect(buildings[0].type).toBe('mining_station');
      expect(buildings[0].q).toBe(5);
      expect(buildings[0].r).toBe(3);
      expect(buildings[0].ownerId).toBe('p1');
      // mining_station cost: energy:20, minerals:5
      expect(next.players[0].resources.energy).toBe(80);
      expect(next.players[0].resources.minerals).toBe(45);
    });

    it('rejects placement with insufficient resources', () => {
      const state = makeState({
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ energy: 5 }), isAI: false, exploredHexes: new Set() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set() },
        ],
      });
      const hex = { q: 0, r: 0, s: 0 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'mining_station', hex, hexType: 'asteroid' });
      expect(next.buildings.size).toBe(0);
    });

    it('rejects placement on wrong hex type', () => {
      const state = makeState();
      const hex = { q: 0, r: 0, s: 0 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'mining_station', hex, hexType: 'planet' });
      expect(next.buildings.size).toBe(0);
    });

    it('rejects duplicate building at same hex', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 5, r: 3, health: 15, maxHealth: 15 }],
      ]);
      const state = makeState({ buildings });
      const hex = { q: 5, r: 3, s: -8 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'colony', hex, hexType: 'planet' });
      expect(next.buildings.size).toBe(1);
    });

    it('consumes colony_ship when building colony', () => {
      const units = new Map<string, UnitData>([
        ['u1', {
          id: 'u1', ownerId: 'p1', type: 'colony_ship', q: 2, r: 4,
          movementPoints: 2, maxMovementPoints: 2,
          health: 12, maxHealth: 12, attack: 0, defense: 2, range: 0, sightRange: 2,
        }],
      ]);
      const state = makeState({ units });
      const hex = { q: 2, r: 4, s: -6 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'colony', hex, hexType: 'planet' });
      expect(next.buildings.size).toBe(1);
      expect(next.units.size).toBe(0);
    });

    it('rejects colony without colony_ship at hex', () => {
      const state = makeState();
      const hex = { q: 2, r: 4, s: -6 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'colony', hex, hexType: 'planet' });
      expect(next.buildings.size).toBe(0);
    });
  });

  describe('END_TURN resource collection', () => {
    it('collects income from current player buildings', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15 }],
        ['b2', { id: 'b2', ownerId: 'p1', type: 'colony', q: 1, r: 0, health: 30, maxHealth: 30 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'END_TURN' });
      // p1 had: energy:100, minerals:50, alloys:20, credits:30
      // mining_station yields minerals:3, colony yields alloys:2 + credits:2
      expect(next.players[0].resources.minerals).toBe(53);
      expect(next.players[0].resources.alloys).toBe(22);
      expect(next.players[0].resources.credits).toBe(32);
    });

    it('does not collect income from other player buildings', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p2', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'END_TURN' });
      // p1 resources should be unchanged
      expect(next.players[0].resources.minerals).toBe(50);
    });
  });

  describe('END_TURN production queue', () => {
    it('decrements production timer and spawns unit when complete', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', {
          id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50,
          productionQueue: [{ unitType: 'scout', turnsRemaining: 1 }],
        }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'END_TURN' });
      // Unit should be spawned
      expect(next.units.size).toBe(1);
      const unit = [...next.units.values()][0];
      expect(unit.type).toBe('scout');
      expect(unit.q).toBe(0);
      expect(unit.r).toBe(0);
      expect(unit.ownerId).toBe('p1');
      // Queue should be empty
      const building = next.buildings.get('b1')!;
      expect(building.productionQueue).toBeUndefined();
    });

    it('decrements timer but does not spawn if turns remaining > 1', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', {
          id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50,
          productionQueue: [{ unitType: 'cruiser', turnsRemaining: 3 }],
        }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.units.size).toBe(0);
      const building = next.buildings.get('b1')!;
      expect(building.productionQueue!.length).toBe(1);
      expect(building.productionQueue![0].turnsRemaining).toBe(2);
    });
  });

  describe('PRODUCE_UNIT', () => {
    it('adds item to starbase production queue and deducts cost', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'PRODUCE_UNIT', buildingId: 'b1', unitType: 'scout' });
      const building = next.buildings.get('b1')!;
      expect(building.productionQueue!.length).toBe(1);
      expect(building.productionQueue![0].unitType).toBe('scout');
      expect(building.productionQueue![0].turnsRemaining).toBe(2);
      // scout cost: energy:20, alloys:5
      expect(next.players[0].resources.energy).toBe(80);
      expect(next.players[0].resources.alloys).toBe(15);
    });

    it('rejects production on non-starbase building', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'PRODUCE_UNIT', buildingId: 'b1', unitType: 'scout' });
      expect(next).toBe(state);
    });

    it('rejects production with insufficient resources', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50 }],
      ]);
      const state = makeState({
        buildings,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ energy: 0 }), isAI: false, exploredHexes: new Set() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set() },
        ],
      });
      const next = gameReducer(state, { type: 'PRODUCE_UNIT', buildingId: 'b1', unitType: 'scout' });
      expect(next).toBe(state);
    });
  });

  describe('ATTACK', () => {
    function makeAttackerDefender(opts: { attackerMp?: number; distance?: number; attackerRange?: number; defenderRange?: number; attackerHealth?: number; defenderHealth?: number; sameOwner?: boolean } = {}) {
      const dist = opts.distance ?? 1;
      const units = new Map<string, UnitData>([
        ['attacker', {
          id: 'attacker', ownerId: 'p1', type: 'fighter', q: 0, r: 0,
          movementPoints: opts.attackerMp ?? 3, maxMovementPoints: 3,
          health: opts.attackerHealth ?? 15, maxHealth: 15,
          attack: 6, defense: 3, range: opts.attackerRange ?? 1, sightRange: 2,
        }],
        ['defender', {
          id: 'defender', ownerId: opts.sameOwner ? 'p1' : 'p2', type: 'fighter', q: dist, r: 0,
          movementPoints: 3, maxMovementPoints: 3,
          health: opts.defenderHealth ?? 15, maxHealth: 15,
          attack: 6, defense: 3, range: opts.defenderRange ?? 1, sightRange: 2,
        }],
      ]);
      return makeState({ units });
    }

    it('applies damage to both units and sets attacker MP to 0', () => {
      const state = makeAttackerDefender();
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      const attacker = next.units.get('attacker');
      const defender = next.units.get('defender');
      // Both should exist (not destroyed in one hit with these stats)
      expect(attacker).toBeDefined();
      expect(defender).toBeDefined();
      expect(attacker!.movementPoints).toBe(0);
      expect(defender!.health).toBeLessThan(15);
    });

    it('rejects out-of-range attack', () => {
      const state = makeAttackerDefender({ distance: 3, attackerRange: 1 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).toBe(state);
    });

    it('cannot attack own units', () => {
      const state = makeAttackerDefender({ sameOwner: true });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).toBe(state);
    });

    it('removes destroyed defender', () => {
      const state = makeAttackerDefender({ defenderHealth: 1 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next.units.has('defender')).toBe(false);
      expect(next.units.has('attacker')).toBe(true);
    });

    it('removes destroyed attacker from retaliation', () => {
      const state = makeAttackerDefender({ attackerHealth: 1 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      // Attacker has 1 HP and defender retaliates — attacker should be destroyed
      expect(next.units.has('attacker')).toBe(false);
    });

    it('rejects attack with 0 movement points', () => {
      const state = makeAttackerDefender({ attackerMp: 0 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).toBe(state);
    });
  });

  it('returns same state for unknown action', () => {
    const state = makeState();
    const next = gameReducer(state, { type: 'HARVEST', unitId: 'u1' });
    expect(next).toBe(state);
  });
});
