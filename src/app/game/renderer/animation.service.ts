import { Injectable, signal } from '@angular/core';
import { HexCoord } from '../../shared/hex/hex-coord.type';

export interface UnitAnimation {
  unitId: string;
  path: HexCoord[];
  currentStep: number;
  /** 0..1 interpolation within current step */
  t: number;
}

@Injectable({ providedIn: 'root' })
export class AnimationService {
  private readonly _activeAnimation = signal<UnitAnimation | null>(null);
  private readonly _inputLocked = signal(false);
  private animFrameId = 0;

  readonly activeAnimation = this._activeAnimation.asReadonly();
  readonly inputLocked = this._inputLocked.asReadonly();

  animateUnitMovement(unitId: string, path: HexCoord[]): Promise<void> {
    if (path.length < 2) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this._inputLocked.set(true);

      const stepDuration = 150; // ms per hex
      const animation: UnitAnimation = { unitId, path, currentStep: 0, t: 0 };
      this._activeAnimation.set(animation);

      let startTime = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / stepDuration, 1);

        const updated: UnitAnimation = { ...animation, currentStep: animation.currentStep, t };
        this._activeAnimation.set(updated);

        if (t >= 1) {
          animation.currentStep++;
          if (animation.currentStep >= path.length - 1) {
            // Animation complete
            this._activeAnimation.set(null);
            this._inputLocked.set(false);
            resolve();
            return;
          }
          startTime = now;
          animation.t = 0;
        }

        this.animFrameId = requestAnimationFrame(tick);
      };

      this.animFrameId = requestAnimationFrame(tick);
    });
  }

  cancel(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    this._activeAnimation.set(null);
    this._inputLocked.set(false);
  }
}
