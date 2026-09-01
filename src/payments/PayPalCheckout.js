import { Shop } from '../core/Shop.js';
import { Armory } from '../core/Armory.js';

const TERMS_VERSION = '2026-08-31';
let sdkPromise = null;
let checkoutGeneration = 0;

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.err || `Checkout request failed (${response.status})`);
  }
  return result;
}

function loadSdk(clientId, clientToken) {
  if (window.paypal?.Buttons && window.paypal?.CardFields) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // Sandbox/live routing is determined by the REST app represented by the
    // client ID. PayPal serves both environments from the same SDK host.
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&commit=true&components=buttons,card-fields&enable-funding=card`;
    script.dataset.clientToken = clientToken;
    script.dataset.namespace = 'paypal';
    script.onload = () => window.paypal?.Buttons
      ? resolve(window.paypal)
      : reject(new Error('PayPal checkout did not initialize'));
    script.onerror = () => reject(new Error('Secure payment options could not be loaded'));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function openPayPalCheckout({ skinId, name, kind, price, onComplete }) {
  const generation = ++checkoutGeneration;
  const modal = document.getElementById('checkout-modal');
  const options = document.getElementById('checkout-payment-options');
  const mount = document.getElementById('paypal-buttons');
  const cardForm = document.getElementById('paypal-card-form');
  const cardDivider = document.getElementById('checkout-or');
  const cardSubmit = document.getElementById('paypal-card-submit');
  const status = document.getElementById('checkout-status');
  const checkbox = document.getElementById('checkout-terms-checkbox');
  const continueButton = document.getElementById('checkout-continue');
  const item = document.getElementById('checkout-item');
  if (!modal || !options || !mount || !status || !checkbox || !continueButton || !item) return;

  item.textContent = `${name} · $${price.toFixed(2)} USD`;
  mount.innerHTML = '';
  for (const id of ['paypal-card-name', 'paypal-card-number', 'paypal-card-expiry', 'paypal-card-cvv']) {
    const field = document.getElementById(id);
    if (field) field.innerHTML = '';
  }
  options.classList.add('hidden');
  cardForm?.classList.add('hidden');
  cardDivider?.classList.add('hidden');
  checkbox.checked = false;
  continueButton.disabled = true;
  continueButton.classList.remove('hidden');
  status.textContent = 'Review and accept the purchase terms to continue.';
  modal.classList.remove('hidden');

  checkbox.onchange = () => { continueButton.disabled = !checkbox.checked; };
  continueButton.onclick = async () => {
    if (!checkbox.checked || generation !== checkoutGeneration) return;
    continueButton.disabled = true;
    status.textContent = 'Loading secure payment options…';
    try {
      const settings = await jsonRequest('/api/store/config');
      if (!settings.configured) throw new Error('Checkout is not live yet: PayPal merchant credentials are missing.');
      const token = await jsonRequest('/api/store/client-token', { method: 'POST' });
      const paypal = await loadSdk(settings.clientId, token.clientToken);
      if (generation !== checkoutGeneration) return;

      const createOrder = async () => {
        status.textContent = 'Creating secure order…';
        const result = await jsonRequest('/api/store/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skinId, termsAccepted: true, termsVersion: TERMS_VERSION }),
        });
        return result.orderId;
      };
      const approve = async ({ orderID }) => {
        status.textContent = 'Confirming payment…';
        if (cardSubmit) cardSubmit.disabled = true;
        const result = await jsonRequest(`/api/store/orders/${encodeURIComponent(orderID)}/capture`, { method: 'POST' });
        if (kind === 'character') Shop.unlock(result.skinId);
        else Armory.grantSkin(result.skinId);
        status.textContent = 'PURCHASE COMPLETE — ADDED TO INVENTORY';
        onComplete?.(result);
      };
      const fail = (error) => {
        status.textContent = error?.message || 'Checkout could not be completed.';
        if (cardSubmit) cardSubmit.disabled = false;
      };

      const buttons = paypal.Buttons({
        style: { layout: 'vertical', shape: 'rect', label: 'paypal', height: 45 },
        createOrder,
        onApprove: approve,
        onCancel: () => { status.textContent = 'Checkout canceled. You were not charged.'; },
        onError: fail,
      });
      if (buttons.isEligible()) await buttons.render('#paypal-buttons');

      const fields = paypal.CardFields({ createOrder, onApprove: approve, onError: fail });
      const cardEligible = fields.isEligible();
      if (cardEligible && cardForm && cardDivider && cardSubmit) {
        await Promise.all([
          fields.NameField({ placeholder: 'Name on card' }).render('#paypal-card-name'),
          fields.NumberField({ placeholder: 'Card number' }).render('#paypal-card-number'),
          fields.ExpiryField({ placeholder: 'MM / YY' }).render('#paypal-card-expiry'),
          fields.CVVField({ placeholder: 'CVV' }).render('#paypal-card-cvv'),
        ]);
        cardForm.classList.remove('hidden');
        cardDivider.classList.remove('hidden');
        cardSubmit.onclick = async () => {
          cardSubmit.disabled = true;
          status.textContent = 'Authorizing card…';
          try { await fields.submit(); } catch (error) { fail(error); }
        };
      }

      options.classList.remove('hidden');
      continueButton.classList.add('hidden');
      status.textContent = cardEligible
        ? 'Choose PayPal or enter a debit/credit card.'
        : 'Choose an available PayPal payment method.';
    } catch (error) {
      status.textContent = error.message;
      continueButton.disabled = false;
    }
  };
}

document.getElementById('checkout-close')?.addEventListener('click', () => {
  checkoutGeneration++;
  document.getElementById('checkout-modal')?.classList.add('hidden');
});
