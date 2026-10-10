// ============================================================
// app.js - Logic frontend cho trang Đặt món (index.html)
// Chọn bàn → lọc danh mục → tìm kiếm → sắp xếp → giỏ hàng → gửi đơn
// ============================================================
'use strict';

// --- Giỏ hàng (lưu trong bộ nhớ) ---
const cart = []; // [{menu_item_id, name, price, quantity}]

// --- Bộ nhớ đệm danh sách món ăn & Trạng thái lọc/sắp xếp ---
let allMenuItems = [];
let allTablesList = [];
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
  if (item.image_url) {
    return item.image_url;
  }
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
async function api(url, options = {}) {
  try {
    options.headers = options.headers || {};
    if (typeof Auth !== 'undefined' && Auth.getToken()) {
      options.headers['Authorization'] = 'Bearer ' + Auth.getToken();
    }
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
    allTablesList = tables;
    const select = document.getElementById('table-select');
    const previousValue = select.value;
    select.innerHTML = '<option value="">-- Chọn bàn --</option>';
    tables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      let statusLabel = 'Trống (Sẵn sàng)';
      if (t.status === 'OCCUPIED' || t.active_order_id) {
        statusLabel = `Đang phục vụ ${t.active_order_id ? '(Đơn #' + t.active_order_id + ')' : ''}`;
      } else if (t.status === 'RESERVED') {
        statusLabel = t.customer_name ? `ĐÃ ĐẶT: ${t.customer_name}` : 'ĐÃ ĐẶT TRƯỚC';
      }
      opt.textContent = `Bàn ${t.table_number} (${t.capacity} chỗ) - [${statusLabel}]`;
      select.appendChild(opt);
    });
    if (previousValue) {
      select.value = previousValue;
    }
    updateReservationsBadge();
  } catch (_) { /* Lỗi đã hiển thị trong api() */ }
}

