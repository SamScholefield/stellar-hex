import { computed, inject, Injectable, signal } from '@angular/core';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { HexData } from '../../models/hex-data';
import { UnitData } from '../../models/game-state';
import { ChunkManagerService } from '../chunks/chunk-manager.service';
import { GameStateService } from '../state/game-state.service';
import { VisionService } from '../vision/vision.service';

export type HexVisibility = 'visible' | 'explored' | 'unexplored';

export interface SelectedHexInfo {
  hex: HexData;
  visibility: HexVisibility;
}

@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly gameState = inject(GameStateService);
  private readonly vision = inject(VisionService);

  private readonly _selectedHexCoord = signal<HexCoord | null>(null);
  private readonly _hoveredHexCoord = signal<HexCoord | null>(null);
  private readonly _selectedUnit = signal<string | null>(null);

  readonly selectedHexCoord = this._selectedHexCoord.asReadonly();
  readonly hoveredHexCoord = this._hoveredHexCoord.asReadonly();
  readonly selectedUnit = this._selectedUnit.asReadonly();

  readonly selectedUnitData = computed<UnitData | null>(() => {
    const id = this._selectedUnit();
    if (!id) return null;
    return this.gameState.units().get(id) ?? null;
  });

  readonly selectedHexData = computed<SelectedHexInfo | null>(() => {
    const coord = this._selectedHexCoord();
    if (!coord) return null;
    const hex = this.chunkManager.getHex(coord.q, coord.r);
    if (!hex) return null;

    const key = `${coord.q},${coord.r}`;
    let visibility: HexVisibility;
    if (this.vision.visibleHexes().has(key)) {
      visibility = 'visible';
    } else if (this.vision.exploredHexes().has(key)) {
      visibility = 'explored';
    } else {
      visibility = 'unexplored';
    }

    return { hex, visibility };
  });

  /** Select a hex, auto-detecting units. Returns true if a move command should be issued. */
  selectHex(coord: HexCoord): boolean {
    const unitAtHex = this.findUnitAt(coord.q, coord.r);
    const currentlySelected = this._selectedUnit();
    const currentPlayer = this.gameState.currentPlayer();

    // If a friendly unit is at the clicked hex, select it
    if (unitAtHex && currentPlayer && unitAtHex.ownerId === currentPlayer.id) {
      this._selectedUnit.set(unitAtHex.id);
      this._selectedHexCoord.set(coord);
      return false;
    }

    // If we have a unit selected and clicked an empty/enemy hex, signal a move
    if (currentlySelected && !unitAtHex) {
      this._selectedHexCoord.set(coord);
      return true;
    }

    // Otherwise, plain hex selection
    this._selectedHexCoord.set(coord);
    this._selectedUnit.set(null);
    return false;
  }

  selectUnit(unitId: string): void {
    const unit = this.gameState.units().get(unitId);
    if (unit) {
      this._selectedUnit.set(unitId);
      this._selectedHexCoord.set({ q: unit.q, r: unit.r, s: -unit.q - unit.r });
    }
  }

  hoverHex(coord: HexCoord | null): void {
    this._hoveredHexCoord.set(coord);
  }

  deselectAll(): void {
    this._selectedHexCoord.set(null);
    this._selectedUnit.set(null);
  }

  private findUnitAt(q: number, r: number): UnitData | null {
    for (const unit of this.gameState.units().values()) {
      if (unit.q === q && unit.r === r) return unit;
    }
    return null;
  }
}
