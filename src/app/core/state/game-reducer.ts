import { GameState, BuildingData, BUILDING_STATS, UNIT_STATS, BuildingType, UnitType, Resources, ANOMALY_REWARDS, Anomaly, generateUnitName, PlayerState, UnitData, GameOverState, ECONOMIC_VICTORY_CREDITS, TechId, TECH_TREE, canResearch, computeTechBonuses, ResearchItem, canAfford, subtractResources, addResources, TradeHub, ResourceKey, TRADE_RATES, TRADE_HUB_REPLENISH, TRADE_HUB_MAX_STOCK } from '../../models/game-state';
import { computeIncome, computeUpkeep } from '../economy/economy.service';
import { StellarObjectType } from '../../models/hex-data';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexDistance, hexKey, hexNeighbors, toHexCoord } from '../../shared/hex/hex-math';
import { resolveCombat, resolveBuildingCombat, CombatResult, CombatOptions, maybePromote } from '../combat/combat-resolver';
import { computeInfluenceForPlayer, isNearAnyEnemyUnit } from '../influence/influence';
import { GameAction } from './actions';

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'END_TURN':
      return endTurn(state, action.miningYields);
    case 'MOVE_UNIT':
      return moveUnit(state, action.unitId, action.path, action.cost);
    case 'BUILD':
      return build(state, action.playerId, action.buildingType, action.hex, action.hexType as StellarObjectType, action.adjacentHexTypes as StellarObjectType[] | undefined, action.nearbyHasPlanet);
    case 'PRODUCE_UNIT':
      return produceUnit(state, action.buildingId, action.unitType);
    case 'QUEUE_RESEARCH':
      return queueResearch(state, action.buildingId, action.techId);
    case 'ATTACK':
      return attack(state, action.attackerId, action.targetId);
    case 'DISCOVER_ANOMALY':
      return discoverAnomaly(state, action.anomaly);
    case 'COLLECT_ANOMALY':
      return collectAnomaly(state, action.anomalyId, action.unitId);
    case 'DISCOVER_TRADE_HUB':
      return discoverTradeHub(state, action.tradeHub);
    case 'TRADE':
      return trade(state, action.hubId, action.unitId, action.sell, action.buy, action.sellAmount);
    case 'UNDOCK_UNIT':
      return undockUnit(state, action.unitId, action.buildingId);
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

function build(state: GameState, playerId: string, buildingType: BuildingType, hex: HexCoord, hexType: StellarObjectType, adjacentHexTypes?: StellarObjectType[], nearbyHasPlanet?: boolean): GameState {
  const stats = BUILDING_STATS[buildingType];
  if (!stats) return state;

  // Validate hex type
  if (!stats.allowedHexTypes.includes(hexType)) return state;

  // Solar collector requires an adjacent star
  if (buildingType === 'solar_collector') {
    if (!adjacentHexTypes || !adjacentHexTypes.includes('star')) return state;
  }

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
  if (!canAfford(player.resources, stats.cost)) return state;

  // Starbase requires a scout at the hex and a planet within range
  if (buildingType === 'starbase') {
    let hasScout = false;
    for (const unit of state.units.values()) {
      if (unit.ownerId === playerId && unit.type === 'scout' && unit.q === hex.q && unit.r === hex.r) {
        hasScout = true;
        break;
      }
    }
    if (!hasScout) return state;
    if (nearbyHasPlanet === false) return state;
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
    shields: stats.maxShields,
    maxShields: stats.maxShields,
  };
  buildings.set(id, building);

  // Deduct resources + auto-set home base in a single pass
  const autoHome = buildingType === 'starbase' && !player.homeBaseId;
  const players = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    const updated = { ...p, resources: subtractResources(p.resources, stats.cost) };
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
  if (!canAfford(player.resources, unitStats.cost)) return state;

  // Deduct resources
  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, resources: subtractResources(p.resources, unitStats.cost) } : p
  );

  // Add to production queue
  const buildings = new Map(state.buildings);
  const queue = [...(building.productionQueue ?? []), { unitType, turnsRemaining: unitStats.buildTurns }];
  buildings.set(buildingId, { ...building, productionQueue: queue });

  return { ...state, players, buildings };
}

