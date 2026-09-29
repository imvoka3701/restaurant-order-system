// ============================================================
// app.js - Logic frontend cho trang Đặt món (index.html)
// Chọn bàn → lọc danh mục → tìm kiếm → sắp xếp → giỏ hàng → gửi đơn
// ============================================================
'use strict';

// --- Giỏ hàng (lưu trong bộ nhớ) ---
const cart = []; // [{menu_item_id, name, price, quantity}]

// --- Bộ nhớ đệm danh sách món ăn & Trạng thái lọc/sắp xếp ---
let allMenuItems = [];
let currentCategory = '';
let currentSort = 'default';
let currentSearch = '';

// --- Hình ảnh món ăn thực tế (15 món) ---
const ITEM_IMAGES = {
  'Gỏi cuốn tôm thịt':   '/images/goi-cuon.jpg',
  'Chả giò rế':           '/images/cha-gio.jpg',
  'Súp bào ngư':          '/images/sup-bao-ngu.jpg',
  'Salad trộn dầu giấm':  '/images/salad.jpg',
  'Phở bò tái nạm':       '/images/pho-bo.jpg',
  'Cơm tấm sườn bì chả': '/images/com-tam.jpg',
  'Bún chả Hà Nội':       '/images/bun-cha.jpg',
  'Cá lóc kho tộ':        '/images/ca-kho-to.jpg',
  'Lẩu thái hải sản':     '/images/lau-thai.jpg',
  'Chè khúc bạch':        '/images/che-khuc-bach.jpg',
  'Bánh flan caramel':    '/images/banh-flan.jpg',
  'Kem dừa non':          '/images/kem-dua.jpg',
  'Trà đá':               '/images/tra-da.jpg',
  'Cà phê sữa đá':       '/images/ca-phe-sua-da.jpg',
  'Nước ép cam tươi':     '/images/nuoc-cam.jpg',
};

// Fallback theo ID nếu tên thay đổi
const ID_IMAGES = {
  1:  '/images/goi-cuon.jpg',
  2:  '/images/cha-gio.jpg',
  3:  '/images/sup-bao-ngu.jpg',
  4:  '/images/salad.jpg',
  5:  '/images/pho-bo.jpg',
  6:  '/images/com-tam.jpg',
  7:  '/images/bun-cha.jpg',
  8:  '/images/ca-kho-to.jpg',
  9:  '/images/lau-thai.jpg',
  10: '/images/che-khuc-bach.jpg',
  11: '/images/banh-flan.jpg',
  12: '/images/kem-dua.jpg',
  13: '/images/tra-da.jpg',
  14: '/images/ca-phe-sua-da.jpg',
  15: '/images/nuoc-cam.jpg',
};

function getItemImage(item) {
  return ITEM_IMAGES[item.name] || ID_IMAGES[item.id] || '/images/pho-bo.jpg';
}

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

// --- Tải danh sách bàn ---
async function loadTables() {
  try {
    const tables = await api('/api/tables');
    const select = document.getElementById('table-select');
    select.innerHTML = '<option value="">-- Chọn bàn --</option>';
    tables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `Bàn ${t.table_number} (${t.capacity} chỗ) - [${t.status}]`;
      select.appendChild(opt);
    });
  } catch (_) { /* Lỗi đã hiển thị trong api() */ }
}

// --- Tải toàn bộ thực đơn từ API ---
async function loadMenu() {
  try {
    const items = await api('/api/menu');
    allMenuItems = items.filter(i => i.is_available);
    renderMenu();
  } catch (_) { /* Lỗi đã hiển thị trong api() */ }
}

