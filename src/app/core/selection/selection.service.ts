import { computed, inject, Injectable, signal } from '@angular/core';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { HexData } from '../../models/hex-data';
import { ChunkManagerService } from '../chunks/chunk-manager.service';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly chunkManager = inject(ChunkManagerService);

  private readonly _selectedHexCoord = signal<HexCoord | null>(null);
  private readonly _hoveredHexCoord = signal<HexCoord | null>(null);
  private readonly _selectedUnit = signal<string | null>(null);

  readonly selectedHexCoord = this._selectedHexCoord.asReadonly();
  readonly hoveredHexCoord = this._hoveredHexCoord.asReadonly();
  readonly selectedUnit = this._selectedUnit.asReadonly();

  readonly selectedHexData = computed<HexData | null>(() => {
    const coord = this._selectedHexCoord();
    if (!coord) return null;
    return this.chunkManager.getHex(coord.q, coord.r);
  });

  selectHex(coord: HexCoord): void {
    this._selectedHexCoord.set(coord);
    this._selectedUnit.set(null);
  }

  hoverHex(coord: HexCoord | null): void {
    this._hoveredHexCoord.set(coord);
  }

  deselectAll(): void {
    this._selectedHexCoord.set(null);
    this._selectedUnit.set(null);
  }
}
