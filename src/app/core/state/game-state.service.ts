import { computed, Injectable, signal } from '@angular/core';
import { GameState, PlayerState, Resources } from '../../models/game-state';
import { GameAction } from './actions';
import { gameReducer } from './game-reducer';

function createInitialState(): GameState {
  return {
    turn: 1,
    currentPlayerIndex: 0,
    players: [],
    units: new Map(),
    buildings: new Map(),
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    seed: Date.now(),
  };
}

@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly _gameState = signal<GameState>(createInitialState());

  readonly turn = computed(() => this._gameState().turn);
  readonly currentPlayer = computed<PlayerState | null>(() => {
    const state = this._gameState();
    return state.players[state.currentPlayerIndex] ?? null;
  });
  readonly resources = computed<Resources | null>(() => this.currentPlayer()?.resources ?? null);
  readonly units = computed(() => this._gameState().units);
  readonly buildings = computed(() => this._gameState().buildings);
  readonly players = computed(() => this._gameState().players);

  dispatch(action: GameAction): void {
    this._gameState.update((state) => gameReducer(state, action));
  }

  getState(): GameState {
    return this._gameState();
  }

  setState(state: GameState): void {
    this._gameState.set(state);
  }
}
