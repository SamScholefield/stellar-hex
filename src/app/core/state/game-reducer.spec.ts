import { describe, it, expect } from 'vitest';
import { gameReducer, shouldEliminate, checkVictory } from './game-reducer';
import { computeUpkeep } from '../economy/economy.service';
import { GameState, DynamicObject, Resources, UnitData, BuildingData, BUILDING_STATS, UNIT_STATS, Anomaly, ECONOMIC_VICTORY_CREDITS } from '../../models/game-state';

function makeResources(overrides: Partial<Resources> = {}): Resources {
  return { energy: 100, minerals: 50, alloys: 20, credits: 30, ...overrides };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    currentPlayerIndex: 0,
    players: [
      { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources(), isAI: false, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
      { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
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

function makeUnitData(overrides: Partial<UnitData> & { id: string; ownerId: string; type: UnitData['type'] }): UnitData {
  const stats = UNIT_STATS[overrides.type];
  return {
    name: `${overrides.type} T001`,
    q: 0,
    r: 0,
    movementPoints: stats.maxMovementPoints,
    maxMovementPoints: stats.maxMovementPoints,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    attack: stats.attack,
    defense: stats.defense,
    range: stats.range,
    sightRange: stats.sightRange,
    size: stats.size,
    weapon: stats.weapon,
    armor: stats.armor,
    shields: stats.maxShields,
    maxShields: stats.maxShields,
    xp: 0,
    veteranTier: 'standard',
    hasAttacked: false,
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
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p2', type: 'scout', movementPoints: 0 })],
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p1', type: 'scout', q: 1, movementPoints: 0 })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.units.get('u1')!.movementPoints).toBe(UNIT_STATS.scout.maxMovementPoints);
      expect(next.units.get('u2')!.movementPoints).toBe(0);
    });

    it('does not mutate the original state', () => {
      const state = makeState();
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(state.currentPlayerIndex).toBe(0);
      expect(next).not.toBe(state);
    });

    it('regenerates shields by 1 on turn refresh', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({
          id: 'u1', ownerId: 'p2', type: 'fighter',
          shields: 0, maxShields: 2,
        })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.units.get('u1')!.shields).toBe(1);
    });

    it('does not regenerate shields beyond maxShields', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({
          id: 'u1', ownerId: 'p2', type: 'fighter',
          shields: 2, maxShields: 2,
        })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.units.get('u1')!.shields).toBe(2);
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
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', movementPoints: 4 })],
      ]);
      const state = makeState({ units });
      const path = [
        { q: 0, r: 0, s: 0 },
        { q: 1, r: 0, s: -1 },
        { q: 2, r: 0, s: -2 },
      ];
      const next = gameReducer(state, { type: 'MOVE_UNIT', unitId: 'u1', path, cost: 2 });
      const unit = next.units.get('u1')!;
      expect(unit.q).toBe(2);
      expect(unit.r).toBe(0);
      expect(unit.movementPoints).toBe(2);
    });

    it('does not mutate original state', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', movementPoints: 3 })],
      ]);
      const state = makeState({ units });
      const path = [{ q: 0, r: 0, s: 0 }, { q: 1, r: 0, s: -1 }];
      gameReducer(state, { type: 'MOVE_UNIT', unitId: 'u1', path, cost: 1 });
      expect(state.units.get('u1')!.q).toBe(0);
    });

    it('returns same state for unknown unit', () => {
      const state = makeState();
      const path = [{ q: 0, r: 0, s: 0 }, { q: 1, r: 0, s: -1 }];
      const next = gameReducer(state, { type: 'MOVE_UNIT', unitId: 'missing', path, cost: 1 });
      expect(next).toBe(state);
    });

    it('returns same state when not enough movement points', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', movementPoints: 1 })],
      ]);
      const state = makeState({ units });
      const path = [
        { q: 0, r: 0, s: 0 },
        { q: 1, r: 0, s: -1 },
        { q: 2, r: 0, s: -2 },
        { q: 3, r: 0, s: -3 },
      ];
      const next = gameReducer(state, { type: 'MOVE_UNIT', unitId: 'u1', path, cost: 3 });
      expect(next).toBe(state);
    });
  });

  describe('BUILD', () => {
    it('places building and deducts resources', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', q: 5, r: 3 })],
      ]);
      const state = makeState({ units });
      const hex = { q: 5, r: 3, s: -8 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'mining_station', hex, hexType: 'asteroid' });
      const buildings = [...next.buildings.values()];
      expect(buildings.length).toBe(1);
      expect(buildings[0].type).toBe('mining_station');
      expect(buildings[0].q).toBe(5);
      expect(buildings[0].r).toBe(3);
      expect(buildings[0].ownerId).toBe('p1');
      expect(next.players[0].resources.energy).toBe(80);
      expect(next.players[0].resources.minerals).toBe(45);
    });

    it('rejects placement with insufficient resources', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout' })],
      ]);
      const state = makeState({
        units,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ energy: 5 }), isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        ],
      });
      const hex = { q: 0, r: 0, s: 0 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'mining_station', hex, hexType: 'asteroid' });
      expect(next.buildings.size).toBe(0);
    });

    it('rejects placement on wrong hex type', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout' })],
      ]);
      const state = makeState({ units });
      const hex = { q: 0, r: 0, s: 0 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'mining_station', hex, hexType: 'planet' });
      expect(next.buildings.size).toBe(0);
    });

    it('rejects duplicate building at same hex', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', q: 5, r: 3 })],
      ]);
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 5, r: 3, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
      ]);
      const state = makeState({ units, buildings });
      const hex = { q: 5, r: 3, s: -8 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'colony', hex, hexType: 'planet' });
      expect(next.buildings.size).toBe(1);
    });

    it('consumes colony_ship when building colony', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'colony_ship', q: 2, r: 4 })],
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

    it('rejects building without friendly unit at hex', () => {
      const state = makeState();
      const hex = { q: 5, r: 3, s: -8 };
      const next = gameReducer(state, { type: 'BUILD', playerId: 'p1', buildingType: 'mining_station', hex, hexType: 'asteroid' });
      expect(next.buildings.size).toBe(0);
    });
  });

  describe('END_TURN resource collection', () => {
    it('collects income from current player buildings', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
        ['b2', { id: 'b2', ownerId: 'p1', type: 'colony', q: 1, r: 0, health: 30, maxHealth: 30, shields: 10, maxShields: 10 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.players[0].resources.minerals).toBe(53);
      expect(next.players[0].resources.alloys).toBe(22);
      expect(next.players[0].resources.credits).toBe(32);
    });

    it('does not collect income from other player buildings', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p2', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.players[0].resources.minerals).toBe(50);
    });

    it('adds miningYields to current player resources', () => {
      const state = makeState();
      const next = gameReducer(state, { type: 'END_TURN', miningYields: { minerals: 5, energy: 2 } });
      expect(next.players[0].resources.minerals).toBe(55);
      expect(next.players[0].resources.energy).toBe(102);
    });

    it('combines building income and miningYields', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'END_TURN', miningYields: { minerals: 4 } });
      expect(next.players[0].resources.minerals).toBe(57);
    });

    it('works without miningYields (backward compatible)', () => {
      const state = makeState();
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.players[0].resources.energy).toBe(100);
      expect(next.players[0].resources.minerals).toBe(50);
      expect(next.players[0].resources.alloys).toBe(20);
      expect(next.players[0].resources.credits).toBe(30);
    });

    it('handles miningYields with all resource types', () => {
      const state = makeState();
      const next = gameReducer(state, {
        type: 'END_TURN',
        miningYields: { energy: 1, minerals: 2, alloys: 3, credits: 4 },
      });
      expect(next.players[0].resources.energy).toBe(101);
      expect(next.players[0].resources.minerals).toBe(52);
      expect(next.players[0].resources.alloys).toBe(23);
      expect(next.players[0].resources.credits).toBe(34);
    });
  });

  describe('END_TURN production queue', () => {
    it('decrements production timer and spawns unit when complete', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', {
          id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15,
          productionQueue: [{ unitType: 'scout', turnsRemaining: 1 }],
        }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.units.size).toBe(1);
      const unit = [...next.units.values()][0];
      expect(unit.type).toBe('scout');
      expect(unit.q).toBe(0);
      expect(unit.r).toBe(0);
      expect(unit.ownerId).toBe('p1');
      // Spawned unit should have new combat fields
      expect(unit.weapon).toBe('laser');
      expect(unit.size).toBe('small');
      expect(unit.xp).toBe(0);
      expect(unit.veteranTier).toBe('standard');
      const building = next.buildings.get('b1')!;
      expect(building.productionQueue).toBeUndefined();
    });

    it('decrements timer but does not spawn if turns remaining > 1', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', {
          id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15,
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
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'PRODUCE_UNIT', buildingId: 'b1', unitType: 'scout' });
      const building = next.buildings.get('b1')!;
      expect(building.productionQueue!.length).toBe(1);
      expect(building.productionQueue![0].unitType).toBe('scout');
      expect(building.productionQueue![0].turnsRemaining).toBe(UNIT_STATS.scout.buildTurns);
      expect(next.players[0].resources.energy).toBe(80);
      expect(next.players[0].resources.alloys).toBe(15);
    });

    it('uses variable build turns from UNIT_STATS', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15 }],
      ]);
      const state = makeState({
        buildings,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ energy: 200, alloys: 100, credits: 100 }), isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        ],
      });

      const nextBs = gameReducer(state, { type: 'PRODUCE_UNIT', buildingId: 'b1', unitType: 'battleship' });
      expect(nextBs.buildings.get('b1')!.productionQueue![0].turnsRemaining).toBe(UNIT_STATS.battleship.buildTurns);

      const nextFr = gameReducer(state, { type: 'PRODUCE_UNIT', buildingId: 'b1', unitType: 'frigate' });
      expect(nextFr.buildings.get('b1')!.productionQueue![0].turnsRemaining).toBe(UNIT_STATS.frigate.buildTurns);
    });

    it('rejects production on non-starbase building', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
      ]);
      const state = makeState({ buildings });
      const next = gameReducer(state, { type: 'PRODUCE_UNIT', buildingId: 'b1', unitType: 'scout' });
      expect(next).toBe(state);
    });

    it('rejects production with insufficient resources', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15 }],
      ]);
      const state = makeState({
        buildings,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ energy: 0 }), isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
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
        ['attacker', makeUnitData({
          id: 'attacker', ownerId: 'p1', type: 'fighter', q: 0, r: 0,
          movementPoints: opts.attackerMp ?? 3,
          health: opts.attackerHealth ?? UNIT_STATS.fighter.maxHealth,
          range: opts.attackerRange ?? 1,
        })],
        ['defender', makeUnitData({
          id: 'defender', ownerId: opts.sameOwner ? 'p1' : 'p2', type: 'fighter', q: dist, r: 0,
          health: opts.defenderHealth ?? UNIT_STATS.fighter.maxHealth,
          range: opts.defenderRange ?? 1,
        })],
      ]);
      return makeState({ units });
    }

    it('applies damage to both units and sets attacker hasAttacked', () => {
      const state = makeAttackerDefender();
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      const attacker = next.units.get('attacker');
      const defender = next.units.get('defender');
      expect(attacker).toBeDefined();
      expect(defender).toBeDefined();
      expect(attacker!.hasAttacked).toBe(true);
      expect(defender!.health).toBeLessThan(UNIT_STATS.fighter.maxHealth);
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
      expect(next.units.has('attacker')).toBe(false);
    });

    it('allows attack with 0 movement points (move then attack)', () => {
      const state = makeAttackerDefender({ attackerMp: 0 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).not.toBe(state);
      expect(next.units.get('attacker')?.hasAttacked).toBe(true);
    });

    it('rejects attack when unit has already attacked', () => {
      const units = new Map<string, UnitData>([
        ['attacker', makeUnitData({
          id: 'attacker', ownerId: 'p1', type: 'fighter', q: 0, r: 0,
          movementPoints: 3, hasAttacked: true,
        })],
        ['defender', makeUnitData({
          id: 'defender', ownerId: 'p2', type: 'fighter', q: 1, r: 0,
        })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).toBe(state);
    });

    it('range-2 unit can attack at distance 2', () => {
      const state = makeAttackerDefender({ distance: 2, attackerRange: 2 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).not.toBe(state);
      const defender = next.units.get('defender');
      // Defender should have taken damage or been destroyed
      expect(!defender || defender.health < UNIT_STATS.fighter.maxHealth).toBe(true);
    });

    it('range-2 attacker vs range-1 defender at distance 2 — no retaliation', () => {
      const state = makeAttackerDefender({ distance: 2, attackerRange: 2, defenderRange: 1 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).not.toBe(state);
      const attacker = next.units.get('attacker');
      // Attacker should be unscathed (no retaliation from range-1 defender at distance 2)
      expect(attacker).toBeDefined();
      expect(attacker!.health).toBe(UNIT_STATS.fighter.maxHealth);
      expect(attacker!.shields).toBe(UNIT_STATS.fighter.maxShields);
    });

    it('range-2 attacker vs range-2 defender at distance 2 — both strike', () => {
      const state = makeAttackerDefender({ distance: 2, attackerRange: 2, defenderRange: 2 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).not.toBe(state);
      const attacker = next.units.get('attacker');
      const defender = next.units.get('defender');
      // Both should take damage (or one/both destroyed)
      if (attacker && defender) {
        const attackerTookDamage = attacker.health < UNIT_STATS.fighter.maxHealth || attacker.shields < UNIT_STATS.fighter.maxShields;
        const defenderTookDamage = defender.health < UNIT_STATS.fighter.maxHealth || defender.shields < UNIT_STATS.fighter.maxShields;
        expect(attackerTookDamage).toBe(true);
        expect(defenderTookDamage).toBe(true);
      }
    });

    it('range-2 unit rejects attack at distance 3', () => {
      const state = makeAttackerDefender({ distance: 3, attackerRange: 2 });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      expect(next).toBe(state);
    });

    it('adds XP to attacker after combat', () => {
      const state = makeAttackerDefender();
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      const attacker = next.units.get('attacker');
      if (attacker) {
        expect(attacker.xp).toBeGreaterThan(0);
      }
    });

    it('promotes unit when XP threshold reached', () => {
      // Give attacker 49 XP, a kill should push them over 50
      const units = new Map<string, UnitData>([
        ['attacker', makeUnitData({
          id: 'attacker', ownerId: 'p1', type: 'fighter', q: 0, r: 0,
          xp: 49, veteranTier: 'standard',
        })],
        ['defender', makeUnitData({
          id: 'defender', ownerId: 'p2', type: 'scout', q: 1, r: 0,
          health: 1, shields: 0,
        })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      const attacker = next.units.get('attacker');
      if (attacker) {
        expect(attacker.xp).toBeGreaterThanOrEqual(50);
        expect(attacker.veteranTier).toBe('improved');
      }
    });

    it('applies shield damage from combat', () => {
      const units = new Map<string, UnitData>([
        ['attacker', makeUnitData({
          id: 'attacker', ownerId: 'p1', type: 'fighter', q: 0, r: 0,
        })],
        ['defender', makeUnitData({
          id: 'defender', ownerId: 'p2', type: 'cruiser', q: 1, r: 0,
          shields: 8, maxShields: 8,
        })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'ATTACK', attackerId: 'attacker', targetId: 'defender' });
      const defender = next.units.get('defender');
      if (defender) {
        expect(defender.shields).toBeLessThan(8);
      }
    });
  });

  describe('DISCOVER_ANOMALY', () => {
    it('adds anomaly to state', () => {
      const state = makeState();
      const anomaly: Anomaly = { id: 'a1', type: 'derelict_ship', q: 5, r: 3 };
      const next = gameReducer(state, { type: 'DISCOVER_ANOMALY', anomaly });
      expect(next.anomalies.size).toBe(1);
      expect(next.anomalies.get('a1')).toEqual(anomaly);
    });

    it('does not duplicate existing anomaly', () => {
      const anomaly: Anomaly = { id: 'a1', type: 'derelict_ship', q: 5, r: 3 };
      const anomalies = new Map([['a1', anomaly]]);
      const state = makeState({ anomalies });
      const next = gameReducer(state, { type: 'DISCOVER_ANOMALY', anomaly });
      expect(next).toBe(state);
    });
  });

  describe('COLLECT_ANOMALY', () => {
    function makeCollectState(opts: { unitType?: string; mp?: number; unitQ?: number; unitR?: number } = {}) {
      const anomaly: Anomaly = { id: 'a1', type: 'resource_cache', q: 3, r: 2 };
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({
          id: 'u1', ownerId: 'p1', type: (opts.unitType ?? 'scout') as any,
          q: opts.unitQ ?? 3, r: opts.unitR ?? 2,
          movementPoints: opts.mp ?? 4,
        })],
      ]);
      return makeState({ units, anomalies: new Map([['a1', anomaly]]) });
    }

    it('grants resources and removes anomaly', () => {
      const state = makeCollectState();
      const next = gameReducer(state, { type: 'COLLECT_ANOMALY', anomalyId: 'a1', unitId: 'u1' });
      expect(next.players[0].resources.minerals).toBe(70);
      expect(next.players[0].resources.energy).toBe(110);
      expect(next.anomalies.size).toBe(0);
    });

    it('does not consume MP', () => {
      const state = makeCollectState({ mp: 2 });
      const next = gameReducer(state, { type: 'COLLECT_ANOMALY', anomalyId: 'a1', unitId: 'u1' });
      expect(next.units.get('u1')!.movementPoints).toBe(2);
    });

    it('allows collection with 0 MP', () => {
      const state = makeCollectState({ mp: 0 });
      const next = gameReducer(state, { type: 'COLLECT_ANOMALY', anomalyId: 'a1', unitId: 'u1' });
      expect(next.anomalies.size).toBe(0);
      expect(next.players[0].resources.minerals).toBe(70);
    });

    it('rejects non-scout units', () => {
      const state = makeCollectState({ unitType: 'fighter' });
      const next = gameReducer(state, { type: 'COLLECT_ANOMALY', anomalyId: 'a1', unitId: 'u1' });
      expect(next).toBe(state);
    });

    it('rejects scout not at anomaly hex', () => {
      const state = makeCollectState({ unitQ: 0, unitR: 0 });
      const next = gameReducer(state, { type: 'COLLECT_ANOMALY', anomalyId: 'a1', unitId: 'u1' });
      expect(next).toBe(state);
    });

    it('rejects unknown anomaly', () => {
      const state = makeCollectState();
      const next = gameReducer(state, { type: 'COLLECT_ANOMALY', anomalyId: 'missing', unitId: 'u1' });
      expect(next).toBe(state);
    });

    it('does not mutate original state', () => {
      const state = makeCollectState();
      gameReducer(state, { type: 'COLLECT_ANOMALY', anomalyId: 'a1', unitId: 'u1' });
      expect(state.anomalies.size).toBe(1);
      expect(state.players[0].resources.minerals).toBe(50);
    });
  });

  describe('END_TURN upkeep and attrition', () => {
    it('deducts upkeep from resources', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'fighter', q: 0, r: 0 })],
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p1', type: 'corvette', q: 1, r: 0 })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'END_TURN' });
      // fighter upkeep: 2 energy, corvette: 3 energy = 5 total
      expect(next.players[0].resources.energy).toBe(100 - 5);
    });

    it('applies attrition (2 dmg) when resource goes negative', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'battleship', q: 0, r: 0 })],
      ]);
      // battleship upkeep: 8 energy, 4 credits. Give player only 3 energy, 0 buildings
      const state = makeState({
        units,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ energy: 3 }), isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        ],
      });
      const next = gameReducer(state, { type: 'END_TURN' });
      const unit = next.units.get('u1');
      expect(unit).toBeDefined();
      expect(unit!.health).toBe(UNIT_STATS.battleship.maxHealth - 2);
    });

    it('removes dead units from attrition', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'battleship', q: 0, r: 0, health: 1 })],
      ]);
      const state = makeState({
        units,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ energy: 3 }), isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        ],
      });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.units.has('u1')).toBe(false);
    });

    it('clamps resources to 0', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'battleship', q: 0, r: 0 })],
      ]);
      // battleship: 8 energy, 4 credits upkeep
      const state = makeState({
        units,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ energy: 3, credits: 2 }), isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        ],
      });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.players[0].resources.energy).toBe(0);
      expect(next.players[0].resources.credits).toBe(0);
    });

    it('does not apply upkeep for scouts and mining_drones', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0 })],
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p1', type: 'mining_drone', q: 1, r: 0 })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'END_TURN' });
      // No upkeep for scouts or mining_drones
      expect(next.players[0].resources.energy).toBe(100);
    });
  });

  describe('END_TURN elimination and victory', () => {
    it('sets eliminated when player has no units or buildings', () => {
      // p1 has no units or buildings, p2 has a unit
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p2', type: 'scout', q: 5, r: 0 })],
      ]);
      const state = makeState({ units });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.players[0].eliminated).toBe(true);
      expect(next.players[1].eliminated).toBe(false);
    });

    it('sets domination victory when one player remains', () => {
      // p2 already eliminated, p1 has no units/buildings → both eliminated? No.
      // Better: p2 eliminated, p1 has a unit
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0 })],
      ]);
      const state = makeState({
        units,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources(), isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set(), eliminated: true, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        ],
      });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.gameOver).toBeDefined();
      expect(next.gameOver!.reason).toBe('domination');
      expect(next.gameOver!.winnerId).toBe('p1');
    });

    it('sets economic victory when credits reach threshold', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0 })],
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p2', type: 'scout', q: 5, r: 0 })],
      ]);
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'colony', q: 0, r: 1, health: 30, maxHealth: 30, shields: 10, maxShields: 10 }],
      ]);
      const state = makeState({
        units,
        buildings,
        players: [
          { id: 'p1', name: 'Player 1', color: '#00ff00', resources: makeResources({ credits: ECONOMIC_VICTORY_CREDITS - 2 }), isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
          { id: 'p2', name: 'Player 2', color: '#ff0000', resources: makeResources(), isAI: true, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        ],
      });
      // Colony yields 2 credits, so after income p1 should have >= ECONOMIC_VICTORY_CREDITS
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.gameOver).toBeDefined();
      expect(next.gameOver!.reason).toBe('economic');
      expect(next.gameOver!.winnerId).toBe('p1');
    });

    it('does not process turn if gameOver already set', () => {
      const state = makeState({
        gameOver: { winnerId: 'p1', reason: 'domination' },
      });
      const next = gameReducer(state, { type: 'END_TURN' });
      expect(next.currentPlayerIndex).toBe(0); // unchanged
      expect(next.turn).toBe(1); // unchanged
    });
  });

  describe('END_TURN influence regen', () => {
    it('heals unit in own influence with no enemies nearby', () => {
      // Place a building and a damaged unit at the same location
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15 }],
      ]);
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'fighter', q: 0, r: 0, health: 10 })],
        // Need a p2 unit far away so p2 isn't eliminated
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p2', type: 'scout', q: 50, r: 50 })],
      ]);
      const state = makeState({ buildings, units });
      const next = gameReducer(state, { type: 'END_TURN' });
      const unit = next.units.get('u1')!;
      expect(unit.health).toBe(12); // 10 + 2
    });

    it('caps HP at maxHealth', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15 }],
      ]);
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'fighter', q: 0, r: 0, health: 14 })],
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p2', type: 'scout', q: 50, r: 50 })],
      ]);
      const state = makeState({ buildings, units });
      const next = gameReducer(state, { type: 'END_TURN' });
      const unit = next.units.get('u1')!;
      // maxHealth for fighter is 15, 14 + 2 = 16 -> capped at 15
      expect(unit.health).toBe(UNIT_STATS.fighter.maxHealth);
    });

    it('regens shields up to maxShields', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15 }],
      ]);
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'fighter', q: 0, r: 0, shields: 0 })],
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p2', type: 'scout', q: 50, r: 50 })],
      ]);
      const state = makeState({ buildings, units });
      const next = gameReducer(state, { type: 'END_TURN' });
      const unit = next.units.get('u1')!;
      expect(unit.shields).toBe(1); // 0 + 1
    });

    it('does NOT regen unit outside influence', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
      ]);
      const units = new Map<string, UnitData>([
        // mining_station sightRange is 2, unit at distance 5 is outside influence
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'fighter', q: 5, r: 5, health: 10 })],
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p2', type: 'scout', q: 50, r: 50 })],
      ]);
      const state = makeState({ buildings, units });
      const next = gameReducer(state, { type: 'END_TURN' });
      const unit = next.units.get('u1')!;
      expect(unit.health).toBe(10); // unchanged
    });

    it('does NOT regen unit near an enemy', () => {
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'starbase', q: 0, r: 0, health: 50, maxHealth: 50, shields: 15, maxShields: 15 }],
      ]);
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'fighter', q: 0, r: 0, health: 10 })],
        // Enemy scout at distance 1 — scout sightRange=4, so 0,0 is within range
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p2', type: 'scout', q: 1, r: 0 })],
      ]);
      const state = makeState({ buildings, units });
      const next = gameReducer(state, { type: 'END_TURN' });
      const unit = next.units.get('u1')!;
      expect(unit.health).toBe(10); // unchanged
    });
  });

  describe('pure helpers', () => {
    it('computeUpkeep sums upkeep for player units', () => {
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'fighter', q: 0, r: 0 })],
        ['u2', makeUnitData({ id: 'u2', ownerId: 'p1', type: 'cruiser', q: 1, r: 0 })],
        ['u3', makeUnitData({ id: 'u3', ownerId: 'p2', type: 'battleship', q: 5, r: 0 })],
      ]);
      const upkeep = computeUpkeep(units, 'p1');
      // fighter: 2 energy, cruiser: 5 energy + 2 credits
      expect(upkeep.energy).toBe(7);
      expect(upkeep.credits).toBe(2);
      expect(upkeep.minerals).toBe(0);
    });

    it('shouldEliminate returns true when player has no units or buildings', () => {
      const player = { id: 'p1', name: 'P1', color: '#fff', resources: makeResources(), isAI: false, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() };
      expect(shouldEliminate(player, new Map(), new Map())).toBe(true);
    });

    it('shouldEliminate returns false when player has units', () => {
      const player = { id: 'p1', name: 'P1', color: '#fff', resources: makeResources(), isAI: false, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() };
      const units = new Map<string, UnitData>([
        ['u1', makeUnitData({ id: 'u1', ownerId: 'p1', type: 'scout', q: 0, r: 0 })],
      ]);
      expect(shouldEliminate(player, units, new Map())).toBe(false);
    });

    it('shouldEliminate returns false when player has buildings', () => {
      const player = { id: 'p1', name: 'P1', color: '#fff', resources: makeResources(), isAI: false, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() };
      const buildings = new Map<string, BuildingData>([
        ['b1', { id: 'b1', ownerId: 'p1', type: 'mining_station', q: 0, r: 0, health: 15, maxHealth: 15, shields: 5, maxShields: 5 }],
      ]);
      expect(shouldEliminate(player, new Map(), buildings)).toBe(false);
    });

    it('shouldEliminate returns false if already eliminated', () => {
      const player = { id: 'p1', name: 'P1', color: '#fff', resources: makeResources(), isAI: false, exploredHexes: new Set<string>(), eliminated: true, researchedTechs: new Set<import('../../models/game-state').TechId>() };
      expect(shouldEliminate(player, new Map(), new Map())).toBe(false);
    });

    it('checkVictory returns domination when one player left', () => {
      const players = [
        { id: 'p1', name: 'P1', color: '#fff', resources: makeResources(), isAI: false, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        { id: 'p2', name: 'P2', color: '#f00', resources: makeResources(), isAI: true, exploredHexes: new Set<string>(), eliminated: true, researchedTechs: new Set<import('../../models/game-state').TechId>() },
      ];
      const result = checkVictory(players, new Map(), new Map());
      expect(result).toEqual({ winnerId: 'p1', reason: 'domination' });
    });

    it('checkVictory returns economic when credits threshold met', () => {
      const players = [
        { id: 'p1', name: 'P1', color: '#fff', resources: makeResources({ credits: ECONOMIC_VICTORY_CREDITS }), isAI: false, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        { id: 'p2', name: 'P2', color: '#f00', resources: makeResources(), isAI: true, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
      ];
      const result = checkVictory(players, new Map(), new Map());
      expect(result).toEqual({ winnerId: 'p1', reason: 'economic' });
    });

    it('checkVictory returns undefined when no victory condition met', () => {
      const players = [
        { id: 'p1', name: 'P1', color: '#fff', resources: makeResources(), isAI: false, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
        { id: 'p2', name: 'P2', color: '#f00', resources: makeResources(), isAI: true, exploredHexes: new Set<string>(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
      ];
      const result = checkVictory(players, new Map(), new Map());
      expect(result).toBeUndefined();
    });
  });
});
