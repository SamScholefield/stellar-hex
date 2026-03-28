import { GameState, TechId } from '../../models/game-state';
import { GameAction } from './actions';

/**
 * Serialize a GameState into a JSON string suitable for the server API.
 * Converts Maps and Sets into JSON-friendly structures.
 */
export function serializeState(state: GameState): string {
  return JSON.stringify({
    turn: state.turn,
    currentPlayerIndex: state.currentPlayerIndex,
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      resources: { ...p.resources },
      isAI: p.isAI,
      exploredHexes: [...p.exploredHexes],
      homeBaseId: p.homeBaseId,
      eliminated: p.eliminated,
      researchedTechs: [...p.researchedTechs],
    })),
    units: [...state.units.entries()],
    buildings: [...state.buildings.entries()],
    dynamicObjects: [...state.dynamicObjects.entries()],
    chunkOverrides: [...state.chunkOverrides.entries()],
    anomalies: [...state.anomalies.entries()],
    tradeHubs: [...state.tradeHubs.entries()],
    tradedThisTurn: [...state.tradedThisTurn],
    seed: state.seed,
    gameOver: state.gameOver,
    spectate: state.spectate,
  });
}

/**
 * Serialize a GameAction into a plain object safe for JSON.
 * Converts any Set/Map fields into arrays.
 */
export function serializeAction(action: GameAction): Record<string, unknown> {
  const obj: Record<string, unknown> = { ...action };

  // END_TURN and UNDOCK_UNIT have Set<string> fields
  if ('impassableHexes' in action && action.impassableHexes instanceof Set) {
    obj['impassableHexes'] = [...action.impassableHexes];
  }
  if ('miningYields' in action && action.miningYields) {
    obj['miningYields'] = { ...action.miningYields };
  }
  // MOVE_UNIT path is already an array of plain objects
  // Other actions are already JSON-safe

  return obj;
}
