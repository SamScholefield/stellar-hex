import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SelectionService } from '../../core/selection/selection.service';
import { CameraService } from '../../core/camera/camera.service';
import { GameStateService } from '../../core/state/game-state.service';
import { ChunkManagerService } from '../../core/chunks/chunk-manager.service';
import { AudioService } from '../../core/audio/audio.service';
import { ActionExecutionService } from '../../core/state/action-execution.service';
import { WaypointService } from '../../core/state/waypoint.service';
import { VisionService } from '../../core/vision/vision.service';
import { HexCoord } from '../../shared/hex/hex-coord.type';
import { HEX_SIZE, hexDistance, hexKey, pixelToHex, toHexCoord } from '../../shared/hex/hex-math';
import { formatName } from '../../shared/pipes/format-name.pipe';
import { buildBlockedSet, getReachableHexes, getUnitCostOverride } from '../../core/pathfinding/hex-pathfinder';

interface PopupOption {
  kind: 'attack' | 'move' | 'select' | 'cancel_waypoint';
  label: string;
  unitId: string;
  targetId?: string;
  target?: HexCoord;
  inRange?: boolean;
}

export interface ClickPopupState {
  screenX: number;
  screenY: number;
  hex: HexCoord;
  options: PopupOption[];
}

@Component({
  selector: 'app-click-popup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'close()',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @if (state(); as s) {
      <div class="dropdown" [style.left.px]="s.screenX" [style.top.px]="s.screenY">
        @for (opt of s.options; track opt.kind + opt.unitId) {
          <button
            class="dropdown-item"
            [class.attack]="opt.kind === 'attack'"
            [class.move]="opt.kind === 'move'"
            [class.cancel]="opt.kind === 'cancel_waypoint'"
            (click)="onOption(opt); $event.stopPropagation()"
          >{{ opt.label }}</button>
        }
      </div>
    }
  `,
})
export class ClickPopupComponent {
  private readonly selection = inject(SelectionService);
  private readonly camera = inject(CameraService);
  private readonly gameState = inject(GameStateService);
  private readonly chunkManager = inject(ChunkManagerService);
  private readonly audio = inject(AudioService);
  private readonly actionExec = inject(ActionExecutionService);
  private readonly waypointSvc = inject(WaypointService);
  private readonly vision = inject(VisionService);

  private readonly _state = signal<ClickPopupState | null>(null);
  readonly state = this._state.asReadonly();
  private openedThisFrame = false;

  open(clientX: number, clientY: number): boolean {
    const rect = document.querySelector('canvas')?.getBoundingClientRect();
    const canvasX = rect ? (clientX - rect.left) * devicePixelRatio : clientX * devicePixelRatio;
    const canvasY = rect ? (clientY - rect.top) * devicePixelRatio : clientY * devicePixelRatio;
    const { x, y } = this.camera.screenToWorld(canvasX, canvasY);
    const hex = pixelToHex(x, y, HEX_SIZE);

    const currentPlayer = this.gameState.currentPlayer();
    if (!currentPlayer) return false;

    const selectedUnitId = this.selection.selectedUnit();
    if (!selectedUnitId) return false;

    const units = this.gameState.units();
    const selectedUnit = units.get(selectedUnitId);
    if (!selectedUnit || selectedUnit.ownerId !== currentPlayer.id) return false;

    const hKey = hexKey(hex.q, hex.r);
    const unitIndex = this.gameState.unitsAtHex();
    const unitsAtHex = unitIndex.get(hKey) ?? [];

    const options: PopupOption[] = [];

    // Waypoint cancel — if the selected unit has a waypoint targeting this hex
    const wp = this.waypointSvc.getWaypoint(selectedUnitId);
    if (wp && wp.target.q === hex.q && wp.target.r === hex.r) {
      options.push({
        kind: 'cancel_waypoint',
        label: 'Cancel Waypoint',
        unitId: selectedUnitId,
      });
    }

    const hasEnemy = unitsAtHex.some(u => u.ownerId !== currentPlayer.id);

    if (hasEnemy) {
      // Enemy present — offer attack option
      const enemy = unitsAtHex.find(u => u.ownerId !== currentPlayer.id)!;
      const visHexes = this.vision.visibleHexes();
      if (visHexes.has(hKey) && selectedUnit.weapon != null && !selectedUnit.hasAttacked) {
        const dist = hexDistance(
          toHexCoord(selectedUnit.q, selectedUnit.r),
          toHexCoord(enemy.q, enemy.r),
        );
        const inRange = dist <= selectedUnit.range;
        options.push({
          kind: 'attack',
          label: inRange ? `Attack ${enemy.name}` : 'Attack Here',
          unitId: selectedUnitId,
          targetId: enemy.id,
          target: hex,
          inRange,
        });
      }
    } else {
      // Check for enemy building at hex
      const buildingIndex = this.gameState.buildingAtHex();
      const buildingAtHex = buildingIndex.get(hKey);
      if (buildingAtHex && buildingAtHex.ownerId !== currentPlayer.id
          && selectedUnit.weapon != null && !selectedUnit.hasAttacked) {
        const visHexes = this.vision.visibleHexes();
        if (visHexes.has(hKey)) {
          const dist = hexDistance(
            toHexCoord(selectedUnit.q, selectedUnit.r),
            toHexCoord(buildingAtHex.q, buildingAtHex.r),
          );
          const inRange = dist <= selectedUnit.range;
          const buildingLabel = formatName(buildingAtHex.type);
          options.push({
            kind: 'attack',
            label: inRange ? `Attack ${buildingLabel}` : 'Attack Here',
            unitId: selectedUnitId,
            targetId: buildingAtHex.id,
            target: hex,
            inRange,
          });
        }
      }
      // Friendly only — offer move + select
      const isSameHex = selectedUnit.q === hex.q && selectedUnit.r === hex.r;

      if (!isSameHex) {
        // Check if hex is in reachable range
        const from: HexCoord = toHexCoord(selectedUnit.q, selectedUnit.r);
        const hexLookup = (q: number, r: number) => this.chunkManager.getHex(q, r);
        const blocked = buildBlockedSet(units, this.gameState.buildings(), currentPlayer.id, selectedUnitId);
        const isBlocked = (q: number, r: number) => blocked.has(hexKey(q, r));
        const override = getUnitCostOverride(selectedUnit.type);
        const reachable = selectedUnit.movementPoints > 0
          ? getReachableHexes(from, selectedUnit.movementPoints, hexLookup, isBlocked, override)
          : new Map<string, number>();
        const inRange = reachable.has(hKey);

        options.push({
          kind: 'move',
          label: inRange ? 'Move Here' : 'Move Here (waypoint)',
          unitId: selectedUnitId,
          target: hex,
          inRange,
        });
      }

      // Select options for each friendly unit at hex
      for (const u of unitsAtHex) {
        if (u.ownerId === currentPlayer.id) {
          options.push({
            kind: 'select',
            label: `Select ${u.name}`,
            unitId: u.id,
          });
        }
      }
    }

    if (options.length === 0) return false;

    this._state.set({ screenX: clientX, screenY: clientY, hex, options });
    this.openedThisFrame = true;
    requestAnimationFrame(() => { this.openedThisFrame = false; });
    return true;
  }

  close(): void {
    if (this.openedThisFrame) return;
    this._state.set(null);
  }

  onOption(opt: PopupOption): void {
    this.close();
    this.audio.playClick();

    switch (opt.kind) {
      case 'attack':
        if (opt.inRange) {
          this.doAttack(opt.unitId, opt.targetId!);
        } else {
          this.waypointSvc.setWaypoint(opt.unitId, opt.target!, opt.targetId);
          this.waypointSvc.executeWaypoint(opt.unitId).then(() => {
            const unit = this.gameState.units().get(opt.unitId);
            if (unit) {
              this.selection.selectUnit(opt.unitId);
            } else {
              this.selection.deselectAll();
            }
          });
        }
        break;

      case 'move':
        if (opt.inRange) {
          this.doMove(opt.unitId, opt.target!);
        } else {
          this.waypointSvc.setWaypoint(opt.unitId, opt.target!);
          this.waypointSvc.executeWaypoint(opt.unitId).then(() => {
            this.selection.selectUnit(opt.unitId);
          });
        }
        break;

      case 'select':
        this.selection.selectUnit(opt.unitId);
        break;

      case 'cancel_waypoint':
        this.waypointSvc.clearWaypoint(opt.unitId);
        break;
    }
  }

  private doAttack(attackerId: string, targetId: string): void {
    this.actionExec.executeAttack(attackerId, targetId);
  }

  private doMove(unitId: string, target: HexCoord): void {
    this.actionExec.executeMove(unitId, target);
  }
}
