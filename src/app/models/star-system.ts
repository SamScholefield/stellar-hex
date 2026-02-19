import { HexCoord } from '../shared/hex/hex-coord.type';

export type StarClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

export interface StarSystemAnchor {
  center: HexCoord;
  starClass: StarClass;
  planetCount: number;
  seed: number;
}
