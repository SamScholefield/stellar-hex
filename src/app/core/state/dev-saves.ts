import {
  GameState,
  UnitData,
  UnitType,
  UNIT_STATS,
  BuildingData,
  BuildingType,
  BUILDING_STATS,
  Resources,
  PlayerState,
  Anomaly,
  AnomalyType,
} from '../../models/game-state';
import { hexesInRange } from '../../shared/hex/hex-math';
import { serialize } from './game-save.service';

function makeUnit(
  id: string,
  ownerId: string,
  type: UnitType,
  q: number,
  r: number,
): UnitData {
  const stats = UNIT_STATS[type];
  return {
    id,
    name: id,
    ownerId,
    type,
    q,
    r,
    movementPoints: stats.maxMovementPoints,
    maxMovementPoints: stats.maxMovementPoints,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    attack: stats.attack,
    defense: stats.defense,
    range: stats.range,
    sightRange: stats.sightRange,
    size: stats.size,
    weapon: stats.weapon,
    armor: stats.armor,
    shields: stats.maxShields,
    maxShields: stats.maxShields,
    xp: 0,
    veteranTier: 'standard',
  };
}

function makeBuilding(
  id: string,
  ownerId: string,
  type: BuildingType,
  q: number,
  r: number,
): BuildingData {
  const stats = BUILDING_STATS[type];
  return { id, ownerId, type, q, r, health: stats.maxHealth, maxHealth: stats.maxHealth, shields: stats.maxShields, maxShields: stats.maxShields };
}

function exploredSet(centerQ: number, centerR: number, radius: number): Set<string> {
  const set = new Set<string>();
  const hexes = hexesInRange({ q: centerQ, r: centerR, s: -centerQ - centerR }, radius);
  for (const h of hexes) {
    set.add(`${h.q},${h.r}`);
  }
  return set;
}

function buildCombatScenario(): string {
  const units = new Map<string, UnitData>();
  const addUnit = (id: string, owner: string, type: UnitType, q: number, r: number) => {
    const u = makeUnit(id, owner, type, q, r);
    units.set(id, u);
  };

  // Player units
  addUnit('dev-p0-scout-1', 'p0', 'scout', 0, 0);
  addUnit('dev-p0-scout-2', 'p0', 'scout', 2, -1);
  addUnit('dev-p0-fighter-1', 'p0', 'fighter', 1, 0);
  addUnit('dev-p0-corvette-1', 'p0', 'corvette', -1, 1);
  addUnit('dev-p0-cruiser-1', 'p0', 'cruiser', 0, 1);
  addUnit('dev-p0-frigate-1', 'p0', 'frigate', -1, 2);

  // AI units
  addUnit('dev-p1-fighter-1', 'p1', 'fighter', 4, -2);
  addUnit('dev-p1-corvette-1', 'p1', 'corvette', 3, -1);
  addUnit('dev-p1-cruiser-1', 'p1', 'cruiser', 5, -3);
  addUnit('dev-p1-frigate-1', 'p1', 'frigate', 6, -3);

  const buildings = new Map<string, BuildingData>();
  const sb0 = makeBuilding('dev-p0-starbase', 'p0', 'starbase', 0, 2);
  buildings.set(sb0.id, sb0);
  const sb1 = makeBuilding('dev-p1-starbase', 'p1', 'starbase', 5, -2);
  buildings.set(sb1.id, sb1);

  const players: PlayerState[] = [
    {
      id: 'p0',
      name: 'Commander',
      color: '#5eead4',
      resources: { energy: 80, minerals: 40, alloys: 15, credits: 30 },
      isAI: false,
      exploredHexes: exploredSet(0, 0, 6),
      eliminated: false,
      researchedTechs: new Set(),
    },
    {
      id: 'p1',
      name: 'AI 1',
      color: '#f87171',
      resources: { energy: 60, minerals: 30, alloys: 10, credits: 20 },
      isAI: true,
      exploredHexes: exploredSet(5, -3, 6),
      eliminated: false,
      researchedTechs: new Set(),
    },
  ];

  const state: GameState = {
    turn: 8,
    currentPlayerIndex: 0,
    players,
    units,
    buildings,
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    anomalies: new Map(),
    seed: 42,
  };

  return serialize(state, { panX: 0, panY: 0, zoom: 1 });
}

