import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu-container">
      <h1>Stellar Hex</h1>
      <p class="subtitle">A hex-based real-time strategy game</p>
      <button (click)="startGame()">Start Game</button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100vw;
      height: 100vh;
      background: radial-gradient(ellipse at center, #0f1a2e 0%, #0a0a1a 70%);
    }
    .menu-container {
      text-align: center;
    }
    h1 {
      font-size: 3.5rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      background: linear-gradient(135deg, #5eead4, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      font-size: 1rem;
      color: #6b7280;
      margin-bottom: 2.5rem;
    }
    button {
      padding: 0.75rem 2.5rem;
      font-size: 1.1rem;
      font-weight: 600;
      color: #0a0a1a;
      background: linear-gradient(135deg, #5eead4, #818cf8);
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.85;
    }
  `,
})
export class MenuComponent {
  private readonly router = inject(Router);

  startGame(): void {
    this.router.navigate(['/game']);
  }
}
