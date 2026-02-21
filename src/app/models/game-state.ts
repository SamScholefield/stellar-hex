import { HexCoord } from '../shared/hex/hex-coord.type';
import { StellarObjectType } from './hex-data';

export interface Resources {
  energy: number;
  minerals: number;
  alloys: number;
  credits: number;
}

export type BuildingType = 'mining_station' | 'colony' | 'solar_collector' | 'starbase' | 'research_lab';

export interface BuildingStats {
  cost: Partial<Resources>;
  maxHealth: number;
  buildTurns: number;
  yield: Partial<Resources>;
  allowedHexTypes: StellarObjectType[];
  sightRange: number;
}

export const BUILDING_STATS: Record<BuildingType, BuildingStats> = {
  mining_station:  { cost: { energy: 20, minerals: 5 },  maxHealth: 15, buildTurns: 1, yield: { minerals: 3 },              allowedHexTypes: ['asteroid', 'asteroid_field'], sightRange: 2 },
  colony:          { cost: { energy: 30, alloys: 10 },    maxHealth: 30, buildTurns: 2, yield: { alloys: 2, credits: 2 },    allowedHexTypes: ['planet'],                      sightRange: 3 },
  solar_collector: { cost: { energy: 10, credits: 15 },   maxHealth: 10, buildTurns: 1, yield: { energy: 4 },                allowedHexTypes: ['star'],                        sightRange: 1 },
  starbase:        { cost: { energy: 40, alloys: 20, credits: 20 }, maxHealth: 50, buildTurns: 3, yield: { energy: 2, credits: 1 }, allowedHexTypes: ['empty', 'planet'],            sightRange: 3 },
  research_lab:    { cost: { energy: 25, alloys: 10 },    maxHealth: 12, buildTurns: 2, yield: { energy: 1, credits: 1 },    allowedHexTypes: ['nebula'],                       sightRange: 2 },
};

export interface ProductionItem {
  unitType: UnitType;
  turnsRemaining: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  resources: Resources;
  isAI: boolean;
  exploredHexes: Set<string>;
  homeBaseId?: string;
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
  name: string;
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

const UNIT_TYPE_PREFIX: Record<UnitType, string> = {
  scout: 'SC',
  fighter: 'FI',
  cruiser: 'CR',
  colony_ship: 'CO',
  mining_drone: 'MD',
};

const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  scout: 'Scout',
  fighter: 'Fighter',
  cruiser: 'Cruiser',
  colony_ship: 'Colony Ship',
  mining_drone: 'Mining Drone',
};

/** Generate a display name like "Scout SC003" based on existing units of the same type. */
export function generateUnitName(type: UnitType, existingUnits: Map<string, UnitData>): string {
  let count = 0;
  for (const u of existingUnits.values()) {
    if (u.type === type) count++;
  }
  const num = String(count + 1).padStart(3, '0');
  return `${UNIT_TYPE_LABEL[type]} ${UNIT_TYPE_PREFIX[type]}${num}`;
}

export interface BuildingData {
  id: string;
  ownerId: string;
  type: BuildingType;
  q: number;
  r: number;
  health: number;
  maxHealth: number;
  productionQueue?: ProductionItem[];
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

export type AnomalyType = 'derelict_ship' | 'resource_cache' | 'alien_signal' | 'wormhole' | 'ancient_ruins';

export interface AnomalyInfo {
  name: string;
  reward: Partial<Resources>;
}

export const ANOMALY_REWARDS: Record<AnomalyType, AnomalyInfo> = {
  derelict_ship:  { name: 'Derelict Ship',  reward: { alloys: 15, credits: 10 } },
  resource_cache: { name: 'Resource Cache',  reward: { minerals: 20, energy: 10 } },
  alien_signal:   { name: 'Alien Signal',    reward: { credits: 25 } },
  wormhole:       { name: 'Wormhole',        reward: { energy: 30 } },
  ancient_ruins:  { name: 'Ancient Ruins',   reward: { alloys: 10, minerals: 10, credits: 10 } },
};

export interface Anomaly {
  id: string;
  type: AnomalyType;
  q: number;
  r: number;
}

export interface GameState {
  turn: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  units: Map<string, UnitData>;
  buildings: Map<string, BuildingData>;
  dynamicObjects: Map<string, DynamicObject>;
  chunkOverrides: Map<string, HexOverride[]>;
  anomalies: Map<string, Anomaly>;
  seed: number;
}
