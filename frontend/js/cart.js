// shopping cart

(function () {
  const API_BASE = '/api';
  const STORAGE_KEY = 'shopping_cart_v1';

  function toInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  }

  class Cart {
    constructor() {
      this.items = new Map(); // pid(string) -> qty(number)
      this.productCache = new Map(); // pid(string) -> { name, price }
      this.inFlight = new Map(); // pid(string) -> Promise

      this.cartItemsEl = null;
      this.totalEl = null;
      this.cartPanelEl = null;
      this.hideTimer = null;
      this.cartWrapperEl = null;
      this.autoHideMs = 3000;
    }

    init() {
      this.cartItemsEl = document.querySelector('.cart-items');
      this.totalEl = document.querySelector('.cart-toralprice');
      this.cartPanelEl = document.querySelector('.shopping-cart');
      this.cartWrapperEl = document.querySelector('.cart-wrapper');

      this.loadFromStorage();
      this.bindCartUI();
      this.bindCartHoverAutoHide();
      this.bindAddToCartButtons();
      this.render();
    }

    bindCartHoverAutoHide() {
      if (!this.cartPanelEl || !this.cartWrapperEl) return;

      // When hovering the cart wrapper/trigger, start a 3s timer.
      this.cartWrapperEl.addEventListener('mouseenter', () => {
        this.cartPanelEl.style.display = 'block';
        this.scheduleAutoHide();
      });

      this.cartWrapperEl.addEventListener('mouseleave', () => {
        this.clearAutoHide();
        this.cartPanelEl.style.display = '';
      });

      // If user is hovering the panel itself, keep it open.
      this.cartPanelEl.addEventListener('mouseenter', () => {
        this.clearAutoHide();
      });

      // When leaving the panel, start the timer again.
      this.cartPanelEl.addEventListener('mouseleave', () => {
        this.scheduleAutoHide();
      });
    }

    scheduleAutoHide() {
      if (!this.cartPanelEl) return;
      this.clearAutoHide();
      this.hideTimer = setTimeout(() => {
        // After 3s, if mouse is NOT hovering the cart panel, hide it.
        if (!this.cartPanelEl.matches(':hover')) {
          this.cartPanelEl.style.display = 'none';
        }
      }, this.autoHideMs);
    }

    clearAutoHide() {
      if (this.hideTimer) {
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
      }
    }

    bindAddToCartButtons() {
      // Home page: buttons rendered with data-pid
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-to-cart-btn[data-pid]');
        if (!btn) return;

        const pid = btn.dataset.pid;
        if (!pid) return;

        e.preventDefault();
        this.add(pid, 1);
      });
    }

    bindCartUI() {
      if (!this.cartItemsEl) return;

      this.cartItemsEl.addEventListener('input', (e) => {
        const input = e.target.closest('.cart-quantity');
        if (!input) return;

        const row = input.closest('.cart-item');
        const pid = row?.dataset?.pid;
        if (!pid) return;

        const qty = toInt(input.value, 1);
        if (qty < 1) return;
        this.setQuantity(pid, qty);
      });

      // Remove
      this.cartItemsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.trashbin');
        if (!btn) return;

        const row = btn.closest('.cart-item');
        const pid = row?.dataset?.pid;
        if (!pid) return;

        e.preventDefault();
        this.remove(pid);
      });

      document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.cart-checkout-btn');
        if (!btn) return;
        e.preventDefault();
        await this.checkout(btn);
      });
    }

    loadFromStorage() {
      this.items.clear();
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;

        const items = data.items;
        if (!items || typeof items !== 'object') return;

        Object.entries(items).forEach(([pid, qty]) => {
          const q = toInt(qty, 0);
          if (pid && q > 0) this.items.set(String(pid), q);
        });
      } catch {
      }
    }

    saveToStorage() {
      const obj = {};
      this.items.forEach((qty, pid) => {
        obj[pid] = qty;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: obj }));
    }

    add(pid, qty) {
      const id = String(pid);
      const q = toInt(qty, 1);
      const current = this.items.get(id) || 0;
      this.items.set(id, current + (q > 0 ? q : 1));
      this.saveToStorage();
      this.render();
      this.showCartPanel();
    }

    setQuantity(pid, qty) {
      const id = String(pid);
      const q = toInt(qty, 1);
      if (q < 1) return;
      this.items.set(id, q);
      this.saveToStorage();
      this.render();
    }

    remove(pid) {
      const id = String(pid);
      this.items.delete(id);
      this.saveToStorage();
      this.render();
    }

    clear() {
      this.items.clear();
      this.saveToStorage();
      this.render();
    }

    getCheckoutPayloadItems() {
      return Array.from(this.items.entries()).map(([pid, quantity]) => ({
        pid: Number(pid),
        quantity: Number(quantity)
      }));
    }

    async checkout(buttonEl) {
      if (this.items.size === 0) {
        alert('Your cart is empty.');
        return;
      }
      if (!window.csrfFetch) {
        alert('Checkout is unavailable: csrfFetch not loaded.');
        return;
      }

      const oldText = buttonEl ? buttonEl.textContent : '';
      if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = 'Processing...';
      }

      try {
        const response = await window.csrfFetch('/api/checkout/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currency: 'HKD',
            items: this.getCheckoutPayloadItems()
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Checkout failed');

        this.clear();
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        alert('Checkout created but no payment URL returned.');
      } catch (err) {
        alert(err.message || 'Checkout failed');
      } finally {
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.textContent = oldText;
        }
      }
    }

    async getProduct(pid) {
      const id = String(pid);
      if (this.productCache.has(id)) return this.productCache.get(id);
      if (this.inFlight.has(id)) return this.inFlight.get(id);

      const p = (async () => {
        const res = await fetch(`${API_BASE}/products/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const product = await res.json();
        const name = product?.name ? String(product.name) : `#${id}`;
        const price = Number(product?.price ?? 0);
        const info = { name, price: Number.isFinite(price) ? price : 0 };
        this.productCache.set(id, info);
        return info;
      })();

      this.inFlight.set(id, p);
      try {
        return await p;
      } finally {
        this.inFlight.delete(id);
      }
    }

    formatMoney(amount) {
      const n = Number(amount);
      if (!Number.isFinite(n)) return '$0.00';
      return `$${n.toFixed(2)}`;
    }

    async render() {
      if (!this.cartItemsEl || !this.totalEl) return;

      // Empty state
      if (this.items.size === 0) {
        this.cartItemsEl.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
        this.totalEl.textContent = this.formatMoney(0);
        return;
      }

      // Render rows quickly with placeholders
      const rows = [];
      this.items.forEach((qty, pid) => {
        const cached = this.productCache.get(pid);
        const name = cached?.name || 'Loading...';
        const price = cached?.price ?? null;
        const lineTotal = price === null ? '' : this.formatMoney(price * qty);

        rows.push(`
          <div class="cart-item" data-pid="${pid}">
            <span class="cart-item-name">${escapeHtml(name)}</span>
            <input type="number" class="cart-quantity" min="1" value="${qty}">
            <span class="cart-item-price">${lineTotal || ''}</span>
            <button class="trashbin" aria-label="Remove">×</button>
          </div>
        `);
      });
      this.cartItemsEl.innerHTML = rows.join('');

      // Hydrate product info (name/price) and update totals
      await Promise.all(
        Array.from(this.items.keys()).map(async (pid) => {
          try {
            await this.getProduct(pid);
          } catch {
          }
        })
      );

      this.renderTotalsOnly();
      this.updateRowLabels();
    }

    updateRowLabels() {
      if (!this.cartItemsEl) return;
      const rows = this.cartItemsEl.querySelectorAll('.cart-item');
      rows.forEach((row) => {
        const pid = row.dataset.pid;
        const qty = this.items.get(pid) || 1;
        const cached = this.productCache.get(pid);
        if (!cached) return;

        const nameEl = row.querySelector('.cart-item-name');
        const priceEl = row.querySelector('.cart-item-price');
        if (nameEl) nameEl.textContent = cached.name;
        if (priceEl) priceEl.textContent = this.formatMoney(cached.price * qty);
      });
    }

    renderTotalsOnly() {
      let total = 0;
      this.items.forEach((qty, pid) => {
        const cached = this.productCache.get(pid);
        if (!cached) return;
        total += cached.price * qty;
      });
      this.totalEl.textContent = this.formatMoney(total);
    }

    // Briefly show the cart panel so user can see the item was added
    showCartPanel() {
      if (!this.cartPanelEl) return;

      this.cartPanelEl.style.display = 'block';

      this.scheduleAutoHide();
    }
  }


  // Escape HTML characters to prevent XSS attacks
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.cart = new Cart();
  document.addEventListener('DOMContentLoaded', () => window.cart.init());
})();

