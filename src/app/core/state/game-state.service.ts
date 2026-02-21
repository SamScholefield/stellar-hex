import { computed, Injectable, signal } from '@angular/core';
import { GameState, GameOverState, PlayerState, Resources, UnitData, BuildingData } from '../../models/game-state';
import { HexData } from '../../models/hex-data';
import { computeMiningDroneIncome } from '../economy/economy.service';
import { GameAction } from './actions';
import { gameReducer } from './game-reducer';

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

function createInitialState(): GameState {
  return {
    turn: 1,
    currentPlayerIndex: 0,
    players: [],
    units: new Map(),
    buildings: new Map(),
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    anomalies: new Map(),
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
  readonly anomalies = computed(() => this._gameState().anomalies);
  readonly homeBaseId = computed(() => this.currentPlayer()?.homeBaseId ?? null);
  readonly gameOver = computed<GameOverState | undefined>(() => this._gameState().gameOver);

  readonly unitsAtHex = computed<Map<string, UnitData[]>>(() => {
    const index = new Map<string, UnitData[]>();
    for (const unit of this.units().values()) {
      const key = hexKey(unit.q, unit.r);
      const list = index.get(key);
      if (list) list.push(unit);
      else index.set(key, [unit]);
    }
    return index;
  });

  readonly buildingAtHex = computed<Map<string, BuildingData>>(() => {
    const index = new Map<string, BuildingData>();
    for (const b of this.buildings().values()) {
      index.set(hexKey(b.q, b.r), b);
    }
    return index;
  });

  readonly playerColors = computed<Map<string, string>>(() => {
    const colors = new Map<string, string>();
    for (const p of this.players()) {
      colors.set(p.id, p.color);
    }
    return colors;
  });

  readonly playerNames = computed<Map<string, string>>(() => {
    const names = new Map<string, string>();
    for (const p of this.players()) {
      names.set(p.id, p.name);
    }
    return names;
  });

  readonly humanPlayer = computed<PlayerState | null>(() => {
    return this.players().find(p => !p.isAI) ?? null;
  });

  dispatch(action: GameAction): void {
    this._gameState.update((state) => gameReducer(state, action));
  }

  /**
   * Computes mining drone income from hex data and dispatches END_TURN
   * with the pre-computed yields. This bridges the gap between the pure
   * reducer (which cannot access hex data) and the ChunkManager (which can).
   */
  dispatchEndTurn(hexLookup: (q: number, r: number) => HexData | null): void {
    const state = this.getState();
    const player = state.players[state.currentPlayerIndex];
    const miningYields = player
      ? computeMiningDroneIncome(state.units, player.id, hexLookup)
      : undefined;
    this.dispatch({ type: 'END_TURN', miningYields });
  }

  getState(): GameState {
    return this._gameState();
  }

  setState(state: GameState): void {
    this._gameState.set(state);
  }
}
