// ============================================================
// cashier.js - Logic hiển thị và thu ngân đơn hàng (Strict RBAC & Audit Trail)
// ============================================================
'use strict';

function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
}

function showAlert(msg, type) {
  const box = document.getElementById('alert-box');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'alert alert-' + type;
  div.textContent = msg;
  box.innerHTML = '';
  box.appendChild(div);
  setTimeout(() => { if (box.contains(div)) box.removeChild(div); }, 4000);
}

// Xử lý thanh toán đơn hàng với phương thức thanh toán & token cashier
async function payOrderWithMethod(orderId, method) {
  try {
    const res = await fetch('/api/orders/' + orderId + '/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({
        status: 'PAID',
        payment_method: method,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const methodLabel = method === 'CASH' ? 'Tiền mặt' : method === 'TRANSFER_QR' ? 'Chuyển khoản QR' : method;
    showAlert(`✅ Đơn #${orderId} đã thanh toán thành công qua [${methodLabel}]! Bàn đã được giải phóng.`, 'success');
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
    if (!container) return;
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
      const waiterInfo = order.waiter_name ? ` (Bồi bàn: <strong>${order.waiter_name}</strong>)` : '';
      top.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
          <span style="font-size:1.15rem;font-weight:800;color:var(--text-main)">Bàn ${order.table_number}</span>
          <span class="badge badge-success">✅ Đã phục vụ</span>
        </div>
        <div style="color:#64748b;font-size:0.85rem;margin-bottom:0.5rem">
          Đơn #${order.id} • ${new Date(order.created_at).toLocaleTimeString('vi-VN')}${waiterInfo}
        </div>
      `;

      const bottom = document.createElement('div');
      bottom.style.marginTop = '1rem';
      bottom.style.paddingTop = '1rem';
      bottom.style.borderTop = '1px solid #e2e8f0';

      const total = document.createElement('div');
      total.style.fontSize = '1.25rem';
      total.style.fontWeight = '800';
      total.style.color = '#ea580c';
      total.style.marginBottom = '0.75rem';
      total.textContent = formatVND(order.total_amount);
      bottom.appendChild(total);

      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 0.75rem;';

      const btnDetail = document.createElement('button');
      btnDetail.className = 'btn btn-secondary';
      btnDetail.style.cssText = 'flex: 1; font-size: 0.82rem; padding: 0.4rem;';
      btnDetail.textContent = '🧾 Xem hóa đơn';
      btnDetail.addEventListener('click', () => openReceiptModal(order.id));

      const btnCancel = document.createElement('button');
      btnCancel.className = 'btn';
      btnCancel.style.cssText = 'font-size: 0.82rem; padding: 0.4rem 0.75rem; background: var(--danger-light); color: var(--danger); border: 1px solid var(--danger-border);';
      btnCancel.textContent = '❌ Hủy đơn';
      btnCancel.title = 'Hủy đơn và giải phóng bàn về trống';
      btnCancel.addEventListener('click', () => cancelOrder(order.id, order.table_number));

      actionRow.appendChild(btnDetail);
      actionRow.appendChild(btnCancel);
      bottom.appendChild(actionRow);

      // Nhóm nút thanh toán theo hình thức
      const btnGroup = document.createElement('div');
      btnGroup.style.display = 'flex';
      btnGroup.style.gap = '0.5rem';

      const btnCash = document.createElement('button');
      btnCash.className = 'btn btn-success';
      btnCash.style.flex = '1';
      btnCash.style.fontSize = '0.85rem';
      btnCash.textContent = '💵 Tiền mặt';
      btnCash.addEventListener('click', () => payOrderWithMethod(order.id, 'CASH'));

      const btnQR = document.createElement('button');
      btnQR.className = 'btn btn-primary';
      btnQR.style.flex = '1';
      btnQR.style.fontSize = '0.85rem';
      btnQR.textContent = '📱 Quét QR';
      btnQR.addEventListener('click', () => payOrderWithMethod(order.id, 'TRANSFER_QR'));

      btnGroup.appendChild(btnCash);
      btnGroup.appendChild(btnQR);
      bottom.appendChild(btnGroup);

      card.appendChild(top);
      card.appendChild(bottom);
      container.appendChild(card);
    });
  } catch (err) {
    showAlert('Lỗi tải danh sách: ' + err.message, 'error');
  }
}

// ============================================================
// MODAL HÓA ĐƠN & HỦY ĐƠN
// ============================================================

async function openReceiptModal(orderId) {
  const modal = document.getElementById('receiptModal');
  const content = document.getElementById('receiptContent');
  if (!modal || !content) return;

  content.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;">⏳ Đang tải chi tiết hóa đơn...</div>';
  modal.style.display = 'flex';

  try {
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) throw new Error('Không thể tải chi tiết hóa đơn');
    const order = await res.json();

    const itemsHtml = (order.items || []).map((item, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 0.6rem 0.4rem; font-size: 0.88rem;">
          <strong style="color: var(--text-main);">${idx + 1}. ${item.menu_item_name}</strong>
          ${item.item_notes ? `<div style="font-size: 0.75rem; color: #b45309; font-style: italic;">📝 ${item.item_notes}</div>` : ''}
        </td>
        <td style="padding: 0.6rem 0.4rem; text-align: center; font-size: 0.88rem; font-weight: 700;">x${item.quantity}</td>
        <td style="padding: 0.6rem 0.4rem; text-align: right; font-size: 0.88rem; color: #64748b;">${formatVND(item.unit_price)}</td>
        <td style="padding: 0.6rem 0.4rem; text-align: right; font-size: 0.88rem; font-weight: 700; color: var(--text-main);">${formatVND(item.subtotal)}</td>
      </tr>
    `).join('');

    content.innerHTML = `
      <div id="printableReceipt" style="font-family: inherit; color: #0f172a;">
        <div style="text-align: center; margin-bottom: 1.25rem;">
          <h2 style="font-size: 1.35rem; font-weight: 800; margin-bottom: 0.2rem; color: var(--primary);">NHÀ HÀNG HƯƠNG VIỆT</h2>
          <p style="font-size: 0.8rem; color: #64748b; margin: 0;">123 Phố Ẩm Thực, Quận 1, TP. Hồ Chí Minh</p>
          <p style="font-size: 0.8rem; color: #64748b; margin: 0;">Hotline: 0900.123.456</p>
          <div style="border-bottom: 2px dashed #cbd5e1; margin: 0.75rem 0;"></div>
          <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0.25rem 0;">PHIẾU TẠM TÍNH</h4>
          <div style="font-size: 0.82rem; color: #64748b;">Mã đơn: <strong>#${order.id}</strong> | <strong>Bàn ${order.table_number}</strong></div>
          <div style="font-size: 0.82rem; color: #64748b;">Thời gian: ${new Date(order.created_at).toLocaleString('vi-VN')}</div>
          ${order.waiter_name ? `<div style="font-size: 0.82rem; color: #64748b;">Bồi bàn: <strong>${order.waiter_name}</strong></div>` : ''}
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem;">
          <thead>
            <tr style="border-bottom: 1.5px solid #cbd5e1; font-size: 0.8rem; color: #64748b; text-transform: uppercase;">
              <th style="padding: 0.4rem; text-align: left;">Món ăn</th>
              <th style="padding: 0.4rem; text-align: center;">SL</th>
              <th style="padding: 0.4rem; text-align: right;">Đơn giá</th>
              <th style="padding: 0.4rem; text-align: right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="border-top: 2px dashed #cbd5e1; padding-top: 0.75rem; margin-top: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 1.15rem; font-weight: 800;">
            <span>TỔNG TIỀN:</span>
            <span style="color: #ea580c; font-size: 1.35rem;">${formatVND(order.total_amount)}</span>
          </div>
          <div style="text-align: center; margin-top: 1.25rem; font-size: 0.8rem; color: #94a3b8; font-style: italic;">
            Cảm ơn quý khách và hẹn gặp lại! 🙏
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div style="color:var(--danger); text-align:center; padding:1.5rem;">${err.message}</div>`;
  }
}