// --- Tải toàn bộ thực đơn từ API ---
async function loadMenu() {
  try {
    const items = await api('/api/menu');
    allMenuItems = items; // Giữ lại cả món đã hết để hiển thị trạng thái 'Đã hết'
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

  // 5. Render từng card món ăn có hình ảnh và trạng thái Best Seller / Đã hết
  filtered.forEach(item => {
    const isAvail = item.is_available !== false;
    const isBestSeller = item.is_best_seller === true;

    const card = document.createElement('div');
    card.className = 'card menu-card' + (!isAvail ? ' is-unavailable' : '');

    // Ảnh món ăn
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'menu-card-img-wrapper';

    const img = document.createElement('img');
    img.className = 'menu-card-img';
    img.src = getItemImage(item);
    img.alt = item.name;
    img.loading = 'lazy';
    img.onerror = () => { img.src = '/images/pho-bo.jpg'; };

    // Badge Danh mục (Khai vị, Món chính...)
    const badge = document.createElement('span');
    badge.className = 'badge menu-card-badge';
    badge.textContent = getCategoryLabel(item.category);

    imgWrapper.appendChild(img);
    imgWrapper.appendChild(badge);

    // Thông báo trạng thái: Best Seller hoặc Đã hết
    if (!isAvail) {
      // Badge Đã hết
      const soldOutBadge = document.createElement('span');
      soldOutBadge.className = 'badge badge-out-of-stock';
      soldOutBadge.textContent = '❌ Đã hết';
      imgWrapper.appendChild(soldOutBadge);

      // Lớp phủ thông báo mờ trên ảnh
      const soldOutOverlay = document.createElement('div');
      soldOutOverlay.className = 'menu-card-soldout-overlay';
      soldOutOverlay.textContent = 'ĐÃ HẾT HÀNG';
      imgWrapper.appendChild(soldOutOverlay);
    } else if (isBestSeller) {
      // Badge Best Seller
      const bestSellerBadge = document.createElement('span');
      bestSellerBadge.className = 'badge badge-best-seller';
      bestSellerBadge.textContent = '🔥 Best Seller';
      imgWrapper.appendChild(bestSellerBadge);
    }

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
    if (isAvail) {
      btnAdd.className = 'btn btn-sm btn-primary';
      btnAdd.textContent = '+ Thêm';
      btnAdd.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(item);
      });
    } else {
      btnAdd.className = 'btn btn-sm btn-disabled';
      btnAdd.textContent = 'Hết món';
      btnAdd.disabled = true;
    }

    footer.appendChild(price);
    footer.appendChild(btnAdd);

    body.appendChild(name);
    body.appendChild(footer);

    card.appendChild(imgWrapper);
    card.appendChild(body);

    // Click vào card để thêm vào giỏ (chỉ khi còn hàng)
    if (isAvail) {
      card.addEventListener('click', () => addToCart(item));
    } else {
      card.addEventListener('click', () => {
        showAlert(`Món "${item.name}" hiện tại đã hết hàng!`, 'error');
      });
    }

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
      note: '',
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

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'cart-item-note';
    noteInput.placeholder = '📝 Ghi chú (không hành, ít cay...)';
    noteInput.value = item.note || '';
    noteInput.style.cssText = 'width: 100%; margin-top: 0.35rem; padding: 0.25rem 0.5rem; font-size: 0.8rem; border: 1px dashed var(--border); border-radius: 4px; background: #fafbfc; box-sizing: border-box;';
    noteInput.addEventListener('input', (e) => {
      item.note = e.target.value;
    });
    left.appendChild(noteInput);

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

let activeOrderForSelectedTable = null;

// --- Gửi đơn hàng (Tạo mới hoặc Gọi thêm món) ---
async function submitOrder() {
  const tableSelect = document.getElementById('table-select');
  const tableId = parseInt(tableSelect.value, 10);
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
  btn.textContent = '⏳ Đang xử lý đơn...';

  try {
    const items = cart.map(c => ({
      menu_item_id: c.menu_item_id,
      quantity: c.quantity,
      note: c.note || '',
    }));

    if (activeOrderForSelectedTable) {
      // 1. Nghiệp vụ: Bàn đang mở -> Gọi thêm món vào đơn hiện tại
      const res = await api(`/api/orders/${activeOrderForSelectedTable.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      showAlert(`🎉 Đã gọi thêm món thành công vào Đơn #${activeOrderForSelectedTable.id}! Tổng mới: ${formatVND(res.new_total_amount)}`, 'success');
    } else {
      // 2. Nghiệp vụ: Bàn trống -> Tạo đơn hàng mới
      const order = await api('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId, items }),
      });

      showAlert(`🎉 Đơn #${order.id} tạo thành công! Tổng: ${formatVND(order.total_amount)}`, 'success');
    }

    cart.length = 0;
    renderCart();
    loadTables();
    checkTableActiveOrder(tableId);
  } catch (_) {
    /* Lỗi đã hiển thị trong api() */
  } finally {
    btn.disabled = false;
    btn.textContent = activeOrderForSelectedTable
      ? `➕ Gọi thêm món vào Đơn #${activeOrderForSelectedTable.id}`
      : '🚀 Gửi đơn hàng';
  }
}

// Kiểm tra xem bàn được chọn có đang có đơn mở không
async function checkTableActiveOrder(tableId) {
  activeOrderForSelectedTable = null;
  const btn = document.getElementById('btn-submit');
  if (!tableId) {
    if (btn) btn.textContent = '🚀 Gửi đơn hàng';
    return;
  }

  try {
    const orders = await api('/api/orders');
    const active = orders.find(o => o.table_id === tableId && ['PENDING', 'PREPARING', 'SERVED'].includes(o.status));
    if (active) {
      activeOrderForSelectedTable = active;
      showAlert(`ℹ️ Bàn đang phục vụ Đơn #${active.id} (${active.status}). Các món bạn chọn sẽ được CỘNG DỒN vào đơn này!`, 'info');
      if (btn) btn.textContent = `➕ Gọi thêm món vào Đơn #${active.id}`;
    } else {
      if (btn) btn.textContent = '🚀 Gửi đơn hàng mới';
    }
  } catch (_) {}
}

// Xử lý khi người dùng chọn bàn: kiểm tra trạng thái RESERVED và phân quyền Bồi bàn vs Khách
function handleTableSelectionChange(tid) {
  const banner = document.getElementById('reservation-info-banner');
  const btnSubmit = document.getElementById('btn-submit');
  if (!tid) {
    if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
    checkTableActiveOrder(0);
    return;
  }

  const table = allTablesList.find(t => t.id === tid);
  if (!table) return;

  const currentUser = typeof Auth !== 'undefined' ? Auth.getUser() : null;
  const isWaiter = currentUser && currentUser.role === 'WAITER';

  if (table.status === 'RESERVED') {
    const timeStr = table.booking_time ? new Date(table.booking_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(table.booking_time).toLocaleDateString('vi-VN') : '';

    if (isWaiter) {
      banner.innerHTML = `
        <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: var(--radius-md); padding: 0.85rem 1rem; color: #92400e;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap;">
            <div>
              <div style="font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 0.35rem;">
                <span>📅 Bàn Đã Được Giữ Chỗ Trước</span>
              </div>
              <div style="font-size: 0.88rem; margin-top: 0.3rem; line-height: 1.4;">
                Khách hàng: <strong>${table.customer_name || 'Khách đặt trước'}</strong> • SĐT: <strong><a href="tel:${table.customer_phone}" style="color:#b45309;">${table.customer_phone || ''}</a></strong><br>
                🕒 Giờ hẹn: <strong>${timeStr}</strong> • Sĩ số: <strong>${table.guest_count || 2} khách</strong>
                ${table.special_request ? `<div style="font-size: 0.8rem; font-style: italic; color: #b45309; margin-top: 0.2rem;">📝 Yêu cầu: ${table.special_request}</div>` : ''}
              </div>
            </div>
            <div style="display: flex; gap: 0.4rem; align-items: center;">
              <button type="button" class="btn btn-sm btn-primary" id="btn-checkin-banner" data-res-id="${table.active_reservation_id || ''}" data-table-id="${table.id}" data-name="${table.customer_name || ''}" style="font-size: 0.82rem; padding: 0.35rem 0.75rem;">
                ✅ Khách vào bàn
              </button>
              <button type="button" class="btn btn-sm btn-secondary" id="btn-cancel-res-banner" data-res-id="${table.active_reservation_id || ''}" data-table-id="${table.id}" style="font-size: 0.82rem; padding: 0.35rem 0.75rem; color: var(--danger); border-color: var(--danger-border);">
                ❌ Hủy giữ chỗ
              </button>
            </div>
          </div>
          <div style="font-size: 0.78rem; color: #b45309; margin-top: 0.45rem; border-top: 1px dashed #fde68a; padding-top: 0.35rem;">
            👉 Nhấn <strong>"Khách vào bàn"</strong> khi khách tới sảnh để mở bàn và bắt đầu gọi món!
          </div>
        </div>
      `;
      banner.style.display = 'block';

      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '🔒 Cần Check-in khách vào bàn trước khi lên đơn';
      }
    } else {
      // Khách vãng lai chưa đăng nhập
      banner.innerHTML = `
        <div style="background: #fee2e2; border: 1.5px solid #fecaca; border-radius: var(--radius-md); padding: 0.75rem 1rem; color: #991b1b; font-size: 0.88rem;">
          🚫 <strong>Bàn số ${table.table_number} hiện đã có khách đặt trước!</strong><br>
          Quý khách vui lòng chọn bàn trống khác hoặc liên hệ nhân viên phục vụ tại quầy.
        </div>
      `;
      banner.style.display = 'block';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '🚫 Bàn đã đặt trước - Vui lòng chọn bàn khác';
      }
    }
    return;
  }

  // Bàn bình thường
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  if (btnSubmit) btnSubmit.disabled = false;
  checkTableActiveOrder(tid);
}

// Xử lý Check-in khách vào bàn
async function doCheckinReservation(resId, tableId, customerName) {
  if (!confirm(`Xác nhận đón khách "${customerName || 'hẹn trước'}" vào Bàn? Thao tác này sẽ chuyển bàn sang Có Khách (OCCUPIED) và mở quyền đặt món ngay.`)) {
    return;
  }
  try {
    if (resId) {
      await api(`/api/reservations/${resId}/checkin`, {
        method: 'PATCH',
      });
    } else {
      await api(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OCCUPIED' }),
      });
    }
    showAlert(`🎉 Khách "${customerName || ''}" đã vào bàn thành công! Sẵn sàng lên thực đơn.`, 'success');
    await loadTables();
    const select = document.getElementById('table-select');
    if (select) {
      select.value = tableId;
      handleTableSelectionChange(tableId);
    }
    closeWaiterResModal();
  } catch (err) {
    showAlert(err.message || 'Check-in thất bại', 'error');
  }
}

