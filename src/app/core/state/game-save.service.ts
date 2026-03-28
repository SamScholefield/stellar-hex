import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
  TradeHub,
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
import { SaveSummary } from '../../api/models/save-summary';
import { listSaves } from '../../api/fn/saves/list-saves';
import { createSave } from '../../api/fn/saves/create-save';
import { getSave } from '../../api/fn/saves/get-save';
import { updateSave } from '../../api/fn/saves/update-save';
import { deleteSave as deleteSaveApi } from '../../api/fn/saves/delete-save';
import { ApiConfiguration } from '../../api/api-configuration';
import { firstValueFrom } from 'rxjs';

const LOCAL_SAVE_KEY = 'stellar-hex-autosave';

interface LocalSaveData {
  state: SerializedGameState;
  camera: { panX: number; panY: number; zoom: number };
  waypoints?: SerializedWaypoint[];
  savedAt?: string;
}

export interface SaveEntry {
  id: number | null;     // server ID (null for local-only saves)
  key: string;           // local storage key or server-generated key
  turn: number;
  playerName: string;
  savedAt: string | null;
  saveName: string;
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
  tradeHubs?: [string, TradeHub][];
  tradedThisTurn?: string[];
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
  const data: LocalSaveData = {
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
      tradeHubs: [...state.tradeHubs.entries()],
      tradedThisTurn: [...state.tradedThisTurn],
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
  const data: LocalSaveData = JSON.parse(json);
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
    tradeHubs: new Map(s.tradeHubs ?? []),
    tradedThisTurn: new Set(s.tradedThisTurn ?? []),
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
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);

  private readonly _saves = signal<SaveEntry[]>([]);
  readonly saves = this._saves.asReadonly();

  /** Current autosave server ID (for PUT updates). */
  private autosaveId: number | null = null;
  private serverAvailable = true;

  readonly hasSave = computed(() => this._saves().length > 0);

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

  /** Fetch saves from server, fallback to localStorage. */
  async refreshSaves(): Promise<void> {
    if (this.serverAvailable) {
      try {
        const res = await firstValueFrom(
          listSaves(this.http, this.apiConfig.rootUrl, {})
        );
        this._saves.set(res.body.map(s => this.summaryToEntry(s)));
        return;
      } catch (e) {
        if (e instanceof HttpErrorResponse && e.status === 0) {
          this.serverAvailable = false;
        }
        // Auth errors (401) are transient — don't disable server permanently
      }
    }
    // Fallback: local saves
    this._saves.set(this.buildLocalSaveList());
  }

  async autoSave(): Promise<void> {
    const state = this.gameState.getState();
    const cam = {
      panX: this.camera.panX(),
      panY: this.camera.panY(),
      zoom: this.camera.zoom(),
    };
    const waypoints = this.waypointSvc.getSerializedWaypoints();
    const json = serialize(state, cam, waypoints);

    // Always save locally as fallback
    localStorage.setItem(LOCAL_SAVE_KEY, json);

    if (!this.serverAvailable) {
      this.refreshSaves();
      return;
    }

    const human = state.players.find(p => !p.isAI);
    const req = {
      saveName: 'Autosave',
      stateJson: json,
      cameraJson: JSON.stringify(cam),
      waypointsJson: JSON.stringify(waypoints),
      turn: state.turn,
      playerName: state.spectate ? 'Spectator' : (human?.name ?? null),
    };

    try {
      if (this.autosaveId) {
        const res = await firstValueFrom(
          updateSave(this.http, this.apiConfig.rootUrl, { id: this.autosaveId, body: req })
        );
        // ID stays the same
      } else {
        const res = await firstValueFrom(
          createSave(this.http, this.apiConfig.rootUrl, { body: req })
        );
        this.autosaveId = res.body.id;
      }
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 0) {
        this.serverAvailable = false;
      }
    }

    this.refreshSaves();
  }

  async loadById(id: number): Promise<void> {
    try {
      const res = await firstValueFrom(
        getSave(this.http, this.apiConfig.rootUrl, { id })
      );
      const save = res.body;
      this.eventLog.clear();

      const { state, camera, waypoints } = deserialize(save.stateJson);
      this.waypointSvc.loadWaypoints(waypoints);
      this.worldGenerator.setSeed(state.seed);
      this.gameState.setState(state);
      this.camera.centerOn(camera.panX, camera.panY);
      this.autosaveId = save.id;
      this.router.navigate(['/game']);
    } catch {
      // Fallback: try local
      this.loadLocal();
    }
  }

  /** Load latest save (server or local). */
  async loadLatest(navigate = true): Promise<void> {
    const latest = this.latestSave();
    if (latest?.id) {
      await this.loadById(latest.id);
      return;
    }
    this.loadLocal(navigate);
  }

  /** Load from localStorage (offline fallback). */
  loadLocal(navigate = true): void {
    const json = localStorage.getItem(LOCAL_SAVE_KEY);
    if (!json) return;

    this.eventLog.clear();
    const { state, camera, waypoints } = deserialize(json);
    this.waypointSvc.loadWaypoints(waypoints);
    this.worldGenerator.setSeed(state.seed);
    this.gameState.setState(state);
    this.camera.centerOn(camera.panX, camera.panY);

    if (navigate) this.router.navigate(['/game']);
  }

  async deleteById(id: number): Promise<void> {
    try {
      await firstValueFrom(
        deleteSaveApi(this.http, this.apiConfig.rootUrl, { id })
      );
      if (this.autosaveId === id) this.autosaveId = null;
    } catch {
      // ignore
    }
    this.refreshSaves();
  }

  /** Clear autosave tracking (e.g. on new game). */
  clearAutosaveId(): void {
    this.autosaveId = null;
  }

  // --- Legacy localStorage methods (offline fallback) ---

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
    localStorage.removeItem(LOCAL_SAVE_KEY);
    this.refreshSaves();
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

  private summaryToEntry(s: SaveSummary): SaveEntry {
    return {
      id: s.id,
      key: `server-${s.id}`,
      turn: s.turn,
      playerName: s.playerName ?? 'Unknown',
      savedAt: s.updatedAt,
      saveName: s.saveName,
    };
  }

  private buildLocalSaveList(): SaveEntry[] {
    const entries: SaveEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || (key !== LOCAL_SAVE_KEY && !key.startsWith('stellar-hex-save-'))) continue;
      try {
        const data: LocalSaveData = JSON.parse(localStorage.getItem(key)!);
        const human = data.state.players.find(p => !p.isAI);
        entries.push({
          id: null,
          key,
          turn: data.state.turn,
          playerName: data.state.spectate ? 'Spectator' : (human?.name ?? 'Unknown'),
          savedAt: data.savedAt ?? null,
          saveName: key === LOCAL_SAVE_KEY ? 'Autosave' : key.replace('stellar-hex-save-', ''),
        });
      } catch {
        entries.push({ id: null, key, turn: 0, playerName: 'Corrupted', savedAt: null, saveName: key });
      }
    }
    return entries;
  }
}
