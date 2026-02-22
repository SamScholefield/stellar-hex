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
  colony:          { cost: { energy: 30, alloys: 10 },    maxHealth: 30, buildTurns: 2, yield: { alloys: 2, credits: 2 },    allowedHexTypes: ['planet'],                      sightRange: 5 },
  solar_collector: { cost: { energy: 10, credits: 15 },   maxHealth: 10, buildTurns: 1, yield: { energy: 4 },                allowedHexTypes: ['star'],                        sightRange: 2 },
  starbase:        { cost: { energy: 40, alloys: 20, credits: 20 }, maxHealth: 50, buildTurns: 3, yield: { energy: 2, credits: 1 }, allowedHexTypes: ['empty', 'planet'],            sightRange: 5 },
  research_lab:    { cost: { energy: 25, alloys: 10 },    maxHealth: 12, buildTurns: 2, yield: { energy: 1, credits: 1 },    allowedHexTypes: ['nebula'],                       sightRange: 4 },
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
  eliminated: boolean;
}

export type ShipSize = 'small' | 'medium' | 'large';
export type WeaponType = 'laser' | 'kinetic' | 'missile';
export type VeteranTier = 'standard' | 'improved' | 'advanced';

export interface WeaponStats {
  shieldBonus: number;
  armorBypass: number;
  sizeBonus: Record<ShipSize, number>;
}

export const WEAPON_STATS: Record<WeaponType, WeaponStats> = {
  laser:   { shieldBonus: 1.25, armorBypass: 0,    sizeBonus: { small: 1.0, medium: 1.0, large: 1.0 } },
  kinetic: { shieldBonus: 1.0,  armorBypass: 0.25, sizeBonus: { small: 1.0, medium: 1.0, large: 1.0 } },
  missile: { shieldBonus: 1.0,  armorBypass: 0,    sizeBonus: { small: 1.25, medium: 1.0, large: 1.0 } },
};

export interface VeteranBonus {
  attackMul: number;
  defenseMul: number;
  critBonus: number;
}

export const VETERAN_BONUSES: Record<VeteranTier, VeteranBonus> = {
  standard: { attackMul: 1.0, defenseMul: 1.0, critBonus: 0 },
  improved: { attackMul: 1.15, defenseMul: 1.1, critBonus: 0.05 },
  advanced: { attackMul: 1.3, defenseMul: 1.2, critBonus: 0.10 },
};

export const VETERAN_XP_THRESHOLDS: Record<VeteranTier, number> = {
  standard: 0,
  improved: 50,
  advanced: 150,
};

export type UnitType = 'scout' | 'fighter' | 'corvette' | 'frigate' | 'cruiser' | 'battleship' | 'colony_ship' | 'mining_drone';

export interface UnitStats {
  maxMovementPoints: number;
  maxHealth: number;
  attack: number;
  defense: number;
  range: number;
  sightRange: number;
  cost: Partial<Resources>;
  size: ShipSize;
  weapon: WeaponType | null;
  armor: number;
  maxShields: number;
  buildTurns: number;
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  scout:        { maxMovementPoints: 4, maxHealth: 8,  attack: 3,  defense: 0,  range: 1, sightRange: 4, cost: { energy: 20, alloys: 5 },                       size: 'small',  weapon: 'laser',   armor: 0, maxShields: 0,  buildTurns: 2 },
  fighter:      { maxMovementPoints: 3, maxHealth: 15, attack: 7,  defense: 3,  range: 1, sightRange: 2, cost: { energy: 30, alloys: 15 },                      size: 'small',  weapon: 'laser',   armor: 1, maxShields: 2,  buildTurns: 2 },
  corvette:     { maxMovementPoints: 3, maxHealth: 18, attack: 8,  defense: 5,  range: 1, sightRange: 2, cost: { energy: 35, alloys: 18 },                      size: 'small',  weapon: 'kinetic', armor: 2, maxShields: 3,  buildTurns: 2 },
  frigate:      { maxMovementPoints: 2, maxHealth: 25, attack: 9,  defense: 8,  range: 2, sightRange: 3, cost: { energy: 45, alloys: 25, credits: 10 },         size: 'medium', weapon: 'missile', armor: 3, maxShields: 5,  buildTurns: 3 },
  cruiser:      { maxMovementPoints: 2, maxHealth: 30, attack: 12, defense: 12, range: 2, sightRange: 3, cost: { energy: 50, alloys: 30, credits: 20 },         size: 'medium', weapon: 'laser',   armor: 4, maxShields: 8,  buildTurns: 3 },
  battleship:   { maxMovementPoints: 1, maxHealth: 50, attack: 18, defense: 18, range: 2, sightRange: 3, cost: { energy: 80, alloys: 50, credits: 40 },         size: 'large',  weapon: 'kinetic', armor: 6, maxShields: 12, buildTurns: 4 },
  colony_ship:  { maxMovementPoints: 2, maxHealth: 12, attack: 0,  defense: 0,  range: 0, sightRange: 2, cost: { energy: 40, alloys: 20, credits: 30 },         size: 'medium', weapon: null,      armor: 0, maxShields: 0,  buildTurns: 2 },
  mining_drone: { maxMovementPoints: 2, maxHealth: 6,  attack: 0,  defense: 0,  range: 0, sightRange: 1, cost: { energy: 15, minerals: 10 },                    size: 'small',  weapon: null,      armor: 0, maxShields: 0,  buildTurns: 2 },
};

export const UNIT_UPKEEP: Partial<Record<UnitType, Partial<Resources>>> = {
  fighter:     { energy: 2 },
  corvette:    { energy: 3 },
  frigate:     { energy: 4, credits: 1 },
  cruiser:     { energy: 5, credits: 2 },
  battleship:  { energy: 8, credits: 4 },
  colony_ship: { energy: 3 },
};

export const ECONOMIC_VICTORY_CREDITS = 500;

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
  size: ShipSize;
  weapon: WeaponType | null;
  armor: number;
  shields: number;
  maxShields: number;
  xp: number;
  veteranTier: VeteranTier;
}

const UNIT_TYPE_PREFIX: Record<UnitType, string> = {
  scout: 'SC',
  fighter: 'FI',
  corvette: 'CV',
  frigate: 'FR',
  cruiser: 'CR',
  battleship: 'BS',
  colony_ship: 'CO',
  mining_drone: 'MD',
};

const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  scout: 'Scout',
  fighter: 'Fighter',
  corvette: 'Corvette',
  frigate: 'Frigate',
  cruiser: 'Cruiser',
  battleship: 'Battleship',
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

export type VictoryReason = 'domination' | 'economic';

export interface GameOverState {
  winnerId: string;
  reason: VictoryReason;
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
  gameOver?: GameOverState;
}