function buildEconomyScenario(): string {
  const units = new Map<string, UnitData>();
  const addUnit = (id: string, owner: string, type: UnitType, q: number, r: number) => {
    const u = makeUnit(id, owner, type, q, r);
    units.set(id, u);
  };

  // Player units
  addUnit('dev-p0-scout-1', 'p0', 'scout', -2, 1);
  addUnit('dev-p0-scout-2', 'p0', 'scout', 3, -2);
  addUnit('dev-p0-colony-ship', 'p0', 'colony_ship', 1, 1);
  addUnit('dev-p0-mining-drone', 'p0', 'mining_drone', -1, 2);

  // AI units
  addUnit('dev-p1-scout-1', 'p1', 'scout', 22, -11);
  addUnit('dev-p1-fighter-1', 'p1', 'fighter', 20, -9);

  const buildings = new Map<string, BuildingData>();
  const addBuilding = (id: string, owner: string, type: BuildingType, q: number, r: number) => {
    const b = makeBuilding(id, owner, type, q, r);
    buildings.set(id, b);
    return b;
  };

  addBuilding('dev-p0-mining-1', 'p0', 'mining_station', -1, 0);
  addBuilding('dev-p0-mining-2', 'p0', 'mining_station', 2, -1);
  addBuilding('dev-p0-colony-1', 'p0', 'colony', 0, 1);
  addBuilding('dev-p0-solar-1', 'p0', 'solar_collector', 1, -1);
  const sb = addBuilding('dev-p0-starbase-1', 'p0', 'starbase', 0, 0);
  sb.productionQueue = [{ unitType: 'fighter', turnsRemaining: 2 }];
  addBuilding('dev-p0-research-1', 'p0', 'research_lab', -2, 2);

  addBuilding('dev-p1-mining-1', 'p1', 'mining_station', 21, -10);
  addBuilding('dev-p1-starbase-1', 'p1', 'starbase', 20, -10);

  const anomalies = new Map<string, Anomaly>();
  anomalies.set('dev-anomaly-1', { id: 'dev-anomaly-1', type: 'resource_cache', q: 4, r: -1 });
  anomalies.set('dev-anomaly-2', { id: 'dev-anomaly-2', type: 'ancient_ruins', q: -3, r: 3 });

  const players: PlayerState[] = [
    {
      id: 'p0',
      name: 'Commander',
      color: '#5eead4',
      resources: { energy: 200, minerals: 80, alloys: 40, credits: 100 },
      isAI: false,
      exploredHexes: exploredSet(0, 0, 10),
      eliminated: false,
      researchedTechs: new Set(),
    },
    {
      id: 'p1',
      name: 'AI 1',
      color: '#f87171',
      resources: { energy: 100, minerals: 40, alloys: 15, credits: 50 },
      isAI: true,
      exploredHexes: exploredSet(20, -10, 6),
      eliminated: false,
      researchedTechs: new Set(),
    },
  ];

  const state: GameState = {
    turn: 20,
    currentPlayerIndex: 0,
    players,
    units,
    buildings,
    dynamicObjects: new Map(),
    chunkOverrides: new Map(),
    anomalies,
    seed: 42,
  };

  return serialize(state, { panX: 0, panY: 0, zoom: 1 });
}

export const DEV_SAVES: { key: string; data: string }[] = [
  { key: 'stellar-hex-save-dev-combat', data: buildCombatScenario() },
  { key: 'stellar-hex-save-dev-economy', data: buildEconomyScenario() },
];
