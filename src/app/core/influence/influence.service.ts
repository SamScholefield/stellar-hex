import { computed, inject, Injectable, signal } from '@angular/core';
import { GameStateService } from '../state/game-state.service';
import { computeTechBonuses } from '../../models/game-state';
import { hexKeysInRange } from '../../shared/hex/hex-math';
import { computeInfluenceForPlayer } from './influence';

@Injectable({ providedIn: 'root' })
export class InfluenceService {
  private readonly gameState = inject(GameStateService);

  private readonly _showInfluenceOverlay = signal(false);
  private readonly _showAttackRangeOverlay = signal(false);

  readonly showInfluenceOverlay = this._showInfluenceOverlay.asReadonly();
  readonly showAttackRangeOverlay = this._showAttackRangeOverlay.asReadonly();

  /** All hex keys within the human player's building influence zones. */
  readonly humanInfluenceHexes = computed<Set<string>>(() => {
    const human = this.gameState.humanPlayer();
    if (!human) return new Set();
    const sightBonus = computeTechBonuses(human.researchedTechs).sightRange ?? 0;
    return computeInfluenceForPlayer(this.gameState.buildings(), human.id, sightBonus);
  });

  /** All hex keys within weapon range of the human player's armed units (merged). */
  readonly humanAttackRangeHexes = computed<Set<string>>(() => {
    const result = new Set<string>();
    for (const group of this.humanAttackRangeGroups()) {
      for (const key of group) result.add(key);
    }
    return result;
  });

  /** Per-unit attack range hex sets for individual border drawing. */
  readonly humanAttackRangeGroups = computed<Set<string>[]>(() => {
    const human = this.gameState.humanPlayer();
    const spectate = this.gameState.spectate();
    const groups: Set<string>[] = [];

    if (spectate) {
      // In spectate mode, show all players' attack ranges
      for (const unit of this.gameState.units().values()) {
        if (unit.weapon == null) continue;
        groups.push(new Set(hexKeysInRange(unit.q, unit.r, unit.range)));
      }
    } else {
      if (!human) return groups;
      for (const unit of this.gameState.units().values()) {
        if (unit.ownerId !== human.id) continue;
        if (unit.weapon == null) continue;
        groups.push(new Set(hexKeysInRange(unit.q, unit.r, unit.range)));
      }
    }
    return groups;
  });

  toggleInfluenceOverlay(): void {
    this._showInfluenceOverlay.update(v => !v);
  }

  toggleAttackRangeOverlay(): void {
    this._showAttackRangeOverlay.update(v => !v);
  }
}
