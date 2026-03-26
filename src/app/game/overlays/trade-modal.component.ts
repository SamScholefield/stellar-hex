import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../core/state/game-state.service';
import { UndoService } from '../../core/state/undo.service';
import { EventLogService } from '../../core/state/event-log.service';
import { AudioService } from '../../core/audio/audio.service';
import { ResourceKey, TRADE_RATES } from '../../models/game-state';

const RESOURCE_KEYS: ResourceKey[] = ['energy', 'minerals', 'alloys', 'credits'];

@Component({
  selector: 'app-trade-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    @if (visible()) {
      <div class="backdrop" (click)="close()">
        <div class="panel-solid modal" (click)="$event.stopPropagation()">
          <h2>Trade Hub</h2>

          @if (hub(); as h) {
            <div class="stock-row">
              <span class="stock-label">Stock:</span>
              <span class="stock-item">{{ h.stock.energy }} En</span>
              <span class="stock-item">{{ h.stock.minerals }} Mi</span>
              <span class="stock-item">{{ h.stock.alloys }} Al</span>
              <span class="stock-item">{{ h.stock.credits }} Cr</span>
            </div>
          }

          <div class="trade-row">
            <label class="trade-label">
              <span>Sell</span>
              <select [ngModel]="sellResource()" (ngModelChange)="onSellChange($event)">
                @for (r of resourceKeys; track r) {
                  <option [value]="r">{{ formatRes(r) }}</option>
                }
              </select>
            </label>
            <span class="trade-arrow">&rarr;</span>
            <label class="trade-label">
              <span>Buy</span>
              <select [ngModel]="buyResource()" (ngModelChange)="onBuyChange($event)">
                @for (r of buyOptions(); track r) {
                  <option [value]="r">{{ formatRes(r) }}</option>
                }
              </select>
            </label>
          </div>

          <div class="amount-row">
            <label class="amount-label">
              <span>Amount to sell</span>
              <input type="range" [min]="minSell()" [max]="maxSellAmount()" [step]="1"
                     [ngModel]="sellAmount()" (ngModelChange)="sellAmount.set($event)" />
              <span class="amount-value">{{ sellAmount() }}</span>
            </label>
          </div>

          <div class="preview">
            <span class="preview-sell">{{ sellAmount() }} {{ formatRes(sellResource()) }}</span>
            <span class="preview-arrow">&rarr;</span>
            <span class="preview-buy">{{ buyAmount() }} {{ formatRes(buyResource()) }}</span>
            <span class="rate-hint">(rate: {{ rateLabel() }})</span>
          </div>

          <div class="modal-actions">
            <button class="cancel" (click)="close()">Close</button>
            <button class="trade-btn" [disabled]="!canTrade()" (click)="executeTrade()">Trade</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .modal {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.5rem 2rem;
      min-width: 340px;

      h2 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--text-primary, #e0e0e0);
      }
    }
    .stock-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.78rem;
      padding: 0.5rem 0.75rem;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 0.375rem;
    }
    .stock-label {
      color: var(--text-secondary, #9ca3af);
      font-weight: 600;
    }
    .stock-item {
      color: var(--text-primary, #e0e0e0);
      font-variant-numeric: tabular-nums;
    }
    .trade-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .trade-label {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.85rem;
      color: var(--text-secondary, #9ca3af);

      select {
        padding: 0.35rem 0.5rem;
        font-size: 0.85rem;
        color: var(--text-primary, #e0e0e0);
        background: #1f2937;
        border: 1px solid #374151;
        border-radius: 0.375rem;
        outline: none;
      }
      select:focus {
        border-color: var(--accent-teal, #5eead4);
      }
    }
    .trade-arrow {
      font-size: 1.2rem;
      color: var(--text-muted, #6b7280);
      margin-top: 1.2rem;
    }
    .amount-row {
      display: flex;
      flex-direction: column;
    }
    .amount-label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.85rem;
      color: var(--text-secondary, #9ca3af);

      input[type="range"] {
        flex: 1;
        accent-color: var(--accent-teal, #5eead4);
      }
    }
    .amount-value {
      font-variant-numeric: tabular-nums;
      color: var(--text-primary, #e0e0e0);
      min-width: 2.5em;
      text-align: right;
    }
    .preview {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 0.5rem;
      font-size: 0.9rem;
    }
    .preview-sell {
      color: var(--accent-red, #f87171);
      font-weight: 600;
    }
    .preview-arrow {
      color: var(--text-muted, #6b7280);
    }
    .preview-buy {
      color: var(--accent-teal, #5eead4);
      font-weight: 600;
    }
    .rate-hint {
      font-size: 0.72rem;
      color: var(--text-muted, #6b7280);
      margin-left: auto;
    }
    .modal-actions {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .cancel {
      padding: 0.5rem 1.5rem;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-secondary, #9ca3af);
      background: transparent;
      border: 1px solid #4b5563;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .cancel:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .trade-btn {
      padding: 0.5rem 1.5rem;
      font-size: 0.9rem;
      font-weight: 600;
      color: #0a0a1a;
      background: linear-gradient(135deg, #5eead4, #818cf8);
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .trade-btn:hover {
      opacity: 0.85;
    }
    .trade-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `,
})
export class TradeModalComponent {
  private readonly gameState = inject(GameStateService);
  private readonly undo = inject(UndoService);
  private readonly eventLog = inject(EventLogService);
  private readonly audio = inject(AudioService);

  readonly visible = model(false);
  readonly hubId = input<string | null>(null);
  readonly unitId = input<string | null>(null);

  readonly resourceKeys = RESOURCE_KEYS;
  readonly sellResource = signal<ResourceKey>('energy');
  readonly buyResource = signal<ResourceKey>('minerals');
  readonly sellAmount = signal(0);

  readonly hub = computed(() => {
    const id = this.hubId();
    return id ? this.gameState.tradeHubs().get(id) ?? null : null;
  });

  readonly buyOptions = computed(() =>
    RESOURCE_KEYS.filter(r => r !== this.sellResource())
  );

  readonly rate = computed(() => {
    const sell = this.sellResource();
    const buy = this.buyResource();
    return TRADE_RATES[sell]?.[buy] ?? 1;
  });

  readonly rateLabel = computed(() => {
    const r = this.rate();
    if (r >= 1) return `${r}:1`;
    return `1:${Math.round(1 / r)}`;
  });

  readonly maxSellAmount = computed(() => {
    const player = this.gameState.humanPlayer();
    return player?.resources[this.sellResource()] ?? 0;
  });

  readonly minSell = computed(() => {
    const r = this.rate();
    return r >= 1 ? Math.ceil(r) : 1;
  });

  readonly hubStock = computed(() => {
    const h = this.hub();
    const buy = this.buyResource();
    return h ? h.stock[buy] : 0;
  });

  readonly buyAmount = computed(() => {
    const r = this.rate();
    if (r <= 0) return 0;
    const fromRate = Math.floor(this.sellAmount() / r);
    return Math.min(fromRate, this.hubStock());
  });

  readonly canTrade = computed(() => {
    return this.buyAmount() >= 1
      && this.sellAmount() > 0
      && this.sellAmount() <= this.maxSellAmount()
      && this.hubStock() > 0
      && this.hubId() != null
      && this.unitId() != null;
  });

  onSellChange(value: ResourceKey): void {
    this.sellResource.set(value);
    if (this.buyResource() === value) {
      const alt = RESOURCE_KEYS.find(r => r !== value);
      if (alt) this.buyResource.set(alt);
    }
    this.sellAmount.set(0);
  }

  onBuyChange(value: ResourceKey): void {
    this.buyResource.set(value);
    this.sellAmount.set(0);
  }

  formatRes(key: ResourceKey): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  executeTrade(): void {
    const hubId = this.hubId();
    const unitId = this.unitId();
    if (!hubId || !unitId) return;

    this.audio.playClick();
    this.undo.dispatch({
      type: 'TRADE',
      hubId,
      unitId,
      sell: this.sellResource(),
      buy: this.buyResource(),
      sellAmount: this.sellAmount(),
    });

    const sell = this.sellResource();
    const buy = this.buyResource();
    const sellAmt = this.sellAmount();
    const buyAmt = this.buyAmount();
    const turn = this.gameState.turn();
    this.eventLog.push({
      turn,
      message: `Traded ${sellAmt} ${this.formatRes(sell)} for ${buyAmt} ${this.formatRes(buy)}`,
    });

    this.close();
  }

  close(): void {
    this.visible.set(false);
    this.sellAmount.set(0);
  }
}
