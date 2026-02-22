import { computed, inject, Injectable, signal } from '@angular/core';
import { GameStateService } from '../state/game-state.service';
import { BUILDING_STATS, UNIT_STATS } from '../../models/game-state';
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
    return computeInfluenceForPlayer(this.gameState.buildings(), human.id);
  });

  /** All hex keys within weapon range of the human player's armed units. */
  readonly humanAttackRangeHexes = computed<Set<string>>(() => {
    const human = this.gameState.humanPlayer();
    if (!human) return new Set();
    const result = new Set<string>();
    for (const unit of this.gameState.units().values()) {
      if (unit.ownerId !== human.id) continue;
      if (unit.weapon == null) continue;
      const range = unit.range;
      for (let dq = -range; dq <= range; dq++) {
        const r1 = Math.max(-range, -dq - range);
        const r2 = Math.min(range, -dq + range);
        for (let dr = r1; dr <= r2; dr++) {
          result.add(`${unit.q + dq},${unit.r + dr}`);
        }
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
