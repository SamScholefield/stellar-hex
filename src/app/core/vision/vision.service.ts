import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { GameStateService } from '../state/game-state.service';
import { hexesInRange } from '../../shared/hex/hex-math';

interface VisionSource {
  q: number;
  r: number;
  sightRange: number;
}

export interface DiscoveryEvent {
  hexKey: string;
  q: number;
  r: number;
}

@Injectable({ providedIn: 'root' })
export class VisionService {
  private readonly gameState = inject(GameStateService);
  private readonly _lastDiscoveries = signal<DiscoveryEvent[]>([]);
  private readonly _discoveryBatchId = signal(0);

  /** Newly discovered hexes from the most recent vision update. */
  readonly lastDiscoveries = this._lastDiscoveries.asReadonly();
  /** Monotonic ID incremented with each new batch of discoveries. */
  readonly discoveryBatchId = this._discoveryBatchId.asReadonly();

  /** All vision sources for the current player (units + buildings). */
  readonly visionSources = computed<VisionSource[]>(() => {
    const player = this.gameState.currentPlayer();
    if (!player) return [];
    return this.sourcesForPlayer(player.id);
  });

  /** Set of hex keys currently visible to the current player. */
  readonly visibleHexes = computed<Set<string>>(() => {
    return this.computeVisible(this.visionSources());
  });

  /** The explored hexes set for the current player. */
  readonly exploredHexes = computed<Set<string>>(() => {
    const player = this.gameState.currentPlayer();
    return player?.exploredHexes ?? new Set();
  });

  /** Vision always from the human player's perspective (for rendering). */
  readonly humanVisibleHexes = computed<Set<string>>(() => {
    const human = this.gameState.players().find(p => !p.isAI);
    if (!human) return new Set();
    return this.computeVisible(this.sourcesForPlayer(human.id));
  });

  /** Explored hexes for the human player (for rendering). */
  readonly humanExploredHexes = computed<Set<string>>(() => {
    const human = this.gameState.players().find(p => !p.isAI);
    return human?.exploredHexes ?? new Set();
  });

  constructor() {
    // Auto-update explored hexes whenever vision sources change
    effect(() => {
      const visible = this.visibleHexes();
      const player = this.gameState.currentPlayer();
      if (!player) return;

      const discoveries: DiscoveryEvent[] = [];
      for (const key of visible) {
        if (!player.exploredHexes.has(key)) {
          player.exploredHexes.add(key);
          const [q, r] = key.split(',').map(Number);
          discoveries.push({ hexKey: key, q, r });
        }
      }

      if (discoveries.length > 0) {
        this._lastDiscoveries.set(discoveries);
        this._discoveryBatchId.update((id) => id + 1);
      }
    });
  }

  isVisible(q: number, r: number): boolean {
    return this.visibleHexes().has(`${q},${r}`);
  }

  isExplored(q: number, r: number): boolean {
    return this.exploredHexes().has(`${q},${r}`);
  }

  private sourcesForPlayer(playerId: string): VisionSource[] {
    const sources: VisionSource[] = [];
    for (const unit of this.gameState.units().values()) {
      if (unit.ownerId === playerId) {
        sources.push({ q: unit.q, r: unit.r, sightRange: unit.sightRange });
      }
    }
    for (const building of this.gameState.buildings().values()) {
      if (building.ownerId === playerId) {
        sources.push({ q: building.q, r: building.r, sightRange: 2 });
      }
    }
    return sources;
  }

  private computeVisible(sources: VisionSource[]): Set<string> {
    const visible = new Set<string>();
    for (const source of sources) {
      const hexes = hexesInRange(
        { q: source.q, r: source.r, s: -source.q - source.r },
        source.sightRange,
      );
      for (const hex of hexes) {
        visible.add(`${hex.q},${hex.r}`);
      }
    }
    return visible;
  }
}
