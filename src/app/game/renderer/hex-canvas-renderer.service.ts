import { inject, Injectable } from '@angular/core';
import { CameraService } from '../../core/camera/camera.service';
import { Chunk } from '../../models/chunk';
import { Anomaly, AnomalyType, BuildingData, BuildingType, UnitData, UnitType } from '../../models/game-state';
import { StellarObjectType } from '../../models/hex-data';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { hexKey, hexToPixel, toHexCoord } from '../../shared/hex/hex-math';
import { CHUNK_SIZE } from '../../core/generation/world-generator.service';
import { CombatAnimation, UnitAnimation } from './animation.service';
import { SpriteAtlasService } from '../../core/sprites/sprite-atlas.service';
import { Waypoint } from '../../core/state/waypoint.service';
import { hashCoord, seededRNG } from '../../core/generation/noise';

// Pre-computed hex vertex offsets (cos/sin for 6 angles at 60° intervals)
const HEX_VERTICES: ReadonlyArray<{ dx: number; dy: number }> = Array.from({ length: 6 }, (_, i) => {
  const angle = (Math.PI / 3) * i;
  return { dx: Math.cos(angle), dy: Math.sin(angle) };
});

// Pre-allocated fog overlay color strings
const FOG_EXPLORED_REACHABLE = 'rgba(0, 0, 0, 0.35)';
const FOG_EXPLORED = 'rgba(0, 0, 0, 0.6)';
const FOG_UNEXPLORED_REACHABLE = 'rgba(0, 0, 0, 0.5)';
const FOG_UNEXPLORED = 'rgba(0, 0, 0, 0.9)';
const RANGE_VISIBLE = 'rgba(59, 130, 246, 0.15)';
const RANGE_FOG = 'rgba(59, 130, 246, 0.3)';
const INFLUENCE_OVERLAY = 'rgba(34, 197, 94, 0.18)';
const INFLUENCE_BORDER = 'rgba(34, 197, 94, 0.75)';
const ATTACK_RANGE_OVERLAY = 'rgba(239, 68, 68, 0.18)';
const ATTACK_RANGE_BORDER = 'rgba(239, 68, 68, 0.75)';

// Neighbor offset per hex edge index (flat-top hexes, axial coords).
// Edge i runs from vertex i to vertex (i+1)%6; the neighbor across that edge
// is at the corresponding (dq, dr) offset.
const EDGE_NEIGHBOR_OFFSETS: ReadonlyArray<[number, number]> = [
  [1, 0],   // edge 0 (v0→v1)
  [0, 1],   // edge 1 (v1→v2)
  [-1, 1],  // edge 2 (v2→v3)
  [-1, 0],  // edge 3 (v3→v4)
  [0, -1],  // edge 4 (v4→v5)
  [1, -1],  // edge 5 (v5→v0)
];

// Starfield parallax background
const STAR_TILE_SIZE = 256;       // virtual tile size in screen pixels
const STARS_PER_TILE = 12;        // density
const STAR_SEED = 0xbada55;
const PARALLAX_FACTOR = 0.15;     // stars move at 15% of camera speed

const FILL_COLORS: Record<StellarObjectType, string> = {
  star: '#f0c040',
  planet: '#4080d0',
  moon: '#c0c0c0',
  asteroid: '#808080',
  asteroid_field: '#606060',
  comet: '#40e0d0',
  nebula: 'rgba(106, 13, 173, 0.35)',
  black_hole: '#8b0000',
  empty: 'rgba(13, 17, 23, 0.35)',
};

// Celestial bodies rendered as filled + stroked circles over space/nebula background
const CELESTIAL_CIRCLE: Record<string, { fill: string; stroke: string; radiusRatio: number; lineWidth: number }> = {
  star:   { fill: 'rgba(240, 192, 64, 0.85)', stroke: '#f0c040', radiusRatio: 0.55, lineWidth: 2.5 },
  planet: { fill: 'rgba(64, 128, 208, 0.80)', stroke: '#4080d0', radiusRatio: 0.40, lineWidth: 2.0 },
  moon:   { fill: 'rgba(160, 160, 176, 0.75)', stroke: '#a0a0b0', radiusRatio: 0.28, lineWidth: 1.5 },
};

// Asteroid debris configuration per type
interface AsteroidDebrisConfig {
  /** Number of debris pieces: [min, max] */
  count: [number, number];
  /** Size range of each square (fraction of hexSize): [min, max] */
  sizeRange: [number, number];
  /** Global alpha range: [min, max] */
  alphaRange: [number, number];
  /** Palette of icy/rocky gray base colors */
  palette: string[];
}

const ASTEROID_DEBRIS: Record<'asteroid' | 'asteroid_field', AsteroidDebrisConfig> = {
  asteroid: {
    count: [4, 8],
    sizeRange: [0.04, 0.10],
    alphaRange: [0.35, 0.65],
    palette: [
      '#5a5a60', // dark steel gray
      '#6e6e74', // medium gray
      '#4a4a50', // charcoal
      '#787880', // cool mid-gray
      '#3e3e44', // deep slate
    ],
  },
  asteroid_field: {
    count: [10, 20],
    sizeRange: [0.05, 0.16],
    alphaRange: [0.45, 0.85],
    palette: [
      '#b0b0b8', // light silver
      '#c8c8d0', // pale gray
      '#9a9aa2', // medium silver
      '#d8d8e0', // near-white
      '#e8e8f0', // icy white
      '#a8a8b0', // cool silver
      '#8a8a92', // darker silver accent
    ],
  },
};

