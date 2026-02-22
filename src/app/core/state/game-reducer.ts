import { GameState, BuildingData, BUILDING_STATS, UNIT_STATS, BuildingType, UnitType, Resources, ANOMALY_REWARDS, Anomaly, generateUnitName, UNIT_UPKEEP, PlayerState, UnitData, GameOverState, ECONOMIC_VICTORY_CREDITS } from '../../models/game-state';
import { StellarObjectType } from '../../models/hex-data';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance } from '../../shared/hex/hex-math';
import { resolveCombat, CombatResult, CombatOptions, maybePromote } from '../combat/combat-resolver';
import { computeInfluenceForPlayer, isNearAnyEnemyUnit } from '../influence/influence';
import { GameAction } from './actions';

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'END_TURN':
      return endTurn(state, action.miningYields);
    case 'MOVE_UNIT':
      return moveUnit(state, action.unitId, action.path, action.cost);
    case 'BUILD':
      return build(state, action.playerId, action.buildingType, action.hex, action.hexType as StellarObjectType);
    case 'PRODUCE_UNIT':
      return produceUnit(state, action.buildingId, action.unitType);
    case 'ATTACK':
      return attack(state, action.attackerId, action.targetId);
    case 'DISCOVER_ANOMALY':
      return discoverAnomaly(state, action.anomaly);
    case 'COLLECT_ANOMALY':
      return collectAnomaly(state, action.anomalyId, action.unitId);
    case 'ADVANCE_COMETS':
      return advanceComets(state);
    case 'SET_HOME_BASE':
      return setHomeBase(state, action.playerId, action.buildingId);
    case 'UPDATE_EXPLORED':
      return updateExplored(state, action.playerId, action.hexKeys);
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

  // Validate friendly unit at hex
  let hasUnit = false;
  for (const unit of state.units.values()) {
    if (unit.ownerId === playerId && unit.q === hex.q && unit.r === hex.r) {
      hasUnit = true;
      break;
    }
  }
  if (!hasUnit) return state;

  // Validate player and resources
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;
  const player = state.players[playerIndex];
  if (!hasResources(player, stats.cost)) return state;

  // Starbase requires a scout at the hex
  if (buildingType === 'starbase') {
    let hasScout = false;
    for (const unit of state.units.values()) {
      if (unit.ownerId === playerId && unit.type === 'scout' && unit.q === hex.q && unit.r === hex.r) {
        hasScout = true;
        break;
      }
    }
    if (!hasScout) return state;
  }

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

  // Deduct resources + auto-set home base in a single pass
  const autoHome = buildingType === 'starbase' && !player.homeBaseId;
  const players = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    const updated = { ...p, resources: deductResources(p.resources, stats.cost) };
    if (autoHome) updated.homeBaseId = id;
    return updated;
  });

  return { ...state, players, buildings, units };
}

function setHomeBase(state: GameState, playerId: string, buildingId: string): GameState {
  const building = state.buildings.get(buildingId);
  if (!building || building.type !== 'starbase' || building.ownerId !== playerId) return state;

  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;

  return {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, homeBaseId: buildingId } : p
    ),
  };
}

function updateExplored(state: GameState, playerId: string, hexKeys: string[]): GameState {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;

  const player = state.players[playerIndex];
  const explored = new Set(player.exploredHexes);
  for (const key of hexKeys) {
    explored.add(key);
  }

  return {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, exploredHexes: explored } : p
    ),
  };
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
  const queue = [...(building.productionQueue ?? []), { unitType, turnsRemaining: unitStats.buildTurns }];
  buildings.set(buildingId, { ...building, productionQueue: queue });

  return { ...state, players, buildings };
}

export interface AttackResult {
  newState: GameState;
  combat: CombatResult | null;
}

function attack(state: GameState, attackerId: string, targetId: string): GameState {
  return attackWithResult(state, attackerId, targetId).newState;
}

