// ============================================================
// revenue.js - Logic hiển thị thống kê & báo cáo doanh thu
// ============================================================
'use strict';

function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
}

function getCategoryLabel(cat) {
  const labels = {
    APPETIZER: 'Khai vị',
    MAIN: 'Món chính',
    DESSERT: 'Tráng miệng',
    BEVERAGE: 'Đồ uống'
  };
  return labels[cat] || cat;
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

async function loadRevenue() {
  try {
    const from = document.getElementById('date-from').value;
    const to = document.getElementById('date-to').value;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const res = await fetch('/api/revenue/summary?' + params.toString());
    if (!res.ok) throw new Error('Lỗi tải doanh thu');
    const data = await res.json();

    // 1. Tổng quan KPI Cards
    const summary = document.getElementById('summary');
    summary.innerHTML = '';

    const cardRev = document.createElement('div');
    cardRev.className = 'kpi-card';
    cardRev.innerHTML = `<div class="kpi-label">💰 Tổng doanh thu</div><div class="kpi-value gradient">${formatVND(data.summary.total_revenue)}</div>`;

    const cardOrders = document.createElement('div');
    cardOrders.className = 'kpi-card';
    cardOrders.innerHTML = `<div class="kpi-label">🧾 Đơn đã thanh toán</div><div class="kpi-value">${data.summary.total_orders} <span style="font-size:1rem;font-weight:600;color:var(--text-muted)">đơn</span></div>`;

    const avgOrder = data.summary.total_orders > 0 ? (parseFloat(data.summary.total_revenue) / data.summary.total_orders) : 0;
    const cardAvg = document.createElement('div');
    cardAvg.className = 'kpi-card';
    cardAvg.innerHTML = `<div class="kpi-label">📊 Trung bình / đơn</div><div class="kpi-value" style="color:var(--accent)">${formatVND(avgOrder)}</div>`;

    summary.appendChild(cardRev);
    summary.appendChild(cardOrders);
    summary.appendChild(cardAvg);

    // 2. Doanh thu theo ngày
    const dailyBody = document.getElementById('daily-body');
    dailyBody.innerHTML = '';
    if (data.daily.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = 'Chưa có dữ liệu';
      td.style.color = '#94a3b8';
      tr.appendChild(td);
      dailyBody.appendChild(tr);
    } else {
      data.daily.forEach(d => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.textContent = d.date ? d.date.split('T')[0] : '';
        const td2 = document.createElement('td');
        td2.textContent = d.total_orders;
        const td3 = document.createElement('td');
        td3.textContent = formatVND(d.revenue);
        td3.style.fontWeight = 'bold';
        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        dailyBody.appendChild(tr);
      });
    }

    // 3. Top món bán chạy
    const topBody = document.getElementById('top-items-body');
    topBody.innerHTML = '';
    if (data.top_items.length === 0) {
      const tr2 = document.createElement('tr');
      const td2b = document.createElement('td');
      td2b.colSpan = 4;
      td2b.textContent = 'Chưa có dữ liệu';
      td2b.style.color = '#94a3b8';
      tr2.appendChild(td2b);
      topBody.appendChild(tr2);
    } else {
      data.top_items.forEach(item => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.innerHTML = '<strong>' + item.name + '</strong>';
        const td2 = document.createElement('td');
        td2.innerHTML = '<span class="badge" style="background:#f1f5f9;color:#475569;font-size:0.75rem">' + getCategoryLabel(item.category) + '</span>';
        const td3 = document.createElement('td');
        td3.innerHTML = '<span style="font-weight:700;color:var(--text-main)">' + item.total_sold + '</span>';
        const td4 = document.createElement('td');
        td4.innerHTML = '<span style="font-weight:800;color:#ea580c">' + formatVND(item.total_revenue) + '</span>';
        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tr.appendChild(td4);
        topBody.appendChild(tr);
      });
    }
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Set ngày mặc định: hôm nay
  const today = new Date().toISOString().split('T')[0];
  const dateFrom = document.getElementById('date-from');
  const dateTo = document.getElementById('date-to');
  if (dateFrom) dateFrom.value = today;
  if (dateTo) dateTo.value = today;

  const btnLoad = document.getElementById('btn-load-revenue');
  if (btnLoad) {
    btnLoad.addEventListener('click', loadRevenue);
  }

  loadRevenue();
});
