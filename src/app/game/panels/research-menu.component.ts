import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BuildingData, Resources, TechId, TechDefinition, TECH_TREE, canResearch, ResearchItem } from '../../models/game-state';
import { GameStateService } from '../../core/state/game-state.service';
import { AudioService } from '../../core/audio/audio.service';

interface ResearchOption {
  techId: TechId;
  def: TechDefinition;
  affordable: boolean;
}

@Component({
  selector: 'app-research-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (building(); as b) {
      <div class="menu-panel">
        <div class="menu-title">Research Lab</div>

        @if (queue().length > 0) {
          <div class="queue-section">
            <div class="queue-title">Researching</div>
            @for (item of queue(); track item.techId) {
              <div class="queue-item">
                <span>{{ techName(item.techId) }}</span>
                <span class="queue-turns">{{ item.turnsRemaining }} turn{{ item.turnsRemaining > 1 ? 's' : '' }}</span>
              </div>
            }
          </div>
        }

        @if (options().length > 0) {
          <div class="section-title">Available Research</div>
          @for (opt of options(); track opt.techId) {
            <button
              class="menu-option"
              [class.disabled]="!opt.affordable"
              [disabled]="!opt.affordable"
              (click)="onResearch(opt.techId)"
            >
              <span class="menu-option-name">{{ opt.def.name }}</span>
              <span class="bonus">{{ bonusLabel(opt.def) }}</span>
              <span class="cost-row">
                @for (c of costEntries(opt.def); track c.key) {
                  <span class="cost-item" [class.sufficient]="c.current >= c.value">{{ c.current }}/{{ c.value }} {{ c.key }}</span>
                }
                <span class="build-turns">{{ opt.def.researchTurns }}T</span>
              </span>
            </button>
          }
        }
      </div>
    }
  `,
  styles: `
    .queue-section {
      margin-bottom: 0.5rem;
    }
    .section-title {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-bottom: 0.15rem;
      padding: 0 0.25rem;
    }
    .bonus {
      font-size: 0.7rem;
      color: var(--accent-teal);
    }
  `,
})
export class ResearchMenuComponent {
  private readonly gameState = inject(GameStateService);
  private readonly audio = inject(AudioService);

  readonly building = input.required<BuildingData | null>();
  readonly researchSelected = output<TechId>();

  readonly queue = computed<ResearchItem[]>(() => this.building()?.researchQueue ?? []);

  readonly options = computed<ResearchOption[]>(() => {
    const resources = this.gameState.resources();
    const researchedTechs = this.gameState.researchedTechs();
    const buildings = this.gameState.buildings();
    const currentPlayer = this.gameState.currentPlayer();

    // Collect all techs currently queued across all labs
    const queuedTechs = new Set<TechId>();
    if (currentPlayer) {
      for (const b of buildings.values()) {
        if (b.ownerId !== currentPlayer.id || b.type !== 'research_lab') continue;
        if (b.researchQueue) {
          for (const item of b.researchQueue) {
            queuedTechs.add(item.techId);
          }
        }
      }
    }

    const result: ResearchOption[] = [];
    for (const [techIdStr, def] of Object.entries(TECH_TREE)) {
      const techId = techIdStr as TechId;
      if (queuedTechs.has(techId)) continue;
      if (!canResearch(techId, researchedTechs)) continue;
      const affordable = resources != null && canAfford(resources, def.cost);
      result.push({ techId, def, affordable });
    }
    return result;
  });

  techName(techId: TechId): string {
    return TECH_TREE[techId]?.name ?? techId;
  }

  bonusLabel(def: TechDefinition): string {
    const parts: string[] = [];
    if (def.bonus.shields) parts.push(`+${def.bonus.shields} shields`);
    if (def.bonus.attack) parts.push(`+${def.bonus.attack} attack`);
    if (def.bonus.armor) parts.push(`+${def.bonus.armor} armor`);
    if (def.bonus.sightRange) parts.push(`+${def.bonus.sightRange} vision`);
    if (def.bonus.maxMovementPoints) parts.push(`+${def.bonus.maxMovementPoints} MP`);
    return parts.join(', ');
  }

  costEntries(def: TechDefinition): { key: string; value: number; current: number }[] {
    const resources = this.gameState.resources();
    return Object.entries(def.cost)
      .filter(([, v]) => v != null && v > 0)
      .map(([k, v]) => ({ key: k, value: v!, current: (resources as Record<string, number> | null)?.[k] ?? 0 }));
  }

  onResearch(techId: TechId): void {
    this.audio.playClick();
    this.researchSelected.emit(techId);
  }
}

function canAfford(resources: Resources, cost: Partial<Resources>): boolean {
  return (resources.energy >= (cost.energy ?? 0))
    && (resources.minerals >= (cost.minerals ?? 0))
    && (resources.alloys >= (cost.alloys ?? 0))
    && (resources.credits >= (cost.credits ?? 0));
}
