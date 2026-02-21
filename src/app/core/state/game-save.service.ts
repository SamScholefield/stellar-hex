import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GameState,
  PlayerState,
  UnitData,
  BuildingData,
  DynamicObject,
  HexOverride,
  Anomaly,
} from '../../models/game-state';
import { GameStateService } from './game-state.service';
import { WorldGeneratorService } from '../generation/world-generator.service';
import { CameraService } from '../camera/camera.service';

const SAVE_KEY = 'stellar-hex-save';
const AUTOSAVE_KEY = 'stellar-hex-autosave';

interface SaveData {
  state: SerializedGameState;
  camera: { panX: number; panY: number; zoom: number };
}

interface SerializedGameState {
  turn: number;
  currentPlayerIndex: number;
  players: SerializedPlayer[];
  units: [string, UnitData][];
  buildings: [string, BuildingData][];
  dynamicObjects: [string, DynamicObject][];
  chunkOverrides: [string, HexOverride[]][];
  anomalies: [string, Anomaly][];
  seed: number;
}

interface SerializedPlayer {
  id: string;
  name: string;
  color: string;
  resources: PlayerState['resources'];
  isAI: boolean;
  exploredHexes: string[];
  homeBaseId?: string;
}

export function serialize(
  state: GameState,
  camera: { panX: number; panY: number; zoom: number },
): string {
  const data: SaveData = {
    state: {
      turn: state.turn,
      currentPlayerIndex: state.currentPlayerIndex,
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        resources: { ...p.resources },
        isAI: p.isAI,
        exploredHexes: [...p.exploredHexes],
        homeBaseId: p.homeBaseId,
      })),
      units: [...state.units.entries()],
      buildings: [...state.buildings.entries()],
      dynamicObjects: [...state.dynamicObjects.entries()],
      chunkOverrides: [...state.chunkOverrides.entries()],
      anomalies: [...state.anomalies.entries()],
      seed: state.seed,
    },
    camera,
  };
  return JSON.stringify(data);
}

export function deserialize(json: string): {
  state: GameState;
  camera: { panX: number; panY: number; zoom: number };
} {
  const data: SaveData = JSON.parse(json);
  const s = data.state;

  const state: GameState = {
    turn: s.turn,
    currentPlayerIndex: s.currentPlayerIndex,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      resources: p.resources,
      isAI: p.isAI,
      exploredHexes: new Set(p.exploredHexes),
      homeBaseId: p.homeBaseId,
    })),
    units: new Map(s.units),
    buildings: new Map(s.buildings),
    dynamicObjects: new Map(s.dynamicObjects),
    chunkOverrides: new Map(s.chunkOverrides),
    anomalies: new Map(s.anomalies),
    seed: s.seed,
  };

  return { state, camera: data.camera };
}

@Injectable({ providedIn: 'root' })
export class GameSaveService {
  private readonly gameState = inject(GameStateService);
  private readonly worldGenerator = inject(WorldGeneratorService);
  private readonly camera = inject(CameraService);
  private readonly router = inject(Router);

  private readonly _hasSave = signal(localStorage.getItem(SAVE_KEY) !== null || localStorage.getItem(AUTOSAVE_KEY) !== null);
  readonly hasSave = this._hasSave.asReadonly();

  save(): void {
    const state = this.gameState.getState();
    const camera = {
      panX: this.camera.panX(),
      panY: this.camera.panY(),
      zoom: this.camera.zoom(),
    };
    localStorage.setItem(SAVE_KEY, serialize(state, camera));
    this._hasSave.set(true);
  }

  autoSave(): void {
    const state = this.gameState.getState();
    const camera = {
      panX: this.camera.panX(),
      panY: this.camera.panY(),
      zoom: this.camera.zoom(),
    };
    localStorage.setItem(AUTOSAVE_KEY, serialize(state, camera));
    this._hasSave.set(true);
  }

  load(navigate = true): void {
    const json = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(AUTOSAVE_KEY);
    if (!json) return;

    const { state, camera } = deserialize(json);

    this.worldGenerator.setSeed(state.seed);
    this.gameState.setState(state);
    this.camera.centerOn(camera.panX, camera.panY);

    if (navigate) this.router.navigate(['/game']);
  }

  deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(AUTOSAVE_KEY);
    this._hasSave.set(false);
  }
}
