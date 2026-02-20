import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';

@Component({
  selector: 'app-action-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      @if (hasUnit()) {
        <button class="action move" [class.active]="!attackMode()">Move</button>
        <button class="action attack" [class.active]="attackMode()" [disabled]="!canAttack()" (click)="toggleAttackMode()">Attack</button>
      }
      @if (canBuild()) {
        <button class="action build" [class.active]="showBuildMenu()" (click)="toggleBuildMenu()">Build</button>
      }
      <button class="action end-turn" (click)="endTurn()">End Turn</button>
    </div>
  `,
  styles: `
    .bar {
      display: flex;
      gap: 0.5rem;
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid #2a4a5a;
      border-radius: 0.5rem;
      padding: 0.4rem 0.75rem;
    }
    .action {
      padding: 0.3rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #e0e0e0;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .action:hover:not(:disabled) {
      background: #374151;
    }
    .action:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .action.active {
      border-color: #3b82f6;
      background: #1e3a5f;
    }
    .action.attack.active {
      border-color: #ef4444;
      background: #5f1e1e;
    }
    .end-turn {
      margin-left: auto;
    }
  `,
})
export class ActionBarComponent {
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);

  readonly hasUnit = computed(() => this.selection.selectedUnit() !== null);
  readonly showBuildMenu = signal(false);

  readonly canAttack = computed(() => {
    const unitData = this.selection.selectedUnitData();
    if (!unitData) return false;
    return unitData.movementPoints > 0 && unitData.attack > 0;
  });

  readonly attackMode = this.selection.attackMode;

  readonly canBuild = computed(() => {
    const hexData = this.selection.selectedHexData();
    if (!hexData || hexData.visibility !== 'visible') return false;
    // Check no building already exists at this hex
    const coord = this.selection.selectedHexCoord();
    if (!coord) return false;
    for (const b of this.gameState.buildings().values()) {
      if (b.q === coord.q && b.r === coord.r) return false;
    }
    return true;
  });

  toggleAttackMode(): void {
    if (this.selection.attackMode()) {
      this.selection.exitAttackMode();
    } else {
      this.selection.enterAttackMode();
    }
  }

  toggleBuildMenu(): void {
    this.showBuildMenu.update(v => !v);
  }

  endTurn(): void {
    this.gameState.dispatch({ type: 'END_TURN' });
    this.selection.deselectAll();
    this.showBuildMenu.set(false);
  }
}
