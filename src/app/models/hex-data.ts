import { HexCoord } from '../shared/hex/hex-coord.type';

export type StellarObjectType =
  | 'star'
  | 'planet'
  | 'moon'
  | 'asteroid'
  | 'asteroid_field'
  | 'comet'
  | 'nebula'
  | 'black_hole'
  | 'empty';

export interface ResourceYield {
  energy?: number;
  minerals?: number;
  alloys?: number;
  credits?: number;
}

export interface StellarObject {
  type: StellarObjectType;
  subtype?: string;
  size: number;
  resources?: ResourceYield;
  orbitAnchor?: HexCoord;
  velocity?: HexCoord;
}

export type AnomalyHexType = 'derelict_ship' | 'resource_cache' | 'alien_signal' | 'wormhole' | 'ancient_ruins';

export interface HexData {
  q: number;
  r: number;
  object: StellarObject | null;
  anomaly?: AnomalyHexType;
}
