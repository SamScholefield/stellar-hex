import { computed, inject, Injectable } from '@angular/core';
import { BuildingData, BUILDING_STATS, Resources, UnitData } from '../../models/game-state';
import { HexData } from '../../models/hex-data';
import { GameStateService } from '../state/game-state.service';
import { ChunkManagerService } from '../chunks/chunk-manager.service';

export function computeIncome(buildings: Map<string, BuildingData>, playerId: string): Resources {
  const income: Resources = { energy: 0, minerals: 0, alloys: 0, credits: 0 };
  for (const building of buildings.values()) {
    if (building.ownerId !== playerId) continue;
    const stats = BUILDING_STATS[building.type];
    if (!stats) continue;
    income.energy += stats.yield.energy ?? 0;
    income.minerals += stats.yield.minerals ?? 0;
    income.alloys += stats.yield.alloys ?? 0;
    income.credits += stats.yield.credits ?? 0;
  }
  return income;
}

/**
 * Computes the per-turn resource income from mining drones.
 * Each mining drone extracts resources from the hex it occupies,
 * based on that hex's ResourceYield (e.g. asteroids yield minerals).
 * Pure function -- no side effects, deterministic given the same inputs.
 */
export function computeMiningDroneIncome(
  units: Map<string, UnitData>,
  playerId: string,
  hexLookup: (q: number, r: number) => HexData | null,
): Partial<Resources> {
  const income: Partial<Resources> = {};
  for (const unit of units.values()) {
    if (unit.ownerId !== playerId || unit.type !== 'mining_drone') continue;
    const hex = hexLookup(unit.q, unit.r);
    if (!hex?.object?.resources) continue;
    const res = hex.object.resources;
    if (res.energy) income.energy = (income.energy ?? 0) + res.energy;
    if (res.minerals) income.minerals = (income.minerals ?? 0) + res.minerals;
    if (res.alloys) income.alloys = (income.alloys ?? 0) + res.alloys;
    if (res.credits) income.credits = (income.credits ?? 0) + res.credits;
  }
  return income;
}

@Injectable({ providedIn: 'root' })
export class EconomyService {
  private readonly gameState = inject(GameStateService);
  private readonly chunkManager = inject(ChunkManagerService);

  /** Total projected income per turn including buildings and mining drones. */
  readonly income = computed<Resources>(() => {
    const player = this.gameState.currentPlayer();
    if (!player) return { energy: 0, minerals: 0, alloys: 0, credits: 0 };

    const buildingIncome = computeIncome(this.gameState.buildings(), player.id);

    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    const miningIncome = computeMiningDroneIncome(this.gameState.units(), player.id, hexLookup);

    return {
      energy: buildingIncome.energy + (miningIncome.energy ?? 0),
      minerals: buildingIncome.minerals + (miningIncome.minerals ?? 0),
      alloys: buildingIncome.alloys + (miningIncome.alloys ?? 0),
      credits: buildingIncome.credits + (miningIncome.credits ?? 0),
    };
  });
}
