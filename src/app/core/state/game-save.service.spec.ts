import { describe, it, expect, beforeEach } from 'vitest';
import { serialize, deserialize } from './game-save.service';
import { GameState } from '../../models/game-state';

function makeTestState(): GameState {
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
        exploredHexes: new Set(['0,0', '1,-1', '2,-1']),
      },
      {
        id: 'p1',
        name: 'AI 1',
        color: '#f87171',
        resources: { energy: 60, minerals: 20, alloys: 5, credits: 25 },
        isAI: true,
        exploredHexes: new Set(['10,-5', '11,-5']),
      },
    ],
    units: new Map([
      [
        'scout-p0',
        {
          id: 'scout-p0',
          ownerId: 'p0',
          type: 'scout',
          q: 1,
          r: -1,
          movementPoints: 3,
          maxMovementPoints: 4,
          health: 8,
          maxHealth: 8,
          attack: 2,
          defense: 1,
          range: 1,
          sightRange: 4,
        },
      ],
      [
        'fighter-p1',
        {
          id: 'fighter-p1',
          ownerId: 'p1',
          type: 'fighter',
          q: 10,
          r: -5,
          movementPoints: 3,
          maxMovementPoints: 3,
          health: 15,
          maxHealth: 15,
          attack: 6,
          defense: 3,
          range: 1,
          sightRange: 2,
        },
      ],
    ]),
    buildings: new Map([
      [
        'mine-1',
        {
          id: 'mine-1',
          ownerId: 'p0',
          type: 'mining_station',
          q: 2,
          r: -1,
          health: 15,
          maxHealth: 15,
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
          type: 'derelict_ship',
          q: 5,
          r: -3,
          reward: { energy: 50 },
          discovered: false,
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

  it('preserves unit stats', () => {
    const json = serialize(state, testCamera);
    const result = deserialize(json);

    const scout = result.state.units.get('scout-p0')!;
    expect(scout.type).toBe('scout');
    expect(scout.q).toBe(1);
    expect(scout.r).toBe(-1);
    expect(scout.movementPoints).toBe(3);
    expect(scout.health).toBe(8);
    expect(scout.attack).toBe(2);
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
});
