(() => {
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderOrders(orders) {
    const root = document.getElementById('memberOrders');
    if (!root) return;
    if (!orders || orders.length === 0) {
      root.innerHTML = '<p>No recent orders.</p>';
      return;
    }

    root.innerHTML = orders.map(order => {
      const total = (Number(order.total_amount || 0) / 100).toFixed(2);
      const items = (order.items || []).map(i =>
        `<div class="item">pid=${i.pid} | ${escapeHtml(i.product_name || 'Unknown')} | qty=${i.quantity} | unit=$${(Number(i.unit_price || 0) / 100).toFixed(2)}</div>`
      ).join('');
      return `
        <div class="order">
          <div class="order-title">Order #${order.order_id} - ${escapeHtml(order.status || '')}</div>
          <div class="muted">Created: ${escapeHtml(order.created_at || '')} | Total: $${total}</div>
          <div>${items}</div>
        </div>
      `;
    }).join('');
  }

  async function loadRecentOrders() {
    const root = document.getElementById('memberOrders');
    if (!root) return;
    try {
      const response = await fetch('/api/orders/member/recent?limit=5');
      if (response.status === 401 || response.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const orders = await response.json();
      renderOrders(orders);
    } catch (err) {
      root.innerHTML = `<p>Failed to load orders: ${escapeHtml(err.message || 'Unknown error')}</p>`;
    }
  }

  document.addEventListener('DOMContentLoaded', loadRecentOrders);
})();