function closeReceiptModal() {
  const modal = document.getElementById('receiptModal');
  if (modal) modal.style.display = 'none';
}

async function cancelOrder(orderId, tableNumber) {
  if (!confirm(`Bạn có chắc chắn muốn hủy Đơn #${orderId} tại Bàn ${tableNumber}? Thao tác này sẽ hủy đơn và giải phóng bàn về trạng thái Trống.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({ status: 'CANCELLED' }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hủy đơn thất bại');

    showAlert(`Đã hủy thành công Đơn #${orderId}! Bàn ${tableNumber} đã được giải phóng.`, 'success');
    loadServedOrders();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Strict RBAC: Chỉ CASHIER được truy cập
  const user = Auth.requireAuth(['CASHIER']);
  if (!user) return;
  Auth.initNav('cashier');

  // Gắn sự kiện modal hóa đơn
  const btnClose1 = document.getElementById('closeReceiptBtn');
  if (btnClose1) btnClose1.addEventListener('click', closeReceiptModal);

  const btnClose2 = document.getElementById('closeReceiptBtn2');
  if (btnClose2) btnClose2.addEventListener('click', closeReceiptModal);

  const btnPrint = document.getElementById('btnPrintReceipt');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  loadServedOrders();
  setInterval(loadServedOrders, 5000);
});
