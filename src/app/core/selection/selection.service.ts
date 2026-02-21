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
  private readonly _selectedUnits = signal<ReadonlySet<string>>(new Set());

  /** Human player's units sorted by type then ID for stable cycling. */
  readonly ownedUnits = computed<UnitData[]>(() => {
    const human = this.gameState.humanPlayer();
    if (!human) return [];
    const units: UnitData[] = [];
    for (const u of this.gameState.units().values()) {
      if (u.ownerId === human.id) units.push(u);
    }
    units.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
    return units;
  });

  readonly selectedHexCoord = this._selectedHexCoord.asReadonly();
  readonly hoveredHexCoord = this._hoveredHexCoord.asReadonly();
  readonly selectedUnit = this._selectedUnit.asReadonly();
  readonly selectedUnits = this._selectedUnits.asReadonly();

  readonly selectedUnitData = computed<UnitData | null>(() => {
    const id = this._selectedUnit();
    if (!id) return null;
    return this.gameState.units().get(id) ?? null;
  });

  readonly selectedHexData = computed<SelectedHexInfo | null>(() => {
    const coord = this._selectedHexCoord();
    return coord ? this.resolveHexInfo(coord) : null;
  });

  readonly hoveredHexData = computed<SelectedHexInfo | null>(() => {
    const coord = this._hoveredHexCoord();
    return coord ? this.resolveHexInfo(coord) : null;
  });

  private resolveHexInfo(coord: HexCoord): SelectedHexInfo | null {
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
  }

  /** Select a hex, auto-detecting units. Returns true if a move command should be issued. */
  selectHex(coord: HexCoord, shiftKey = false): boolean {
    const unitsAtHex = this.findUnitsAt(coord.q, coord.r);
    const currentlySelected = this._selectedUnit();
    const currentPlayer = this.gameState.currentPlayer();

    // Get friendly units at this hex
    const friendlyUnits = currentPlayer
      ? unitsAtHex.filter(u => u.ownerId === currentPlayer.id)
      : [];

    if (shiftKey && friendlyUnits.length > 0) {
      // Shift+click: toggle unit in multi-selection
      const target = this.cycleTarget(friendlyUnits);
      const prev = this._selectedUnits();
      const next = new Set(prev);
      if (next.has(target.id)) {
        next.delete(target.id);
        // Set primary to first remaining, or null
        const firstRemaining = [...next][0] ?? null;
        this._selectedUnit.set(firstRemaining);
      } else {
        next.add(target.id);
        this._selectedUnit.set(target.id);
      }
      this._selectedUnits.set(next);
      this._selectedHexCoord.set(coord);
      return false;
    }

    // Friendly units on clicked hex — cycle selection
    if (friendlyUnits.length > 0) {
      const selectedOnThisHex = currentlySelected && friendlyUnits.some(u => u.id === currentlySelected);
      if (!currentlySelected || selectedOnThisHex) {
        const target = this.cycleTarget(friendlyUnits);
        this._selectedUnit.set(target.id);
        this._selectedHexCoord.set(coord);
        this._selectedUnits.set(new Set());
        return false;
      }
    }

    // Unit selected, clicked a different hex — signal a move
    if (currentlySelected) {
      this._selectedHexCoord.set(coord);
      return true;
    }

    // Otherwise, plain hex selection (enemy hex or empty with no unit selected)
    this._selectedHexCoord.set(coord);
    this._selectedUnit.set(null);
    this._selectedUnits.set(new Set());
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
    this._selectedUnits.set(new Set());
  }

  deselectUnits(): void {
    this._selectedUnit.set(null);
    this._selectedUnits.set(new Set());
  }

  /** Cycle to next/previous owned unit. Returns the selected unit or null. */
  selectNextUnit(direction: 1 | -1): UnitData | null {
    const units = this.ownedUnits();
    if (units.length === 0) return null;

    const currentId = this._selectedUnit();
    const idx = currentId ? units.findIndex(u => u.id === currentId) : -1;
    const nextIdx = idx < 0
      ? 0
      : (idx + direction + units.length) % units.length;
    const unit = units[nextIdx];
    this.selectUnit(unit.id);
    return unit;
  }

  /** Determine which unit to cycle to among friendly units at a hex. */
  private cycleTarget(friendlyUnits: UnitData[]): UnitData {
    const currentId = this._selectedUnit();
    const idx = friendlyUnits.findIndex(u => u.id === currentId);
    if (idx >= 0) {
      // Current selection is one of them — cycle to next
      return friendlyUnits[(idx + 1) % friendlyUnits.length];
    }
    return friendlyUnits[0];
  }

  private findUnitsAt(q: number, r: number): UnitData[] {
    return this.gameState.unitsAtHex().get(`${q},${r}`) ?? [];
  }
}
