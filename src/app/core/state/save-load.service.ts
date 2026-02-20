import { inject, Injectable } from '@angular/core';
import { GameState } from '../../models/game-state';
import { GameStateService } from './game-state.service';
import { WorldGeneratorService } from '../generation/world-generator.service';

interface SerializedGameState {
  turn: number;
  currentPlayerIndex: number;
  players: GameState['players'];
  units: [string, GameState['units'] extends Map<string, infer V> ? V : never][];
  buildings: [string, GameState['buildings'] extends Map<string, infer V> ? V : never][];
  dynamicObjects: [string, GameState['dynamicObjects'] extends Map<string, infer V> ? V : never][];
  chunkOverrides: [string, GameState['chunkOverrides'] extends Map<string, infer V> ? V : never][];
  seed: number;
}

@Injectable({ providedIn: 'root' })
export class SaveLoadService {
  private readonly gameState = inject(GameStateService);
  private readonly worldGenerator = inject(WorldGeneratorService);

  save(): void {
    const state = this.gameState.getState();
    const serialized: SerializedGameState = {
      turn: state.turn,
      currentPlayerIndex: state.currentPlayerIndex,
      players: state.players,
      units: [...state.units.entries()],
      buildings: [...state.buildings.entries()],
      dynamicObjects: [...state.dynamicObjects.entries()],
      chunkOverrides: [...state.chunkOverrides.entries()],
      seed: state.seed,
    };

    const json = JSON.stringify(serialized, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stellar-hex-turn-${state.turn}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async load(file: File): Promise<void> {
    const text = await file.text();
    const serialized: SerializedGameState = JSON.parse(text);

    const state: GameState = {
      turn: serialized.turn,
      currentPlayerIndex: serialized.currentPlayerIndex,
      players: serialized.players,
      units: new Map(serialized.units),
      buildings: new Map(serialized.buildings),
      dynamicObjects: new Map(serialized.dynamicObjects),
      chunkOverrides: new Map(serialized.chunkOverrides),
      seed: serialized.seed,
    };

    this.worldGenerator.setSeed(state.seed);
    this.gameState.setState(state);
  }
}
