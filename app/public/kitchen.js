// ============================================================
// kitchen.js - Logic hiển thị và điều phối đơn hàng trong Bếp
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

// Tải chi tiết đơn hàng (kèm danh sách món)
async function fetchOrderDetail(orderId) {
  const res = await fetch('/api/orders/' + orderId);
  if (!res.ok) throw new Error('Lỗi tải đơn');
  return res.json();
}

// Chuyển trạng thái đơn
async function updateStatus(orderId, newStatus) {
  try {
    const res = await fetch('/api/orders/' + orderId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAlert(`Đơn #${orderId} → ${newStatus}`, 'success');
    loadOrders();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

// Render 1 đơn hàng (dạng vé KDS)
function renderOrder(order, nextStatus, btnLabel, btnClass) {
  const card = document.createElement('div');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'flex-between mb-1';
  const title = document.createElement('strong');
  title.style.fontSize = '1.05rem';
  title.textContent = 'Đơn #' + order.id + ' • Bàn ' + order.table_number;
  const badge = document.createElement('span');
  badge.className = 'badge badge-' + order.status.toLowerCase();
  badge.textContent = order.status;
  header.appendChild(title);
  header.appendChild(badge);
  card.appendChild(header);

  // Thời gian tạo
  const time = document.createElement('div');
  time.style.fontSize = '0.8rem';
  time.style.color = '#94a3b8';
  time.style.marginBottom = '0.5rem';
  time.textContent = '⏱️ ' + new Date(order.created_at).toLocaleTimeString('vi-VN') + ' - ' + new Date(order.created_at).toLocaleDateString('vi-VN');
  card.appendChild(time);

  // Danh sách món (sẽ load async)
  const itemsList = document.createElement('div');
  itemsList.className = 'order-items-list';
  itemsList.textContent = 'Đang tải chi tiết...';
  card.appendChild(itemsList);

  // Load chi tiết
  fetchOrderDetail(order.id).then(detail => {
    itemsList.innerHTML = '';
    if (detail.items) {
      detail.items.forEach(item => {
        const p = document.createElement('div');
        p.style.fontSize = '0.9rem';
        p.style.display = 'flex';
        p.style.justifyContent = 'space-between';
        p.innerHTML = '<span>' + item.menu_item_name + '</span><strong style="color:#f97316">x' + item.quantity + '</strong>';
        itemsList.appendChild(p);
      });
    }
  }).catch(() => {
    itemsList.textContent = 'Không tải được chi tiết';
  });

  // Nút chuyển trạng thái
  const btn = document.createElement('button');
  btn.className = 'btn ' + btnClass;
  btn.style.width = '100%';
  btn.style.marginTop = '0.75rem';
  btn.textContent = btnLabel;
  btn.addEventListener('click', () => updateStatus(order.id, nextStatus));
  card.appendChild(btn);

  return card;
}

// Tải và hiển thị đơn
async function loadOrders() {
  try {
    // 1. Tải PENDING
    const pendingRes = await fetch('/api/orders?status=PENDING');
    const pendingOrders = await pendingRes.json();
    const pendingDiv = document.getElementById('pending-orders');
    pendingDiv.innerHTML = '';
    if (pendingOrders.length === 0) {
      const p = document.createElement('div');
      p.style.color = '#94a3b8';
      p.style.textAlign = 'center';
      p.style.padding = '2rem 1rem';
      p.style.background = '#ffffff';
      p.style.borderRadius = '12px';
      p.style.border = '1px dashed #cbd5e1';
      p.innerHTML = '<div style="font-size:1.5rem">☕</div><div style="margin-top:0.25rem">Không có đơn chờ</div>';
      pendingDiv.appendChild(p);
    } else {
      pendingOrders.forEach(o => {
        pendingDiv.appendChild(renderOrder(o, 'PREPARING', '🔥 Bắt đầu chuẩn bị', 'btn-warning'));
      });
    }

    // 2. Tải PREPARING
    const prepRes = await fetch('/api/orders?status=PREPARING');
    const prepOrders = await prepRes.json();
    const prepDiv = document.getElementById('preparing-orders');
    prepDiv.innerHTML = '';
    if (prepOrders.length === 0) {
      const p2 = document.createElement('div');
      p2.style.color = '#94a3b8';
      p2.style.textAlign = 'center';
      p2.style.padding = '2rem 1rem';
      p2.style.background = '#ffffff';
      p2.style.borderRadius = '12px';
      p2.style.border = '1px dashed #cbd5e1';
      p2.innerHTML = '<div style="font-size:1.5rem">👨‍🍳</div><div style="margin-top:0.25rem">Không có đơn đang nấu</div>';
      prepDiv.appendChild(p2);
    } else {
      prepOrders.forEach(o => {
        prepDiv.appendChild(renderOrder(o, 'SERVED', '✅ Đã phục vụ món', 'btn-success'));
      });
    }
  } catch (err) {
    showAlert('Lỗi tải đơn: ' + err.message, 'error');
  }
}

// Khởi tạo và tự refresh mỗi 5 giây
document.addEventListener('DOMContentLoaded', () => {
  loadOrders();
  setInterval(loadOrders, 5000);
});
