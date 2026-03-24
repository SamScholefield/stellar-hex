import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GameState,
  GameOverState,
  PlayerState,
  UnitData,
  BuildingData,
  DynamicObject,
  HexOverride,
  Anomaly,
  UNIT_STATS,
  BUILDING_STATS,
  TechId,
} from '../../models/game-state';
import { GameStateService } from './game-state.service';
import { EventLogService } from './event-log.service';
import { WaypointService, SerializedWaypoint } from './waypoint.service';
import { WorldGeneratorService } from '../generation/world-generator.service';
import { CameraService } from '../camera/camera.service';
import { DEV_SAVES } from './dev-saves';

const SAVE_KEY = 'stellar-hex-autosave';

interface SaveData {
  state: SerializedGameState;
  camera: { panX: number; panY: number; zoom: number };
  waypoints?: SerializedWaypoint[];
  savedAt?: string;
}

export interface SaveEntry {
  key: string;
  turn: number;
  playerName: string;
  savedAt: string | null;
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
  gameOver?: GameOverState;
  spectate?: boolean;
}

interface SerializedPlayer {
  id: string;
  name: string;
  color: string;
  resources: PlayerState['resources'];
  isAI: boolean;
  exploredHexes: string[];
  homeBaseId?: string;
  eliminated?: boolean;
  researchedTechs?: string[];
}

export function serialize(
  state: GameState,
  camera: { panX: number; panY: number; zoom: number },
  waypoints: SerializedWaypoint[] = [],
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
        eliminated: p.eliminated,
        researchedTechs: [...p.researchedTechs],
      })),
      units: [...state.units.entries()],
      buildings: [...state.buildings.entries()],
      dynamicObjects: [...state.dynamicObjects.entries()],
      chunkOverrides: [...state.chunkOverrides.entries()],
      anomalies: [...state.anomalies.entries()],
      seed: state.seed,
      gameOver: state.gameOver,
      spectate: state.spectate,
    },
    camera,
    waypoints,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(data);
}

export function deserialize(json: string): {
  state: GameState;
  camera: { panX: number; panY: number; zoom: number };
  waypoints: SerializedWaypoint[];
} {
  const data: SaveData = JSON.parse(json);
  const s = data.state;

  // Migrate units: fill new combat fields from UNIT_STATS if missing
  const rawUnits = new Map(s.units);
  for (const [id, unit] of rawUnits) {
    if (unit.weapon === undefined) {
      const stats = UNIT_STATS[unit.type];
      if (stats) {
        rawUnits.set(id, {
          ...unit,
          size: stats.size,
          weapon: stats.weapon,
          armor: stats.armor,
          shields: stats.maxShields,
          maxShields: stats.maxShields,
          xp: 0,
          veteranTier: 'standard',
          hasAttacked: false,
        } as UnitData);
      }
    }
  }

  // Migrate buildings: fill shields fields if missing
  const rawBuildings = new Map(s.buildings);
  for (const [id, building] of rawBuildings) {
    if ((building as any).shields === undefined) {
      const stats = BUILDING_STATS[building.type];
      const maxShields = stats?.maxShields ?? 0;
      rawBuildings.set(id, { ...building, shields: maxShields, maxShields });
    }
  }

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
      eliminated: p.eliminated ?? false,
      researchedTechs: new Set((p.researchedTechs ?? []) as TechId[]),
    })),
    units: rawUnits,
    buildings: rawBuildings,
    dynamicObjects: new Map(s.dynamicObjects),
    chunkOverrides: new Map(s.chunkOverrides),
    anomalies: new Map(s.anomalies),
    seed: s.seed,
    gameOver: s.gameOver,
    spectate: s.spectate,
  };

  return { state, camera: data.camera, waypoints: data.waypoints ?? [] };
}

@Injectable({ providedIn: 'root' })
export class GameSaveService {
  private readonly gameState = inject(GameStateService);
  private readonly eventLog = inject(EventLogService);
  private readonly waypointSvc = inject(WaypointService);
  private readonly worldGenerator = inject(WorldGeneratorService);
  private readonly camera = inject(CameraService);
  private readonly router = inject(Router);

  private readonly _hasSave = signal(localStorage.getItem(SAVE_KEY) !== null);
  readonly hasSave = this._hasSave.asReadonly();
  private readonly _saves = signal<SaveEntry[]>(this.buildSaveList());
  readonly saves = this._saves.asReadonly();

  /** The most recently saved entry (by savedAt timestamp), or null. */
  readonly latestSave = computed<SaveEntry | null>(() => {
    let latest: SaveEntry | null = null;
    for (const entry of this._saves()) {
      if (!entry.savedAt) continue;
      if (!latest || entry.savedAt > latest.savedAt!) {
        latest = entry;
      }
    }
    return latest;
  });

  autoSave(): void {
    const state = this.gameState.getState();
    const camera = {
      panX: this.camera.panX(),
      panY: this.camera.panY(),
      zoom: this.camera.zoom(),
    };
    const waypoints = this.waypointSvc.getSerializedWaypoints();
    localStorage.setItem(SAVE_KEY, serialize(state, camera, waypoints));
    this.refreshSaves();
  }

  load(navigate = true): void {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return;

    this.eventLog.clear();
    const { state, camera, waypoints } = deserialize(json);
    this.waypointSvc.loadWaypoints(waypoints);

    this.worldGenerator.setSeed(state.seed);
    this.gameState.setState(state);
    this.camera.centerOn(camera.panX, camera.panY);

    if (navigate) this.router.navigate(['/game']);
  }

  loadFromKey(key: string): void {
    const json = localStorage.getItem(key);
    if (!json) return;

    this.eventLog.clear();
    const { state, camera, waypoints } = deserialize(json);
    this.waypointSvc.loadWaypoints(waypoints);
    this.worldGenerator.setSeed(state.seed);
    this.gameState.setState(state);
    this.camera.centerOn(camera.panX, camera.panY);
    this.router.navigate(['/game']);
  }

  deleteKey(key: string): void {
    localStorage.removeItem(key);
    this.refreshSaves();
  }

  deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
    this.refreshSaves();
  }

  private refreshSaves(): void {
    this._hasSave.set(localStorage.getItem(SAVE_KEY) !== null);
    this._saves.set(this.buildSaveList());
  }

  installDevSaves(): void {
    for (const { key, data } of DEV_SAVES) {
      localStorage.setItem(key, data);
    }
    this.refreshSaves();
  }

  removeDevSaves(): void {
    for (const { key } of DEV_SAVES) {
      localStorage.removeItem(key);
    }
    this.refreshSaves();
  }

  private buildSaveList(): SaveEntry[] {
    const entries: SaveEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || (key !== SAVE_KEY && !key.startsWith('stellar-hex-save-'))) continue;
      try {
        const data: SaveData = JSON.parse(localStorage.getItem(key)!);
        const human = data.state.players.find(p => !p.isAI);
        entries.push({
          key,
          turn: data.state.turn,
          playerName: data.state.spectate ? 'Spectator' : (human?.name ?? 'Unknown'),
          savedAt: data.savedAt ?? null,
        });
      } catch {
        entries.push({ key, turn: 0, playerName: 'Corrupted', savedAt: null });
      }
    }
    entries.sort((a, b) => {
      if (a.key === SAVE_KEY) return -1;
      if (b.key === SAVE_KEY) return 1;
      return a.key.localeCompare(b.key);
    });
    return entries;
  }
}