function queueResearch(state: GameState, buildingId: string, techId: TechId): GameState {
  const building = state.buildings.get(buildingId);
  if (!building || building.type !== 'research_lab') return state;

  const techDef = TECH_TREE[techId];
  if (!techDef) return state;

  const playerIndex = state.players.findIndex(p => p.id === building.ownerId);
  if (playerIndex === -1) return state;
  const player = state.players[playerIndex];

  // Check prerequisites
  if (!canResearch(techId, player.researchedTechs)) return state;

  // Check not already queued in any research lab
  for (const b of state.buildings.values()) {
    if (b.ownerId !== player.id || b.type !== 'research_lab') continue;
    if (b.researchQueue?.some(item => item.techId === techId)) return state;
  }

  // Check resources
  if (!canAfford(player.resources, techDef.cost)) return state;

  // Deduct resources
  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, resources: subtractResources(p.resources, techDef.cost) } : p
  );

  // Add to research queue
  const buildings = new Map(state.buildings);
  const queue: ResearchItem[] = [...(building.researchQueue ?? []), { techId, turnsRemaining: techDef.researchTurns }];
  buildings.set(buildingId, { ...building, researchQueue: queue });

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
  if (!attacker) return { newState: state, combat: null };

  // Must not have already attacked this turn
  if (attacker.hasAttacked) return { newState: state, combat: null };

  // Try unit target first, then building target
  const defender = state.units.get(targetId);
  const targetBuilding = !defender ? state.buildings.get(targetId) : null;

  if (!defender && !targetBuilding) return { newState: state, combat: null };

  // Cannot attack own entities
  const targetOwnerId = defender ? defender.ownerId : targetBuilding!.ownerId;
  if (attacker.ownerId === targetOwnerId) return { newState: state, combat: null };

  const targetQ = defender ? defender.q : targetBuilding!.q;
  const targetR = defender ? defender.r : targetBuilding!.r;

  // Check range
  const dist = hexDistance(
    toHexCoord(attacker.q, attacker.r),
    toHexCoord(targetQ, targetR),
  );
  if (dist > attacker.range) return { newState: state, combat: null };

  // Compute influence for combat modifiers (include tech sight bonus)
  const attackerPlayer = state.players.find(p => p.id === attacker.ownerId);
  const defenderPlayer = state.players.find(p => p.id === targetOwnerId);
  const attackerSightBonus = attackerPlayer ? (computeTechBonuses(attackerPlayer.researchedTechs).sightRange ?? 0) : 0;
  const defenderSightBonus = defenderPlayer ? (computeTechBonuses(defenderPlayer.researchedTechs).sightRange ?? 0) : 0;
  const attackerInfluence = computeInfluenceForPlayer(state.buildings, attacker.ownerId, attackerSightBonus);
  const defenderInfluence = computeInfluenceForPlayer(state.buildings, targetOwnerId, defenderSightBonus);

  // --- Building target path ---
  if (targetBuilding) {
    let defenderIncomingMul = 1.0;
    if (defenderInfluence.has(hexKey(targetQ, targetR))) defenderIncomingMul *= 0.9;
    if (attackerInfluence.has(hexKey(targetQ, targetR))) defenderIncomingMul *= 1.1;

    const bCombat = resolveBuildingCombat(attacker, targetBuilding, state.seed + state.turn, defenderIncomingMul);

    const units = new Map(state.units);
    const newXp = attacker.xp + bCombat.attackerXpGain;
    units.set(attackerId, {
      ...attacker,
      hasAttacked: true,
      xp: newXp,
      veteranTier: maybePromote(attacker.veteranTier, newXp),
    });

    let buildings = state.buildings;
    if (bCombat.destroyed) {
      buildings = new Map(state.buildings);
      // Destroy all docked units
      if (targetBuilding.dockedUnits) {
        for (const dockedId of targetBuilding.dockedUnits) {
          units.delete(dockedId);
        }
      }
      buildings.delete(targetId);
    } else {
      buildings = new Map(state.buildings);
      buildings.set(targetId, {
        ...targetBuilding,
        health: targetBuilding.health - bCombat.hullDamage,
        shields: Math.max(0, targetBuilding.shields - bCombat.shieldDamage),
      });
    }

    // Map BuildingCombatResult to CombatResult shape for callers
    const combat: CombatResult = {
      attackerDamage: 0,
      defenderDamage: bCombat.damage,
      attackerShieldDamage: 0,
      defenderShieldDamage: bCombat.shieldDamage,
      attackerDestroyed: false,
      defenderDestroyed: bCombat.destroyed,
      attackerXpGain: bCombat.attackerXpGain,
      defenderXpGain: 0,
      attackerStrike: bCombat.strike,
      defenderStrike: null,
    };

    // Check elimination and victory immediately
    let players = state.players.map(p => {
      if (p.eliminated) return p;
      if (shouldEliminate(p, units, buildings)) return { ...p, eliminated: true };
      return p;
    });
    const gameOver = checkVictory(players, units, buildings) ?? state.gameOver;

    return { newState: { ...state, units, buildings, players, gameOver }, combat };
  }

  // --- Unit target path ---
  const combatOptions: CombatOptions = {
    attackerInOwnInfluence: attackerInfluence.has(hexKey(attacker.q, attacker.r)),
    defenderInOwnInfluence: defenderInfluence.has(hexKey(defender!.q, defender!.r)),
    attackerInEnemyInfluence: defenderInfluence.has(hexKey(attacker.q, attacker.r)),
    defenderInEnemyInfluence: attackerInfluence.has(hexKey(defender!.q, defender!.r)),
  };

  const combat = resolveCombat(attacker, defender!, dist, state.seed + state.turn, combatOptions);

  const units = new Map(state.units);

  if (combat.attackerDestroyed) {
    units.delete(attackerId);
  } else {
    const newXp = attacker.xp + combat.attackerXpGain;
    units.set(attackerId, {
      ...attacker,
      health: attacker.health - (combat.attackerStrike ? combat.defenderStrike?.hullDamage ?? 0 : 0),
      shields: Math.max(0, attacker.shields - (combat.defenderStrike?.shieldDamage ?? 0)),
      hasAttacked: true,
      xp: newXp,
      veteranTier: maybePromote(attacker.veteranTier, newXp),
    });
  }

  if (combat.defenderDestroyed) {
    units.delete(targetId);
  } else {
    const newXp = defender!.xp + combat.defenderXpGain;
    units.set(targetId, {
      ...defender!,
      health: defender!.health - combat.attackerStrike.hullDamage,
      shields: Math.max(0, defender!.shields - combat.attackerStrike.shieldDamage),
      xp: newXp,
      veteranTier: maybePromote(defender!.veteranTier, newXp),
    });
  }

  // Check elimination and victory immediately
  const buildings = state.buildings;
  let players = state.players.map(p => {
    if (p.eliminated) return p;
    if (shouldEliminate(p, units, buildings)) return { ...p, eliminated: true };
    return p;
  });
  const gameOver = checkVictory(players, units, buildings) ?? state.gameOver;

  return { newState: { ...state, units, players, gameOver }, combat };
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
  let buildings = state.buildings;
  let buildingsChanged = false;

  if (currentPlayer && !currentPlayer.eliminated) {
    const income = addResources(
      computeIncome(state.buildings, currentPlayer.id),
      miningYields ?? {},
    );

    // Compute upkeep
    const upkeep = computeUpkeep(state.units, currentPlayer.id);

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
    const regenSightBonus = computeTechBonuses(currentPlayer.researchedTechs).sightRange ?? 0;
    const influence = computeInfluenceForPlayer(state.buildings, currentPlayer.id, regenSightBonus);
    for (const [id, unit] of units) {
      if (unit.ownerId !== currentPlayer.id) continue;
      const key = hexKey(unit.q, unit.r);
      if (!influence.has(key)) continue;
      if (isNearAnyEnemyUnit(unit.q, unit.r, units, currentPlayer.id)) continue;
      const newHealth = Math.min(unit.health + 2, unit.maxHealth);
      const newShields = Math.min(unit.shields + 1, unit.maxShields);
      if (newHealth !== unit.health || newShields !== unit.shields) {
        units.set(id, { ...unit, health: newHealth, shields: newShields });
      }
    }

    // Building regen: +2 HP, +1 shield for buildings in own influence, not near enemies
    for (const [bId, building] of (buildingsChanged ? buildings : state.buildings)) {
      if (building.ownerId !== currentPlayer.id) continue;
      const bKey = hexKey(building.q, building.r);
      if (!influence.has(bKey)) continue;
      if (isNearAnyEnemyUnit(building.q, building.r, units, currentPlayer.id)) continue;
      const newHealth = Math.min(building.health + 2, building.maxHealth);
      const newShields = Math.min(building.shields + 1, building.maxShields);
      if (newHealth !== building.health || newShields !== building.shields) {
        if (!buildingsChanged) {
          buildings = new Map(state.buildings);
          buildingsChanged = true;
        }
        buildings.set(bId, { ...building, health: newHealth, shields: newShields });
      }
    }
  }

  // Process production queues for current player's starbases
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
        // Spawn unit at adjacent hex (not on the starbase itself)
        const unitStats = UNIT_STATS[item.unitType];
        const owner = currentPlayer;
        const techBonus = owner ? computeTechBonuses(owner.researchedTechs) : {};

        // Find first empty adjacent hex
        const neighbors = hexNeighbors(building.q, building.r);
        const occupiedKeys = new Set<string>();
        for (const u of units.values()) if (!u.dockedAt) occupiedKeys.add(hexKey(u.q, u.r));
        for (const b of buildings.values()) occupiedKeys.add(hexKey(b.q, b.r));
        const spawnHex = neighbors.find(n => !occupiedKeys.has(hexKey(n.q, n.r))) ?? { q: building.q, r: building.r };

        const unitId = `u_${building.q}_${building.r}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const unitName = generateUnitName(item.unitType, units);
        units.set(unitId, {
          id: unitId,
          name: unitName,
          ownerId: building.ownerId,
          type: item.unitType,
          q: spawnHex.q,
          r: spawnHex.r,
          movementPoints: unitStats.maxMovementPoints + (techBonus.maxMovementPoints ?? 0),
          maxMovementPoints: unitStats.maxMovementPoints + (techBonus.maxMovementPoints ?? 0),
          health: unitStats.maxHealth,
          maxHealth: unitStats.maxHealth,
          attack: unitStats.attack + (techBonus.attack ?? 0),
          defense: unitStats.defense,
          range: unitStats.range,
          sightRange: unitStats.sightRange + (techBonus.sightRange ?? 0),
          size: unitStats.size,
          weapon: unitStats.weapon,
          armor: unitStats.armor + (techBonus.armor ?? 0),
          shields: unitStats.maxShields + (techBonus.shields ?? 0),
          maxShields: unitStats.maxShields + (techBonus.shields ?? 0),
          xp: 0,
          veteranTier: 'standard',
          hasAttacked: false,
        });
      } else {
        newQueue.push({ ...item, turnsRemaining: remaining });
      }
    }
    buildings.set(bId, { ...building, productionQueue: newQueue.length > 0 ? newQueue : undefined });
  }

  // Process research queues for current player's research labs
  let researchCompleted = false;
  for (const [bId, building] of (buildingsChanged ? buildings : state.buildings)) {
    if (building.ownerId !== currentPlayer?.id) continue;
    if (!building.researchQueue || building.researchQueue.length === 0) continue;

    if (!buildingsChanged) {
      buildings = new Map(state.buildings);
      buildingsChanged = true;
    }

    const newQueue: ResearchItem[] = [];
    for (const item of building.researchQueue) {
      const remaining = item.turnsRemaining - 1;
      if (remaining <= 0) {
        researchCompleted = true;
      } else {
        newQueue.push({ ...item, turnsRemaining: remaining });
      }
    }
    buildings.set(bId, { ...building, researchQueue: newQueue.length > 0 ? newQueue : undefined });
  }

  // If any research completed, update player's researchedTechs and apply bonuses to all units
  if (researchCompleted && currentPlayer) {
    const newResearched = new Set(currentPlayer.researchedTechs);
    // Find completed techs from original queues
    for (const b of state.buildings.values()) {
      if (b.ownerId !== currentPlayer.id || b.type !== 'research_lab') continue;
      if (!b.researchQueue) continue;
      for (const item of b.researchQueue) {
        if (item.turnsRemaining === 1) {
          newResearched.add(item.techId);
        }
      }
    }

    const playerIdx = players.findIndex(p => p.id === currentPlayer.id);
    players = players.map((p, i) =>
      i === playerIdx ? { ...p, researchedTechs: newResearched } : p
    );

    // Apply new tech bonuses to all owned units
    const bonus = computeTechBonuses(newResearched);
    for (const [id, unit] of units) {
      if (unit.ownerId !== currentPlayer.id) continue;
      const updated = applyTechBonusToUnit(unit, bonus);
      if (updated !== unit) units.set(id, updated);
    }
  }

  // Refresh movement points and regen shields for the next player's units
  for (const [id, unit] of units) {
    if (unit.ownerId === state.players[nextPlayerIndex].id) {
      units.set(id, {
        ...unit,
        movementPoints: unit.maxMovementPoints,
        shields: Math.min(unit.shields + 1, unit.maxShields),
        hasAttacked: false,
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
    tradedThisTurn: new Set(),
    gameOver: gameOver ?? state.gameOver,
  };

  if (nextPlayerIndex === 0) {
    result = advanceComets(result);

    // Replenish trade hub stock each round
    if (result.tradeHubs.size > 0) {
      const tradeHubs = new Map(result.tradeHubs);
      for (const [id, hub] of tradeHubs) {
        const stock: Resources = {
          energy: Math.min(hub.stock.energy + TRADE_HUB_REPLENISH.energy, TRADE_HUB_MAX_STOCK.energy),
          minerals: Math.min(hub.stock.minerals + TRADE_HUB_REPLENISH.minerals, TRADE_HUB_MAX_STOCK.minerals),
          alloys: Math.min(hub.stock.alloys + TRADE_HUB_REPLENISH.alloys, TRADE_HUB_MAX_STOCK.alloys),
          credits: Math.min(hub.stock.credits + TRADE_HUB_REPLENISH.credits, TRADE_HUB_MAX_STOCK.credits),
        };
        tradeHubs.set(id, { ...hub, stock });
      }
      result = { ...result, tradeHubs };
    }
  }

  return result;
}

function moveUnit(state: GameState, unitId: string, path: HexCoord[], cost: number): GameState {
  const unit = state.units.get(unitId);
  if (!unit || path.length === 0) return state;

  const dest = path[path.length - 1];
  const remaining = unit.movementPoints - cost;
  if (remaining < 0) return state;

  // Cannot move to a hex occupied by an enemy unit or building
  const destKey = hexKey(dest.q, dest.r);
  for (const u of state.units.values()) {
    if (u.id !== unitId && u.ownerId !== unit.ownerId && hexKey(u.q, u.r) === destKey) return state;
  }
  for (const b of state.buildings.values()) {
    if (b.ownerId !== unit.ownerId && hexKey(b.q, b.r) === destKey) return state;
  }

  // Check for friendly starbase at destination — auto-dock
  let dockBuilding: BuildingData | null = null;
  for (const b of state.buildings.values()) {
    if (b.type === 'starbase' && b.ownerId === unit.ownerId && b.q === dest.q && b.r === dest.r) {
      dockBuilding = b;
      break;
    }
  }

  const units = new Map(state.units);
  if (dockBuilding) {
    // Dock: heal to full, mark as docked
    units.set(unitId, {
      ...unit,
      q: dest.q,
      r: dest.r,
      movementPoints: 0,
      health: unit.maxHealth,
      shields: unit.maxShields,
      dockedAt: dockBuilding.id,
    });
    // Add to building's docked list
    const buildings = new Map(state.buildings);
    const docked = dockBuilding.dockedUnits ? [...dockBuilding.dockedUnits] : [];
    docked.push(unitId);
    buildings.set(dockBuilding.id, { ...dockBuilding, dockedUnits: docked });
    return { ...state, units, buildings };
  }

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

  // Check victory immediately (anomaly credits could trigger economic victory)
  const gameOver = checkVictory(players, state.units, state.buildings) ?? state.gameOver;

  return { ...state, players, anomalies, gameOver };
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

/** Apply cumulative tech bonuses to a unit's stats (based on base stats + bonus). */
function applyTechBonusToUnit(unit: UnitData, bonus: import('../../models/game-state').TechBonus): UnitData {
  const base = UNIT_STATS[unit.type];
  const newAttack = base.attack + (bonus.attack ?? 0);
  const newArmor = base.armor + (bonus.armor ?? 0);
  const newMaxShields = base.maxShields + (bonus.shields ?? 0);
  const newSightRange = base.sightRange + (bonus.sightRange ?? 0);
  const newMaxMP = base.maxMovementPoints + (bonus.maxMovementPoints ?? 0);

  if (unit.attack === newAttack && unit.armor === newArmor &&
      unit.maxShields === newMaxShields && unit.sightRange === newSightRange &&
      unit.maxMovementPoints === newMaxMP) {
    return unit;
  }

  return {
    ...unit,
    attack: newAttack,
    armor: newArmor,
    maxShields: newMaxShields,
    shields: Math.min(unit.shields, newMaxShields),
    sightRange: newSightRange,
    maxMovementPoints: newMaxMP,
  };
}

function discoverTradeHub(state: GameState, tradeHub: TradeHub): GameState {
  if (state.tradeHubs.has(tradeHub.id)) return state;
  const tradeHubs = new Map(state.tradeHubs);
  tradeHubs.set(tradeHub.id, tradeHub);
  return { ...state, tradeHubs };
}

function trade(state: GameState, hubId: string, unitId: string, sell: ResourceKey, buy: ResourceKey, sellAmount: number): GameState {
  if (sell === buy) return state;
  const hub = state.tradeHubs.get(hubId);
  if (!hub) return state;

  const unit = state.units.get(unitId);
  if (!unit || unit.type !== 'scout') return state;
  if (unit.q !== hub.q || unit.r !== hub.r) return state;

  const playerIndex = state.players.findIndex(p => p.id === unit.ownerId);
  if (playerIndex === -1) return state;
  const player = state.players[playerIndex];

  // Check once-per-turn limit
  const tradedKey = `${player.id}:${hubId}`;
  if (state.tradedThisTurn.has(tradedKey)) return state;

  // Check rate and affordability
  const rate = TRADE_RATES[sell]?.[buy];
  if (rate == null || rate <= 0) return state;
  if (sellAmount <= 0) return state;
  if (player.resources[sell] < sellAmount) return state;

  const buyAmount = Math.floor(sellAmount / rate);
  if (buyAmount < 1) return state;

  // Check hub has enough stock of the buy resource
  if (hub.stock[buy] < buyAmount) return state;

  // Execute trade — player sells to hub, buys from hub
  const newResources: Resources = { ...player.resources };
  newResources[sell] -= sellAmount;
  newResources[buy] += buyAmount;

  const newStock: Resources = { ...hub.stock };
  newStock[buy] -= buyAmount;
  newStock[sell] += sellAmount;

  const tradeHubs = new Map(state.tradeHubs);
  tradeHubs.set(hubId, { ...hub, stock: newStock });

  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, resources: newResources } : p
  );

  const tradedThisTurn = new Set(state.tradedThisTurn);
  tradedThisTurn.add(tradedKey);

  const gameOver = checkVictory(players, state.units, state.buildings) ?? state.gameOver;

  return { ...state, players, tradeHubs, tradedThisTurn, gameOver };
}

function undockUnit(state: GameState, unitId: string, buildingId: string): GameState {
  const unit = state.units.get(unitId);
  if (!unit || unit.dockedAt !== buildingId) return state;

  // Cannot undock in same turn as docking (MP is 0 after dock, refreshed next turn)
  if (unit.movementPoints <= 0) return state;

  const building = state.buildings.get(buildingId);
  if (!building) return state;

  // Find adjacent empty hex to undock to
  const neighbors = hexNeighbors(building.q, building.r);
  const occupiedKeys = new Set<string>();
  for (const u of state.units.values()) if (!u.dockedAt) occupiedKeys.add(hexKey(u.q, u.r));
  for (const b of state.buildings.values()) occupiedKeys.add(hexKey(b.q, b.r));
  const undockHex = neighbors.find(n => !occupiedKeys.has(hexKey(n.q, n.r)));
  if (!undockHex) return state; // No space to undock

  const units = new Map(state.units);
  units.set(unitId, {
    ...unit,
    q: undockHex.q,
    r: undockHex.r,
    movementPoints: 0,
    dockedAt: undefined,
  });

  // Remove from building's docked list
  const buildings = new Map(state.buildings);
  const docked = (building.dockedUnits ?? []).filter(id => id !== unitId);
  buildings.set(buildingId, { ...building, dockedUnits: docked.length > 0 ? docked : undefined });

  return { ...state, units, buildings };
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