export function attackWithResult(state: GameState, attackerId: string, targetId: string): AttackResult {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(targetId);
  if (!attacker || !defender) return { newState: state, combat: null };

  // Cannot attack own units
  if (attacker.ownerId === defender.ownerId) return { newState: state, combat: null };

  // Must not have already attacked this turn (MP = -1 after attacking)
  if (attacker.movementPoints < 0) return { newState: state, combat: null };

  // Check range
  const dist = hexDistance(
    { q: attacker.q, r: attacker.r, s: -attacker.q - attacker.r },
    { q: defender.q, r: defender.r, s: -defender.q - defender.r },
  );
  if (dist > attacker.range) return { newState: state, combat: null };

  // Compute influence for combat modifiers
  const attackerInfluence = computeInfluenceForPlayer(state.buildings, attacker.ownerId);
  const defenderInfluence = computeInfluenceForPlayer(state.buildings, defender.ownerId);
  const combatOptions: CombatOptions = {
    attackerInOwnInfluence: attackerInfluence.has(`${attacker.q},${attacker.r}`),
    defenderInOwnInfluence: defenderInfluence.has(`${defender.q},${defender.r}`),
    attackerInEnemyInfluence: defenderInfluence.has(`${attacker.q},${attacker.r}`),
    defenderInEnemyInfluence: attackerInfluence.has(`${defender.q},${defender.r}`),
  };

  // Resolve combat
  const combat = resolveCombat(attacker, defender, dist, state.seed + state.turn, combatOptions);

  const units = new Map(state.units);

  // Apply damage and set attacker MP to 0
  if (combat.attackerDestroyed) {
    units.delete(attackerId);
  } else {
    const newXp = attacker.xp + combat.attackerXpGain;
    units.set(attackerId, {
      ...attacker,
      health: attacker.health - (combat.attackerStrike ? combat.defenderStrike?.hullDamage ?? 0 : 0),
      shields: Math.max(0, attacker.shields - (combat.defenderStrike?.shieldDamage ?? 0)),
      movementPoints: -1,
      xp: newXp,
      veteranTier: maybePromote(attacker.veteranTier, newXp),
    });
  }

  if (combat.defenderDestroyed) {
    units.delete(targetId);
  } else {
    const newXp = defender.xp + combat.defenderXpGain;
    units.set(targetId, {
      ...defender,
      health: defender.health - combat.attackerStrike.hullDamage,
      shields: Math.max(0, defender.shields - combat.attackerStrike.shieldDamage),
      xp: newXp,
      veteranTier: maybePromote(defender.veteranTier, newXp),
    });
  }

  return { newState: { ...state, units }, combat };
}

function endTurn(state: GameState, miningYields?: Partial<Resources>): GameState {
  // If game is already over, don't process further turns
  if (state.gameOver) return state;

  const currentPlayerIndex = state.currentPlayerIndex;
  const currentPlayer = state.players[currentPlayerIndex];
  const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length;
  const nextTurn = nextPlayerIndex === 0 ? state.turn + 1 : state.turn;

  // Collect income from current player's buildings before switching
  let players = state.players;
  let units = new Map(state.units);

  if (currentPlayer && !currentPlayer.eliminated) {
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

    // Add mining drone income from pre-computed yields
    income.energy += miningYields?.energy ?? 0;
    income.minerals += miningYields?.minerals ?? 0;
    income.alloys += miningYields?.alloys ?? 0;
    income.credits += miningYields?.credits ?? 0;

    // Compute upkeep
    const upkeep = computeUpkeepForPlayer(state.units, currentPlayer.id);

    // Apply income then subtract upkeep
    const newResources = {
      energy: currentPlayer.resources.energy + income.energy - upkeep.energy,
      minerals: currentPlayer.resources.minerals + income.minerals - upkeep.minerals,
      alloys: currentPlayer.resources.alloys + income.alloys - upkeep.alloys,
      credits: currentPlayer.resources.credits + income.credits - upkeep.credits,
    };

    // Attrition: if any resource is negative, damage all player's units by 2
    const isBankrupt = newResources.energy < 0 || newResources.minerals < 0
      || newResources.alloys < 0 || newResources.credits < 0;

    if (isBankrupt) {
      for (const [id, unit] of units) {
        if (unit.ownerId !== currentPlayer.id) continue;
        const newHealth = unit.health - 2;
        if (newHealth <= 0) {
          units.delete(id);
        } else {
          units.set(id, { ...unit, health: newHealth });
        }
      }
    }

    // Clamp resources to 0
    newResources.energy = Math.max(0, newResources.energy);
    newResources.minerals = Math.max(0, newResources.minerals);
    newResources.alloys = Math.max(0, newResources.alloys);
    newResources.credits = Math.max(0, newResources.credits);

    players = state.players.map((p, i) =>
      i === currentPlayerIndex ? { ...p, resources: newResources } : p
    );

    // Influence regen: +2 HP, +1 shield for units in own influence, not near enemies
    const influence = computeInfluenceForPlayer(state.buildings, currentPlayer.id);
    for (const [id, unit] of units) {
      if (unit.ownerId !== currentPlayer.id) continue;
      const key = `${unit.q},${unit.r}`;
      if (!influence.has(key)) continue;
      if (isNearAnyEnemyUnit(unit.q, unit.r, units, currentPlayer.id)) continue;
      const newHealth = Math.min(unit.health + 2, unit.maxHealth);
      const newShields = Math.min(unit.shields + 1, unit.maxShields);
      if (newHealth !== unit.health || newShields !== unit.shields) {
        units.set(id, { ...unit, health: newHealth, shields: newShields });
      }
    }
  }

  // Process production queues for current player's starbases
  let buildings = state.buildings;
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
        const unitName = generateUnitName(item.unitType, units);
        units.set(unitId, {
          id: unitId,
          name: unitName,
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
          size: unitStats.size,
          weapon: unitStats.weapon,
          armor: unitStats.armor,
          shields: unitStats.maxShields,
          maxShields: unitStats.maxShields,
          xp: 0,
          veteranTier: 'standard',
        });
      } else {
        newQueue.push({ ...item, turnsRemaining: remaining });
      }
    }
    buildings.set(bId, { ...building, productionQueue: newQueue.length > 0 ? newQueue : undefined });
  }

  // Refresh movement points and regen shields for the next player's units
  for (const [id, unit] of units) {
    if (unit.ownerId === state.players[nextPlayerIndex].id) {
      units.set(id, {
        ...unit,
        movementPoints: unit.maxMovementPoints,
        shields: Math.min(unit.shields + 1, unit.maxShields),
      });
    }
  }

  // Elimination check: mark players with no units AND no buildings as eliminated
  players = players.map(p => {
    if (p.eliminated) return p;
    if (shouldEliminate(p, units, buildings)) {
      return { ...p, eliminated: true };
    }
    return p;
  });

  // Victory check
  const gameOver = checkVictory(players, units, buildings);

  let result: GameState = {
    ...state,
    turn: nextTurn,
    currentPlayerIndex: nextPlayerIndex,
    players,
    units,
    buildings,
    gameOver: gameOver ?? state.gameOver,
  };

  if (nextPlayerIndex === 0) {
    result = advanceComets(result);
  }

  return result;
}

