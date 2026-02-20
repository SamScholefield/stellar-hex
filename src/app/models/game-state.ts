import { HexCoord } from '../shared/hex/hex-coord.type';

export interface Resources {
  energy: number;
  minerals: number;
  alloys: number;
  credits: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  resources: Resources;
  isAI: boolean;
}

export type UnitType = 'scout' | 'fighter' | 'cruiser' | 'colony_ship' | 'mining_drone';

export interface UnitStats {
  maxMovementPoints: number;
  maxHealth: number;
  attack: number;
  defense: number;
  range: number;
  sightRange: number;
  cost: Partial<Resources>;
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  scout:        { maxMovementPoints: 4, maxHealth: 8,  attack: 2,  defense: 1,  range: 1, sightRange: 4, cost: { energy: 20, alloys: 5 } },
  fighter:      { maxMovementPoints: 3, maxHealth: 15, attack: 6,  defense: 3,  range: 1, sightRange: 2, cost: { energy: 30, alloys: 15 } },
  cruiser:      { maxMovementPoints: 2, maxHealth: 30, attack: 10, defense: 8,  range: 2, sightRange: 3, cost: { energy: 50, alloys: 30, credits: 20 } },
  colony_ship:  { maxMovementPoints: 2, maxHealth: 12, attack: 0,  defense: 2,  range: 0, sightRange: 2, cost: { energy: 40, alloys: 20, credits: 30 } },
  mining_drone: { maxMovementPoints: 2, maxHealth: 6,  attack: 0,  defense: 1,  range: 0, sightRange: 1, cost: { energy: 15, minerals: 10 } },
};

export interface UnitData {
  id: string;
  ownerId: string;
  type: UnitType;
  q: number;
  r: number;
  movementPoints: number;
  maxMovementPoints: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  range: number;
  sightRange: number;
}

export interface BuildingData {
  id: string;
  ownerId: string;
  type: string;
  q: number;
  r: number;
  health: number;
  maxHealth: number;
}

export interface DynamicObject {
  id: string;
  type: string;
  q: number;
  r: number;
  velocity: HexCoord;
}

export interface HexOverride {
  q: number;
  r: number;
  change: string;
}

export interface GameState {
  turn: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  units: Map<string, UnitData>;
  buildings: Map<string, BuildingData>;
  dynamicObjects: Map<string, DynamicObject>;
  chunkOverrides: Map<string, HexOverride[]>;
  seed: number;
}
