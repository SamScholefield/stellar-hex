import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameInitService } from '../core/state/game-init.service';

@Component({
  selector: 'app-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="menu-container">
      <h1>Stellar Hex</h1>
      <p class="subtitle">A hex-based real-time strategy game</p>
      <div class="form">
        <label>
          <span>Player Name</span>
          <input [(ngModel)]="playerName" placeholder="Commander" />
        </label>
        <label>
          <span>AI Opponents</span>
          <select [(ngModel)]="aiOpponents">
            <option [ngValue]="1">1</option>
            <option [ngValue]="2">2</option>
            <option [ngValue]="3">3</option>
            <option [ngValue]="4">4</option>
            <option [ngValue]="5">5</option>
          </select>
        </label>
      </div>
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
      margin-bottom: 2rem;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      font-size: 0.9rem;
      color: #9ca3af;
    }
    input, select {
      padding: 0.4rem 0.75rem;
      font-size: 0.9rem;
      color: #e0e0e0;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 0.375rem;
      outline: none;
      width: 160px;
    }
    input:focus, select:focus {
      border-color: #5eead4;
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
  private readonly gameInit = inject(GameInitService);

  playerName = 'Commander';
  aiOpponents = 1;

  startGame(): void {
    this.gameInit.newGame({
      playerName: this.playerName || 'Commander',
      aiOpponents: this.aiOpponents,
    });
  }
}
