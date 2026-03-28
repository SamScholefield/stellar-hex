import { HexCoord } from '../../shared/hex/hex-coord.type';
import { Anomaly, BuildingType, ResourceKey, Resources, TechId, TradeHub, UnitType } from '../../models/game-state';

export type GameAction =
  | { type: 'END_TURN'; miningYields?: Partial<Resources>; impassableHexes?: Set<string> }
  | { type: 'MOVE_UNIT'; unitId: string; path: HexCoord[]; cost: number }
  | { type: 'ATTACK'; attackerId: string; targetId: string }
  | { type: 'BUILD'; playerId: string; buildingType: BuildingType; hex: HexCoord; hexType: string; adjacentHexTypes?: string[]; nearbyHasPlanet?: boolean }
  | { type: 'PRODUCE_UNIT'; buildingId: string; unitType: UnitType }
  | { type: 'QUEUE_RESEARCH'; buildingId: string; techId: TechId }
  | { type: 'DISCOVER_ANOMALY'; anomaly: Anomaly }
  | { type: 'COLLECT_ANOMALY'; anomalyId: string; unitId: string }
  | { type: 'DISCOVER_TRADE_HUB'; tradeHub: TradeHub }
  | { type: 'TRADE'; hubId: string; unitId: string; sell: ResourceKey; buy: ResourceKey; sellAmount: number }
  | { type: 'UNDOCK_UNIT'; unitId: string; buildingId: string; impassableHexes?: Set<string> }
  | { type: 'ADVANCE_COMETS' }
  | { type: 'SET_HOME_BASE'; playerId: string; buildingId: string }
  | { type: 'UPDATE_EXPLORED'; playerId: string; hexKeys: string[] };
