// ============================================================
// admin.js - Xử lý logic Dashboard Quản trị Nhà hàng (100% CSP Compliant)
// ============================================================
'use strict';

let allMenuItems = [];
let allTables = [];
let allReservations = [];

const DEFAULT_MENU_IMAGES = {
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

function getItemImage(item) {
  if (item.image_url) return item.image_url;
  return DEFAULT_MENU_IMAGES[item.name] || '/images/pho-bo.jpg';
}

function compressImage(file, maxWidth = 640, maxHeight = 480, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Không thể đọc file ảnh'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Lỗi khi đọc file'));
    reader.readAsDataURL(file);
  });
}

function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.round(amount || 0));
}

function getCategoryLabel(cat) {
  const map = {
    APPETIZER: 'Khai vị',
    MAIN: 'Món chính',
    DESSERT: 'Tráng miệng',
    BEVERAGE: 'Đồ uống',
  };
  return map[cat] || cat;
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Kiểm tra quyền Strict RBAC: Chỉ ADMIN được phép vào trang này
  const currentUser = Auth.requireAuth(['ADMIN']);
  if (!currentUser) return;

  // 2. Khởi tạo thanh menu
  Auth.initNav('admin');

  // Hiển thị đồng hồ thời gian
  const timeBadge = document.getElementById('liveTimeBadge');
  if (timeBadge) {
    const updateTime = () => {
      const now = new Date();
      timeBadge.textContent = '🕒 ' + now.toLocaleTimeString('vi-VN') + ' | ' + now.toLocaleDateString('vi-VN');
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // 3. Khởi tạo giá trị ngày mặc định (Hôm nay)
  const today = new Date().toISOString().split('T')[0];
  const revFromInput = document.getElementById('revFrom');
  const revToInput = document.getElementById('revTo');
  if (revFromInput) revFromInput.value = today;
  if (revToInput) revToInput.value = today;

  // 4. Thiết lập sự kiện chuyển Tab (Dùng addEventListener thay vì inline onclick)
  const tabsNav = document.getElementById('adminTabsNav');
  if (tabsNav) {
    tabsNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const targetTabId = btn.getAttribute('data-tab');
      if (!targetTabId) return;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.getElementById(targetTabId);
      if (panel) panel.classList.add('active');

      if (targetTabId === 'revenueTab') loadRevenueData();
      else if (targetTabId === 'menuTab') loadMenuData();
      else if (targetTabId === 'tableTab') loadTablesData();
      else if (targetTabId === 'staffTab') loadStaffData();
      else if (targetTabId === 'reservationTab') loadReservationsData();
    });
  }

  // 5. Sự kiện lọc Doanh thu
  const revForm = document.getElementById('revFilterForm');
  if (revForm) {
    revForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loadRevenueData();
    });
  }

  const btnTodayRev = document.getElementById('btnTodayRev');
  if (btnTodayRev) {
    btnTodayRev.addEventListener('click', () => {
      const d = new Date().toISOString().split('T')[0];
      if (revFromInput) revFromInput.value = d;
      if (revToInput) revToInput.value = d;
      loadRevenueData();
    });
  }

  // 6. Sự kiện tìm kiếm & lọc Thực đơn
  const menuSearch = document.getElementById('menuSearch');
  if (menuSearch) {
    menuSearch.addEventListener('input', filterMenuTable);
  }
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', filterMenuTable);
  }

  // 7. Sự kiện Modal Thực đơn & Tải ảnh
  const btnOpenAdd = document.getElementById('btnOpenAddMenu');
  if (btnOpenAdd) {
    btnOpenAdd.addEventListener('click', openAddModal);
  }

  const modalCloseX = document.getElementById('modalCloseX');
  if (modalCloseX) {
    modalCloseX.addEventListener('click', closeModal);
  }

  const modalCancelBtn = document.getElementById('modalCancelBtn');
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeModal);
  }

  const menuForm = document.getElementById('menuForm');
  if (menuForm) {
    menuForm.addEventListener('submit', handleSaveMenu);
  }

  // Sự kiện chọn file ảnh (Client-side Canvas compression)
  const menuImageFile = document.getElementById('menuImageFile');
  if (menuImageFile) {
    menuImageFile.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('Vui lòng chọn một file hình ảnh hợp lệ (JPG, PNG, WEBP).');
        menuImageFile.value = '';
        return;
      }

      try {
        const compressedBase64 = await compressImage(file, 640, 480, 0.85);
        document.getElementById('menuImageUrl').value = compressedBase64;

        const previewImg = document.getElementById('imagePreview');
        const placeholder = document.getElementById('imagePreviewPlaceholder');
        const btnRemove = document.getElementById('btnRemoveImage');

        if (previewImg) {
          previewImg.src = compressedBase64;
          previewImg.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (btnRemove) btnRemove.style.display = 'inline-block';
      } catch (err) {
        alert('Lỗi xử lý ảnh: ' + err.message);
      }
    });
  }

  // Sự kiện gỡ ảnh
  const btnRemoveImage = document.getElementById('btnRemoveImage');
  if (btnRemoveImage) {
    btnRemoveImage.addEventListener('click', () => {
      document.getElementById('menuImageUrl').value = '';
      const fileInput = document.getElementById('menuImageFile');
      if (fileInput) fileInput.value = '';

      const previewImg = document.getElementById('imagePreview');
      const placeholder = document.getElementById('imagePreviewPlaceholder');
      if (previewImg) {
        previewImg.src = '';
        previewImg.style.display = 'none';
      }
      if (placeholder) placeholder.style.display = 'block';
      btnRemoveImage.style.display = 'none';
    });
  }

  // 8. Event Delegation trên Bảng Thực đơn (Tránh inline onclick)
  const menuTableBody = document.getElementById('menuTableBody');
  if (menuTableBody) {
    menuTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (!id) return;

      if (action === 'toggle') {
        const nextStatus = btn.getAttribute('data-status') === 'true';
        toggleAvailable(id, nextStatus);
      } else if (action === 'edit') {
        openEditModal(id);
      } else if (action === 'delete') {
        softDeleteItem(id);
      }
    });
  }

  // 9. Sự kiện Quản lý Bàn Ăn
  const btnRefreshTables = document.getElementById('btnRefreshTables');
  if (btnRefreshTables) {
    btnRefreshTables.addEventListener('click', loadTablesData);
  }

  const btnOpenAddTable = document.getElementById('btnOpenAddTable');
  if (btnOpenAddTable) {
    btnOpenAddTable.addEventListener('click', openAddTableModal);
  }

  const tableModalCloseX = document.getElementById('tableModalCloseX');
  if (tableModalCloseX) {
    tableModalCloseX.addEventListener('click', closeTableModal);
  }

  const tableModalCancelBtn = document.getElementById('tableModalCancelBtn');
  if (tableModalCancelBtn) {
    tableModalCancelBtn.addEventListener('click', closeTableModal);
  }

  const tableForm = document.getElementById('tableForm');
  if (tableForm) {
    tableForm.addEventListener('submit', handleSaveTable);
  }

  const tablesTableBody = document.getElementById('tablesTableBody');
  if (tablesTableBody) {
    tablesTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (!id) return;

      if (action === 'release') {
        handleQuickTableStatus(id, 'AVAILABLE');
      } else if (action === 'reserve') {
        handleQuickTableStatus(id, 'RESERVED');
      } else if (action === 'checkin') {
        const resId = btn.getAttribute('data-reservation-id');
        const custName = btn.getAttribute('data-customer-name') || '';
        handleCheckinReservation(resId, id, custName);
      } else if (action === 'cancel-reservation') {
        const resId = btn.getAttribute('data-reservation-id');
        handleCancelReservation(resId, id);
      } else if (action === 'edit') {
        openEditTableModal(id);
      } else if (action === 'delete') {
        const tableNumber = btn.getAttribute('data-table-number') || id;
        handleDeleteTable(id, tableNumber);
      }
    });
  }

  // Tự động làm mới số liệu bàn mỗi 8 giây khi đang ở tab Quản lý Bàn ăn
  setInterval(() => {
    const tableTab = document.getElementById('tableTab');
    if (tableTab && tableTab.classList.contains('active')) {
      loadTablesData();
    }
  }, 8000);

  // 10. Sự kiện Quản trị Tài khoản (Staff)
  const createStaffForm = document.getElementById('createStaffForm');
  if (createStaffForm) {
    createStaffForm.addEventListener('submit', handleCreateStaff);
  }

  const btnRefreshStaff = document.getElementById('btnRefreshStaff');
  if (btnRefreshStaff) {
    btnRefreshStaff.addEventListener('click', loadStaffData);
  }

  const staffTableBody = document.getElementById('staffTableBody');
  if (staffTableBody) {
    staffTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (!id) return;

      if (action === 'reset-pass') {
        const username = btn.getAttribute('data-username') || '';
        openResetPassModal(id, username);
      } else if (action === 'toggle-status') {
        const username = btn.getAttribute('data-username') || '';
        const newStatus = btn.getAttribute('data-status') === 'true';
        handleToggleUserStatus(id, username, newStatus);
      }
    });
  }

  const resetPassCloseX = document.getElementById('resetPassCloseX');
  if (resetPassCloseX) {
    resetPassCloseX.addEventListener('click', closeResetPassModal);
  }

  const resetPassCancelBtn = document.getElementById('resetPassCancelBtn');
  if (resetPassCancelBtn) {
    resetPassCancelBtn.addEventListener('click', closeResetPassModal);
  }

  const resetPassForm = document.getElementById('resetPassForm');
  if (resetPassForm) {
    resetPassForm.addEventListener('submit', handleConfirmResetPass);
  }

  // 11. Sự kiện Sổ Đặt Bàn (Reservations)
  const resSearchInput = document.getElementById('resSearchInput');
  if (resSearchInput) {
    resSearchInput.addEventListener('input', filterReservationsTable);
  }

  const resStatusFilter = document.getElementById('resStatusFilter');
  if (resStatusFilter) {
    resStatusFilter.addEventListener('change', filterReservationsTable);
  }

  const btnOpenAddRes = document.getElementById('btnOpenAddReservation');
  if (btnOpenAddRes) {
    btnOpenAddRes.addEventListener('click', openAddReservationModal);
  }

  const btnRefreshRes = document.getElementById('btnRefreshReservations');
  if (btnRefreshRes) {
    btnRefreshRes.addEventListener('click', loadReservationsData);
  }

  const resModalCloseX = document.getElementById('resModalCloseX');
  if (resModalCloseX) {
    resModalCloseX.addEventListener('click', closeReservationModal);
  }

  const resModalCancelBtn = document.getElementById('resModalCancelBtn');
  if (resModalCancelBtn) {
    resModalCancelBtn.addEventListener('click', closeReservationModal);
  }

  const reservationForm = document.getElementById('reservationForm');
  if (reservationForm) {
    reservationForm.addEventListener('submit', handleSaveReservation);
  }

  const reservationsTableBody = document.getElementById('reservationsTableBody');
  if (reservationsTableBody) {
    reservationsTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const resId = parseInt(btn.getAttribute('data-id'), 10);
      const tableId = parseInt(btn.getAttribute('data-table-id'), 10);
      const custName = btn.getAttribute('data-customer-name') || '';

      if (action === 'checkin-res') {
        handleCheckinReservation(resId, tableId, custName);
      } else if (action === 'cancel-res') {
        handleCancelReservation(resId, tableId);
      }
    });
  }

  // Tự động làm mới số liệu đặt bàn mỗi 8 giây khi đang ở tab Sổ Đặt Bàn
  setInterval(() => {
    const resTab = document.getElementById('reservationTab');
    if (resTab && resTab.classList.contains('active')) {
      loadReservationsData();
    }
  }, 8000);

  // 12. TẢI NGAY TOÀN BỘ SỐ LIỆU BAN ĐẦU
  loadRevenueData();
  loadMenuData();
  loadTablesData();
  loadStaffData();
  loadReservationsData();
});