// --- Hiển thị thực đơn kết hợp Lọc danh mục, Tìm kiếm và Sắp xếp ---
function renderMenu() {
  const list = document.getElementById('menu-list');
  list.innerHTML = '';

  // 1. Lọc theo danh mục
  let filtered = allMenuItems;
  if (currentCategory) {
    filtered = filtered.filter(item => item.category === currentCategory);
  }

  // 2. Tìm kiếm theo tên món
  if (currentSearch) {
    filtered = filtered.filter(item => 
      item.name.toLowerCase().includes(currentSearch)
    );
  }

  // 3. Sắp xếp
  filtered = [...filtered].sort((a, b) => {
    const priceA = parseFloat(a.price);
    const priceB = parseFloat(b.price);
    if (currentSort === 'price-asc') {
      return priceA - priceB;
    } else if (currentSort === 'price-desc') {
      return priceB - priceA;
    } else {
      // Mặc định: theo danh mục rồi theo tên
      return a.name.localeCompare(b.name, 'vi');
    }
  });

  // 4. Kiểm tra rỗng
  if (filtered.length === 0) {
    list.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #94a3b8; background: #ffffff; border-radius: 16px; border: 1px dashed #cbd5e1">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem">🍽️</div>
        <div style="font-weight: 600; color: #64748b">Không tìm thấy món ăn nào</div>
        <div style="font-size: 0.85rem; margin-top: 0.25rem">Thử đổi danh mục hoặc từ khóa tìm kiếm</div>
      </div>
    `;
    return;
  }

  // 5. Render từng card món ăn có hình ảnh
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card menu-card';

    // Ảnh món ăn
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'menu-card-img-wrapper';

    const img = document.createElement('img');
    img.className = 'menu-card-img';
    img.src = getItemImage(item);
    img.alt = item.name;
    img.loading = 'lazy';

    const badge = document.createElement('span');
    badge.className = 'badge menu-card-badge';
    badge.textContent = getCategoryLabel(item.category);

    imgWrapper.appendChild(img);
    imgWrapper.appendChild(badge);

    // Thân card
    const body = document.createElement('div');
    body.className = 'menu-card-body';

    const name = document.createElement('div');
    name.className = 'menu-card-title';
    name.textContent = item.name;

    const footer = document.createElement('div');
    footer.className = 'menu-card-footer';

    const price = document.createElement('div');
    price.className = 'menu-card-price';
    price.textContent = formatVND(item.price);

    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn btn-sm btn-primary';
    btnAdd.textContent = '+ Thêm';
    btnAdd.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(item);
    });

    footer.appendChild(price);
    footer.appendChild(btnAdd);

    body.appendChild(name);
    body.appendChild(footer);

    card.appendChild(imgWrapper);
    card.appendChild(body);

    // Click vào card để thêm vào giỏ
    card.addEventListener('click', () => addToCart(item));

    list.appendChild(card);
  });
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
    empty.innerHTML = `
      <div style="font-size:2.5rem;margin-bottom:0.75rem">🛒</div>
      <div style="font-weight:600;color:#64748b;margin-bottom:0.25rem">Giỏ hàng đang trống</div>
      <div style="font-size:0.85rem">Chọn món bên thực đơn để thêm</div>
    `;
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
    qtySpan.style.color = '#64748b';
    qtySpan.style.fontSize = '0.85rem';
    qtySpan.textContent = ' x' + item.quantity + ' = ' + formatVND(subtotal);
    left.appendChild(nameSpan);
    left.appendChild(document.createElement('br'));
    left.appendChild(qtySpan);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '6px';
    right.style.alignItems = 'center';

    const btnMinus = document.createElement('button');
    btnMinus.className = 'btn btn-sm btn-secondary';
    btnMinus.textContent = '−';
    btnMinus.style.padding = '0.25rem 0.6rem';
    btnMinus.addEventListener('click', () => updateQuantity(item.menu_item_id, -1));

    const btnPlus = document.createElement('button');
    btnPlus.className = 'btn btn-sm btn-primary';
    btnPlus.textContent = '+';
    btnPlus.style.padding = '0.25rem 0.6rem';
    btnPlus.addEventListener('click', () => updateQuantity(item.menu_item_id, 1));

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-sm btn-danger';
    btnDel.textContent = '✕';
    btnDel.style.padding = '0.25rem 0.55rem';
    btnDel.addEventListener('click', () => removeFromCart(item.menu_item_id));

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
    showAlert('Vui lòng chọn bàn trước khi gửi đơn', 'error');
    return;
  }
  if (cart.length === 0) {
    showAlert('Giỏ hàng đang trống! Vui lòng chọn món ăn', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.textContent = '⏳ Đang gửi đơn...';

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

    showAlert(`🎉 Đơn #${order.id} tạo thành công! Tổng: ${formatVND(order.total_amount)}`, 'success');
    cart.length = 0;
    renderCart();
    loadTables(); // Cập nhật lại trạng thái bàn (OCCUPIED)
  } catch (_) {
    /* Lỗi đã hiển thị */
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Gửi đơn hàng';
  }
}

// --- Thiết lập sự kiện & Khởi tạo (Tuân thủ 100% CSP - Không dùng inline onclick) ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Tải bàn & thực đơn
  loadTables();
  loadMenu();
  renderCart();

  // 2. Sự kiện lọc danh mục
  const filterBar = document.getElementById('category-filter-bar');
  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-category]');
      if (!btn) return;
      filterBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.getAttribute('data-category');
      renderMenu();
    });
  }

  // 3. Sự kiện sắp xếp
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderMenu();
    });
  }

  // 4. Sự kiện tìm kiếm
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentSearch = searchInput.value.trim().toLowerCase();
      renderMenu();
    });
  }

  // 5. Sự kiện gửi đơn hàng
  const btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', submitOrder);
  }
});
