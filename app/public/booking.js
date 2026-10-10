// ============================================================
// booking.js - Logic Đặt Bàn Trực Tuyến (100% CSP Compliant)
// ============================================================
'use strict';

let availableTables = [];

function showBookingAlert(msg, type = 'error') {
  const box = document.getElementById('bookingAlert');
  if (!box) return;
  box.style.display = 'block';
  if (type === 'error') {
    box.style.background = '#fef2f2';
    box.style.color = '#b91c1c';
    box.style.border = '1px solid #fecaca';
  } else {
    box.style.background = '#ecfdf5';
    box.style.color = '#047857';
    box.style.border = '1px solid #a7f3d0';
  }
  box.textContent = msg;
}

function hideBookingAlert() {
  const box = document.getElementById('bookingAlert');
  if (box) box.style.display = 'none';
}

async function loadAvailableTables() {
  const select = document.getElementById('tableSelect');
  const btnSubmit = document.getElementById('btnSubmitBooking');
  if (!select) return;

  try {
    const res = await fetch('/api/tables');
    if (!res.ok) throw new Error('Không thể kết nối đến máy chủ nhà hàng');
    const allTables = await res.json();

    availableTables = allTables.filter(t => t.status === 'AVAILABLE');

    if (availableTables.length === 0) {
      select.innerHTML = '<option value="" disabled selected>⚠️ Hiện tất cả các bàn đã có khách hoặc được đặt trước</option>';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '❌ Tạm Thời Kín Chỗ - Vui Lòng Liên Hệ Hotline';
      }
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🎉 Xác Nhận Đặt Bàn Ngay';
    }

    select.innerHTML = '<option value="">-- Vui lòng chọn bàn phù hợp --</option>' + availableTables.map(t => `
      <option value="${t.id}">Bàn số ${t.table_number} (${t.capacity} chỗ ngồi)</option>
    `).join('');
  } catch (err) {
    select.innerHTML = `<option value="" disabled>Lỗi tải bàn: ${err.message}</option>`;
  }
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  hideBookingAlert();

  const customer_name = document.getElementById('custName').value.trim();
  const customer_phone = document.getElementById('custPhone').value.trim();
  const guest_count = parseInt(document.getElementById('guestCount').value, 10);
  const table_id = parseInt(document.getElementById('tableSelect').value, 10);
  const dateVal = document.getElementById('bookingDate').value;
  const timeVal = document.getElementById('bookingTime').value;
  const special_request = document.getElementById('specialRequest').value.trim();

  if (!table_id) {
    showBookingAlert('Vui lòng chọn bàn ăn bạn mong muốn!');
    return;
  }

  if (!dateVal || !timeVal) {
    showBookingAlert('Vui lòng chọn ngày và khung giờ hẹn!');
    return;
  }

  const booking_time = `${dateVal}T${timeVal}:00`;

  const btn = document.getElementById('btnSubmitBooking');
  btn.disabled = true;
  btn.textContent = '⏳ Đang khóa giữ chỗ bàn ăn...';

  try {
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_name,
        customer_phone,
        guest_count,
        table_id,
        booking_time,
        special_request,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Đặt bàn thất bại');
    }

    // Hiển thị vé đặt bàn thành công
    const r = data.reservation;
    const ticketDiv = document.getElementById('ticketInfo');
    if (ticketDiv) {
      ticketDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; border-bottom:1px solid #e2e8f0; padding-bottom:0.4rem;">
          <span style="color:#64748b;">Mã đặt bàn:</span>
          <strong style="color:var(--primary); font-size:1rem;">#RES-${r.id}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem;">
          <span style="color:#64748b;">Khách hàng:</span>
          <strong style="color:var(--text-main);">${r.customer_name}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem;">
          <span style="color:#64748b;">Số điện thoại:</span>
          <strong>${r.customer_phone}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem;">
          <span style="color:#64748b;">Vị trí bàn:</span>
          <strong style="color:var(--primary);">Bàn ${r.table_number} (${r.table_capacity} chỗ ngồi)</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem;">
          <span style="color:#64748b;">Số lượng khách:</span>
          <strong>${r.guest_count} người</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:#64748b;">Thời gian hẹn:</span>
          <strong style="color:#b45309;">${timeVal} - ${new Date(dateVal).toLocaleDateString('vi-VN')}</strong>
        </div>
        ${r.special_request ? `<div style="margin-top:0.4rem; padding-top:0.4rem; border-top:1px dashed #e2e8f0; font-size:0.8rem; color:#64748b;">📝 Yêu cầu: ${r.special_request}</div>` : ''}
      `;
    }

    const modal = document.getElementById('successModal');
    if (modal) modal.style.display = 'flex';

    // Reset form và tải lại danh sách bàn trống
    document.getElementById('bookingForm').reset();
    setDefaultDate();
    loadAvailableTables();
  } catch (err) {
    showBookingAlert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🎉 Xác Nhận Đặt Bàn Ngay';
  }
}

function setDefaultDate() {
  const dateInput = document.getElementById('bookingDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setDefaultDate();
  loadAvailableTables();

  const form = document.getElementById('bookingForm');
  if (form) {
    form.addEventListener('submit', handleBookingSubmit);
  }

  const btnCloseModal = document.getElementById('btnCloseSuccess');
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      const modal = document.getElementById('successModal');
      if (modal) modal.style.display = 'none';
    });
  }
});
