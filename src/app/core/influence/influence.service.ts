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

  /** All hex keys within weapon range of the human player's armed units. */
  readonly humanAttackRangeHexes = computed<Set<string>>(() => {
    const human = this.gameState.humanPlayer();
    if (!human) return new Set();
    const result = new Set<string>();
    for (const unit of this.gameState.units().values()) {
      if (unit.ownerId !== human.id) continue;
      if (unit.weapon == null) continue;
      for (const key of hexKeysInRange(unit.q, unit.r, unit.range)) {
        result.add(key);
      }
    }
    return result;
  });

  toggleInfluenceOverlay(): void {
    this._showInfluenceOverlay.update(v => !v);
  }

  toggleAttackRangeOverlay(): void {
    this._showAttackRangeOverlay.update(v => !v);
  }
}
