import { computed, Injectable, inject, signal } from '@angular/core';
import { CameraService } from '../camera/camera.service';
import { WorldGeneratorService, CHUNK_SIZE } from '../generation/world-generator.service';
import { GameStateService } from '../state/game-state.service';
import { Chunk, ChunkCoord } from '../../models/chunk';
import { HexData, StellarObject } from '../../models/hex-data';
import { Api } from '../../api/api';
import { getChunks } from '../../api/fn/world/get-chunks';
import { ChunkData } from '../../api/models/chunk-data';
import { HexData as ApiHexData } from '../../api/models/hex-data';
import { AnomalyType } from '../../models/game-state';

const SQRT3 = Math.sqrt(3);
const VISIBLE_BUFFER = 2;
const EVICTION_DISTANCE = 5;

// Set to true to force local generation (disable server)
const FORCE_LOCAL = false;

function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

@Injectable({ providedIn: 'root' })
export class ChunkManagerService {
  private readonly camera = inject(CameraService);
  private readonly generator = inject(WorldGeneratorService);
  private readonly gameState = inject(GameStateService);
  private readonly api = inject(Api);
  private readonly cache = new Map<string, Chunk>();
  private pendingFetch = new Set<string>();
  private serverAvailable = !FORCE_LOCAL;

  /** Which chunk coords overlap the current viewport. */
  readonly visibleChunkCoords = computed<ChunkCoord[]>(() => {
    const vp = this.camera.viewport();
    return this.getChunkCoordsInRect(vp.left, vp.top, vp.right, vp.bottom);
  });

  /** Signal updated when new chunks arrive from server. */
  private readonly _chunkVersion = signal(0);

  /** Loaded chunks that are currently visible. */
  readonly visibleChunks = computed<Chunk[]>(() => {
    this._chunkVersion(); // depend on version to re-trigger when server chunks arrive
    const coords = this.visibleChunkCoords();
    const chunks: Chunk[] = [];
    const missing: ChunkCoord[] = [];

    for (const coord of coords) {
      const key = chunkKey(coord.cx, coord.cy);
      const chunk = this.cache.get(key);
      if (chunk) {
        chunks.push(chunk);
      } else {
        missing.push(coord);
      }
    }

    if (missing.length > 0) {
      if (this.serverAvailable) {
        this.fetchFromServer(missing);
      } else {
        // Local fallback
        for (const coord of missing) {
          const key = chunkKey(coord.cx, coord.cy);
          const chunk = this.generator.generate(coord);
          this.cache.set(key, chunk);
          chunks.push(chunk);
        }
      }
    }

    this.evictDistantChunks(coords);
    return chunks;
  });