export interface RenderState {
  ctx: CanvasRenderingContext2D;
  camera: CameraService;
  hexSize: number;
  chunks: Chunk[];
  hoveredHex: HexCoord | null;
  selectedHex: HexCoord | null;
  units?: Map<string, UnitData>;
  playerColors?: Map<string, string>;
  selectedUnitId?: string | null;
  reachableHexes?: Map<string, number> | null;
  pathPreview?: HexCoord[] | null;
  unitAnimation?: UnitAnimation | null;
  visibleHexes?: Set<string> | null;
  exploredHexes?: Set<string> | null;
  currentPlayerId?: string | null;
  buildings?: Map<string, BuildingData>;
  combatAnimation?: CombatAnimation | null;
  anomalies?: Map<string, Anomaly>;
  tradeHubs?: Map<string, import('../../models/game-state').TradeHub>;
  waypoints?: Map<string, Waypoint>;
  influenceOverlay?: Set<string> | null;
  attackRangeOverlay?: Set<string> | null;
  attackRangeGroups?: Set<string>[] | null;
}

const STARFIELD_CACHE_MAX = 100;

@Injectable({ providedIn: 'root' })
export class HexCanvasRendererService {
  private readonly sprites = inject(SpriteAtlasService);
  private readonly starTileCache = new Map<string, OffscreenCanvas>();
  draw(state: RenderState): void {
    const { ctx, camera, hexSize, chunks, hoveredHex, selectedHex,
      units, playerColors, selectedUnitId, reachableHexes, pathPreview,
      unitAnimation, visibleHexes, exploredHexes, currentPlayerId,
      buildings, combatAnimation, anomalies, waypoints,
      influenceOverlay, attackRangeOverlay, attackRangeGroups } = state;
    const w = camera.canvasWidth();
    const h = camera.canvasHeight();
    const zoom = camera.zoom();
    const panX = camera.panX();
    const panY = camera.panY();
    const hasFog = visibleHexes != null && exploredHexes != null;

    ctx.clearRect(0, 0, w, h);
    this.drawStarfield(ctx, w, h, panX, panY, zoom);
    ctx.save();
    ctx.translate(w / 2 - panX * zoom, h / 2 - panY * zoom);
    ctx.scale(zoom, zoom);

    for (const chunk of chunks) {
      this.renderChunkTexture(chunk, hexSize);
      this.blitChunk(ctx, chunk);
    }

    // Fog of war overlay — drawn per hex after chunk textures
    if (hasFog) {
      for (const chunk of chunks) {
        for (const hex of chunk.hexes.values()) {
          const key = hexKey(hex.q, hex.r);
          if (visibleHexes!.has(key)) continue; // fully visible, no fog
          const isReachable = reachableHexes?.has(key) ?? false;
          if (exploredHexes!.has(key)) {
            const fogColor = isReachable ? FOG_EXPLORED_REACHABLE : FOG_EXPLORED;
            this.drawHexOverlay(ctx, toHexCoord(hex.q, hex.r), hexSize, fogColor, null);
          } else {
            const fogColor = isReachable ? FOG_UNEXPLORED_REACHABLE : FOG_UNEXPLORED;
            this.drawHexOverlay(ctx, toHexCoord(hex.q, hex.r), hexSize, fogColor, null);
          }
        }
      }
    }

    // Influence overlay — drawn after fog, before buildings
    if (influenceOverlay) {
      for (const key of influenceOverlay) {
        if (hasFog && !visibleHexes!.has(key) && !exploredHexes!.has(key)) continue;
        const [q, r] = key.split(',').map(Number);
        this.drawHexOverlay(ctx, toHexCoord(q, r), hexSize, INFLUENCE_OVERLAY, null);
      }
      this.drawOverlayBorder(ctx, influenceOverlay, hexSize, INFLUENCE_BORDER, 2, hasFog ? visibleHexes! : null, hasFog ? exploredHexes! : null);
    }

    // Attack range overlay
    if (attackRangeOverlay) {
      for (const key of attackRangeOverlay) {
        if (hasFog && !visibleHexes!.has(key) && !exploredHexes!.has(key)) continue;
        const [q, r] = key.split(',').map(Number);
        this.drawHexOverlay(ctx, toHexCoord(q, r), hexSize, ATTACK_RANGE_OVERLAY, null);
      }
      // Draw per-unit borders if groups are available, otherwise fall back to merged border
      if (attackRangeGroups && attackRangeGroups.length > 0) {
        const fogVisible = hasFog ? visibleHexes! : null;
        const fogExplored = hasFog ? exploredHexes! : null;
        for (const group of attackRangeGroups) {
          this.drawOverlayBorder(ctx, group, hexSize, ATTACK_RANGE_BORDER, 2, fogVisible, fogExplored);
        }
      } else {
        this.drawOverlayBorder(ctx, attackRangeOverlay, hexSize, ATTACK_RANGE_BORDER, 2, hasFog ? visibleHexes! : null, hasFog ? exploredHexes! : null);
      }
    }

    // Draw buildings after fog, before units
    if (buildings) {
      for (const building of buildings.values()) {
        if (hasFog) {
          const bKey = hexKey(building.q, building.r);
          if (!visibleHexes!.has(bKey) && !exploredHexes!.has(bKey)) continue;
        }
        const color = playerColors?.get(building.ownerId) ?? '#ffffff';
        this.drawBuilding(ctx, building, hexSize, color);
      }
    }

    // Draw anomalies after buildings, before units
    if (anomalies) {
      for (const anomaly of anomalies.values()) {
        if (hasFog) {
          const aKey = hexKey(anomaly.q, anomaly.r);
          if (!visibleHexes!.has(aKey) && !exploredHexes!.has(aKey)) continue;
        }
        this.drawAnomaly(ctx, anomaly, hexSize);
      }
    }

    // Draw trade hubs
    const tradeHubs = state.tradeHubs;
    if (tradeHubs) {
      for (const hub of tradeHubs.values()) {
        if (hasFog) {
          const hKey = hexKey(hub.q, hub.r);
          if (!visibleHexes!.has(hKey) && !exploredHexes!.has(hKey)) continue;
        }
        this.drawTradeHub(ctx, hub.q, hub.r, hexSize);
      }
    }

    // Movement range overlay
    if (reachableHexes) {
      for (const key of reachableHexes.keys()) {
        const [q, r] = key.split(',').map(Number);
        const rangeColor = hasFog && !visibleHexes!.has(key) ? RANGE_FOG : RANGE_VISIBLE;
        this.drawHexOverlay(ctx, toHexCoord(q, r), hexSize, rangeColor, null);
      }
    }

    // Path preview
    if (pathPreview && pathPreview.length > 1) {
      this.drawPathLine(ctx, pathPreview, hexSize);
    }

    // Draw units
    if (units) {
      for (const unit of units.values()) {
        // Hide enemy units in fog
        if (hasFog && unit.ownerId !== currentPlayerId) {
          const unitKey = hexKey(unit.q, unit.r);
          if (!visibleHexes!.has(unitKey)) continue;
        }

        const color = playerColors?.get(unit.ownerId) ?? '#ffffff';
        const isSelected = unit.id === selectedUnitId;

        // If this unit is animating, draw at interpolated position
        if (unitAnimation && unitAnimation.unitId === unit.id) {
          const fromHex = unitAnimation.path[unitAnimation.currentStep];
          const toHex = unitAnimation.path[unitAnimation.currentStep + 1];
          if (fromHex && toHex) {
            const from = hexToPixel(fromHex.q, fromHex.r, hexSize);
            const to = hexToPixel(toHex.q, toHex.r, hexSize);
            const ax = from.x + (to.x - from.x) * unitAnimation.t;
            const ay = from.y + (to.y - from.y) * unitAnimation.t;
            this.drawUnitAt(ctx, unit, hexSize, color, isSelected, ax, ay);
            continue;
          }
        }

        this.drawUnit(ctx, unit, hexSize, color, isSelected);
      }
    }

    // Combat animation flash
    if (combatAnimation && units) {
      const flashEntity = combatAnimation.phase === 'flash_attacker'
        ? units.get(combatAnimation.attackerId)
        : combatAnimation.phase === 'flash_defender'
          ? (units.get(combatAnimation.defenderId) ?? buildings?.get(combatAnimation.defenderId) ?? null)
          : null;
      if (flashEntity) {
        const { x, y } = hexToPixel(flashEntity.q, flashEntity.r, hexSize);
        const flashColor = combatAnimation.phase === 'flash_attacker'
          ? 'rgba(255, 255, 255, 0.6)'
          : 'rgba(239, 68, 68, 0.6)';
        ctx.beginPath();
        ctx.arc(x, y, hexSize * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = flashColor;
        ctx.fill();
      }
    }

    // Overlays drawn on main canvas, not chunk textures
    if (hoveredHex) {
      this.drawHexOverlay(ctx, hoveredHex, hexSize, 'rgba(255, 255, 255, 0.1)', null);
    }
    if (selectedHex) {
      this.drawHexOverlay(ctx, selectedHex, hexSize, 'rgba(0, 255, 255, 0.15)', '#00e5ff');
    }

    // Waypoint markers
    if (waypoints && units && currentPlayerId) {
      for (const wp of waypoints.values()) {
        const unit = units.get(wp.unitId);
        if (!unit || unit.ownerId !== currentPlayerId) continue;
        const isSelected = wp.unitId === selectedUnitId;
        this.drawWaypointIndicator(ctx, unit, wp, hexSize, isSelected);
      }
    }

    ctx.restore();
  }

  private drawHexOverlay(
    ctx: CanvasRenderingContext2D,
    hex: HexCoord,
    hexSize: number,
    fillColor: string | null,
    strokeColor: string | null,
  ): void {
    const { x, y } = hexToPixel(hex.q, hex.r, hexSize);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const vx = x + hexSize * HEX_VERTICES[i].dx;
      const vy = y + hexSize * HEX_VERTICES[i].dy;
      if (i === 0) {
        ctx.moveTo(vx, vy);
      } else {
        ctx.lineTo(vx, vy);
      }
    }
    ctx.closePath();
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /**
   * Draw the outer boundary of an overlay set.
   * For each hex in the set, any edge whose neighbor is NOT in the set is a border edge.
   * All border segments are batched into a single path and stroked once.
   */
  private drawOverlayBorder(
    ctx: CanvasRenderingContext2D,
    overlay: Set<string>,
    hexSize: number,
    strokeColor: string,
    lineWidth: number,
    visibleHexes: Set<string> | null,
    exploredHexes: Set<string> | null,
  ): void {
    ctx.beginPath();
    for (const key of overlay) {
      if (visibleHexes && exploredHexes && !visibleHexes.has(key) && !exploredHexes.has(key)) continue;
      const [q, r] = key.split(',').map(Number);
      const { x, y } = hexToPixel(q, r, hexSize);
      for (let i = 0; i < 6; i++) {
        const [dq, dr] = EDGE_NEIGHBOR_OFFSETS[i];
        if (overlay.has(`${q + dq},${r + dr}`)) continue;
        const v0 = HEX_VERTICES[i];
        const v1 = HEX_VERTICES[(i + 1) % 6];
        ctx.moveTo(x + hexSize * v0.dx, y + hexSize * v0.dy);
        ctx.lineTo(x + hexSize * v1.dx, y + hexSize * v1.dy);
      }
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  private drawPathLine(ctx: CanvasRenderingContext2D, path: HexCoord[], hexSize: number): void {
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const { x, y } = hexToPixel(path[i].q, path[i].r, hexSize);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow at destination
    const dest = path[path.length - 1];
    const { x, y } = hexToPixel(dest.q, dest.r, hexSize);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.fill();
  }

  private renderChunkTexture(chunk: Chunk, hexSize: number): void {
    if (!chunk.dirty && chunk.texture) return;

    const padding = hexSize * 2;
    const sampleHexes = [
      { dq: 0, dr: 0 },
      { dq: CHUNK_SIZE - 1, dr: 0 },
      { dq: 0, dr: CHUNK_SIZE - 1 },
      { dq: CHUNK_SIZE - 1, dr: CHUNK_SIZE - 1 },
    ];
    const baseQ = chunk.coord.cx * CHUNK_SIZE;
    const baseR = chunk.coord.cy * CHUNK_SIZE;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const s of sampleHexes) {
      const { x, y } = hexToPixel(baseQ + s.dq, baseR + s.dr, hexSize);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    const texW = Math.ceil(maxX - minX + padding * 2);
    const texH = Math.ceil(maxY - minY + padding * 2);
    const offsetX = minX - padding;
    const offsetY = minY - padding;

    if (!chunk.texture || chunk.texture.width !== texW || chunk.texture.height !== texH) {
      chunk.texture = new OffscreenCanvas(texW, texH);
    }

    const tctx = chunk.texture.getContext('2d')!;
    tctx.clearRect(0, 0, texW, texH);

    tctx.strokeStyle = 'rgba(42, 74, 90, 0.35)';
    tctx.lineWidth = 1;

    for (const hex of chunk.hexes.values()) {
      const { x, y } = hexToPixel(hex.q, hex.r, hexSize);
      const lx = x - offsetX;
      const ly = y - offsetY;

      const objType = hex.object?.type ?? 'empty';
      const celestial = CELESTIAL_CIRCLE[objType];
      const isAsteroid = objType === 'asteroid' || objType === 'asteroid_field';
      const isComet = objType === 'comet';
      const isBlackHole = objType === 'black_hole';

      // Celestial bodies, asteroids, comets, and black holes use the nebula background
      // when inside a nebula region, otherwise default to the dark space background
      const spaceOrNebula = hex.inNebula ? FILL_COLORS.nebula : FILL_COLORS.empty;
      tctx.fillStyle = (celestial || isAsteroid || isComet || isBlackHole) ? spaceOrNebula : (FILL_COLORS[objType] ?? FILL_COLORS.empty);
      this.drawHex(tctx, lx, ly, hexSize);

      // Draw scattered debris pattern for asteroids
      if (isAsteroid) {
        this.drawAsteroidDebris(tctx, lx, ly, hexSize, hex.q, hex.r, objType as 'asteroid' | 'asteroid_field');
      }

      // Draw comet with head circle and directional tail
      if (isComet) {
        this.drawComet(tctx, lx, ly, hexSize, hex.object!.velocity ?? null);
      }

      // Draw black hole with event horizon, accretion disk, and glow
      if (isBlackHole) {
        this.drawBlackHole(tctx, lx, ly, hexSize);
      }

      // Draw stroked circle indicator for celestial bodies
      if (celestial) {
        this.drawCelestialCircle(tctx, lx, ly, hexSize, celestial);
      }
    }

    chunk.dirty = false;
    (chunk as any)._texOffsetX = offsetX;
    (chunk as any)._texOffsetY = offsetY;
  }

  private blitChunk(ctx: CanvasRenderingContext2D, chunk: Chunk): void {
    if (!chunk.texture) return;
    const offsetX = (chunk as any)._texOffsetX ?? 0;
    const offsetY = (chunk as any)._texOffsetY ?? 0;
    ctx.drawImage(chunk.texture, offsetX, offsetY);
  }

  private drawUnit(
    ctx: CanvasRenderingContext2D,
    unit: UnitData,
    hexSize: number,
    color: string,
    isSelected: boolean,
  ): void {
    const { x, y } = hexToPixel(unit.q, unit.r, hexSize);
    this.drawUnitAt(ctx, unit, hexSize, color, isSelected, x, y);
  }

  private drawUnitAt(
    ctx: CanvasRenderingContext2D,
    unit: UnitData,
    hexSize: number,
    color: string,
    isSelected: boolean,
    x: number,
    y: number,
  ): void {
    const r = hexSize * 0.35;

    // Selected unit highlight ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Try sprite first, fall back to geometric shape
    if (!this.sprites.drawUnit(ctx, unit.type, color, x, y, r)) {
      ctx.beginPath();
      this.traceUnitShape(ctx, x, y, r, unit.type);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Shield bar (blue, above health bar when unit has shields)
    let barY = y + r + 4;
    if (unit.maxShields > 0) {
      const barW = r * 2;
      const barH = 2;
      const barX = x - r;
      const shieldRatio = unit.shields / unit.maxShields;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(barX, barY, barW * shieldRatio, barH);
      barY += barH + 1;
    }

    // Health bar (only when damaged)
    if (unit.health < unit.maxHealth) {
      const barW = r * 2;
      const barH = 3;
      const barX = x - r;
      const ratio = unit.health / unit.maxHealth;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(barX, barY, barW * ratio, barH);
      barY += barH + 1;
    }

    // Veteran stars (top-left of unit)
    if (unit.veteranTier !== 'standard') {
      const starCount = unit.veteranTier === 'improved' ? 1 : 2;
      const starSize = 3;
      for (let i = 0; i < starCount; i++) {
        const sx = x - r + i * (starSize * 2 + 2);
        const sy = y - r - 4;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const angle = (Math.PI / 5) * j - Math.PI / 2;
          const dist = j % 2 === 0 ? starSize : starSize * 0.4;
          const px = sx + dist * Math.cos(angle);
          const py = sy + dist * Math.sin(angle);
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private traceUnitShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    type: UnitType,
  ): void {
    switch (type) {
      case 'scout':
        // Triangle pointing up
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.85, y + r * 0.6);
        ctx.lineTo(x - r * 0.85, y + r * 0.6);
        break;
      case 'fighter':
        // Diamond
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        break;
      case 'cruiser':
        // Pentagon
        for (let i = 0; i < 5; i++) {
          const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          const px = x + r * Math.cos(angle);
          const py = y + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        break;
      case 'corvette':
        // Arrow pointing right
        ctx.moveTo(x + r, y);
        ctx.lineTo(x - r * 0.5, y - r * 0.7);
        ctx.lineTo(x - r * 0.2, y);
        ctx.lineTo(x - r * 0.5, y + r * 0.7);
        break;
      case 'frigate':
        // Hexagon
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = x + r * 0.85 * Math.cos(angle);
          const py = y + r * 0.85 * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        break;
      case 'battleship':
        // Octagon
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI / 4) * i - Math.PI / 8;
          const px = x + r * Math.cos(angle);
          const py = y + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        break;
      case 'colony_ship':
        // Rounded square (draw as octagon approximation)
        const s = r * 0.75;
        ctx.moveTo(x - s, y - s * 0.5);
        ctx.lineTo(x - s * 0.5, y - s);
        ctx.lineTo(x + s * 0.5, y - s);
        ctx.lineTo(x + s, y - s * 0.5);
        ctx.lineTo(x + s, y + s * 0.5);
        ctx.lineTo(x + s * 0.5, y + s);
        ctx.lineTo(x - s * 0.5, y + s);
        ctx.lineTo(x - s, y + s * 0.5);
        break;
      case 'mining_drone':
        // Small circle
        ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
        break;
    }
  }

  private drawBuilding(
    ctx: CanvasRenderingContext2D,
    building: BuildingData,
    hexSize: number,
    color: string,
  ): void {
    const { x, y } = hexToPixel(building.q, building.r, hexSize);
    const r = hexSize * 0.3;
    // Offset building to bottom-left of hex so it doesn't overlap units
    const bx = x - hexSize * 0.25;
    const by = y + hexSize * 0.2;

    // Try sprite first, fall back to geometric shape
    if (!this.sprites.drawBuilding(ctx, building.type, color, bx, by, r)) {
      ctx.beginPath();
      this.traceBuildingShape(ctx, bx, by, r, building.type);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Shield bar (blue, above health bar)
    let barY = by + r + 3;
    if (building.maxShields > 0 && building.shields < building.maxShields) {
      const barW = r * 2;
      const barH = 2;
      const barX = bx - r;
      const shieldRatio = building.shields / building.maxShields;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(barX, barY, barW * shieldRatio, barH);
      barY += barH + 1;
    }

    // Health bar when damaged
    if (building.health < building.maxHealth) {
      const barW = r * 2;
      const barH = 2;
      const barX = bx - r;
      const ratio = building.health / building.maxHealth;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(barX, barY, barW * ratio, barH);
    }
  }

  private traceBuildingShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    type: BuildingType,
  ): void {
    switch (type) {
      case 'colony':
        // Square
        ctx.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
        break;
      case 'mining_station':
        // Circle
        ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
        break;
      case 'starbase':
        // Hexagon
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = x + r * 0.8 * Math.cos(angle);
          const py = y + r * 0.8 * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        break;
      case 'solar_collector':
        // Triangle pointing up
        ctx.moveTo(x, y - r * 0.8);
        ctx.lineTo(x + r * 0.7, y + r * 0.5);
        ctx.lineTo(x - r * 0.7, y + r * 0.5);
        break;
      case 'research_lab':
        // Diamond
        ctx.moveTo(x, y - r * 0.8);
        ctx.lineTo(x + r * 0.7, y);
        ctx.lineTo(x, y + r * 0.8);
        ctx.lineTo(x - r * 0.7, y);
        break;
    }
  }

  private drawAnomaly(
    ctx: CanvasRenderingContext2D,
    anomaly: Anomaly,
    hexSize: number,
  ): void {
    const { x, y } = hexToPixel(anomaly.q, anomaly.r, hexSize);
    // Offset to top-right to avoid overlap with buildings
    const ax = x + hexSize * 0.25;
    const ay = y - hexSize * 0.2;
    const r = hexSize * 0.22;
    const color = '#f59e0b';

    // Glow
    ctx.save();
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 6;

    ctx.beginPath();
    this.traceAnomalyShape(ctx, ax, ay, r, anomaly.type);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  private drawTradeHub(
    ctx: CanvasRenderingContext2D,
    q: number,
    r: number,
    hexSize: number,
  ): void {
    const { x, y } = hexToPixel(q, r, hexSize);
    const r1 = hexSize * 0.32;
    const s = hexSize * 0.22;

    ctx.save();
    ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
    ctx.lineWidth = 1.5;

    // Circle
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.stroke();

    // Square overlay (rotated 0°, axis-aligned)
    ctx.beginPath();
    ctx.rect(x - s, y - s, s * 2, s * 2);
    ctx.stroke();

    ctx.restore();
  }

  private traceAnomalyShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    type: AnomalyType,
  ): void {
    switch (type) {
      case 'derelict_ship':
        // Diamond
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        break;
      case 'resource_cache':
        // Square
        ctx.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
        break;
      case 'alien_signal':
        // Star (4-pointed)
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI / 4) * i - Math.PI / 2;
          const dist = i % 2 === 0 ? r : r * 0.4;
          const px = x + dist * Math.cos(angle);
          const py = y + dist * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        break;
      case 'wormhole':
        // Circle
        ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
        break;
      case 'ancient_ruins':
        // Triangle
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.85, y + r * 0.6);
        ctx.lineTo(x - r * 0.85, y + r * 0.6);
        break;
    }
  }

  private drawWaypointIndicator(
    ctx: CanvasRenderingContext2D,
    unit: UnitData,
    wp: Waypoint,
    hexSize: number,
    isSelected: boolean,
  ): void {
    const from = hexToPixel(unit.q, unit.r, hexSize);
    const to = hexToPixel(wp.target.q, wp.target.r, hexSize);
    const isAttack = !!wp.attackTargetId;
    const alpha = isSelected ? 0.6 : 0.25;
    const solidAlpha = isSelected ? 1.0 : 0.35;
    const color = isAttack ? `rgba(239, 68, 68, ${alpha})` : `rgba(59, 130, 246, ${alpha})`;
    const solidColor = isAttack ? `rgba(239, 68, 68, ${solidAlpha})` : `rgba(59, 130, 246, ${solidAlpha})`;

    // Dashed line from unit to target
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair marker at target
    const r = hexSize * 0.3;
    ctx.beginPath();
    ctx.moveTo(to.x - r, to.y);
    ctx.lineTo(to.x + r, to.y);
    ctx.moveTo(to.x, to.y - r);
    ctx.lineTo(to.x, to.y + r);
    ctx.strokeStyle = solidColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Diamond outline at target
    const d = r * 0.6;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y - d);
    ctx.lineTo(to.x + d, to.y);
    ctx.lineTo(to.x, to.y + d);
    ctx.lineTo(to.x - d, to.y);
    ctx.closePath();
    ctx.strokeStyle = solidColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private renderStarTile(col: number, row: number): OffscreenCanvas {
    const key = `${col},${row}`;
    let tile = this.starTileCache.get(key);
    if (tile) return tile;

    tile = new OffscreenCanvas(STAR_TILE_SIZE, STAR_TILE_SIZE);
    const tctx = tile.getContext('2d')!;
    const rng = seededRNG(hashCoord(STAR_SEED, col, row));
    for (let i = 0; i < STARS_PER_TILE; i++) {
      const lx = rng.next() * STAR_TILE_SIZE;
      const ly = rng.next() * STAR_TILE_SIZE;
      const brightness = 0.3 + rng.next() * 0.7;
      const radius = 0.4 + rng.next() * 0.8;
      const alpha = Math.round(brightness * 255);
      tctx.fillStyle = `rgba(255,255,255,${(alpha / 255).toFixed(2)})`;
      const size = radius < 0.9 ? 1 : 2;
      tctx.fillRect(Math.round(lx), Math.round(ly), size, size);
    }

    if (this.starTileCache.size >= STARFIELD_CACHE_MAX) {
      const firstKey = this.starTileCache.keys().next().value!;
      this.starTileCache.delete(firstKey);
    }
    this.starTileCache.set(key, tile);
    return tile;
  }

  private drawStarfield(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    panX: number,
    panY: number,
    zoom: number,
  ): void {
    const offsetX = panX * zoom * PARALLAX_FACTOR;
    const offsetY = panY * zoom * PARALLAX_FACTOR;

    const startCol = Math.floor(offsetX / STAR_TILE_SIZE) - 1;
    const endCol = Math.floor((offsetX + w) / STAR_TILE_SIZE) + 1;
    const startRow = Math.floor(offsetY / STAR_TILE_SIZE) - 1;
    const endRow = Math.floor((offsetY + h) / STAR_TILE_SIZE) + 1;

    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        const sx = col * STAR_TILE_SIZE - offsetX;
        const sy = row * STAR_TILE_SIZE - offsetY;
        if (sx + STAR_TILE_SIZE < 0 || sx > w || sy + STAR_TILE_SIZE < 0 || sy > h) continue;
        const tile = this.renderStarTile(col, row);
        ctx.drawImage(tile, Math.round(sx), Math.round(sy));
      }
    }
  }

  private drawHex(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
  ): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const x = cx + size * HEX_VERTICES[i].dx;
      const y = cy + size * HEX_VERTICES[i].dy;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Draw scattered square debris inside an asteroid hex.
   * Uses a seeded RNG keyed on the hex coordinates for deterministic placement.
   * Clips to the hex boundary so no debris bleeds outside.
   */
  private drawAsteroidDebris(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    cx: number,
    cy: number,
    hexSize: number,
    q: number,
    r: number,
    type: 'asteroid' | 'asteroid_field',
  ): void {
    const config = ASTEROID_DEBRIS[type];
    const rng = seededRNG(hashCoord(0xA57E201D, q, r));

    // Determine number of debris pieces
    const count = Math.floor(rng.next() * (config.count[1] - config.count[0] + 1)) + config.count[0];

    // The inner radius of a flat-top hex (distance from center to edge midpoint)
    const innerR = hexSize * Math.sqrt(3) / 2;

    ctx.save();

    // Clip to hex boundary
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const vx = cx + hexSize * HEX_VERTICES[i].dx;
      const vy = cy + hexSize * HEX_VERTICES[i].dy;
      if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.clip();

    for (let i = 0; i < count; i++) {
      // Random position within a bounding circle (reject if outside hex — but
      // since we clip, we can be slightly generous with placement)
      const angle = rng.next() * Math.PI * 2;
      const dist = rng.next() * innerR * 0.88;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;

      // Size of this debris piece
      const t = rng.next();
      const sizeFrac = config.sizeRange[0] + t * (config.sizeRange[1] - config.sizeRange[0]);
      const pieceSize = hexSize * sizeFrac;

      // Slight rotation for variety
      const rotation = rng.next() * Math.PI * 0.5;

      // Pick a color from the palette
      const colorIndex = Math.floor(rng.next() * config.palette.length);
      const color = config.palette[colorIndex];

      // Alpha varies per piece within the configured range
      const alpha = config.alphaRange[0] + rng.next() * (config.alphaRange[1] - config.alphaRange[0]);

      ctx.save();
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate(rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;

      // Draw a rectangle (some slightly elongated for variety)
      const aspect = 0.6 + rng.next() * 0.8; // 0.6 to 1.4 aspect ratio
      const w = pieceSize;
      const h = pieceSize * aspect;
      ctx.fillRect(-w / 2, -h / 2, w, h);

      ctx.restore();
    }

    ctx.restore();
  }

  private drawCelestialCircle(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    cx: number,
    cy: number,
    hexSize: number,
    config: { fill: string; stroke: string; radiusRatio: number; lineWidth: number },
  ): void {
    ctx.save();
    const r = hexSize * config.radiusRatio;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = config.fill;
    ctx.fill();
    ctx.strokeStyle = config.stroke;
    ctx.lineWidth = config.lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw a comet as an icy-blue head circle with a tapered tail trailing
   * opposite to its velocity direction.
   * The tail uses a gradient from semi-opaque near the head to transparent at the tip.
   * If velocity is zero or absent, draws a default tail pointing left (trailing
   * behind a rightward-moving comet) since the comet is stationary.
   */
  private drawComet(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    cx: number,
    cy: number,
    hexSize: number,
    velocity: HexCoord | null,
  ): void {
    ctx.save();

    // Clip to hex boundary so tail doesn't bleed into adjacent hexes
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const vx = cx + hexSize * HEX_VERTICES[i].dx;
      const vy = cy + hexSize * HEX_VERTICES[i].dy;
      if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.clip();

    // Convert hex velocity to pixel-space direction (flat-top hex layout)
    // dx = (3/2) * vq,  dy = (sqrt3/2) * vq + sqrt3 * vr
    const SQRT3 = Math.sqrt(3);
    const vq = velocity?.q ?? 0;
    const vr = velocity?.r ?? 0;
    let dx = (3 / 2) * vq;
    let dy = (SQRT3 / 2) * vq + SQRT3 * vr;

    // Normalize direction; if zero velocity, default tail points left
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag < 0.001) {
      dx = -1;
      dy = 0;
    } else {
      dx /= mag;
      dy /= mag;
    }

    // Tail direction is OPPOSITE to velocity (trails behind)
    const tailDx = -dx;
    const tailDy = -dy;

    // Head: slightly offset forward from center along velocity direction
    const headOffset = hexSize * 0.12;
    const headX = cx + dx * headOffset;
    const headY = cy + dy * headOffset;
    const headRadius = hexSize * 0.14;

    // Tail geometry
    const tailLength = hexSize * 0.65;
    const tailEndX = headX + tailDx * tailLength;
    const tailEndY = headY + tailDy * tailLength;

    // Perpendicular to tail direction (for tail width)
    const perpX = -tailDy;
    const perpY = tailDx;

    // Tail widths: wide near head, tapering to a point
    const tailWidthHead = hexSize * 0.12;
    const tailWidthMid = hexSize * 0.06;

    // Draw tail as a filled shape with gradient
    // Shape: head-left → mid-left → tip → mid-right → head-right
    const midX = headX + tailDx * tailLength * 0.45;
    const midY = headY + tailDy * tailLength * 0.45;

    ctx.beginPath();
    ctx.moveTo(headX + perpX * tailWidthHead, headY + perpY * tailWidthHead);
    ctx.quadraticCurveTo(
      midX + perpX * tailWidthMid, midY + perpY * tailWidthMid,
      tailEndX, tailEndY,
    );
    ctx.quadraticCurveTo(
      midX - perpX * tailWidthMid, midY - perpY * tailWidthMid,
      headX - perpX * tailWidthHead, headY - perpY * tailWidthHead,
    );
    ctx.closePath();

    // Gradient along the tail: semi-opaque near head → transparent at tip
    const grad = ctx.createLinearGradient(headX, headY, tailEndX, tailEndY);
    grad.addColorStop(0, 'rgba(180, 230, 255, 0.55)');
    grad.addColorStop(0.4, 'rgba(120, 210, 240, 0.30)');
    grad.addColorStop(1, 'rgba(80, 200, 230, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Head glow: soft radial gradient behind the head circle
    const glowRadius = hexSize * 0.25;
    const glow = ctx.createRadialGradient(headX, headY, 0, headX, headY, glowRadius);
    glow.addColorStop(0, 'rgba(200, 240, 255, 0.45)');
    glow.addColorStop(0.5, 'rgba(160, 220, 240, 0.15)');
    glow.addColorStop(1, 'rgba(100, 200, 230, 0.0)');
    ctx.beginPath();
    ctx.arc(headX, headY, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Head circle: solid icy blue-white
    ctx.beginPath();
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#d0f0ff';
    ctx.fill();
    ctx.strokeStyle = '#80d8e8';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw a black hole as a dark event horizon circle surrounded by a glowing
   * accretion disk.  The rendering layers (back to front):
   *   1. Outer glow — soft radial gradient in warm reddish-purple
   *   2. Accretion disk — stroked ring with an orange-red gradient
   *   3. Event horizon — very dark filled circle at the center
   * Clips to the hex boundary so nothing bleeds into adjacent hexes.
   */
  private drawBlackHole(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    cx: number,
    cy: number,
    hexSize: number,
  ): void {
    ctx.save();

    // Clip to hex boundary
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const vx = cx + hexSize * HEX_VERTICES[i].dx;
      const vy = cy + hexSize * HEX_VERTICES[i].dy;
      if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.clip();

    // --- 1. Outer glow: warm reddish-purple radial gradient ---
    const glowRadius = hexSize * 0.7;
    const glow = ctx.createRadialGradient(cx, cy, hexSize * 0.15, cx, cy, glowRadius);
    glow.addColorStop(0, 'rgba(160, 40, 60, 0.50)');
    glow.addColorStop(0.35, 'rgba(120, 20, 80, 0.25)');
    glow.addColorStop(0.7, 'rgba(80, 10, 60, 0.10)');
    glow.addColorStop(1, 'rgba(40, 0, 30, 0.0)');
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // --- 2. Accretion disk: stroked ring with gradient ---
    const diskRadius = hexSize * 0.38;
    const diskGrad = ctx.createRadialGradient(cx, cy, diskRadius * 0.7, cx, cy, diskRadius * 1.3);
    diskGrad.addColorStop(0, 'rgba(200, 80, 20, 0.0)');
    diskGrad.addColorStop(0.3, 'rgba(220, 100, 40, 0.70)');
    diskGrad.addColorStop(0.5, 'rgba(240, 140, 60, 0.85)');
    diskGrad.addColorStop(0.7, 'rgba(200, 60, 40, 0.65)');
    diskGrad.addColorStop(1, 'rgba(140, 20, 40, 0.0)');
    ctx.beginPath();
    ctx.arc(cx, cy, diskRadius, 0, Math.PI * 2);
    ctx.strokeStyle = diskGrad;
    ctx.lineWidth = hexSize * 0.14;
    ctx.stroke();

    // --- 3. Event horizon: very dark center circle ---
    const horizonRadius = hexSize * 0.22;
    const horizonGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, horizonRadius);
    horizonGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    horizonGrad.addColorStop(0.7, 'rgba(5, 0, 10, 0.92)');
    horizonGrad.addColorStop(1, 'rgba(20, 5, 20, 0.80)');
    ctx.beginPath();
    ctx.arc(cx, cy, horizonRadius, 0, Math.PI * 2);
    ctx.fillStyle = horizonGrad;
    ctx.fill();

    // Subtle dark stroke around the event horizon edge
    ctx.strokeStyle = 'rgba(80, 20, 40, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }
}