// Xử lý Hủy đặt chỗ
async function doCancelReservation(resId, tableId) {
  if (!confirm('Bạn có chắc chắn muốn hủy giữ chỗ bàn này và giải phóng bàn về trạng thái Trống (AVAILABLE)?')) {
    return;
  }
  try {
    if (resId) {
      await api(`/api/reservations/${resId}/cancel`, {
        method: 'PATCH',
      });
    } else {
      await api(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'AVAILABLE' }),
      });
    }
    showAlert('Đã hủy giữ chỗ thành công! Bàn đã được giải phóng.', 'success');
    await loadTables();
    const select = document.getElementById('table-select');
    if (select) {
      select.value = '';
      handleTableSelectionChange(0);
    }
    closeWaiterResModal();
  } catch (err) {
    showAlert(err.message || 'Hủy giữ chỗ thất bại', 'error');
  }
}

// --- Quản lý Sổ Đặt Bàn Dành Cho Bồi Bàn (WAITER) ---
async function updateReservationsBadge() {
  const currentUser = typeof Auth !== 'undefined' ? Auth.getUser() : null;
  if (!currentUser || currentUser.role !== 'WAITER') return;

  const quickBtn = document.getElementById('btn-quick-view-res');
  if (quickBtn) quickBtn.style.display = 'inline-flex';

  try {
    const reservations = await api('/api/reservations?status=ACTIVE');
    const count = reservations.length;
    const badge1 = document.getElementById('quick-res-count');
    const badge2 = document.getElementById('navWaiterResCount');
    if (badge1) badge1.textContent = count;
    if (badge2) badge2.textContent = count;
  } catch (_) {}
}