  /** Get the chunk coords that overlap a world-coordinate rectangle. */
  getChunkCoordsInRect(
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): ChunkCoord[] {
    const hexSize = 30;
    const corners = [
      { x: left, y: top },
      { x: right, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
    ];

    let minCX = Infinity;
    let maxCX = -Infinity;
    let minCY = Infinity;
    let maxCY = -Infinity;

    for (const { x, y } of corners) {
      const q = ((2 / 3) * x) / hexSize;
      const r = ((-1 / 3) * x + (SQRT3 / 3) * y) / hexSize;
      const cx = Math.floor(q / CHUNK_SIZE);
      const cy = Math.floor(r / CHUNK_SIZE);
      if (cx < minCX) minCX = cx;
      if (cx > maxCX) maxCX = cx;
      if (cy < minCY) minCY = cy;
      if (cy > maxCY) maxCY = cy;
    }

    minCX -= VISIBLE_BUFFER;
    maxCX += VISIBLE_BUFFER;
    minCY -= VISIBLE_BUFFER;
    maxCY += VISIBLE_BUFFER;

    const coords: ChunkCoord[] = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        coords.push({ cx, cy });
      }
    }
    return coords;
  }

  /** Discard all cached chunks. */
  clearCache(): void {
    this.cache.clear();
    this.pendingFetch.clear();
  }

  /** Mark the chunk containing hex (q, r) as dirty. */
  markDirty(q: number, r: number): void {
    const cx = Math.floor(q / CHUNK_SIZE);
    const cy = Math.floor(r / CHUNK_SIZE);
    const chunk = this.cache.get(chunkKey(cx, cy));
    if (chunk) {
      chunk.dirty = true;
    }
  }

  /** Look up a hex from cache, generating locally if needed (synchronous). */
  getHex(q: number, r: number): HexData | null {
    const cx = Math.floor(q / CHUNK_SIZE);
    const cy = Math.floor(r / CHUNK_SIZE);
    const key = chunkKey(cx, cy);
    let chunk = this.cache.get(key);
    if (!chunk) {
      // Always use local gen for synchronous lookups
      chunk = this.generator.generate({ cx, cy });
      this.cache.set(key, chunk);
    }
    return chunk.hexes.get(`${q},${r}`) ?? null;
  }

  /** Fetch missing chunks from the server API. */
  private async fetchFromServer(missing: ChunkCoord[]): Promise<void> {
    const toFetch = missing.filter(c => !this.pendingFetch.has(chunkKey(c.cx, c.cy)));
    if (toFetch.length === 0) return;

    for (const c of toFetch) {
      this.pendingFetch.add(chunkKey(c.cx, c.cy));
    }

    const seed = this.gameState.getState().seed;
    const coordsStr = toFetch.map(c => `${c.cx},${c.cy}`).join(';');

    try {
      const response = await this.api.invoke(getChunks, { seed, coords: coordsStr });
      for (const chunkData of response.chunks) {
        const key = chunkKey(chunkData.cx, chunkData.cy);
        const chunk = this.convertApiChunk(chunkData);
        this.cache.set(key, chunk);
        this.pendingFetch.delete(key);
      }
      this._chunkVersion.update(v => v + 1);
    } catch {
      for (const c of toFetch) {
        this.pendingFetch.delete(chunkKey(c.cx, c.cy));
      }
      this.serverAvailable = false;
      console.warn('[ChunkManager] Server unavailable, falling back to local generation');
      for (const coord of toFetch) {
        const key = chunkKey(coord.cx, coord.cy);
        if (!this.cache.has(key)) {
          const chunk = this.generator.generate(coord);
          this.cache.set(key, chunk);
        }
      }
      this._chunkVersion.update(v => v + 1);
    }
  }

  /** Convert API ChunkData to internal Chunk format. */
  private convertApiChunk(data: ChunkData): Chunk {
    const hexes = new Map<string, HexData>();
    for (const [key, apiHex] of Object.entries(data.hexes)) {
      hexes.set(key, this.convertApiHex(apiHex));
    }
    return {
      coord: { cx: data.cx, cy: data.cy },
      hexes,
      dirty: true,
    };
  }

  /** Convert API HexData to internal HexData format. */
  private convertApiHex(apiHex: ApiHexData): HexData {
    let object: StellarObject | null = null;
    if (apiHex.object) {
      object = {
        type: apiHex.object.type as any,
        subtype: apiHex.object.subtype ?? undefined,
        size: apiHex.object.size,
        resources: apiHex.object.resources ? {
          energy: apiHex.object.resources.energy ?? undefined,
          minerals: apiHex.object.resources.minerals ?? undefined,
          alloys: apiHex.object.resources.alloys ?? undefined,
          credits: apiHex.object.resources.credits ?? undefined,
        } : undefined,
        orbitAnchor: apiHex.object.orbitAnchor ? {
          q: apiHex.object.orbitAnchor.q,
          r: apiHex.object.orbitAnchor.r,
          s: apiHex.object.orbitAnchor.s ?? (-apiHex.object.orbitAnchor.q - apiHex.object.orbitAnchor.r),
        } : undefined,
        velocity: apiHex.object.velocity ? {
          q: apiHex.object.velocity.q,
          r: apiHex.object.velocity.r,
          s: apiHex.object.velocity.s ?? 0,
        } : undefined,
      };
    }

    return {
      q: apiHex.q,
      r: apiHex.r,
      object,
      anomaly: (apiHex.anomaly as AnomalyType) ?? undefined,
      tradeHub: apiHex.tradeHub ?? undefined,
      inNebula: apiHex.inNebula ?? undefined,
    };
  }

  private evictDistantChunks(visibleCoords: ChunkCoord[]): void {
    if (this.cache.size < 50) return;

    for (const [key, chunk] of this.cache) {
      const isNearVisible = visibleCoords.some(
        (vc) =>
          Math.abs(vc.cx - chunk.coord.cx) <= EVICTION_DISTANCE &&
          Math.abs(vc.cy - chunk.coord.cy) <= EVICTION_DISTANCE,
      );
      if (!isNearVisible) {
        this.cache.delete(key);
      }
    }
  }
}
