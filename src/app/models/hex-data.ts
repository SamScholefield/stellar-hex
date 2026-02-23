import { HexCoord } from '../shared/hex/hex-coord.type';
import { AnomalyType, Resources } from './game-state';

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

export interface StellarObject {
  type: StellarObjectType;
  subtype?: string;
  size: number;
  resources?: Partial<Resources>;
  orbitAnchor?: HexCoord;
  velocity?: HexCoord;
}

export interface HexData {
  q: number;
  r: number;
  object: StellarObject | null;
  anomaly?: AnomalyType;
  /** True when this hex falls within a nebula noise region, even if its primary object is not a nebula. */
  inNebula?: boolean;
}
