// ============================================================
// app.js - Logic frontend cho trang Đặt món (index.html)
// Chọn bàn → chọn món → giỏ hàng → gửi đơn
// Escape dữ liệu khi render (chống XSS) bằng textContent
// ============================================================
'use strict';

// --- Giỏ hàng (lưu trong bộ nhớ) ---
const cart = []; // [{menu_item_id, name, price, quantity}]

// --- Hàm tiện ích ---

// Format tiền VND
function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
}

// Hiển thị thông báo (chống XSS: dùng textContent)
function showAlert(msg, type) {
  const box = document.getElementById('alert-box');
  const div = document.createElement('div');
  div.className = 'alert alert-' + type;
  div.textContent = msg;
  box.innerHTML = '';
  box.appendChild(div);
  setTimeout(() => { if (box.contains(div)) box.removeChild(div); }, 4000);
}

// Gọi API chung
async function api(url, options) {
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi không xác định');
    return data;
  } catch (err) {
    showAlert(err.message, 'error');
    throw err;
  }
}

// --- Tải danh sách bàn ---
async function loadTables() {
  try {
    const tables = await api('/api/tables');
    const select = document.getElementById('table-select');
    // Giữ option mặc định
    select.innerHTML = '<option value="">-- Chọn bàn --</option>';
    tables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      // Escape qua textContent
      opt.textContent = 'Bàn ' + t.table_number + ' (' + t.capacity + ' chỗ) - ' + t.status;
      select.appendChild(opt);
    });
  } catch (_) { /* lỗi đã hiển thị */ }
}

// --- Lọc danh mục với giao diện nút bấm ---
function filterCategory(btn, category) {
  document.querySelectorAll('.filter-bar .btn').forEach(b => {
    b.classList.remove('active');
  });
  if (btn) {
    btn.classList.add('active');
  }
  loadMenu(category);
}

// --- Tải thực đơn ---
async function loadMenu(category) {
  try {
    const url = category ? '/api/menu?category=' + encodeURIComponent(category) : '/api/menu';
    const items = await api(url);
    const list = document.getElementById('menu-list');
    list.innerHTML = '';

    items.forEach(item => {
      if (!item.is_available) return; // Ẩn món không phục vụ
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cursor = 'pointer';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';
      card.style.padding = '1.25rem';

      const topSection = document.createElement('div');
      
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.background = '#f1f5f9';
      badge.style.color = '#475569';
      badge.style.fontSize = '0.7rem';
      badge.style.marginBottom = '0.5rem';
      badge.textContent = getCategoryLabel(item.category);

      const name = document.createElement('strong');
      name.style.display = 'block';
      name.style.fontSize = '1.05rem';
      name.style.lineHeight = '1.4';
      name.style.color = '#0f172a';
      name.textContent = item.name;

      topSection.appendChild(badge);
      topSection.appendChild(name);

      const bottomSection = document.createElement('div');
      bottomSection.className = 'flex-between';
      bottomSection.style.marginTop = '1.25rem';

      const price = document.createElement('div');
      price.style.color = '#ea580c';
      price.style.fontWeight = '800';
      price.style.fontSize = '1.1rem';
      price.textContent = formatVND(item.price);

      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-primary';
      btn.textContent = '+ Thêm';
      btn.onclick = function(e) {
        e.stopPropagation();
        addToCart(item);
      };

      bottomSection.appendChild(price);
      bottomSection.appendChild(btn);

      card.appendChild(topSection);
      card.appendChild(bottomSection);
      card.onclick = () => addToCart(item);

      list.appendChild(card);
    });

    if (items.filter(i => i.is_available).length === 0) {
      list.innerHTML = '<p style="color:#64748b;grid-column:1/-1;text-align:center;padding:2rem">Không có món nào trong danh mục này</p>';
    }
  } catch (_) { /* lỗi đã hiển thị */ }
}

// Label tiếng Việt cho danh mục
function getCategoryLabel(cat) {
  const labels = {
    APPETIZER: 'Khai vị',
    MAIN: 'Món chính',
    DESSERT: 'Tráng miệng',
    BEVERAGE: 'Đồ uống',
  };
  return labels[cat] || cat;
}

