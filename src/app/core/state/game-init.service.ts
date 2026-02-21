import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { GameState, PlayerState, Resources, UnitData, UnitType, UNIT_STATS, generateUnitName } from '../../models/game-state';
import { GameStateService } from './game-state.service';
import { GameSaveService } from './game-save.service';
import { WorldGeneratorService } from '../generation/world-generator.service';
import { CameraService } from '../camera/camera.service';
import { hexToPixel, hexDistance, hexesInRange } from '../../shared/hex/hex-math';
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

/** Max hex distance from a planet for a spawn point (scout 4 MP x 2 turns). */
const SPAWN_PLANET_RANGE = 8;

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
  };
}

@Injectable({ providedIn: 'root' })
export class GameInitService {
  private readonly gameState = inject(GameStateService);
  private readonly gameSave = inject(GameSaveService);
  private readonly worldGenerator = inject(WorldGeneratorService);
  private readonly camera = inject(CameraService);
  private readonly router = inject(Router);

  newGame(config: NewGameConfig): void {
    this.gameSave.deleteSave();
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
      });
    }

    const takenPositions = new Set<string>();
    const units = new Map<string, UnitData>();
    for (let i = 0; i < players.length; i++) {
      const base = BASE_POSITIONS[i % BASE_POSITIONS.length];
      const pos = this.findSpawnNearPlanet(base.q, base.r, takenPositions);
      takenPositions.add(`${pos.q},${pos.r}`);

      const name = generateUnitName('scout', units);
      const unit = makeUnit(`scout-${players[i].id}`, name, players[i].id, 'scout', pos.q, pos.r);
      units.set(unit.id, unit);

      // Reveal starting area
      const visible = hexesInRange({ q: pos.q, r: pos.r, s: -pos.q - pos.r }, unit.sightRange);
      for (const hex of visible) {
        players[i].exploredHexes.add(`${hex.q},${hex.r}`);
      }
    }

    const state: GameState = {
      turn: 1,
      currentPlayerIndex: 0,
      players,
      units,
      buildings: new Map(),
      dynamicObjects: new Map(),
      chunkOverrides: new Map(),
      anomalies: new Map(),
      seed,
    };

    this.gameState.setState(state);

    // Center camera on player 0's starting position
    const p0Unit = units.get(`scout-${players[0].id}`)!;
    const { x, y } = hexToPixel(p0Unit.q, p0Unit.r, 30);
    this.camera.centerOn(x, y);

    this.router.navigate(['/game']);
  }

  /** Find a spawn hex within SPAWN_PLANET_RANGE of a planet, near the base position. */
  private findSpawnNearPlanet(
    baseQ: number,
    baseR: number,
    takenPositions: Set<string>,
  ): { q: number; r: number } {
    const base: HexCoord = { q: baseQ, r: baseR, s: -baseQ - baseR };

    // Find nearby star systems and scan orbital rings for planets
    const systems = this.worldGenerator.getNearbySystems(baseQ, baseR);
    let nearestPlanet: HexCoord | null = null;
    let nearestDist = Infinity;

    for (const sys of systems) {
      const orbitals = hexesInRange(sys.center, 4);
      for (const hex of orbitals) {
        if (hexDistance(hex, sys.center) < 2) continue;
        const obj = this.worldGenerator.getHexObject(hex.q, hex.r);
        if (obj?.type === 'planet') {
          const d = hexDistance(hex, base);
          if (d < nearestDist) {
            nearestDist = d;
            nearestPlanet = hex;
          }
        }
      }
    }

    // Base is already within range of a planet and on passable terrain
    if (nearestPlanet && nearestDist <= SPAWN_PLANET_RANGE) {
      const baseKey = `${baseQ},${baseR}`;
      if (!takenPositions.has(baseKey)) {
        const baseObj = this.worldGenerator.getHexObject(baseQ, baseR);
        if (!baseObj || (baseObj.type !== 'star' && baseObj.type !== 'black_hole')) {
          return { q: baseQ, r: baseR };
        }
      }
    }

    // Find an empty hex within SPAWN_PLANET_RANGE of the nearest planet
    if (nearestPlanet) {
      const candidates = hexesInRange(nearestPlanet, SPAWN_PLANET_RANGE);
      // Prefer hexes closer to the base position
      candidates.sort((a, b) => hexDistance(a, base) - hexDistance(b, base));

      for (const hex of candidates) {
        const key = `${hex.q},${hex.r}`;
        if (takenPositions.has(key)) continue;
        const obj = this.worldGenerator.getHexObject(hex.q, hex.r);
        if (obj && (obj.type === 'star' || obj.type === 'black_hole')) continue;
        return { q: hex.q, r: hex.r };
      }
    }

    // Fallback: no planet found (extremely unlikely), use base
    return { q: baseQ, r: baseR };
  }
}
