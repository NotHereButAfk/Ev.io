const SHOP_ITEMS = [
  { id: 'health_sm', label: 'Health Pack',  desc: '+50 HP',            price: 50,  icon: '❤️'  },
  { id: 'health_lg', label: 'Full Restore', desc: 'Full HP restored',  price: 100, icon: '💊'  },
  { id: 'ammo',      label: 'Ammo Crate',   desc: 'Refill all ammo',   price: 75,  icon: '🎯'  },
  { id: 'armor',     label: 'Armor Repair', desc: 'Restore shield',    price: 80,  icon: '🛡️'  },
  { id: 'frags',     label: 'Frags ×2',     desc: '+2 frag grenades',  price: 60,  icon: '💣'  },
  { id: 'smokes',    label: 'Smokes ×2',    desc: '+2 smoke grenades', price: 40,  icon: '💨'  },
  { id: 'speed',     label: 'Speed Boost',  desc: '30s × 1.4 speed',  price: 120, icon: '⚡'  },
];

export class InGameShop {
  constructor() {
    this.el      = document.getElementById('ingame-shop');
    this.coinsEl = document.getElementById('igs-coins');
    this.gridEl  = document.getElementById('igs-grid');
    this.isOpen  = false;
    this.onBuy   = null; // (itemId: string) => void
  }

  show(coins) {
    this.isOpen = true;
    this.el?.classList.remove('hidden');
    this._render(coins);
  }

  hide() {
    this.isOpen = false;
    this.el?.classList.add('hidden');
  }

  refresh(coins) {
    if (this.isOpen) this._render(coins);
  }

  _render(coins) {
    if (this.coinsEl) this.coinsEl.textContent = coins;
    if (!this.gridEl) return;
    this.gridEl.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const canAfford = coins >= item.price;
      const card = document.createElement('div');
      card.className = 'igs-card' + (canAfford ? '' : ' igs-poor');
      card.innerHTML = `
        <div class="igs-icon">${item.icon}</div>
        <div class="igs-name">${item.label}</div>
        <div class="igs-desc">${item.desc}</div>
        <div class="igs-price">💰 ${item.price}</div>
      `;
      if (canAfford) {
        card.addEventListener('click', () => this.onBuy?.(item.id));
      }
      this.gridEl.appendChild(card);
    }
  }
}
