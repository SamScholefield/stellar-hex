import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { GameState, PlayerState, Resources, UnitData, UnitType, UNIT_STATS, BuildingData, BUILDING_STATS, generateUnitName } from '../../models/game-state';
import { GameStateService } from './game-state.service';
import { GameSaveService } from './game-save.service';
import { EventLogService } from './event-log.service';
import { UndoService } from './undo.service';
import { WaypointService } from './waypoint.service';
import { SelectionService } from '../selection/selection.service';
import { ChunkManagerService } from '../chunks/chunk-manager.service';
import { WorldGeneratorService } from '../generation/world-generator.service';
import { CameraService } from '../camera/camera.service';
import { hexToPixel, hexDistance, hexesInRange, hexKey, toHexCoord } from '../../shared/hex/hex-math';
import { HexCoord } from '../../shared/hex/hex-coord.type';

export interface NewGameConfig {
  playerName: string;
  aiOpponents: number;
  seed?: number;
}

const PLAYER_COLORS = ['#5eead4', '#f87171', '#fbbf24', '#a78bfa', '#34d399', '#fb923c'];

/** Base positions spread around the origin. Adjusted at runtime to be near planets. */
const BASE_POSITIONS: { q: number; r: number }[] = [
  { q: 0, r: 0 },
  { q: 20, r: -10 },
  { q: -20, r: 10 },
  { q: -10, r: -20 },
  { q: 10, r: 20 },
  { q: 20, r: 10 },
];

/** Preferred max hex distance from a star for a spawn point. */
const SPAWN_STAR_RANGE = 4;
/** Widened search range if preferred range has no valid hex. */
const SPAWN_STAR_RANGE_MAX = 8;

function makeStartResources(): Resources {
  return { energy: 100, minerals: 50, alloys: 20, credits: 50 };
}

function makeUnit(id: string, name: string, ownerId: string, type: UnitType, q: number, r: number): UnitData {
  const stats = UNIT_STATS[type];
  return {
    id, name, ownerId, type, q, r,
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
    hasAttacked: false,
  };
}

@Injectable({ providedIn: 'root' })
export class GameInitService {
  private readonly gameState = inject(GameStateService);
  private readonly gameSave = inject(GameSaveService);
  private readonly eventLog = inject(EventLogService);
  private readonly undoSvc = inject(UndoService);
  private readonly waypointSvc = inject(WaypointService);
  private readonly selectionSvc = inject(SelectionService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly worldGenerator = inject(WorldGeneratorService);
  private readonly camera = inject(CameraService);
  private readonly router = inject(Router);

  newGame(config: NewGameConfig): void {
    this.eventLog.clear();
    this.waypointSvc.clearAll();
    this.undoSvc.clearHistory();
    this.selectionSvc.deselectAll();
    this.gameSave.deleteSave();
    this.chunkManager.clearCache();
    const seed = config.seed ?? Date.now();
    this.worldGenerator.setSeed(seed);

    const players: PlayerState[] = [
      {
        id: 'p0',
        name: config.playerName,
        color: PLAYER_COLORS[0],
        resources: makeStartResources(),
        isAI: false,
        exploredHexes: new Set(),
        eliminated: false,
        researchedTechs: new Set(),
      },
    ];

    for (let i = 0; i < config.aiOpponents; i++) {
      players.push({
        id: `p${i + 1}`,
        name: `AI ${i + 1}`,
        color: PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length],
        resources: makeStartResources(),
        isAI: true,
        exploredHexes: new Set(),
        eliminated: false,
        researchedTechs: new Set(),
      });
    }

    const takenPositions = new Set<string>();
    const units = new Map<string, UnitData>();
    const buildings = new Map<string, BuildingData>();
    const starbaseStats = BUILDING_STATS.starbase;
    const scoutStats = UNIT_STATS.scout;
    const revealRange = Math.max(starbaseStats.sightRange, scoutStats.sightRange);

    // Spawn human player first, then track their visible hexes
    let humanVisibleHexes: Set<string> | null = null;

    for (let i = 0; i < players.length; i++) {
      const base = BASE_POSITIONS[i % BASE_POSITIONS.length];
      const pos = this.findSpawnNearStar(base.q, base.r, takenPositions, humanVisibleHexes);
      takenPositions.add(hexKey(pos.q, pos.r));

      // Place starting starbase
      const starbaseId = `starbase-${players[i].id}`;
      buildings.set(starbaseId, {
        id: starbaseId,
        ownerId: players[i].id,
        type: 'starbase',
        q: pos.q,
        r: pos.r,
        health: starbaseStats.maxHealth,
        maxHealth: starbaseStats.maxHealth,
        shields: starbaseStats.maxShields,
        maxShields: starbaseStats.maxShields,
      });
      players[i].homeBaseId = starbaseId;

      // Place starting scout on the same hex
      const name = generateUnitName('scout', units);
      const unit = makeUnit(`scout-${players[i].id}`, name, players[i].id, 'scout', pos.q, pos.r);
      units.set(unit.id, unit);

      // Reveal starting area (starbase sightRange is larger than scout)
      const visible = hexesInRange(toHexCoord(pos.q, pos.r), revealRange);
      for (const hex of visible) {
        players[i].exploredHexes.add(hexKey(hex.q, hex.r));
      }

      // After human spawn, record their visible hexes so AI spawns avoid them
      if (i === 0) {
        humanVisibleHexes = new Set(players[0].exploredHexes);
      }
    }

    const state: GameState = {
      turn: 1,
      currentPlayerIndex: 0,
      players,
      units,
      buildings,
      dynamicObjects: new Map(),
      chunkOverrides: new Map(),
      anomalies: new Map(),
      seed,
    };

    this.gameState.setState(state);

    // Center camera on player 0's starting position
    const p0Base = buildings.get(`starbase-${players[0].id}`)!;
    const { x, y } = hexToPixel(p0Base.q, p0Base.r, 30);
    this.camera.centerOn(x, y);

    this.router.navigate(['/game']);
  }

