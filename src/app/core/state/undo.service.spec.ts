import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { UndoService } from './undo.service';
import { GameStateService } from './game-state.service';
import { SelectionService } from '../selection/selection.service';
import { GameState } from '../../models/game-state';

function makeState(turn: number): GameState {
  return {
    turn,
    currentPlayerIndex: 0,
    players: [{ id: 'p1', name: 'P1', color: '#fff', resources: { energy: 100, minerals: 50, alloys: 20, credits: 10 }, isAI: false, exploredHexes: new Set(), eliminated: false, researchedTechs: new Set<import('../../models/game-state').TechId>() }],
    units: new Map(),
    buildings: new Map(),
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    anomalies: new Map(),
    tradeHubs: new Map(),
    tradedThisTurn: new Set(),
    seed: 42,
  };
}

describe('UndoService', () => {
  let undo: UndoService;
  let gameState: GameStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    undo = TestBed.inject(UndoService);
    gameState = TestBed.inject(GameStateService);
    // Disable server sync so dispatches don't make HTTP calls
    (gameState as any).serverAvailable = false;
    gameState.setState(makeState(1));
  });

  it('starts with canUndo false', () => {
    expect(undo.canUndo()).toBe(false);
  });

  it('dispatch pushes snapshot and canUndo becomes true', () => {
    undo.dispatch({ type: 'END_TURN' });
    expect(undo.canUndo()).toBe(true);
  });

  it('undo restores previous state', () => {
    const before = gameState.getState();
    undo.dispatch({ type: 'END_TURN' });
    expect(gameState.turn()).not.toBe(before.turn);

    const undone = undo.undo();
    expect(undone).toBe(true);
    expect(gameState.turn()).toBe(before.turn);
    expect(undo.canUndo()).toBe(false);
  });

  it('undo returns false when no snapshots', () => {
    expect(undo.undo()).toBe(false);
  });

  it('supports multiple undos', () => {
    gameState.setState(makeState(1));
    undo.dispatch({ type: 'END_TURN' }); // turn 1 -> 2
    undo.dispatch({ type: 'END_TURN' }); // turn 2 -> ...

    undo.undo();
    expect(gameState.turn()).toBe(2);

    undo.undo();
    expect(gameState.turn()).toBe(1);
    expect(undo.canUndo()).toBe(false);
  });

  it('clearHistory clears snapshots', () => {
    undo.dispatch({ type: 'END_TURN' });
    expect(undo.canUndo()).toBe(true);

    undo.clearHistory();
    expect(undo.canUndo()).toBe(false);
    expect(undo.undo()).toBe(false);
  });

  it('caps at 20 snapshots', () => {
    for (let i = 0; i < 25; i++) {
      undo.dispatch({ type: 'END_TURN' });
    }
    // Should only be able to undo 20 times
    let count = 0;
    while (undo.undo()) count++;
    expect(count).toBe(20);
  });

  it('dispatchEndTurn clears history', () => {
    undo.dispatch({ type: 'END_TURN' });
    expect(undo.canUndo()).toBe(true);

    const hexLookup = () => null;
    undo.dispatchEndTurn(hexLookup);
    expect(undo.canUndo()).toBe(false);
  });
});
