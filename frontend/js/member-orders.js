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
      root.innerHTML = '<div class="empty-state">📭 No recent orders.</div>';
      return;
    }

    root.innerHTML = orders.map(order => {
      const total = (Number(order.total_amount || 0) / 100).toFixed(2);
      const items = (order.items || []).map(i =>
        `<div class="member-order-item">pid=${i.pid} | ${escapeHtml(i.product_name || 'Unknown')} | qty=${i.quantity} | unit=$${(Number(i.unit_price || 0) / 100).toFixed(2)}</div>`
      ).join('');
      return `
        <div class="item-card member-order-card">
          <div class="member-order-top">
            <div class="item-title">Order #${order.order_id}</div>
            <span class="member-order-status">${escapeHtml(order.status || '')}</span>
          </div>
          <div class="member-order-meta">
            <span>Created: ${escapeHtml(order.created_at || '')}</span>
            <span>Total: $${total}</span>
            <span>Currency: ${escapeHtml(order.currency || '')}</span>
          </div>
          <div class="member-order-items">${items || '<div class="member-order-item">No items</div>'}</div>
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
      root.innerHTML = `<div class="empty-state">❌ Failed to load orders: ${escapeHtml(err.message || 'Unknown error')}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', loadRecentOrders);
})();