// ============================================================
// LOGIC BÁO CÁO DOANH THU & KPIS
// ============================================================

async function loadRevenueData() {
  const from = document.getElementById('revFrom')?.value || '';
  const to = document.getElementById('revTo')?.value || '';

  try {
    let url = '/api/revenue/summary';
    const params = [];
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
    });

    if (!res.ok) throw new Error('Không thể tải dữ liệu doanh thu');
    const data = await res.json();

    const totalRev = parseFloat(data.summary?.total_revenue || 0);
    const totalOrders = parseInt(data.summary?.total_orders || 0, 10);
    const avgOrder = totalOrders > 0 ? Math.round(totalRev / totalOrders) : 0;

    const elRev = document.getElementById('statRevenue');
    const elOrders = document.getElementById('statOrders');
    const elAvg = document.getElementById('statAvg');

    if (elRev) elRev.textContent = formatVND(totalRev);
    if (elOrders) elOrders.textContent = totalOrders.toLocaleString('vi-VN');
    if (elAvg) elAvg.textContent = formatVND(avgOrder);

    // Top items
    const topBody = document.getElementById('topItemsBody');
    if (!topBody) return;

    if (!data.top_items || data.top_items.length === 0) {
      topBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Chưa có đơn hàng thanh toán trong khoảng thời gian này</td></tr>`;
      return;
    }

    topBody.innerHTML = data.top_items.map(item => `
      <tr>
        <td><strong style="color: var(--text-main);">${item.name}</strong></td>
        <td><span class="cat-badge">${getCategoryLabel(item.category)}</span></td>
        <td style="text-align: center; font-weight: 700; color: var(--accent);">${item.total_sold}</td>
        <td style="text-align: right; font-weight: 700; color: var(--primary);">${formatVND(item.total_revenue)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Lỗi tải doanh thu:', err);
  }
}

