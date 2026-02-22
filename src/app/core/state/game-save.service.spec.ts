import { describe, it, expect, beforeEach } from 'vitest';
import { serialize, deserialize } from './game-save.service';
import { GameState, UNIT_STATS } from '../../models/game-state';
import { SerializedWaypoint } from './waypoint.service';

function makeTestState(): GameState {
  const scoutStats = UNIT_STATS.scout;
  const fighterStats = UNIT_STATS.fighter;
  return {
    turn: 5,
    currentPlayerIndex: 0,
    players: [
      {
        id: 'p0',
        name: 'Player 1',
        color: '#5eead4',
        resources: { energy: 80, minerals: 30, alloys: 10, credits: 40 },
        isAI: false,
        eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>(), exploredHexes: new Set(['0,0', '1,-1', '2,-1']),
      },
      {
        id: 'p1',
        name: 'AI 1',
        color: '#f87171',
        resources: { energy: 60, minerals: 20, alloys: 5, credits: 25 },
        isAI: true,
        eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>(), exploredHexes: new Set(['10,-5', '11,-5']),
      },
    ],
    units: new Map([
      [
        'scout-p0',
        {
          id: 'scout-p0',
          name: 'Scout SC001',
          ownerId: 'p0',
          type: 'scout' as const,
          q: 1,
          r: -1,
          movementPoints: 3,
          maxMovementPoints: scoutStats.maxMovementPoints,
          health: scoutStats.maxHealth,
          maxHealth: scoutStats.maxHealth,
          attack: scoutStats.attack,
          defense: scoutStats.defense,
          range: scoutStats.range,
          sightRange: scoutStats.sightRange,
          size: scoutStats.size,
          weapon: scoutStats.weapon,
          armor: scoutStats.armor,
          shields: scoutStats.maxShields,
          maxShields: scoutStats.maxShields,
          xp: 0,
          veteranTier: 'standard' as const,
          hasAttacked: false,
        },
      ],
      [
        'fighter-p1',
        {
          id: 'fighter-p1',
          name: 'Fighter FI001',
          ownerId: 'p1',
          type: 'fighter' as const,
          q: 10,
          r: -5,
          movementPoints: fighterStats.maxMovementPoints,
          maxMovementPoints: fighterStats.maxMovementPoints,
          health: fighterStats.maxHealth,
          maxHealth: fighterStats.maxHealth,
          attack: fighterStats.attack,
          defense: fighterStats.defense,
          range: fighterStats.range,
          sightRange: fighterStats.sightRange,
          size: fighterStats.size,
          weapon: fighterStats.weapon,
          armor: fighterStats.armor,
          shields: fighterStats.maxShields,
          maxShields: fighterStats.maxShields,
          xp: 0,
          veteranTier: 'standard' as const,
          hasAttacked: false,
        },
      ],
    ]),
    buildings: new Map([
      [
        'mine-1',
        {
          id: 'mine-1',
          ownerId: 'p0',
          type: 'mining_station' as const,
          q: 2,
          r: -1,
          health: 15,
          maxHealth: 15,
          shields: 5,
          maxShields: 5,
        },
      ],
    ]),
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    anomalies: new Map([
      [
        'anomaly-1',
        {
          id: 'anomaly-1',
          type: 'derelict_ship' as const,
          q: 5,
          r: -3,
        },
      ],
    ]),
    seed: 12345,
  };
}

const testCamera = { panX: 100, panY: -50, zoom: 1.5 };

