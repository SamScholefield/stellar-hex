import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameInitService } from '../core/state/game-init.service';
import { AudioService } from '../core/audio/audio.service';
import { GameSaveService, SaveEntry } from '../core/state/game-save.service';

@Component({
  selector: 'app-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="layout">
      <div class="column start-column">
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
        <button class="primary" (click)="startGame()">New Game</button>
      </div>

      <div class="column saves-column">
        <h2>Saved Games</h2>
        @if (saveSvc.saves().length === 0) {
          <p class="no-saves">No saved games found.</p>
        } @else {
          <table class="saves-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Turn</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (entry of saveSvc.saves(); track entry.key) {
                <tr>
                  <td>{{ entry.playerName }}</td>
                  <td>{{ entry.turn }}</td>
                  <td class="date-cell">{{ entry.savedAt ? (entry.savedAt | date:'short') : '—' }}</td>
                  <td class="actions-cell">
                    <button class="btn-load" (click)="loadSave(entry)">Load</button>
                    <button class="btn-delete" (click)="deleteSave(entry)">Delete</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
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
    .layout {
      display: flex;
      gap: 4rem;
      align-items: flex-start;
      padding: 2rem;
    }
    .column {
      min-width: 280px;
    }
    .start-column {
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
    .primary {
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
    .primary:hover {
      opacity: 0.85;
    }

    /* Saves column */
    .saves-column {
      min-width: 380px;
    }
    h2 {
      font-size: 1.4rem;
      font-weight: 600;
      color: #e0e0e0;
      margin-bottom: 1rem;
    }
    .no-saves {
      color: #6b7280;
      font-size: 0.9rem;
    }
    .saves-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .saves-table th {
      text-align: left;
      color: #6b7280;
      font-weight: 500;
      padding: 0.4rem 0.5rem;
      border-bottom: 1px solid #374151;
    }
    .saves-table td {
      padding: 0.5rem 0.5rem;
      color: #d1d5db;
      border-bottom: 1px solid #1f2937;
    }
    .date-cell {
      color: #9ca3af;
      font-size: 0.8rem;
    }
    .actions-cell {
      display: flex;
      gap: 0.4rem;
    }
    .btn-load, .btn-delete {
      padding: 0.25rem 0.6rem;
      font-size: 0.78rem;
      border-radius: 0.25rem;
      cursor: pointer;
      border: 1px solid;
      background: transparent;
      transition: opacity 0.2s;
    }
    .btn-load {
      color: #5eead4;
      border-color: #5eead4;
    }
    .btn-load:hover {
      background: rgba(94, 234, 212, 0.1);
    }
    .btn-delete {
      color: #6b7280;
      border-color: #4b5563;
    }
    .btn-delete:hover {
      color: #f87171;
      border-color: #f87171;
    }
  `,
})
export class MenuComponent {
  private readonly gameInit = inject(GameInitService);
  private readonly audio = inject(AudioService);
  protected readonly saveSvc = inject(GameSaveService);

  playerName = localStorage.getItem('stellar-hex-player-name') ?? 'Commander';
  aiOpponents = 1;

  async startGame(): Promise<void> {
    const name = this.playerName || 'Commander';
    localStorage.setItem('stellar-hex-player-name', name);
    await this.audio.ensureContext();
    this.gameInit.newGame({
      playerName: name,
      aiOpponents: this.aiOpponents,
    });
  }

  async loadSave(entry: SaveEntry): Promise<void> {
    await this.audio.ensureContext();
    this.saveSvc.loadFromKey(entry.key);
  }

  deleteSave(entry: SaveEntry): void {
    this.saveSvc.deleteKey(entry.key);
  }
}