  /**
   * Find a spawn hex near a star hex, on empty/nebula (valid for starbase).
   * If excludeHexes is provided, candidates within that set are rejected
   * (used to keep AI spawns outside the human player's starting vision).
   */
  private findSpawnNearStar(
    baseQ: number,
    baseR: number,
    takenPositions: Set<string>,
    excludeHexes: Set<string> | null,
  ): { q: number; r: number } {
    const base: HexCoord = toHexCoord(baseQ, baseR);
    const starbaseAllowed = new Set(BUILDING_STATS.starbase.allowedHexTypes);

    // Collect all star hexes from nearby systems (stars are at system centers)
    const systems = this.worldGenerator.getNearbySystems(baseQ, baseR);
    const stars: { star: HexCoord; dist: number }[] = [];
    for (const sys of systems) {
      const obj = this.worldGenerator.getHexObject(sys.center.q, sys.center.r);
      if (obj?.type === 'star') {
        stars.push({ star: sys.center, dist: hexDistance(sys.center, base) });
      }
    }
    stars.sort((a, b) => a.dist - b.dist);

    // Try each star, preferring the closest to base position
    for (const { star } of stars) {
      // First try preferred range, then widen if needed
      for (const range of [SPAWN_STAR_RANGE, SPAWN_STAR_RANGE_MAX]) {
        const candidates = hexesInRange(star, range);
        // Sort by distance to star (spawn close to star for solar collector access)
        candidates.sort((a, b) => hexDistance(a, star) - hexDistance(b, star));

        for (const hex of candidates) {
          const key = hexKey(hex.q, hex.r);
          if (takenPositions.has(key)) continue;
          if (excludeHexes?.has(key)) continue;
          const obj = this.worldGenerator.getHexObject(hex.q, hex.r);
          const hexType = obj?.type ?? 'empty';
          if (!starbaseAllowed.has(hexType)) continue;
          return { q: hex.q, r: hex.r };
        }
      }
    }

    // Last resort: use an adjacent empty hex near the base position
    const adjacentHex: HexCoord = { q: baseQ + 1, r: baseR, s: -baseQ - 1 - baseR };
    return { q: adjacentHex.q, r: adjacentHex.r };
  }
}