describe('serialize / deserialize', () => {
  let state: GameState;

  beforeEach(() => {
    state = makeTestState();
  });

  it('round-trips GameState without data loss', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);

    expect(result.state.turn).toBe(5);
    expect(result.state.currentPlayerIndex).toBe(0);
    expect(result.state.seed).toBe(12345);
    expect(result.state.players.length).toBe(2);
  });

  it('restores camera position', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);

    expect(result.camera).toEqual(testCamera);
  });

  it('restores Maps from entries arrays', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);

    expect(result.state.units).toBeInstanceOf(Map);
    expect(result.state.units.size).toBe(2);
    expect(result.state.units.get('scout-p0')?.ownerId).toBe('p0');

    expect(result.state.buildings).toBeInstanceOf(Map);
    expect(result.state.buildings.size).toBe(1);
    expect(result.state.buildings.get('mine-1')?.type).toBe('mining_station');

    expect(result.state.anomalies).toBeInstanceOf(Map);
    expect(result.state.anomalies.size).toBe(1);
    expect(result.state.anomalies.get('anomaly-1')?.type).toBe('derelict_ship');
  });

  it('restores Sets from string arrays', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);

    expect(result.state.players[0].exploredHexes).toBeInstanceOf(Set);
    expect(result.state.players[0].exploredHexes.size).toBe(3);
    expect(result.state.players[0].exploredHexes.has('0,0')).toBe(true);
    expect(result.state.players[0].exploredHexes.has('1,-1')).toBe(true);

    expect(result.state.players[1].exploredHexes).toBeInstanceOf(Set);
    expect(result.state.players[1].exploredHexes.size).toBe(2);
  });

  it('preserves player resources', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);

    expect(result.state.players[0].resources).toEqual({
      energy: 80,
      minerals: 30,
      alloys: 10,
      credits: 40,
    });
  });

  it('preserves unit stats including new combat fields', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);

    const scout = result.state.units.get('scout-p0')!;
    expect(scout.type).toBe('scout');
    expect(scout.q).toBe(1);
    expect(scout.r).toBe(-1);
    expect(scout.weapon).toBe('laser');
    expect(scout.size).toBe('small');
    expect(scout.xp).toBe(0);
    expect(scout.veteranTier).toBe('standard');
  });

  it('handles empty Maps and Sets', () => {
    state.units = new Map();
    state.buildings = new Map();
    state.players[0].exploredHexes = new Set();

    const json = serialize(state, testCamera);
    const result = deserialize(json);

    expect(result.state.units.size).toBe(0);
    expect(result.state.buildings.size).toBe(0);
    expect(result.state.players[0].exploredHexes.size).toBe(0);
  });

  it('produces valid JSON string', () => {
    const json = serialize(state, testCamera);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('migrates old save data missing eliminated and gameOver fields', () => {
    const oldSave = {
      state: {
        turn: 3,
        currentPlayerIndex: 0,
        players: [{
          id: 'p0', name: 'Player', color: '#5eead4',
          resources: { energy: 50, minerals: 20, alloys: 10, credits: 15 },
          isAI: false, exploredHexes: ['0,0'],
          // Note: no eliminated field
        }],
        units: [],
        buildings: [],
        dynamicObjects: [],
        chunkOverrides: [],
        anomalies: [],
        seed: 42,
        // Note: no gameOver field
      },
      camera: { panX: 0, panY: 0, zoom: 1 },
    };

    const json = JSON.stringify(oldSave);
    const result = deserialize(json);

    expect(result.state.players[0].eliminated).toBe(false);
    expect(result.state.gameOver).toBeUndefined();
  });

  it('preserves eliminated and gameOver when present', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);
    expect(result.state.players[0].eliminated).toBe(false);
    expect(result.state.gameOver).toBeUndefined();
  });

  it('migrates old save data missing weapon field', () => {
    // Simulate old save format without new combat fields
    const oldSave = {
      state: {
        turn: 3,
        currentPlayerIndex: 0,
        players: [{
          id: 'p0', name: 'Player', color: '#5eead4',
          resources: { energy: 50, minerals: 20, alloys: 10, credits: 15 },
          isAI: false, exploredHexes: ['0,0'],
        }],
        units: [['u1', {
          id: 'u1', name: 'Scout SC001', ownerId: 'p0', type: 'scout',
          q: 0, r: 0, movementPoints: 4, maxMovementPoints: 4,
          health: 8, maxHealth: 8, attack: 3, defense: 0, range: 1, sightRange: 4,
          // Note: no weapon, size, armor, shields, xp, veteranTier
        }]],
        buildings: [],
        dynamicObjects: [],
        chunkOverrides: [],
        anomalies: [],
        seed: 42,
      },
      camera: { panX: 0, panY: 0, zoom: 1 },
    };

    const json = JSON.stringify(oldSave);
    const result = deserialize(json);

    const unit = result.state.units.get('u1')!;
    expect(unit.weapon).toBe('laser');
    expect(unit.size).toBe('small');
    expect(unit.armor).toBe(0);
    expect(unit.shields).toBe(0);
    expect(unit.maxShields).toBe(0);
    expect(unit.xp).toBe(0);
    expect(unit.veteranTier).toBe('standard');
  });

  it('round-trips waypoints through serialize/deserialize', () => {
    const waypoints: SerializedWaypoint[] = [
      { unitId: 'scout-p0', q: 5, r: -3 },
      { unitId: 'fighter-p1', q: 2, r: -1, attackTargetId: 'enemy-1' },
    ];

    const json = serialize(state, testCamera, waypoints);
    const result = deserialize(json);

    expect(result.waypoints).toEqual(waypoints);
  });

  it('returns empty waypoints array for old saves without waypoints field', () => {
    const oldSave = {
      state: {
        turn: 3,
        currentPlayerIndex: 0,
        players: [{
          id: 'p0', name: 'Player', color: '#5eead4',
          resources: { energy: 50, minerals: 20, alloys: 10, credits: 15 },
          isAI: false, exploredHexes: ['0,0'], eliminated: false,
        }],
        units: [],
        buildings: [],
        dynamicObjects: [],
        chunkOverrides: [],
        anomalies: [],
        seed: 42,
      },
      camera: { panX: 0, panY: 0, zoom: 1 },
      // Note: no waypoints field
    };

    const json = JSON.stringify(oldSave);
    const result = deserialize(json);

    expect(result.waypoints).toEqual([]);
  });

  it('defaults to empty waypoints when serialize is called without waypoints param', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);

    expect(result.waypoints).toEqual([]);
  });
});