// --- Giỏ hàng ---
function addToCart(item) {
  const existing = cart.find(c => c.menu_item_id === item.id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({
      menu_item_id: item.id,
      name: item.name,
      price: parseFloat(item.price),
      quantity: 1,
    });
  }
  renderCart();
  showAlert('Đã thêm: ' + item.name, 'success');
}

function removeFromCart(menuItemId) {
  const idx = cart.findIndex(c => c.menu_item_id === menuItemId);
  if (idx !== -1) cart.splice(idx, 1);
  renderCart();
}

function updateQuantity(menuItemId, delta) {
  const item = cart.find(c => c.menu_item_id === menuItemId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    removeFromCart(menuItemId);
    return;
  }
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items');
  container.innerHTML = '';

  if (cart.length === 0) {
    const empty = document.createElement('div');
    empty.style.textAlign = 'center';
    empty.style.padding = '2.5rem 1rem';
    empty.style.color = '#94a3b8';
    empty.innerHTML = '<div style="font-size:2.5rem;margin-bottom:0.75rem">🛒</div><div style="font-weight:600;color:#64748b;margin-bottom:0.25rem">Giỏ hàng đang trống</div><div style="font-size:0.85rem">Chọn món bên thực đơn để thêm</div>';
    container.appendChild(empty);
    document.getElementById('cart-total').textContent = 'Tổng: 0 ₫';
    return;
  }

  let total = 0;
  cart.forEach(item => {
    const subtotal = item.price * item.quantity;
    total += subtotal;

    const div = document.createElement('div');
    div.className = 'cart-item';

    const left = document.createElement('div');
    const nameSpan = document.createElement('strong');
    nameSpan.textContent = item.name;
    const qtySpan = document.createElement('span');
    qtySpan.style.color = '#757575';
    qtySpan.style.fontSize = '0.85rem';
    qtySpan.textContent = ' x' + item.quantity + ' = ' + formatVND(subtotal);
    left.appendChild(nameSpan);
    left.appendChild(document.createElement('br'));
    left.appendChild(qtySpan);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '4px';

    const btnMinus = document.createElement('button');
    btnMinus.className = 'btn btn-sm btn-secondary';
    btnMinus.textContent = '−';
    btnMinus.onclick = () => updateQuantity(item.menu_item_id, -1);

    const btnPlus = document.createElement('button');
    btnPlus.className = 'btn btn-sm btn-primary';
    btnPlus.textContent = '+';
    btnPlus.onclick = () => updateQuantity(item.menu_item_id, 1);

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-sm btn-danger';
    btnDel.textContent = '✕';
    btnDel.onclick = () => removeFromCart(item.menu_item_id);

    right.appendChild(btnMinus);
    right.appendChild(btnPlus);
    right.appendChild(btnDel);

    div.appendChild(left);
    div.appendChild(right);
    container.appendChild(div);
  });

  document.getElementById('cart-total').textContent = 'Tổng: ' + formatVND(total);
}

// --- Gửi đơn hàng ---
async function submitOrder() {
  const tableId = parseInt(document.getElementById('table-select').value, 10);
  if (!tableId) {
    showAlert('Vui lòng chọn bàn trước', 'error');
    return;
  }
  if (cart.length === 0) {
    showAlert('Giỏ hàng trống', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = 'Đang gửi...';

  try {
    const items = cart.map(c => ({
      menu_item_id: c.menu_item_id,
      quantity: c.quantity,
    }));

    const order = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_id: tableId, items }),
    });

    showAlert('Đơn #' + order.id + ' đã được tạo! Tổng: ' + formatVND(order.total_amount), 'success');
    cart.length = 0;
    renderCart();
    loadTables(); // Refresh trạng thái bàn
  } catch (_) {
    /* lỗi đã hiển thị */
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gửi đơn hàng';
  }
}

// --- Khởi tạo ---
document.addEventListener('DOMContentLoaded', () => {
  loadTables();
  loadMenu('');
  renderCart();
});
