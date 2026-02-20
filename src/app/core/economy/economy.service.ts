import { computed, inject, Injectable } from '@angular/core';
import { BuildingData, BUILDING_STATS, Resources } from '../../models/game-state';
import { GameStateService } from '../state/game-state.service';

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

@Injectable({ providedIn: 'root' })
export class EconomyService {
  private readonly gameState = inject(GameStateService);

  readonly income = computed<Resources>(() => {
    const player = this.gameState.currentPlayer();
    if (!player) return { energy: 0, minerals: 0, alloys: 0, credits: 0 };
    return computeIncome(this.gameState.buildings(), player.id);
  });
}
