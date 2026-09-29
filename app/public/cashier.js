// ============================================================
// cashier.js - Logic hiển thị và thu ngân đơn hàng
// ============================================================
'use strict';

function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
}

function showAlert(msg, type) {
  const box = document.getElementById('alert-box');
  const div = document.createElement('div');
  div.className = 'alert alert-' + type;
  div.textContent = msg;
  box.innerHTML = '';
  box.appendChild(div);
  setTimeout(() => { if (box.contains(div)) box.removeChild(div); }, 3000);
}

async function payOrder(orderId) {
  try {
    const res = await fetch('/api/orders/' + orderId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PAID' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAlert(`Đơn #${orderId} đã thanh toán thành công!`, 'success');
    loadServedOrders();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function loadServedOrders() {
  try {
    const res = await fetch('/api/orders?status=SERVED');
    const orders = await res.json();
    const container = document.getElementById('served-orders');
    container.innerHTML = '';

    if (orders.length === 0) {
      const p = document.createElement('div');
      p.style.color = '#94a3b8';
      p.style.gridColumn = '1 / -1';
      p.style.textAlign = 'center';
      p.style.padding = '3rem 1rem';
      p.style.background = '#ffffff';
      p.style.borderRadius = '16px';
      p.style.border = '1px dashed #cbd5e1';
      p.innerHTML = `
        <div style="font-size:2.5rem;margin-bottom:0.5rem">✨</div>
        <div style="font-weight:600;color:#64748b">Không có đơn chờ thanh toán</div>
        <div style="font-size:0.85rem;margin-top:0.25rem">Tất cả bàn đã hoàn tất thanh toán hoặc đang dùng món</div>
      `;
      container.appendChild(p);
      return;
    }

    orders.forEach(order => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';

      const top = document.createElement('div');
      const header = document.createElement('div');
      header.className = 'flex-between mb-1';
      const title = document.createElement('strong');
      title.style.fontSize = '1.05rem';
      title.textContent = 'Đơn #' + order.id + ' • Bàn ' + order.table_number;
      const badge = document.createElement('span');
      badge.className = 'badge badge-served';
      badge.textContent = 'SERVED';
      header.appendChild(title);
      header.appendChild(badge);
      top.appendChild(header);

      const time = document.createElement('div');
      time.style.fontSize = '0.8rem';
      time.style.color = '#94a3b8';
      time.textContent = '⏱️ ' + new Date(order.created_at).toLocaleTimeString('vi-VN') + ' - ' + new Date(order.created_at).toLocaleDateString('vi-VN');
      top.appendChild(time);
      card.appendChild(top);

      const bottom = document.createElement('div');
      bottom.style.marginTop = '1.5rem';

      const total = document.createElement('div');
      total.style.fontSize = '1.25rem';
      total.style.fontWeight = '800';
      total.style.color = '#ea580c';
      total.style.marginBottom = '0.75rem';
      total.textContent = formatVND(order.total_amount);
      bottom.appendChild(total);

      const btn = document.createElement('button');
      btn.className = 'btn btn-success';
      btn.style.width = '100%';
      btn.textContent = '💳 Thu tiền & Hoàn tất';
      btn.addEventListener('click', () => payOrder(order.id));
      bottom.appendChild(btn);

      card.appendChild(bottom);
      container.appendChild(card);
    });
  } catch (err) {
    showAlert('Lỗi: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadServedOrders();
  setInterval(loadServedOrders, 5000);
});