// ============================================================
// LOGIC QUẢN LÝ THỰC ĐƠN (MENU MANAGEMENT)
// ============================================================

async function loadMenuData() {
  const tbody = document.getElementById('menuTableBody');
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('Không thể tải thực đơn');
    allMenuItems = await res.json();
    renderMenuTable(allMenuItems);
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 1.5rem;">${err.message}</td></tr>`;
    }
  }
}

function renderMenuTable(items) {
  const tbody = document.getElementById('menuTableBody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Không tìm thấy món ăn nào</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const isAvail = item.is_available;
    const thumb = getItemImage(item);
    return `
      <tr>
        <td style="font-weight: 600; color: var(--text-muted);">${item.id}</td>
        <td>
          <img src="${thumb}" alt="${item.name}" class="table-menu-thumb" onerror="this.src='/images/pho-bo.jpg'">
        </td>
        <td>
          <strong style="color: var(--text-main); font-size: 0.95rem;">${item.name}</strong>
          ${item.is_best_seller ? '<span class="badge-best-seller-mini">🔥 Best Seller</span>' : ''}
        </td>
        <td><span class="cat-badge">${getCategoryLabel(item.category)}</span></td>
        <td style="font-weight: 700; color: var(--primary);">${formatVND(item.price)}</td>
        <td>
          <span class="status-badge ${isAvail ? 'available' : 'unavailable'}">
            ${isAvail ? '● Còn phục vụ' : '○ Tạm hết'}
          </span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" data-action="toggle" data-id="${item.id}" data-status="${!isAvail}" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
            ${isAvail ? 'Đánh dấu Hết' : 'Bật phục vụ'}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${item.id}" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
            Sửa
          </button>
          <button class="btn btn-sm" data-action="delete" data-id="${item.id}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: var(--danger-light); color: var(--danger); border: 1px solid var(--danger-border);">
            Ngừng bán
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterMenuTable() {
  const searchInput = document.getElementById('menuSearch');
  const catInput = document.getElementById('categoryFilter');
  const search = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const category = catInput ? catInput.value : '';

  const filtered = allMenuItems.filter(item => {
    const matchName = item.name.toLowerCase().includes(search);
    const matchCat = category === '' || item.category === category;
    return matchName && matchCat;
  });

  renderMenuTable(filtered);
}

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Thêm Món Mới';
  document.getElementById('menuId').value = '';
  document.getElementById('menuImageUrl').value = '';
  document.getElementById('menuName').value = '';
  document.getElementById('menuCategory').value = 'MAIN';
  document.getElementById('menuPrice').value = '';
  document.getElementById('menuAvailable').checked = true;

  const fileInput = document.getElementById('menuImageFile');
  if (fileInput) fileInput.value = '';
  const previewImg = document.getElementById('imagePreview');
  const placeholder = document.getElementById('imagePreviewPlaceholder');
  const btnRemove = document.getElementById('btnRemoveImage');
  if (previewImg) {
    previewImg.src = '';
    previewImg.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'block';
  if (btnRemove) btnRemove.style.display = 'none';

  document.getElementById('menuModal').classList.add('active');
}

function openEditModal(id) {
  const item = allMenuItems.find(i => i.id === id);
  if (!item) return;

  document.getElementById('modalTitle').textContent = 'Chỉnh Sửa Món Ăn';
  document.getElementById('menuId').value = item.id;
  document.getElementById('menuImageUrl').value = item.image_url || '';
  document.getElementById('menuName').value = item.name;
  document.getElementById('menuCategory').value = item.category;
  document.getElementById('menuPrice').value = Math.round(item.price);
  document.getElementById('menuAvailable').checked = item.is_available;

  const fileInput = document.getElementById('menuImageFile');
  if (fileInput) fileInput.value = '';
  const previewImg = document.getElementById('imagePreview');
  const placeholder = document.getElementById('imagePreviewPlaceholder');
  const btnRemove = document.getElementById('btnRemoveImage');

  const imgSrc = getItemImage(item);
  if (imgSrc) {
    if (previewImg) {
      previewImg.src = imgSrc;
      previewImg.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (btnRemove) btnRemove.style.display = item.image_url ? 'inline-block' : 'none';
  } else {
    if (previewImg) {
      previewImg.src = '';
      previewImg.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'block';
    if (btnRemove) btnRemove.style.display = 'none';
  }

  document.getElementById('menuModal').classList.add('active');
}

function closeModal() {
  document.getElementById('menuModal').classList.remove('active');
}

async function handleSaveMenu(e) {
  e.preventDefault();
  const id = document.getElementById('menuId').value;
  const name = document.getElementById('menuName').value.trim();
  const category = document.getElementById('menuCategory').value;
  const price = parseFloat(document.getElementById('menuPrice').value);
  const is_available = document.getElementById('menuAvailable').checked;
  const image_url = document.getElementById('menuImageUrl').value || null;

  const btn = document.getElementById('saveMenuBtn');
  btn.disabled = true;

  try {
    let url = '/api/menu';
    let method = 'POST';
    if (id) {
      url = `/api/menu/${id}`;
      method = 'PATCH';
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({ name, category, price, is_available, image_url }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Lưu món ăn thất bại');
    }

    closeModal();
    loadMenuData();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function toggleAvailable(id, newStatus) {
  try {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({ is_available: newStatus }),
    });

    if (!res.ok) throw new Error('Cập nhật trạng thái thất bại');
    loadMenuData();
  } catch (err) {
    alert(err.message);
  }
}

async function softDeleteItem(id) {
  if (!confirm('Bạn có chắc muốn ngừng bán món này? Món sẽ được chuyển sang trạng thái tạm hết phục vụ.')) {
    return;
  }
  try {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
    });

    if (!res.ok) throw new Error('Thao tác thất bại');
    loadMenuData();
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// LOGIC QUẢN LÝ BÀN ĂN (TABLES MANAGEMENT)
// ============================================================

async function loadTablesData() {
  const tbody = document.getElementById('tablesTableBody');
  try {
    const res = await fetch('/api/tables', {
      headers: {
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
    });
    if (!res.ok) throw new Error('Không thể tải danh sách bàn ăn');
    allTables = await res.json();
    renderTablesStats(allTables);
    renderTablesTable(allTables);
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 1.5rem;">${err.message}</td></tr>`;
    }
  }
}

