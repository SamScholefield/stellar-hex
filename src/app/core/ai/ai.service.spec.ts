import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIService } from './ai.service';
import { GameStateService } from '../state/game-state.service';
import { ChunkManagerService } from '../chunks/chunk-manager.service';
import { AnimationService } from '../../game/renderer/animation.service';
import { EventLogService } from '../state/event-log.service';
import { GameState, UnitData, PlayerState, UNIT_STATS } from '../../models/game-state';

function makeUnit(overrides: Partial<UnitData> & { id: string; ownerId: string; type: UnitData['type'] }): UnitData {
  const stats = UNIT_STATS[overrides.type];
  return {
    name: overrides.name ?? `${overrides.type} T001`,
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
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    currentPlayerIndex: 1,
    players: [
      { id: 'human', name: 'Human', color: '#00f', resources: { energy: 100, minerals: 50, alloys: 30, credits: 30 }, isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
      { id: 'ai', name: 'AI', color: '#f00', resources: { energy: 100, minerals: 50, alloys: 30, credits: 30 }, isAI: true, exploredHexes: new Set(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0']), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() },
    ],
    units: new Map(),
    buildings: new Map(),
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    anomalies: new Map(),
    seed: 42,
    ...overrides,
  };
}

describe('AIService', () => {
  let ai: AIService;
  let gameState: GameStateService;
  let chunkManager: ChunkManagerService;
  let animation: AnimationService;
  let eventLog: EventLogService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    ai = TestBed.inject(AIService);
    gameState = TestBed.inject(GameStateService);
    chunkManager = TestBed.inject(ChunkManagerService);
    animation = TestBed.inject(AnimationService);
    eventLog = TestBed.inject(EventLogService);

    // Mock animation methods to resolve instantly
    vi.spyOn(animation, 'animateUnitMovement').mockResolvedValue();
    vi.spyOn(animation, 'animateCombat').mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches END_TURN after executing', async () => {
    const state = makeState();
    gameState.setState(state);

    const dispatchSpy = vi.spyOn(gameState, 'dispatch');
    const turn = ai.executeTurn('ai');
    await vi.advanceTimersByTimeAsync(6000);
    await turn;

    const endTurnCalls = dispatchSpy.mock.calls.filter(c => c[0].type === 'END_TURN');
    expect(endTurnCalls.length).toBe(1);
  });

  it('moves scout units toward unexplored areas', async () => {
    const scout = makeUnit({ id: 'scout1', ownerId: 'ai', type: 'scout', q: 0, r: 0 });
    const state = makeState({ units: new Map([['scout1', scout]]) });
    state.players[1].exploredHexes = new Set(['0,0']);
    gameState.setState(state);

    const dispatchSpy = vi.spyOn(gameState, 'dispatch');
    const turn = ai.executeTurn('ai');
    await vi.advanceTimersByTimeAsync(6000);
    await turn;

    const moveCalls = dispatchSpy.mock.calls.filter(c => c[0].type === 'MOVE_UNIT');
    expect(moveCalls.length).toBeGreaterThanOrEqual(1);
    expect(moveCalls[0][0].type).toBe('MOVE_UNIT');
  });

  it('attacks when favorable combat is available', async () => {
    const fighter = makeUnit({ id: 'f1', ownerId: 'ai', type: 'fighter', q: 0, r: 0 });
    const enemyScout = makeUnit({ id: 'e1', ownerId: 'human', type: 'scout', q: 1, r: 0 });

    const state = makeState({
      units: new Map([['f1', fighter], ['e1', enemyScout]]),
    });
    state.players[1].exploredHexes = new Set(['0,0', '1,0']);
    gameState.setState(state);

    const dispatchSpy = vi.spyOn(gameState, 'dispatch');
    const turn = ai.executeTurn('ai');
    await vi.advanceTimersByTimeAsync(6000);
    await turn;

    const attackCalls = dispatchSpy.mock.calls.filter(c => c[0].type === 'ATTACK');
    expect(attackCalls.length).toBe(1);
    expect(attackCalls[0][0]).toEqual({ type: 'ATTACK', attackerId: 'f1', targetId: 'e1' });
  });

  it('does not attack when result would be unfavorable', async () => {
    const scout = makeUnit({ id: 's1', ownerId: 'ai', type: 'scout', q: 0, r: 0, health: 1, shields: 0 });
    const cruiser = makeUnit({ id: 'c1', ownerId: 'human', type: 'cruiser', q: 1, r: 0 });

    const state = makeState({
      units: new Map([['s1', scout], ['c1', cruiser]]),
    });
    state.players[1].exploredHexes = new Set(['0,0', '1,0']);
    gameState.setState(state);

    const dispatchSpy = vi.spyOn(gameState, 'dispatch');
    const turn = ai.executeTurn('ai');
    await vi.advanceTimersByTimeAsync(6000);
    await turn;

    const attackCalls = dispatchSpy.mock.calls.filter(c => c[0].type === 'ATTACK');
    expect(attackCalls.length).toBe(0);
  });
});