async function openWaiterResModal() {
  const modal = document.getElementById('waiterReservationModal');
  const tbody = document.getElementById('waiterResTableBody');
  if (!modal || !tbody) return;

  modal.classList.add('active');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Đang tải sổ đặt bàn...</td></tr>';

  try {
    const reservations = await api('/api/reservations');
    const todayStr = new Date().toISOString().split('T')[0];
    const todayRes = reservations.filter(r => r.booking_time && r.booking_time.startsWith(todayStr));

    if (todayRes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Hôm nay chưa có lượt đặt bàn nào</td></tr>';
      return;
    }

    tbody.innerHTML = todayRes.map(r => {
      let timeFormatted = '—';
      if (r.booking_time) {
        timeFormatted = new Date(r.booking_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      }

      let action = '';
      if (r.status === 'ACTIVE') {
        action = `
          <button type="button" class="btn btn-sm btn-primary" data-action="w-checkin" data-id="${r.id}" data-table-id="${r.table_id}" data-name="${r.customer_name}" style="padding: 0.25rem 0.6rem; font-size: 0.78rem;">
            Vào bàn
          </button>
          <button type="button" class="btn btn-sm btn-secondary" data-action="w-cancel" data-id="${r.id}" data-table-id="${r.table_id}" style="padding: 0.25rem 0.5rem; font-size: 0.78rem; color: var(--danger); border-color: var(--danger-border); margin-left: 0.25rem;">
            Hủy
          </button>
        `;
      } else if (r.status === 'CHECKED_IN') {
        action = `<span style="color: var(--success); font-weight: 600; font-size: 0.8rem;">✓ Đã vào bàn</span>`;
      } else {
        action = `<span style="color: var(--text-muted); font-size: 0.8rem;">Đã hủy</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid var(--border-light);">
          <td style="padding: 0.6rem 0.75rem; font-weight: 600;">#${r.id}</td>
          <td style="padding: 0.6rem 0.75rem;">
            <strong>${r.customer_name}</strong><br>
            <a href="tel:${r.customer_phone}" style="color: var(--primary); font-size: 0.8rem;">${r.customer_phone}</a>
          </td>
          <td style="padding: 0.6rem 0.75rem;">
            <strong style="color: var(--text-main);">Bàn ${r.table_number}</strong> (${r.guest_count} khách)
          </td>
          <td style="padding: 0.6rem 0.75rem; font-weight: 600; color: #b45309;">${timeFormatted}</td>
          <td style="padding: 0.6rem 0.75rem; font-size: 0.8rem; color: var(--text-muted); max-width: 150px;">
            ${r.special_request || '—'}
          </td>
          <td style="padding: 0.6rem 0.75rem; text-align: right; white-space: nowrap;">
            ${action}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--danger);">${err.message}</td></tr>`;
  }
}

function closeWaiterResModal() {
  const modal = document.getElementById('waiterReservationModal');
  if (modal) modal.classList.remove('active');
}

function openWaiterNewBookingModal() {
  const modal = document.getElementById('waiterNewBookingModal');
  if (!modal) return;

  document.getElementById('wCustomerName').value = '';
  document.getElementById('wCustomerPhone').value = '';
  document.getElementById('wGuestCount').value = '2';
  document.getElementById('wSpecialRequest').value = '';

  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('wBookingTime').value = localIso;

  const select = document.getElementById('wTableSelect');
  select.innerHTML = '<option value="">-- Chọn bàn trống --</option>';
  const availableTables = allTablesList.filter(t => t.status === 'AVAILABLE');
  if (availableTables.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '⚠️ Hiện không còn bàn trống!';
    opt.disabled = true;
    select.appendChild(opt);
  } else {
    availableTables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `Bàn số ${t.table_number} (${t.capacity} chỗ)`;
      select.appendChild(opt);
    });
  }

  modal.classList.add('active');
}

function closeWaiterNewBookingModal() {
  const modal = document.getElementById('waiterNewBookingModal');
  if (modal) modal.classList.remove('active');
}

async function handleWaiterNewBookingSubmit(e) {
  e.preventDefault();
  const customer_name = document.getElementById('wCustomerName').value.trim();
  const customer_phone = document.getElementById('wCustomerPhone').value.trim();
  const table_id = parseInt(document.getElementById('wTableSelect').value, 10);
  const guest_count = parseInt(document.getElementById('wGuestCount').value, 10);
  const booking_time = document.getElementById('wBookingTime').value;
  const special_request = document.getElementById('wSpecialRequest').value.trim();

  if (!table_id) {
    showAlert('Vui lòng chọn bàn ăn còn trống!', 'error');
    return;
  }

  const btn = document.getElementById('btnSubmitWaiterBooking');
  btn.disabled = true;
  btn.textContent = 'Đang giữ chỗ...';

  try {
    const res = await api('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name,
        customer_phone,
        table_id,
        guest_count,
        booking_time,
        special_request,
      }),
    });

    showAlert(`🎉 ${res.message || 'Đặt bàn thành công!'}`, 'success');
    closeWaiterNewBookingModal();
    await loadTables();
    openWaiterResModal();
  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Xác Nhận Giữ Chỗ';
  }
}

