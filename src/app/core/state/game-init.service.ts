import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { GameState, PlayerState, Resources, UnitData, UnitType, UNIT_STATS } from '../../models/game-state';
import { GameStateService } from './game-state.service';
import { WorldGeneratorService } from '../generation/world-generator.service';
import { CameraService } from '../camera/camera.service';
import { hexToPixel } from '../../shared/hex/hex-math';

export interface NewGameConfig {
  playerName: string;
  aiOpponents: number;
  seed?: number;
}

const PLAYER_COLORS = ['#5eead4', '#f87171', '#fbbf24', '#a78bfa', '#34d399', '#fb923c'];

/** Starting hex positions for up to 6 players, spread around the origin. */
const START_POSITIONS: { q: number; r: number }[] = [
  { q: 0, r: 0 },
  { q: 20, r: -10 },
  { q: -20, r: 10 },
  { q: -10, r: -20 },
  { q: 10, r: 20 },
  { q: 20, r: 10 },
];

function makeStartResources(): Resources {
  return { energy: 100, minerals: 50, alloys: 20, credits: 50 };
}

function makeUnit(id: string, ownerId: string, type: UnitType, q: number, r: number): UnitData {
  const stats = UNIT_STATS[type];
  return {
    id, ownerId, type, q, r,
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
  private readonly worldGenerator = inject(WorldGeneratorService);
  private readonly camera = inject(CameraService);
  private readonly router = inject(Router);

  newGame(config: NewGameConfig): void {
    const seed = config.seed ?? Date.now();
    this.worldGenerator.setSeed(seed);

    const players: PlayerState[] = [
      {
        id: 'p0',
        name: config.playerName,
        color: PLAYER_COLORS[0],
        resources: makeStartResources(),
        isAI: false,
      },
    ];

    for (let i = 0; i < config.aiOpponents; i++) {
      players.push({
        id: `p${i + 1}`,
        name: `AI ${i + 1}`,
        color: PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length],
        resources: makeStartResources(),
        isAI: true,
      });
    }

    const units = new Map<string, UnitData>();
    for (let i = 0; i < players.length; i++) {
      const pos = START_POSITIONS[i % START_POSITIONS.length];
      units.set(`scout-${players[i].id}`, makeUnit(`scout-${players[i].id}`, players[i].id, 'scout', pos.q, pos.r));
    }

    const state: GameState = {
      turn: 1,
      currentPlayerIndex: 0,
      players,
      units,
      buildings: new Map(),
      dynamicObjects: new Map(),
      chunkOverrides: new Map(),
      seed,
    };

    this.gameState.setState(state);

    // Center camera on player 0's starting position
    const p0Pos = START_POSITIONS[0];
    const { x, y } = hexToPixel(p0Pos.q, p0Pos.r, 30); // HEX_SIZE = 30
    this.camera.centerOn(x, y);

    this.router.navigate(['/game']);
  }
}
