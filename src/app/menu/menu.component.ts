import { afterNextRender, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameInitService } from '../core/state/game-init.service';
import { AudioService } from '../core/audio/audio.service';
import { GameSaveService, SaveEntry } from '../core/state/game-save.service';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss',
})
export class MenuComponent {
  private readonly gameInit = inject(GameInitService);
  private readonly audio = inject(AudioService);
  private readonly router = inject(Router);
  protected readonly saveSvc = inject(GameSaveService);
  private readonly auth = inject(AuthService);
  readonly showNewGameModal = signal(false);

  constructor() {
    afterNextRender(() => {
      const loader = document.getElementById('app-loader');
      if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 300);
      }
    });
  }
  playerName = localStorage.getItem('stellar-hex-player-name') ?? 'Commander';
  aiOpponents = 1;

  openNewGameModal(): void {
    this.showNewGameModal.set(true);
  }

  closeModal(): void {
    this.showNewGameModal.set(false);
  }

  async confirmNewGame(): Promise<void> {
    const name = this.playerName || 'Commander';
    localStorage.setItem('stellar-hex-player-name', name);
    await this.audio.ensureContext();
    this.gameInit.newGame({
      playerName: name,
      aiOpponents: this.aiOpponents,
    });
  }

  async startSpectate(): Promise<void> {
    await this.audio.ensureContext();
    this.gameInit.newGame({
      playerName: 'Spectator',
      aiOpponents: this.aiOpponents,
      spectate: true,
    });
  }

  async continueSave(): Promise<void> {
    const latest = this.saveSvc.latestSave();
    if (!latest) return;
    await this.audio.ensureContext();
    this.saveSvc.loadFromKey(latest.key);
  }

  async loadSave(entry: SaveEntry): Promise<void> {
    await this.audio.ensureContext();
    this.saveSvc.loadFromKey(entry.key);
  }

  logout(): void {
    this.auth.logout();
  }

  deleteSave(entry: SaveEntry): void {
    this.saveSvc.deleteKey(entry.key);
  }

  openGuide(): void {
    this.router.navigate(['/guide']);
  }
}
