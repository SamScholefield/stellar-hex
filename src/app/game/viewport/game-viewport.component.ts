import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  signal,
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
import { UndoService } from '../../core/state/undo.service';
import { ActionExecutionService } from '../../core/state/action-execution.service';
import { HEX_SIZE, hexKey, hexToPixel, pixelToHex, toHexCoord } from '../../shared/hex/hex-math';
import { buildBlockedSet, findPath, getReachableHexes, getUnitCostOverride } from '../../core/pathfinding/hex-pathfinder';
import { VisionService } from '../../core/vision/vision.service';
import { WaypointService } from '../../core/state/waypoint.service';
import { InfluenceService } from '../../core/influence/influence.service';
import { SpriteAtlasService } from '../../core/sprites/sprite-atlas.service';
import { HexCoord } from '../../shared/hex/hex-coord.type';

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
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
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
  private readonly undo = inject(UndoService);
  private readonly spriteAtlas = inject(SpriteAtlasService);
  private readonly waypointSvc = inject(WaypointService);
  private readonly influenceSvc = inject(InfluenceService);
  private readonly actionExec = inject(ActionExecutionService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  readonly firstDrawComplete = signal(false);

  private panning = false;
  private spaceHeld = false;
  private pointerDown = false;
  private swallowNextClick = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onWindowBlur = () => { this.swallowNextClick = true; };
  private readonly onWindowFocus = () => {
    // If focus returned without a click (e.g. alt-tab back), clear after a short delay
    // so that a keyboard-initiated focus doesn't block the next click
    setTimeout(() => { this.swallowNextClick = false; }, 200);
  };

  // Pre-built set of enemy-occupied hex keys (friendly units allow stacking)
  private readonly blockedHexSet = computed(() => {
    const selectedId = this.selection.selectedUnit();
    const playerId = this.gameState.currentPlayer()?.id ?? '';
    return buildBlockedSet(this.gameState.units(), this.gameState.buildings(), playerId, selectedId ?? undefined);
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
    const isBlocked = (q: number, r: number) => blocked.has(hexKey(q, r));
    const from: HexCoord = toHexCoord(unit.q, unit.r);
    const override = getUnitCostOverride(unit.type);
    return getReachableHexes(from, unit.movementPoints, hexLookup, isBlocked, override);
  });

  // Path preview — recomputes when reachable or hovered hex changes
  private readonly pathPreview = computed<HexCoord[] | null>(() => {
    const reachable = this.reachable();
    const hoveredHex = this.selection.hoveredHexCoord();
    if (!reachable || !hoveredHex) return null;
    if (!reachable.has(hexKey(hoveredHex.q, hoveredHex.r))) return null;

    const selectedUnitId = this.selection.selectedUnit();
    if (!selectedUnitId) return null;
    const unit = this.gameState.units().get(selectedUnitId);
    if (!unit) return null;

    const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
    const blocked = this.blockedHexSet();
    const isBlocked = (q: number, r: number) => blocked.has(hexKey(q, r));
    const from: HexCoord = toHexCoord(unit.q, unit.r);
    const override = getUnitCostOverride(unit.type);
    return findPath(from, hoveredHex, unit.movementPoints, hexLookup, isBlocked, override);
  });

  constructor() {
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('focus', this.onWindowFocus);
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
      // Filter out docked units — they shouldn't render on the map
      const allUnits = this.gameState.units();
      const units = new Map<string, import('../../models/game-state').UnitData>();
      for (const [id, u] of allUnits) {
        if (!u.dockedAt) units.set(id, u);
      }
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
      const anomalies = this.gameState.anomalies();
      const tradeHubs = this.gameState.tradeHubs();
      const waypoints = this.waypointSvc.waypoints();
      const influenceHexes = this.influenceSvc.showInfluenceOverlay() ? this.influenceSvc.humanInfluenceHexes() : null;
      const attackRangeHexes = this.influenceSvc.showAttackRangeOverlay() ? this.influenceSvc.humanAttackRangeHexes() : null;
      const attackRangeGroups = this.influenceSvc.showAttackRangeOverlay() ? this.influenceSvc.humanAttackRangeGroups() : null;

      const canvas = this.canvasRef().nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.renderer.draw({
          ctx, camera: this.camera, hexSize: HEX_SIZE, chunks, hoveredHex, selectedHex,
          units, playerColors, selectedUnitId, reachableHexes: reachable, pathPreview,
          unitAnimation: activeAnim, visibleHexes, exploredHexes, currentPlayerId,
          buildings, combatAnimation: combatAnim, anomalies, tradeHubs, waypoints,
          influenceOverlay: influenceHexes, attackRangeOverlay: attackRangeHexes, attackRangeGroups,
        });
        if (!this.firstDrawComplete() && this.spriteAtlas.ready()) {
          // Sample center pixel to confirm real content was drawn
          const cx = Math.floor(canvas.width / 2);
          const cy = Math.floor(canvas.height / 2);
          const pixel = ctx.getImageData(cx, cy, 1, 1).data;
          if (pixel[3] > 0) {
            this.firstDrawComplete.set(true);
          }
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('focus', this.onWindowFocus);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || (this.ai.executing() && !this.gameState.spectate())) return;
    this.pointerDown = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.downX = event.clientX;
    this.downY = event.clientY;
    if (this.spaceHeld) {
      this.panning = true;
      this.updateCursor();
    }
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
    if (this.pointerDown && event.button === 0 && !this.panning) {
      const movedX = Math.abs(event.clientX - this.downX);
      const movedY = Math.abs(event.clientY - this.downY);
      if (movedX < CLICK_THRESHOLD && movedY < CLICK_THRESHOLD) {
        this.handleClick(event);
      }
    }
    this.panning = false;
    this.pointerDown = false;
    this.updateCursor();
  }

  protected onPointerLeave(): void {
    this.panning = false;
    this.pointerDown = false;
    this.selection.hoverHex(null);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      event.preventDefault();
      this.spaceHeld = true;
      this.updateCursor();
    }
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spaceHeld = false;
      this.panning = false;
      this.updateCursor();
    }
  }

  private updateCursor(): void {
    const el = this.canvasRef().nativeElement;
    el.style.cursor = this.panning ? 'grabbing' : this.spaceHeld ? 'grab' : '';
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (this.ai.executing() && !this.gameState.spectate()) return;
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * devicePixelRatio;
    const screenY = (event.clientY - rect.top) * devicePixelRatio;
    this.camera.zoomAt(screenX, screenY, event.deltaY);
  }

  protected onDblClick(event: MouseEvent): void {
    if (this.ai.executing() && !this.gameState.spectate()) return;
    const hex = this.screenEventToHex(event as PointerEvent);
    const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
    this.camera.centerOn(x, y);
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  private handleClick(event: PointerEvent): void {
    if (this.swallowNextClick) {
      this.swallowNextClick = false;
      return;
    }
    if (this.animation.inputLocked() || this.ai.executing()) return;

    const hex = this.screenEventToHex(event);
    this.selection.selectHex(hex, event.shiftKey);
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
