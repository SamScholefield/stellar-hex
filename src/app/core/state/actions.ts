import { HexCoord } from '../../shared/hex/hex-coord.type';
import { Anomaly, BuildingType, Resources, TechId, UnitType } from '../../models/game-state';

export type GameAction =
  | { type: 'END_TURN'; miningYields?: Partial<Resources> }
  | { type: 'MOVE_UNIT'; unitId: string; path: HexCoord[]; cost: number }
  | { type: 'ATTACK'; attackerId: string; targetId: string }
  | { type: 'BUILD'; playerId: string; buildingType: BuildingType; hex: HexCoord; hexType: string }
  | { type: 'PRODUCE_UNIT'; buildingId: string; unitType: UnitType }
  | { type: 'QUEUE_RESEARCH'; buildingId: string; techId: TechId }
  | { type: 'DISCOVER_ANOMALY'; anomaly: Anomaly }
  | { type: 'COLLECT_ANOMALY'; anomalyId: string; unitId: string }
  | { type: 'ADVANCE_COMETS' }
  | { type: 'SET_HOME_BASE'; playerId: string; buildingId: string }
  | { type: 'UPDATE_EXPLORED'; playerId: string; hexKeys: string[] };
