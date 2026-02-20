import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
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
import { hexDistance, pixelToHex } from '../../shared/hex/hex-math';
import { findPath, getReachableHexes } from '../../core/pathfinding/hex-pathfinder';
import { VisionService } from '../../core/vision/vision.service';
import { EventLogService } from '../../core/state/event-log.service';
import { attackWithResult } from '../../core/state/game-reducer';
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
  private readonly vision = inject(VisionService);
  private readonly eventLog = inject(EventLogService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gameCanvas');

  private panning = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private resizeObserver: ResizeObserver | null = null;

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
    });

    effect(() => {
      const chunks = this.chunkManager.visibleChunks();
      const hoveredHex = this.selection.hoveredHexCoord();
      const selectedHex = this.selection.selectedHexCoord();
      const selectedUnitId = this.selection.selectedUnit();
      const units = this.gameState.units();
      const players = this.gameState.players();

      const playerColors = new Map<string, string>();
      for (const p of players) {
        playerColors.set(p.id, p.color);
      }

      // Compute movement range and path preview for selected unit
      let reachable: Map<string, number> | null = null;
      let pathPreview: HexCoord[] | null = null;
      if (selectedUnitId) {
        const unit = units.get(selectedUnitId);
        if (unit && unit.movementPoints > 0) {
          const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
          const isBlocked = (q: number, r: number) => {
            for (const u of units.values()) {
              if (u.q === q && u.r === r && u.id !== selectedUnitId) return true;
            }
            return false;
          };
          const from: HexCoord = { q: unit.q, r: unit.r, s: -unit.q - unit.r };
          reachable = getReachableHexes(from, unit.movementPoints, hexLookup, isBlocked);

          if (hoveredHex && reachable.has(`${hoveredHex.q},${hoveredHex.r}`)) {
            pathPreview = findPath(from, hoveredHex, unit.movementPoints, hexLookup, isBlocked);
          }
        }
      }

      // Compute attackable targets when in attack mode
      const attackMode = this.selection.attackMode();
      let attackTargets: Set<string> | null = null;
      if (attackMode && selectedUnitId) {
        const selectedUnit = units.get(selectedUnitId);
        if (selectedUnit && selectedUnit.movementPoints > 0 && selectedUnit.attack > 0) {
          attackTargets = new Set<string>();
          const visHexes = this.vision.visibleHexes();
          for (const unit of units.values()) {
            if (unit.ownerId === selectedUnit.ownerId) continue;
            const unitKey = `${unit.q},${unit.r}`;
            if (!visHexes.has(unitKey)) continue;
            const dist = hexDistance(
              { q: selectedUnit.q, r: selectedUnit.r, s: -selectedUnit.q - selectedUnit.r },
              { q: unit.q, r: unit.r, s: -unit.q - unit.r },
            );
            if (dist <= selectedUnit.range) {
              attackTargets.add(unit.id);
            }
          }
        }
      }

      const activeAnim = this.animation.activeAnimation();
      const combatAnim = this.animation.combatAnimation();
      const visibleHexes = this.vision.visibleHexes();
      const exploredHexes = this.vision.exploredHexes();
      const currentPlayer = this.gameState.currentPlayer();
      const currentPlayerId = currentPlayer?.id ?? null;
      const buildings = this.gameState.buildings();

      const canvas = this.canvasRef().nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.renderer.draw(ctx, this.camera, HEX_SIZE, chunks, hoveredHex, selectedHex, units, playerColors, selectedUnitId, reachable, pathPreview, activeAnim, visibleHexes, exploredHexes, currentPlayerId, buildings, attackTargets, combatAnim);
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
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
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * devicePixelRatio;
    const screenY = (event.clientY - rect.top) * devicePixelRatio;
    this.camera.zoomAt(screenX, screenY, event.deltaY);
  }

  protected onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  private handleClick(event: PointerEvent): void {
    if (this.animation.inputLocked() || this.ai.executing()) return;

    const hex = this.screenEventToHex(event);
    const selectedUnitId = this.selection.selectedUnit();

    // Attack mode handling
    if (this.selection.attackMode() && selectedUnitId) {
      const attacker = this.gameState.units().get(selectedUnitId);
      if (attacker) {
        // Find enemy unit at clicked hex
        let targetId: string | null = null;
        for (const unit of this.gameState.units().values()) {
          if (unit.q === hex.q && unit.r === hex.r && unit.ownerId !== attacker.ownerId) {
            targetId = unit.id;
            break;
          }
        }
        if (targetId) {
          this.executeAttack(selectedUnitId, targetId);
          return;
        }
      }
      // Click on non-target exits attack mode
      this.selection.exitAttackMode();
      return;
    }

    // If a unit is selected, try to move it to the clicked hex
    if (selectedUnitId) {
      const unit = this.gameState.units().get(selectedUnitId);
      if (unit && unit.movementPoints > 0) {
        const from = { q: unit.q, r: unit.r, s: -unit.q - unit.r };
        const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
        const isBlocked = (q: number, r: number) => {
          for (const u of this.gameState.units().values()) {
            if (u.q === q && u.r === r && u.id !== selectedUnitId) return true;
          }
          return false;
        };

        const path = findPath(from, hex, unit.movementPoints, hexLookup, isBlocked);
        if (path && path.length > 1) {
          this.animation.animateUnitMovement(selectedUnitId, path).then(() => {
            this.gameState.dispatch({ type: 'MOVE_UNIT', unitId: selectedUnitId, path });
            this.selection.selectUnit(selectedUnitId);
          });
          return;
        }
      }
    }

    this.selection.selectHex(hex);
  }

  private executeAttack(attackerId: string, targetId: string): void {
    const state = this.gameState.getState();
    const { combat } = attackWithResult(state, attackerId, targetId);
    if (!combat) return;

    const attacker = state.units.get(attackerId)!;
    const defender = state.units.get(targetId)!;

    this.animation.animateCombat(attackerId, targetId).then(() => {
      this.gameState.dispatch({ type: 'ATTACK', attackerId, targetId });

      // Log combat result
      const turn = this.gameState.turn();
      const msg = `${attacker.type} attacked ${defender.type}: dealt ${combat.defenderDamage} dmg, took ${combat.attackerDamage} dmg`
        + (combat.defenderDestroyed ? ` — ${defender.type} destroyed!` : '')
        + (combat.attackerDestroyed ? ` — ${attacker.type} destroyed!` : '');
      this.eventLog.push({ turn, message: msg, q: defender.q, r: defender.r });

      this.selection.exitAttackMode();

      // Keep attacker selected if it survived
      if (!combat.attackerDestroyed) {
        this.selection.selectUnit(attackerId);
      } else {
        this.selection.deselectAll();
      }
    });
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
