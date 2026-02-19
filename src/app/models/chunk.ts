import { HexData } from './hex-data';

export interface ChunkCoord {
  cx: number;
  cy: number;
}

export interface Chunk {
  coord: ChunkCoord;
  hexes: Map<string, HexData>;
  dirty: boolean;
  texture?: OffscreenCanvas;
}
