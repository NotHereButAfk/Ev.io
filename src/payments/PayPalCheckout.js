import { Shop } from '../core/Shop.js';
import { Armory } from '../core/Armory.js';

let sdkPromise = null;
async function config() {
  const response = await fetch('/api/store/config', { credentials: 'same-origin' });
  return response.json();
}
function loadSdk(clientId, environment) {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const host = environment === 'sandbox' ? 'https://www.sandbox.paypal.com' : 'https://www.paypal.com';
    script.src = `${host}/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons&enable-funding=card`;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error('PayPal checkout failed to load'));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function openPayPalCheckout({ skinId, name, kind, price, onComplete }) {
  const modal = document.getElementById('checkout-modal');
  const mount = document.getElementById('paypal-buttons');
  const status = document.getElementById('checkout-status');
  document.getElementById('checkout-item').textContent = `${name} · $${price.toFixed(2)} USD`;
  mount.innerHTML = '';
  status.textContent = 'Loading secure payment options…';
  modal.classList.remove('hidden');
  try {
    const settings = await config();
    if (!settings.configured) throw new Error('Checkout is awaiting PayPal merchant configuration');
    const paypal = await loadSdk(settings.clientId, settings.environment);
    status.textContent = '';
    await paypal.Buttons({
      style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
      createOrder: async () => {
        const response = await fetch('/api/store/orders', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skinId }) });
        const result = await response.json();
        if (!result.ok) throw new Error(result.err || 'Unable to create order');
        return result.orderId;
      },
      onApprove: async ({ orderID }) => {
        status.textContent = 'Confirming payment…';
        const response = await fetch(`/api/store/orders/${encodeURIComponent(orderID)}/capture`, { method: 'POST', credentials: 'same-origin' });
        const result = await response.json();
        if (!result.ok) throw new Error(result.err || 'Payment capture failed');
        if (kind === 'character') Shop.unlock(result.skinId); else Armory.grantSkin(result.skinId);
        status.textContent = 'PURCHASE COMPLETE — ADDED TO INVENTORY';
        onComplete?.(result);
      },
      onCancel: () => { status.textContent = 'Checkout canceled. You were not charged.'; },
      onError: (error) => { status.textContent = error?.message || 'Checkout could not be completed.'; },
    }).render('#paypal-buttons');
  } catch (error) { status.textContent = error.message; }
}

document.getElementById('checkout-close')?.addEventListener('click', () => document.getElementById('checkout-modal')?.classList.add('hidden'));
