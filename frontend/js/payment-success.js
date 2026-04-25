(() => {
  const statusEl = document.getElementById('statusText');
  const detailEl = document.getElementById('detailText');

  function setStatus(text, detail) {
    if (statusEl) statusEl.textContent = text;
    if (detailEl) detailEl.textContent = detail;
  }

  async function pollOrder(orderId, maxTries = 8) {
    for (let i = 0; i < maxTries; i += 1) {
      const response = await window.csrfFetch(`/api/orders/${encodeURIComponent(orderId)}/status`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'PAID') return data;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return null;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    const mock = params.get('mock');
    if (!orderId) {
      setStatus('Missing order ID', 'Unable to verify payment without an order ID.');
      return;
    }

    try {
      if (mock === '1') {
        await window.csrfFetch(`/api/payments/mock/complete/${encodeURIComponent(orderId)}`, { method: 'POST' });
      }
      const order = await pollOrder(orderId);
      if (order && order.status === 'PAID') {
        setStatus('Payment successful', `Order #${order.order_id} has been paid.`);
      } else {
        setStatus('Payment pending', `Order #${orderId} is still being processed.`);
      }
    } catch (err) {
      setStatus('Verification failed', err.message || 'Unable to confirm payment status.');
    }
  });
})();