// --- Thiết lập sự kiện & Khởi tạo (Tuân thủ 100% CSP - Không dùng inline onclick) ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Strict RBAC: Chặn Admin, Kitchen, Cashier không được vào trang đặt món
  if (typeof Auth !== 'undefined') {
    if (!Auth.checkOrderPageAccess()) return;
    Auth.initNav('order');
  }

  // 2. Tải bàn & thực đơn
  loadTables();
  loadMenu();
  renderCart();

  // 3. Sự kiện chọn bàn để kiểm tra trạng thái đặt trước & đơn dồn
  const tableSelect = document.getElementById('table-select');
  if (tableSelect) {
    tableSelect.addEventListener('change', () => {
      const tid = parseInt(tableSelect.value, 10);
      handleTableSelectionChange(tid);
    });
  }

  // Sự kiện nút Checkin / Hủy trên Reservation Banner
  const resBanner = document.getElementById('reservation-info-banner');
  if (resBanner) {
    resBanner.addEventListener('click', (e) => {
      const checkinBtn = e.target.closest('#btn-checkin-banner');
      if (checkinBtn) {
        const resId = parseInt(checkinBtn.getAttribute('data-res-id'), 10);
        const tableId = parseInt(checkinBtn.getAttribute('data-table-id'), 10);
        const name = checkinBtn.getAttribute('data-name') || '';
        doCheckinReservation(resId, tableId, name);
        return;
      }
      const cancelBtn = e.target.closest('#btn-cancel-res-banner');
      if (cancelBtn) {
        const resId = parseInt(cancelBtn.getAttribute('data-res-id'), 10);
        const tableId = parseInt(cancelBtn.getAttribute('data-table-id'), 10);
        doCancelReservation(resId, tableId);
        return;
      }
    });
  }

  // Sự kiện mở Sổ Đặt Bàn cho Bồi Bàn
  const btnQuickRes = document.getElementById('btn-quick-view-res');
  if (btnQuickRes) {
    btnQuickRes.addEventListener('click', openWaiterResModal);
  }

  const btnNavWaiterRes = document.getElementById('btnOpenWaiterResModal');
  if (btnNavWaiterRes) {
    btnNavWaiterRes.addEventListener('click', openWaiterResModal);
  }

  const waiterResCloseX = document.getElementById('waiterResModalCloseX');
  if (waiterResCloseX) {
    waiterResCloseX.addEventListener('click', closeWaiterResModal);
  }

  const waiterResCloseBtn = document.getElementById('waiterResModalCloseBtn');
  if (waiterResCloseBtn) {
    waiterResCloseBtn.addEventListener('click', closeWaiterResModal);
  }

  const waiterResTableBody = document.getElementById('waiterResTableBody');
  if (waiterResTableBody) {
    waiterResTableBody.addEventListener('click', (e) => {
      const checkinBtn = e.target.closest('button[data-action="w-checkin"]');
      if (checkinBtn) {
        const resId = parseInt(checkinBtn.getAttribute('data-id'), 10);
        const tableId = parseInt(checkinBtn.getAttribute('data-table-id'), 10);
        const name = checkinBtn.getAttribute('data-name') || '';
        doCheckinReservation(resId, tableId, name);
        return;
      }
      const cancelBtn = e.target.closest('button[data-action="w-cancel"]');
      if (cancelBtn) {
        const resId = parseInt(cancelBtn.getAttribute('data-id'), 10);
        const tableId = parseInt(cancelBtn.getAttribute('data-table-id'), 10);
        doCancelReservation(resId, tableId);
        return;
      }
    });
  }

  // Sự kiện nhận đặt bàn hotline cho Bồi bàn
  const btnOpenWaiterNewRes = document.getElementById('btnOpenWaiterNewRes');
  if (btnOpenWaiterNewRes) {
    btnOpenWaiterNewRes.addEventListener('click', openWaiterNewBookingModal);
  }

  const waiterNewBookingCloseX = document.getElementById('waiterNewBookingCloseX');
  if (waiterNewBookingCloseX) {
    waiterNewBookingCloseX.addEventListener('click', closeWaiterNewBookingModal);
  }

  const waiterNewBookingCancelBtn = document.getElementById('waiterNewBookingCancelBtn');
  if (waiterNewBookingCancelBtn) {
    waiterNewBookingCancelBtn.addEventListener('click', closeWaiterNewBookingModal);
  }

  const waiterNewBookingForm = document.getElementById('waiterNewBookingForm');
  if (waiterNewBookingForm) {
    waiterNewBookingForm.addEventListener('submit', handleWaiterNewBookingSubmit);
  }

  // 4. Sự kiện lọc danh mục
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

  // 5. Sự kiện sắp xếp
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderMenu();
    });
  }

  // 6. Sự kiện tìm kiếm
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentSearch = searchInput.value.trim().toLowerCase();
      renderMenu();
    });
  }

  // 7. Sự kiện gửi đơn hàng
  const btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', submitOrder);
  }

  // Tự động đồng bộ số liệu bàn & đặt bàn mỗi 10 giây
  setInterval(() => {
    loadTables();
  }, 10000);
});
