import { GameState } from '../../models/game-state';
import { GameAction } from './actions';

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'END_TURN':
      return endTurn(state);
    case 'MOVE_UNIT':
      return moveUnit(state, action.unitId, action.path);
    case 'ADVANCE_COMETS':
      return advanceComets(state);
    default:
      return state;
  }
}

function endTurn(state: GameState): GameState {
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const nextTurn = nextPlayerIndex === 0 ? state.turn + 1 : state.turn;

  // Refresh movement points for the next player's units
  const units = new Map(state.units);
  for (const [id, unit] of units) {
    if (unit.ownerId === state.players[nextPlayerIndex].id) {
      units.set(id, { ...unit, movementPoints: unit.maxMovementPoints });
    }
  }

  // Advance comets at the start of each new round (when wrapping back to player 0)
  let result: GameState = {
    ...state,
    turn: nextTurn,
    currentPlayerIndex: nextPlayerIndex,
    units,
  };

  if (nextPlayerIndex === 0) {
    result = advanceComets(result);
  }

  return result;
}

function moveUnit(state: GameState, unitId: string, path: import('../../shared/hex/hex-coord.type').HexCoord[]): GameState {
  const unit = state.units.get(unitId);
  if (!unit || path.length === 0) return state;

  const dest = path[path.length - 1];
  // Path cost = number of steps (each step costs at least 1 MP)
  const cost = path.length - 1;
  const remaining = unit.movementPoints - cost;
  if (remaining < 0) return state;

  const units = new Map(state.units);
  units.set(unitId, {
    ...unit,
    q: dest.q,
    r: dest.r,
    movementPoints: remaining,
  });

  return { ...state, units };
}

function advanceComets(state: GameState): GameState {
  if (state.dynamicObjects.size === 0) return state;

  const dynamicObjects = new Map(state.dynamicObjects);
  for (const [id, obj] of dynamicObjects) {
    dynamicObjects.set(id, {
      ...obj,
      q: obj.q + obj.velocity.q,
      r: obj.r + obj.velocity.r,
    });
  }

  return { ...state, dynamicObjects };
}
