import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { CameraService } from '../../core/camera/camera.service';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { SelectionService } from '../../core/selection/selection.service';
import { GameStateService } from '../../core/state/game-state.service';
import { HexCanvasRendererService } from '../renderer/hex-canvas-renderer.service';
import { AnimationService } from '../renderer/animation.service';
import { AIService } from '../../core/ai/ai.service';
import { AudioService } from '../../core/audio/audio.service';
import { hexToPixel, pixelToHex } from '../../shared/hex/hex-math';
import { findPath, getReachableHexes, getUnitCostOverride, pathCost } from '../../core/pathfinding/hex-pathfinder';
import { VisionService } from '../../core/vision/vision.service';
import { SpriteAtlasService } from '../../core/sprites/sprite-atlas.service';
import { HexCoord } from '../../shared/hex/hex-coord.type';

const HEX_SIZE = 30;
const CLICK_THRESHOLD = 4;

@Component({
  selector: 'app-game-viewport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointerleave)': 'onPointerLeave()',
    '(wheel)': 'onWheel($event)',
    '(dblclick)': 'onDblClick($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
  template: `<canvas #gameCanvas></canvas>`,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class GameViewportComponent implements OnDestroy {
  private readonly camera = inject(CameraService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly selection = inject(SelectionService);
  private readonly gameState = inject(GameStateService);
  private readonly renderer = inject(HexCanvasRendererService);
  readonly animation = inject(AnimationService);
  private readonly ai = inject(AIService);
  private readonly audio = inject(AudioService);
  private readonly vision = inject(VisionService);
  private readonly spriteAtlas = inject(SpriteAtlasService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  private panning = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private resizeObserver: ResizeObserver | null = null;

  // Pre-built set of occupied hex keys (excludes selected unit)
  private readonly blockedHexSet = computed(() => {
    const units = this.gameState.units();
    const selectedId = this.selection.selectedUnit();
    const set = new Set<string>();
    for (const u of units.values()) {
      if (u.id !== selectedId) set.add(`${u.q},${u.r}`);
    }
    return set;
  });

  // Reachable hexes — only recomputes when selected unit or units map changes
  private readonly reachable = computed<Map<string, number> | null>(() => {
    const selectedUnitId = this.selection.selectedUnit();
    if (!selectedUnitId) return null;
    const units = this.gameState.units();
    const unit = units.get(selectedUnitId);
    if (!unit || unit.movementPoints <= 0) return null;

    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    const blocked = this.blockedHexSet();
    const isBlocked = (q: number, r: number) => blocked.has(`${q},${r}`);
    const from: HexCoord = { q: unit.q, r: unit.r, s: -unit.q - unit.r };
    const override = getUnitCostOverride(unit.type);
    return getReachableHexes(from, unit.movementPoints, hexLookup, isBlocked, override);
  });

  // Path preview — recomputes when reachable or hovered hex changes
  private readonly pathPreview = computed<HexCoord[] | null>(() => {
    const reachable = this.reachable();
    const hoveredHex = this.selection.hoveredHexCoord();
    if (!reachable || !hoveredHex) return null;
    if (!reachable.has(`${hoveredHex.q},${hoveredHex.r}`)) return null;

    const selectedUnitId = this.selection.selectedUnit();
    if (!selectedUnitId) return null;
    const unit = this.gameState.units().get(selectedUnitId);
    if (!unit) return null;

    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    const blocked = this.blockedHexSet();
    const isBlocked = (q: number, r: number) => blocked.has(`${q},${r}`);
    const from: HexCoord = { q: unit.q, r: unit.r, s: -unit.q - unit.r };
    const override = getUnitCostOverride(unit.type);
    return findPath(from, hoveredHex, unit.movementPoints, hexLookup, isBlocked, override);
  });

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        const { width, height } = entry.contentRect;
        canvas.width = width * devicePixelRatio;
        canvas.height = height * devicePixelRatio;
        this.camera.setCanvasSize(canvas.width, canvas.height);
      });
      this.resizeObserver.observe(canvas);
      this.spriteAtlas.load();
    });

    // Render effect — reads computed signals for reachable/pathPreview
    effect(() => {
      this.spriteAtlas.ready();
      const chunks = this.chunkManager.visibleChunks();
      const hoveredHex = this.selection.hoveredHexCoord();
      const selectedHex = this.selection.selectedHexCoord();
      const selectedUnitId = this.selection.selectedUnit();
      const units = this.gameState.units();
      const playerColors = this.gameState.playerColors();

      const reachable = this.reachable();
      const pathPreview = this.pathPreview();

      const activeAnim = this.animation.activeAnimation();
      const combatAnim = this.animation.combatAnimation();
      // Always render fog from the human player's perspective
      const visibleHexes = this.vision.humanVisibleHexes();
      const exploredHexes = this.vision.humanExploredHexes();
      const currentPlayerId = this.gameState.humanPlayer()?.id ?? null;
      const buildings = this.gameState.buildings();

      const canvas = this.canvasRef().nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.renderer.draw(ctx, this.camera, HEX_SIZE, chunks, hoveredHex, selectedHex, units, playerColors, selectedUnitId, reachable, pathPreview, activeAnim, visibleHexes, exploredHexes, currentPlayerId, buildings, null, combatAnim);
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.ai.executing()) return;
    this.panning = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.downX = event.clientX;
    this.downY = event.clientY;
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.panning) {
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.camera.panBy(dx * devicePixelRatio, dy * devicePixelRatio);
    } else {
      this.updateHover(event);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.panning && event.button === 0) {
      const movedX = Math.abs(event.clientX - this.downX);
      const movedY = Math.abs(event.clientY - this.downY);
      if (movedX < CLICK_THRESHOLD && movedY < CLICK_THRESHOLD) {
        this.handleClick(event);
      }
    }
    this.panning = false;
  }

  protected onPointerLeave(): void {
    this.panning = false;
    this.selection.hoverHex(null);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (this.ai.executing()) return;
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * devicePixelRatio;
    const screenY = (event.clientY - rect.top) * devicePixelRatio;
    this.camera.zoomAt(screenX, screenY, event.deltaY);
  }

  protected onDblClick(event: MouseEvent): void {
    if (this.ai.executing()) return;
    const hex = this.screenEventToHex(event as PointerEvent);
    const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
    this.camera.centerOn(x, y);
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  private handleClick(event: PointerEvent): void {
    if (this.animation.inputLocked() || this.ai.executing()) return;

    const hex = this.screenEventToHex(event);
    const selectedUnitId = this.selection.selectedUnit();

    // If a unit is selected, try to move it to the clicked hex
    if (selectedUnitId) {
      const unit = this.gameState.units().get(selectedUnitId);
      if (unit && unit.movementPoints > 0) {
        const from = { q: unit.q, r: unit.r, s: -unit.q - unit.r };
        const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
        const blocked = this.blockedHexSet();
        const isBlocked = (q: number, r: number) => blocked.has(`${q},${r}`);

        const override = getUnitCostOverride(unit.type);
        const path = findPath(from, hex, unit.movementPoints, hexLookup, isBlocked, override);
        if (path && path.length > 1) {
          const cost = pathCost(path, hexLookup, override);
          this.animation.animateUnitMovement(selectedUnitId, path).then(() => {
            this.gameState.dispatch({ type: 'MOVE_UNIT', unitId: selectedUnitId, path, cost });
            this.selection.selectUnit(selectedUnitId);
          });
          return;
        }
      }
    }

    this.selection.selectHex(hex);
    this.audio.playClick();
  }

  private updateHover(event: PointerEvent): void {
    const hex = this.screenEventToHex(event);
    this.selection.hoverHex(hex);
  }

  private screenEventToHex(event: PointerEvent) {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * devicePixelRatio;
    const screenY = (event.clientY - rect.top) * devicePixelRatio;
    const { x, y } = this.camera.screenToWorld(screenX, screenY);
    return pixelToHex(x, y, HEX_SIZE);
  }
}