function renderTablesStats(tables) {
  const total = tables.length;
  const available = tables.filter(t => t.status === 'AVAILABLE').length;
  const occupied = tables.filter(t => t.status === 'OCCUPIED').length;
  const reserved = tables.filter(t => t.status === 'RESERVED').length;

  const elTotal = document.getElementById('statTotalTables');
  const elAvail = document.getElementById('statAvailableTables');
  const elOcc = document.getElementById('statOccupiedTables');
  const elRes = document.getElementById('statReservedTables');

  if (elTotal) elTotal.textContent = total;
  if (elAvail) elAvail.textContent = available;
  if (elOcc) elOcc.textContent = occupied;
  if (elRes) elRes.textContent = reserved;
}

function getTableStatusBadge(status) {
  if (status === 'AVAILABLE') {
    return `<span class="status-badge available">● Trống / Sẵn sàng</span>`;
  }
  if (status === 'OCCUPIED') {
    return `<span class="status-badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;">● Có khách</span>`;
  }
  if (status === 'RESERVED') {
    return `<span class="status-badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">● Đặt trước</span>`;
  }
  return `<span class="status-badge">${status}</span>`;
}

function renderTablesTable(tables) {
  const tbody = document.getElementById('tablesTableBody');
  if (!tbody) return;

  if (!tables || tables.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Chưa có bàn ăn nào trong hệ thống</td></tr>`;
    return;
  }

  tbody.innerHTML = tables.map(t => {
    let orderInfo = `<span style="color: var(--text-muted); font-size: 0.85rem;">— Không có —</span>`;
    if (t.active_order_id) {
      orderInfo = `<strong style="color: var(--primary);">#${t.active_order_id}</strong> <span style="font-size: 0.8rem; background: var(--surface-alt); padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid var(--border);">${t.active_order_status}</span>`;
    } else if (t.status === 'RESERVED' && t.customer_name) {
      const timeStr = t.booking_time ? new Date(t.booking_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(t.booking_time).toLocaleDateString('vi-VN') : '';
      orderInfo = `
        <div style="font-size: 0.85rem; line-height: 1.35;">
          <strong style="color: #b45309;">👤 ${t.customer_name}</strong> <span style="color: #64748b;">(${t.customer_phone})</span><br>
          <span style="color: var(--text-muted); font-size: 0.78rem;">🕒 Hẹn: ${timeStr} • ${t.guest_count || 2} khách</span>
          ${t.special_request ? `<div style="font-size: 0.75rem; color: #b45309; font-style: italic;">📝 ${t.special_request}</div>` : ''}
        </div>
      `;
    }

    let actionBtns = '';
    if (t.status === 'RESERVED') {
      actionBtns = `
        <button class="btn btn-sm btn-primary" data-action="checkin" data-id="${t.id}" data-reservation-id="${t.active_reservation_id || ''}" data-customer-name="${t.customer_name || ''}" title="Khách đến quán nhận bàn" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
          Khách vào bàn
        </button>
        <button class="btn btn-secondary btn-sm" data-action="cancel-reservation" data-id="${t.id}" data-reservation-id="${t.active_reservation_id || ''}" title="Hủy giữ chỗ và giải phóng bàn" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem; color: var(--danger); border-color: var(--danger-border);">
          Hủy giữ chỗ
        </button>
      `;
    } else if (t.status === 'OCCUPIED') {
      actionBtns = `
        <button class="btn btn-secondary btn-sm" data-action="release" data-id="${t.id}" title="Giải phóng bàn kẹt về trạng thái AVAILABLE" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem; color: var(--success); border-color: var(--success-border);">
          Giải phóng
        </button>
      `;
    } else {
      actionBtns = `
        <button class="btn btn-secondary btn-sm" data-action="reserve" data-id="${t.id}" title="Đặt trước bàn này" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem; color: #b45309;">
          Đặt trước
        </button>
      `;
    }

    return `
      <tr>
        <td style="font-weight: 600; color: var(--text-muted);">${t.id}</td>
        <td><strong style="color: var(--text-main); font-size: 1rem;">Bàn ${t.table_number}</strong></td>
        <td><span style="font-weight: 600;">${t.capacity}</span> <span style="color: var(--text-muted); font-size: 0.85rem;">chỗ ngồi</span></td>
        <td>${getTableStatusBadge(t.status)}</td>
        <td>${orderInfo}</td>
        <td style="text-align: right; white-space: nowrap;">
          ${actionBtns}
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${t.id}" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
            Sửa
          </button>
          <button class="btn btn-sm" data-action="delete" data-id="${t.id}" data-table-number="${t.table_number}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: var(--danger-light); color: var(--danger); border: 1px solid var(--danger-border);">
            Xóa
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddTableModal() {
  document.getElementById('tableModalTitle').textContent = 'Thêm Bàn Ăn Mới';
  document.getElementById('tableId').value = '';
  document.getElementById('tableNumber').value = '';
  document.getElementById('tableCapacity').value = '4';
  const statusGroup = document.getElementById('tableStatusGroup');
  if (statusGroup) statusGroup.style.display = 'none';
  document.getElementById('tableModal').classList.add('active');
}

function openEditTableModal(id) {
  const table = allTables.find(t => t.id === id);
  if (!table) return;

  document.getElementById('tableModalTitle').textContent = `Chỉnh Sửa Bàn Số ${table.table_number}`;
  document.getElementById('tableId').value = table.id;
  document.getElementById('tableNumber').value = table.table_number;
  document.getElementById('tableCapacity').value = table.capacity;
  const statusGroup = document.getElementById('tableStatusGroup');
  if (statusGroup) {
    statusGroup.style.display = 'block';
    document.getElementById('tableStatus').value = table.status;
  }
  document.getElementById('tableModal').classList.add('active');
}

function closeTableModal() {
  document.getElementById('tableModal').classList.remove('active');
}

async function handleSaveTable(e) {
  e.preventDefault();
  const id = document.getElementById('tableId').value;
  const table_number = parseInt(document.getElementById('tableNumber').value, 10);
  const capacity = parseInt(document.getElementById('tableCapacity').value, 10);
  const btn = document.getElementById('saveTableBtn');
  btn.disabled = true;

  try {
    let url = '/api/tables';
    let method = 'POST';
    let payload = { table_number, capacity };

    if (id) {
      url = `/api/tables/${id}`;
      method = 'PATCH';
      payload.status = document.getElementById('tableStatus').value;
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Lưu thông tin bàn thất bại');
    }

    closeTableModal();
    loadTablesData();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleQuickTableStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/tables/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cập nhật trạng thái thất bại');
    loadTablesData();
  } catch (err) {
    alert(err.message);
  }
}

async function handleDeleteTable(id, tableNumber) {
  if (!confirm(`Bạn có chắc chắn muốn xóa Bàn ${tableNumber}? Thao tác này sẽ bị chặn nếu bàn đang có đơn hàng hoặc có dữ liệu đơn trong quá khứ.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/tables/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Xóa bàn thất bại');
    }

    alert(data.message || `Đã xóa bàn số ${tableNumber} thành công!`);
    loadTablesData();
  } catch (err) {
    alert(err.message);
  }
}

