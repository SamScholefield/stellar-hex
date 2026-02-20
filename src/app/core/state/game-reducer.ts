import { GameState, BuildingData, BUILDING_STATS, UNIT_STATS, BuildingType, UnitType } from '../../models/game-state';
import { StellarObjectType } from '../../models/hex-data';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { GameAction } from './actions';

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'END_TURN':
      return endTurn(state);
    case 'MOVE_UNIT':
      return moveUnit(state, action.unitId, action.path);
    case 'BUILD':
      return build(state, action.playerId, action.buildingType, action.hex, action.hexType as StellarObjectType);
    case 'PRODUCE_UNIT':
      return produceUnit(state, action.buildingId, action.unitType);
    case 'ADVANCE_COMETS':
      return advanceComets(state);
    default:
      return state;
  }
}

function hasResources(player: { resources: { energy: number; minerals: number; alloys: number; credits: number } }, cost: Partial<{ energy: number; minerals: number; alloys: number; credits: number }>): boolean {
  return (player.resources.energy >= (cost.energy ?? 0))
    && (player.resources.minerals >= (cost.minerals ?? 0))
    && (player.resources.alloys >= (cost.alloys ?? 0))
    && (player.resources.credits >= (cost.credits ?? 0));
}

function deductResources(resources: { energy: number; minerals: number; alloys: number; credits: number }, cost: Partial<{ energy: number; minerals: number; alloys: number; credits: number }>) {
  return {
    energy: resources.energy - (cost.energy ?? 0),
    minerals: resources.minerals - (cost.minerals ?? 0),
    alloys: resources.alloys - (cost.alloys ?? 0),
    credits: resources.credits - (cost.credits ?? 0),
  };
}

function build(state: GameState, playerId: string, buildingType: BuildingType, hex: HexCoord, hexType: StellarObjectType): GameState {
  const stats = BUILDING_STATS[buildingType];
  if (!stats) return state;

  // Validate hex type
  if (!stats.allowedHexTypes.includes(hexType)) return state;

  // Validate no duplicate building at this hex
  for (const b of state.buildings.values()) {
    if (b.q === hex.q && b.r === hex.r) return state;
  }

  // Validate player and resources
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;
  const player = state.players[playerIndex];
  if (!hasResources(player, stats.cost)) return state;

  // Colony special case: consume colony_ship at hex
  let units = state.units;
  if (buildingType === 'colony') {
    let colonyShipId: string | null = null;
    for (const [id, unit] of state.units) {
      if (unit.ownerId === playerId && unit.type === 'colony_ship' && unit.q === hex.q && unit.r === hex.r) {
        colonyShipId = id;
        break;
      }
    }
    if (!colonyShipId) return state;
    units = new Map(state.units);
    units.delete(colonyShipId);
  }

  // Deduct resources
  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, resources: deductResources(p.resources, stats.cost) } : p
  );

  // Add building
  const buildings = new Map(state.buildings);
  const id = `b_${hex.q}_${hex.r}_${Date.now()}`;
  const building: BuildingData = {
    id,
    ownerId: playerId,
    type: buildingType,
    q: hex.q,
    r: hex.r,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
  };
  buildings.set(id, building);

  return { ...state, players, buildings, units };
}

function produceUnit(state: GameState, buildingId: string, unitType: UnitType): GameState {
  const building = state.buildings.get(buildingId);
  if (!building || building.type !== 'starbase') return state;

  const unitStats = UNIT_STATS[unitType];
  if (!unitStats) return state;

  // Validate player resources
  const playerIndex = state.players.findIndex(p => p.id === building.ownerId);
  if (playerIndex === -1) return state;
  const player = state.players[playerIndex];
  if (!hasResources(player, unitStats.cost)) return state;

  // Deduct resources
  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, resources: deductResources(p.resources, unitStats.cost) } : p
  );

  // Add to production queue
  const buildings = new Map(state.buildings);
  const queue = [...(building.productionQueue ?? []), { unitType, turnsRemaining: 2 }];
  buildings.set(buildingId, { ...building, productionQueue: queue });

  return { ...state, players, buildings };
}

function endTurn(state: GameState): GameState {
  const currentPlayerIndex = state.currentPlayerIndex;
  const currentPlayer = state.players[currentPlayerIndex];
  const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length;
  const nextTurn = nextPlayerIndex === 0 ? state.turn + 1 : state.turn;

  // Collect income from current player's buildings before switching
  let players = state.players;
  if (currentPlayer) {
    const income = { energy: 0, minerals: 0, alloys: 0, credits: 0 };
    for (const building of state.buildings.values()) {
      if (building.ownerId !== currentPlayer.id) continue;
      const stats = BUILDING_STATS[building.type];
      if (!stats) continue;
      income.energy += stats.yield.energy ?? 0;
      income.minerals += stats.yield.minerals ?? 0;
      income.alloys += stats.yield.alloys ?? 0;
      income.credits += stats.yield.credits ?? 0;
    }
    players = state.players.map((p, i) =>
      i === currentPlayerIndex
        ? {
            ...p,
            resources: {
              energy: p.resources.energy + income.energy,
              minerals: p.resources.minerals + income.minerals,
              alloys: p.resources.alloys + income.alloys,
              credits: p.resources.credits + income.credits,
            },
          }
        : p
    );
  }

  // Process production queues for current player's starbases
  let buildings = state.buildings;
  let units = new Map(state.units);
  let buildingsChanged = false;

  for (const [bId, building] of state.buildings) {
    if (building.ownerId !== currentPlayer?.id) continue;
    if (!building.productionQueue || building.productionQueue.length === 0) continue;

    if (!buildingsChanged) {
      buildings = new Map(state.buildings);
      buildingsChanged = true;
    }

    const newQueue = [];
    for (const item of building.productionQueue) {
      const remaining = item.turnsRemaining - 1;
      if (remaining <= 0) {
        // Spawn unit at building location
        const unitStats = UNIT_STATS[item.unitType];
        const unitId = `u_${building.q}_${building.r}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        units.set(unitId, {
          id: unitId,
          ownerId: building.ownerId,
          type: item.unitType,
          q: building.q,
          r: building.r,
          movementPoints: unitStats.maxMovementPoints,
          maxMovementPoints: unitStats.maxMovementPoints,
          health: unitStats.maxHealth,
          maxHealth: unitStats.maxHealth,
          attack: unitStats.attack,
          defense: unitStats.defense,
          range: unitStats.range,
          sightRange: unitStats.sightRange,
        });
      } else {
        newQueue.push({ ...item, turnsRemaining: remaining });
      }
    }
    buildings.set(bId, { ...building, productionQueue: newQueue.length > 0 ? newQueue : undefined });
  }

  // Refresh movement points for the next player's units
  for (const [id, unit] of units) {
    if (unit.ownerId === state.players[nextPlayerIndex].id) {
      units.set(id, { ...unit, movementPoints: unit.maxMovementPoints });
    }
  }

  let result: GameState = {
    ...state,
    turn: nextTurn,
    currentPlayerIndex: nextPlayerIndex,
    players,
    units,
    buildings,
  };

  if (nextPlayerIndex === 0) {
    result = advanceComets(result);
  }

  return result;
}

function moveUnit(state: GameState, unitId: string, path: HexCoord[]): GameState {
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
