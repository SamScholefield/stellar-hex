import { HexCoord } from '../../shared/hex/hex-coord.type';

export type GameAction =
  | { type: 'END_TURN' }
  | { type: 'MOVE_UNIT'; unitId: string; path: HexCoord[] }
  | { type: 'ATTACK'; attackerId: string; targetId: string }
  | { type: 'BUILD'; playerId: string; buildingType: string; hex: HexCoord }
  | { type: 'PRODUCE_UNIT'; buildingId: string; unitType: string }
  | { type: 'HARVEST'; unitId: string }
  | { type: 'ADVANCE_COMETS' };