async function handleCheckinReservation(reservationId, tableId, customerName) {
  if (!confirm(`Khách "${customerName || 'đặt trước'}" đã đến nhận bàn? Thao tác này sẽ chuyển bàn sang trạng thái Có Khách (OCCUPIED).`)) {
    return;
  }

  try {
    if (reservationId) {
      const res = await fetch(`/api/reservations/${reservationId}/checkin`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${Auth.getToken()}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in thất bại');
      alert(data.message || 'Khách đã vào bàn thành công!');
    } else {
      await handleQuickTableStatus(tableId, 'OCCUPIED');
    }
    loadTablesData();
    loadReservationsData();
  } catch (err) {
    alert(err.message);
  }
}

async function handleCancelReservation(reservationId, tableId) {
  if (!confirm('Bạn có chắc chắn muốn hủy đặt bàn này và giải phóng bàn về trạng thái Trống (AVAILABLE)?')) {
    return;
  }

  try {
    if (reservationId) {
      const res = await fetch(`/api/reservations/${reservationId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${Auth.getToken()}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hủy đặt bàn thất bại');
      alert(data.message || 'Đã hủy giữ chỗ thành công!');
    } else {
      await handleQuickTableStatus(tableId, 'AVAILABLE');
    }
    loadTablesData();
    loadReservationsData();
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// LOGIC QUẢN TRỊ TÀI KHOẢN (STAFF & USER MANAGEMENT)
// ============================================================

async function loadStaffData() {
  const tbody = document.getElementById('staffTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/users', {
      headers: {
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
    });

    if (!res.ok) throw new Error('Không thể tải danh sách tài khoản');
    const users = await res.json();
    renderStaffTable(users);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 1.5rem;">${err.message}</td></tr>`;
  }
}

function renderStaffTable(users) {
  const tbody = document.getElementById('staffTableBody');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Không có tài khoản nào</td></tr>`;
    return;
  }

  const currentUser = Auth.getUser();

  tbody.innerHTML = users.map(u => {
    const roleClass = `role-${u.role.toLowerCase()}`;
    const isActive = u.is_active !== false;
    const isSelf = currentUser && currentUser.id === u.id;

    return `
      <tr>
        <td style="font-weight: 600; color: var(--text-muted);">${u.id}</td>
        <td>
          <strong style="color: var(--text-main); font-size: 0.95rem;">${u.username}</strong>
          ${isSelf ? '<span style="font-size: 0.75rem; background: var(--primary-light); color: var(--primary); padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700; margin-left: 0.4rem;">Bạn</span>' : ''}
        </td>
        <td><span class="role-badge ${roleClass}">${Auth.getRoleLabel(u.role)} (${u.role})</span></td>
        <td>
          <span class="status-badge ${isActive ? 'available' : 'unavailable'}">
            ${isActive ? '● Hoạt động' : '○ Đã khóa'}
          </span>
        </td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${new Date(u.created_at).toLocaleString('vi-VN')}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" data-action="reset-pass" data-id="${u.id}" data-username="${u.username}" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
            Đổi mật khẩu
          </button>
          ${isSelf ? `
            <button class="btn btn-secondary btn-sm" disabled title="Không thể tự khóa tài khoản của chính mình" style="opacity: 0.4; cursor: not-allowed; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
              Khóa
            </button>
          ` : `
            <button class="btn btn-sm" data-action="toggle-status" data-id="${u.id}" data-username="${u.username}" data-status="${!isActive}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; ${isActive ? 'background: var(--danger-light); color: var(--danger); border: 1px solid var(--danger-border);' : 'background: var(--success-light); color: var(--success); border: 1px solid var(--success-border);'}">
              ${isActive ? 'Khóa tài khoản' : 'Mở khóa'}
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

async function handleCreateStaff(e) {
  e.preventDefault();
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({ username, password, role }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Tạo tài khoản thất bại');

    alert(`Tạo thành công tài khoản "${data.username}" (${data.role})!`);
    document.getElementById('createStaffForm').reset();
    loadStaffData();
  } catch (err) {
    alert(err.message);
  }
}

function openResetPassModal(userId, username) {
  document.getElementById('resetUserId').value = userId;
  document.getElementById('resetTargetUsername').textContent = username;
  document.getElementById('resetNewPassword').value = '';
  document.getElementById('resetPasswordModal').classList.add('active');
}

function closeResetPassModal() {
  document.getElementById('resetPasswordModal').classList.remove('active');
}

async function handleConfirmResetPass(e) {
  e.preventDefault();
  const userId = document.getElementById('resetUserId').value;
  const password = document.getElementById('resetNewPassword').value;
  const username = document.getElementById('resetTargetUsername').textContent;
  const btn = document.getElementById('btnConfirmResetPass');
  btn.disabled = true;

  try {
    const res = await fetch(`/api/users/${userId}/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Đổi mật khẩu thất bại');

    alert(`Đã đổi mật khẩu thành công cho nhân viên "${username}"!`);
    closeResetPassModal();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleToggleUserStatus(userId, username, newStatus) {
  const actionText = newStatus ? 'mở khóa' : 'khóa';
  if (!confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản "${username}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({ is_active: newStatus }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cập nhật trạng thái thất bại');

    alert(data.message || `Đã ${actionText} tài khoản thành công!`);
    loadStaffData();
  } catch (err) {
    alert(err.message);
  }
}

// ============================================================
// LOGIC SỔ ĐẶT BÀN (RESERVATIONS MANAGEMENT)
// ============================================================

async function loadReservationsData() {
  const tbody = document.getElementById('reservationsTableBody');
  try {
    const res = await fetch('/api/reservations', {
      headers: {
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
    });
    if (!res.ok) throw new Error('Không thể tải danh sách đặt bàn');
    allReservations = await res.json();
    renderReservationsStats(allReservations);
    filterReservationsTable();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger); padding: 1.5rem;">${err.message}</td></tr>`;
    }
  }
}

function renderReservationsStats(reservations) {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayReservations = reservations.filter(r => {
    if (!r.booking_time) return false;
    return r.booking_time.startsWith(todayStr);
  });

  const totalToday = todayReservations.length;
  const activeCount = reservations.filter(r => r.status === 'ACTIVE').length;
  const checkedInCount = todayReservations.filter(r => r.status === 'CHECKED_IN').length;
  const totalGuests = reservations.filter(r => r.status === 'ACTIVE').reduce((sum, r) => sum + (parseInt(r.guest_count, 10) || 0), 0);

  const elToday = document.getElementById('statTodayRes');
  const elActive = document.getElementById('statActiveRes');
  const elCheckedIn = document.getElementById('statCheckedInRes');
  const elGuests = document.getElementById('statGuestCount');

  if (elToday) elToday.textContent = totalToday;
  if (elActive) elActive.textContent = activeCount;
  if (elCheckedIn) elCheckedIn.textContent = checkedInCount;
  if (elGuests) elGuests.textContent = totalGuests;
}

function filterReservationsTable() {
  const search = (document.getElementById('resSearchInput')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('resStatusFilter')?.value || '';

  let filtered = allReservations;

  if (statusFilter) {
    filtered = filtered.filter(r => r.status === statusFilter);
  }

  if (search) {
    filtered = filtered.filter(r => 
      (r.customer_name && r.customer_name.toLowerCase().includes(search)) ||
      (r.customer_phone && r.customer_phone.includes(search)) ||
      (r.table_number && r.table_number.toString().includes(search)) ||
      (r.special_request && r.special_request.toLowerCase().includes(search))
    );
  }

  renderReservationsTable(filtered);
}

function renderReservationsTable(reservations) {
  const tbody = document.getElementById('reservationsTableBody');
  if (!tbody) return;

  if (!reservations || reservations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">Không tìm thấy phiếu đặt bàn nào phù hợp</td></tr>`;
    return;
  }

  tbody.innerHTML = reservations.map(r => {
    let statusBadge = '';
    if (r.status === 'ACTIVE') {
      statusBadge = `<span class="status-badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">● Đang giữ chỗ</span>`;
    } else if (r.status === 'CHECKED_IN') {
      statusBadge = `<span class="status-badge" style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;">● Đã nhận bàn</span>`;
    } else if (r.status === 'CANCELLED') {
      statusBadge = `<span class="status-badge" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;">● Đã hủy</span>`;
    } else {
      statusBadge = `<span class="status-badge">${r.status}</span>`;
    }

    let timeFormatted = '—';
    if (r.booking_time) {
      const dt = new Date(r.booking_time);
      const hours = dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const date = dt.toLocaleDateString('vi-VN');
      timeFormatted = `<strong>${hours}</strong> <span style="color:var(--text-muted); font-size:0.8rem;">${date}</span>`;
    }

    let actionBtns = '';
    if (r.status === 'ACTIVE') {
      actionBtns = `
        <button class="btn btn-sm btn-primary" data-action="checkin-res" data-id="${r.id}" data-table-id="${r.table_id}" data-customer-name="${r.customer_name}" title="Khách đến nhận bàn" style="margin-right: 0.35rem; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
          Khách vào bàn
        </button>
        <button class="btn btn-secondary btn-sm" data-action="cancel-res" data-id="${r.id}" data-table-id="${r.table_id}" title="Hủy phiếu đặt" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; color: var(--danger); border-color: var(--danger-border);">
          Hủy đặt
        </button>
      `;
    } else if (r.status === 'CHECKED_IN') {
      actionBtns = `<span style="color: var(--success); font-weight: 600; font-size: 0.85rem;">✓ Đã vào bàn</span>`;
    } else {
      actionBtns = `<span style="color: var(--text-muted); font-size: 0.82rem;">— Đã hủy —</span>`;
    }

    return `
      <tr>
        <td style="font-weight: 600; color: var(--text-muted);">#${r.id}</td>
        <td><strong style="color: var(--text-main); font-size: 0.95rem;">${r.customer_name}</strong></td>
        <td><a href="tel:${r.customer_phone}" style="color: var(--primary); text-decoration: none; font-weight: 500;">${r.customer_phone}</a></td>
        <td>
          <span style="font-weight: 700; color: #1e293b;">Bàn ${r.table_number}</span> 
          <span style="color: var(--text-muted); font-size: 0.8rem;">(${r.table_capacity} chỗ)</span>
        </td>
        <td style="text-align: center;"><span style="font-weight: 600;">${r.guest_count}</span> khách</td>
        <td>${timeFormatted}</td>
        <td style="max-width: 200px; font-size: 0.85rem; color: #475569;">
          ${r.special_request ? `📝 ${r.special_request}` : '<span style="color: var(--text-muted);">—</span>'}
        </td>
        <td>${statusBadge}</td>
        <td style="text-align: right; white-space: nowrap;">
          ${actionBtns}
        </td>
      </tr>
    `;
  }).join('');
}

function openAddReservationModal() {
  document.getElementById('resCustomerName').value = '';
  document.getElementById('resCustomerPhone').value = '';
  document.getElementById('resGuestCount').value = '2';
  document.getElementById('resSpecialRequest').value = '';

  // Thời gian mặc định: Hiện tại + 1 tiếng
  const now = new Date();
  now.setHours(now.getHours() + 1);
  now.setMinutes(0);
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('resBookingTime').value = localIso;

  // Lấy các bàn trống
  const select = document.getElementById('resTableSelect');
  select.innerHTML = '<option value="">-- Chọn bàn trống --</option>';
  const availableTables = allTables.filter(t => t.status === 'AVAILABLE');
  if (availableTables.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '⚠️ Hiện không còn bàn trống nào!';
    opt.disabled = true;
    select.appendChild(opt);
  } else {
    availableTables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `Bàn số ${t.table_number} (${t.capacity} chỗ ngồi)`;
      select.appendChild(opt);
    });
  }

  document.getElementById('reservationModal').classList.add('active');
}

function closeReservationModal() {
  document.getElementById('reservationModal').classList.remove('active');
}

async function handleSaveReservation(e) {
  e.preventDefault();
  const customer_name = document.getElementById('resCustomerName').value.trim();
  const customer_phone = document.getElementById('resCustomerPhone').value.trim();
  const table_id = parseInt(document.getElementById('resTableSelect').value, 10);
  const guest_count = parseInt(document.getElementById('resGuestCount').value, 10);
  const booking_time = document.getElementById('resBookingTime').value;
  const special_request = document.getElementById('resSpecialRequest').value.trim();

  if (!table_id) {
    alert('Vui lòng chọn bàn ăn còn trống!');
    return;
  }

  const btn = document.getElementById('saveReservationBtn');
  btn.disabled = true;
  btn.textContent = 'Đang xử lý...';

  try {
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`,
      },
      body: JSON.stringify({
        customer_name,
        customer_phone,
        table_id,
        guest_count,
        booking_time,
        special_request,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Đặt bàn thất bại');

    alert(`🎉 ${data.message || 'Đặt bàn thành công!'}`);
    closeReservationModal();
    loadReservationsData();
    loadTablesData();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Xác Nhận Giữ Chỗ';
  }
}