function moveUnit(state: GameState, unitId: string, path: HexCoord[], cost: number): GameState {
  const unit = state.units.get(unitId);
  if (!unit || path.length === 0) return state;

  const dest = path[path.length - 1];
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

function discoverAnomaly(state: GameState, anomaly: Anomaly): GameState {
  if (state.anomalies.has(anomaly.id)) return state;
  const anomalies = new Map(state.anomalies);
  anomalies.set(anomaly.id, anomaly);
  return { ...state, anomalies };
}

function collectAnomaly(state: GameState, anomalyId: string, unitId: string): GameState {
  const anomaly = state.anomalies.get(anomalyId);
  if (!anomaly) return state;

  const unit = state.units.get(unitId);
  if (!unit || unit.type !== 'scout') return state;
  if (unit.q !== anomaly.q || unit.r !== anomaly.r) return state;

  const info = ANOMALY_REWARDS[anomaly.type];
  if (!info) return state;

  const playerIndex = state.players.findIndex(p => p.id === unit.ownerId);
  if (playerIndex === -1) return state;

  const players = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    return {
      ...p,
      resources: {
        energy: p.resources.energy + (info.reward.energy ?? 0),
        minerals: p.resources.minerals + (info.reward.minerals ?? 0),
        alloys: p.resources.alloys + (info.reward.alloys ?? 0),
        credits: p.resources.credits + (info.reward.credits ?? 0),
      },
    };
  });

  const anomalies = new Map(state.anomalies);
  anomalies.delete(anomalyId);

  return { ...state, players, anomalies };
}

export function computeUpkeepForPlayer(units: Map<string, UnitData>, playerId: string): Resources {
  const upkeep: Resources = { energy: 0, minerals: 0, alloys: 0, credits: 0 };
  for (const unit of units.values()) {
    if (unit.ownerId !== playerId) continue;
    const cost = UNIT_UPKEEP[unit.type];
    if (!cost) continue;
    upkeep.energy += cost.energy ?? 0;
    upkeep.minerals += cost.minerals ?? 0;
    upkeep.alloys += cost.alloys ?? 0;
    upkeep.credits += cost.credits ?? 0;
  }
  return upkeep;
}

export function shouldEliminate(player: PlayerState, units: Map<string, UnitData>, buildings: Map<string, BuildingData>): boolean {
  if (player.eliminated) return false;
  for (const u of units.values()) {
    if (u.ownerId === player.id) return false;
  }
  for (const b of buildings.values()) {
    if (b.ownerId === player.id) return false;
  }
  return true;
}

export function checkVictory(players: PlayerState[], units: Map<string, UnitData>, buildings: Map<string, BuildingData>): GameOverState | undefined {
  // Economic victory
  for (const p of players) {
    if (!p.eliminated && p.resources.credits >= ECONOMIC_VICTORY_CREDITS) {
      return { winnerId: p.id, reason: 'economic' };
    }
  }

  // Domination victory
  const alive = players.filter(p => !p.eliminated);
  if (alive.length === 1) {
    return { winnerId: alive[0].id, reason: 'domination' };
  }

  return undefined;
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
