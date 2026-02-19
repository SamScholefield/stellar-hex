import { computed, Injectable, inject } from '@angular/core';
import { CameraService } from '../camera/camera.service';
import { WorldGeneratorService, CHUNK_SIZE } from '../generation/world-generator.service';
import { Chunk, ChunkCoord } from '../../models/chunk';
import { HexData } from '../../models/hex-data';
import { hexToPixel } from '../../shared/hex/hex-math';

const SQRT3 = Math.sqrt(3);
const EVICTION_DISTANCE = 3;

function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

@Injectable({ providedIn: 'root' })
export class ChunkManagerService {
  private readonly camera = inject(CameraService);
  private readonly generator = inject(WorldGeneratorService);
  private readonly cache = new Map<string, Chunk>();

  /** Which chunk coords overlap the current viewport. */
  readonly visibleChunkCoords = computed<ChunkCoord[]>(() => {
    const vp = this.camera.viewport();
    return this.getChunkCoordsInRect(vp.left, vp.top, vp.right, vp.bottom);
  });

  /** Loaded chunks that are currently visible. Generates missing chunks on demand. */
  readonly visibleChunks = computed<Chunk[]>(() => {
    const coords = this.visibleChunkCoords();
    const chunks: Chunk[] = [];

    for (const coord of coords) {
      const key = chunkKey(coord.cx, coord.cy);
      let chunk = this.cache.get(key);
      if (!chunk) {
        chunk = this.generator.generate(coord);
        this.cache.set(key, chunk);
      }
      chunks.push(chunk);
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
    // Convert world pixel bounds to approximate hex q,r bounds
    // For flat-top hexes with size=HEX_SIZE, we need to figure out which chunks they fall in
    // Since hex layout is: x = size * 3/2 * q, y = size * sqrt(3)/2 * q + size * sqrt(3) * r
    // We use a conservative estimate: inverse transform of the corners
    const hexSize = 30; // matches HEX_SIZE in viewport
    const margin = CHUNK_SIZE * 2; // generous margin to avoid popping

    const minQ = Math.floor(((2 / 3) * left) / hexSize) - margin;
    const maxQ = Math.ceil(((2 / 3) * right) / hexSize) + margin;
    const minR = Math.floor(((-1 / 3) * right + (SQRT3 / 3) * top) / hexSize / SQRT3) - margin;
    const maxR = Math.ceil(((-1 / 3) * left + (SQRT3 / 3) * bottom) / hexSize / SQRT3) + margin;

    const minCX = Math.floor(minQ / CHUNK_SIZE);
    const maxCX = Math.floor(maxQ / CHUNK_SIZE);
    const minCY = Math.floor(minR / CHUNK_SIZE);
    const maxCY = Math.floor(maxR / CHUNK_SIZE);

    const coords: ChunkCoord[] = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        coords.push({ cx, cy });
      }
    }
    return coords;
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

  /** Look up a hex from cache, generating the chunk if needed. */
  getHex(q: number, r: number): HexData | null {
    const cx = Math.floor(q / CHUNK_SIZE);
    const cy = Math.floor(r / CHUNK_SIZE);
    const key = chunkKey(cx, cy);
    let chunk = this.cache.get(key);
    if (!chunk) {
      chunk = this.generator.generate({ cx, cy });
      this.cache.set(key, chunk);
    }
    return chunk.hexes.get(`${q},${r}`) ?? null;
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
