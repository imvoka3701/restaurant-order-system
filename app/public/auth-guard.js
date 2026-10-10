// ============================================================
// auth-guard.js - Quản lý phiên đăng nhập và Phân quyền Tuyệt đối (Strict RBAC)
// ============================================================
'use strict';

const Auth = {
  TOKEN_KEY: 'restaurant_token',
  USER_KEY: 'restaurant_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    try {
      const data = localStorage.getItem(this.USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    window.location.href = '/login.html';
  },

  getRoleLabel(role) {
    const map = {
      ADMIN: 'Quản trị viên',
      WAITER: 'Bồi bàn',
      KITCHEN: 'Đầu bếp',
      CASHIER: 'Thu ngân',
    };
    return map[role] || role;
  },

  getDefaultPath(role) {
    if (role === 'ADMIN') return '/admin.html';
    if (role === 'KITCHEN') return '/kitchen.html';
    if (role === 'CASHIER') return '/cashier.html';
    return '/index.html';
  },

  /**
   * Kiểm tra quyền truy cập Strict RBAC cho trang hiện tại
   * @param {string[]} allowedRoles - Danh sách vai trò được phép truy cập
   */
  requireAuth(allowedRoles = []) {
    const token = this.getToken();
    const user = this.getUser();

    // 1. Chưa đăng nhập
    if (!token || !user) {
      window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }

    // 2. Strict Role Check: Mỗi role chỉ được vào đúng trang của mình
    if (allowedRoles.length > 0) {
      if (!allowedRoles.includes(user.role)) {
        alert(`Vai trò "${this.getRoleLabel(user.role)}" không có quyền truy cập trang này! Hệ thống sẽ chuyển bạn về màn hình làm việc đúng thẩm quyền.`);
        window.location.href = this.getDefaultPath(user.role);
        return null;
      }
    }

    return user;
  },

  /**
   * Chặn truy cập chéo trên trang Đặt món (/index.html):
   * Khách vãng lai và Waiter được đặt món. Admin, Kitchen, Cashier không được vào đặt món.
   */
  checkOrderPageAccess() {
    const user = this.getUser();
    if (user) {
      if (user.role === 'ADMIN') {
        alert('Quản trị viên không tham gia đặt món ăn. Chuyển hướng về Dashboard Quản trị!');
        window.location.href = '/admin.html';
        return false;
      }
      if (user.role === 'KITCHEN') {
        window.location.href = '/kitchen.html';
        return false;
      }
      if (user.role === 'CASHIER') {
        window.location.href = '/cashier.html';
        return false;
      }
    }
    return true;
  },

  /**
   * Khởi tạo Navigation chuẩn theo từng Role riêng biệt
   */
  initNav(activePage = '') {
    const user = this.getUser();
    const nav = document.querySelector('nav');
    if (!nav) return;

    let navHtml = '';

    if (!user) {
      // Khách bàn / Chưa đăng nhập
      navHtml = `
        <span class="brand">🍽️ Nhà Hàng Hương Việt</span>
        <a href="/index.html" class="${activePage === 'order' ? 'active' : ''}">Đặt món tại bàn</a>
        <a href="/booking.html" class="${activePage === 'booking' ? 'active' : ''}">📅 Đặt bàn online</a>
        <div style="margin-left: auto;">
          <a href="/login.html" class="btn btn-primary btn-sm" style="padding: 0.35rem 0.9rem; font-size: 0.85rem;">
            Đăng nhập nhân viên
          </a>
        </div>
      `;
    } else if (user.role === 'ADMIN') {
      // ADMIN: Chỉ quản trị
      navHtml = `
        <span class="brand">👑 Quản Trị Nhà Hàng Hương Việt</span>
        <span style="font-size: 0.85rem; color: #94a3b8; margin-left: 0.5rem; font-weight: 500;">(Dashboard Trung Tâm Điều Hành)</span>
        <div class="user-badge" style="margin-left: auto; display: flex; align-items: center; gap: 0.75rem;">
          <span style="color: #cbd5e1; font-size: 0.85rem; font-weight: 600;">
            👤 <strong>${user.username}</strong> (${this.getRoleLabel(user.role)})
          </span>
          <button id="logoutBtn" class="btn btn-secondary btn-sm" style="padding: 0.3rem 0.75rem; font-size: 0.8rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3);">
            Đăng xuất
          </button>
        </div>
      `;
    } else if (user.role === 'WAITER') {
      // WAITER: Nhận đơn & Gọi món & Sổ đón khách
      navHtml = `
        <span class="brand">💁 Bồi Bàn - Hương Việt</span>
        <a href="/index.html" class="active">Nhận Đơn & Gọi Món</a>
        <button type="button" id="btnOpenWaiterResModal" class="btn btn-secondary btn-sm" style="margin-left: 0.5rem; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; font-size: 0.82rem; padding: 0.3rem 0.75rem; cursor: pointer;">
          📅 Sổ Đặt Bàn (<span id="navWaiterResCount">0</span>)
        </button>
        <div class="user-badge" style="margin-left: auto; display: flex; align-items: center; gap: 0.75rem;">
          <span style="color: #cbd5e1; font-size: 0.85rem; font-weight: 600;">
            👤 <strong>${user.username}</strong> (${this.getRoleLabel(user.role)})
          </span>
          <button id="logoutBtn" class="btn btn-secondary btn-sm" style="padding: 0.3rem 0.75rem; font-size: 0.8rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3);">
            Đăng xuất
          </button>
        </div>
      `;
    } else if (user.role === 'KITCHEN') {
      // KITCHEN: Chỉ xem bếp
      navHtml = `
        <span class="brand">👨‍🍳 Màn Hình Bếp - Hương Việt</span>
        <a href="/kitchen.html" class="active">Điều Phối Món</a>
        <div class="user-badge" style="margin-left: auto; display: flex; align-items: center; gap: 0.75rem;">
          <span style="color: #cbd5e1; font-size: 0.85rem; font-weight: 600;">
            👤 <strong>${user.username}</strong> (${this.getRoleLabel(user.role)})
          </span>
          <button id="logoutBtn" class="btn btn-secondary btn-sm" style="padding: 0.3rem 0.75rem; font-size: 0.8rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3);">
            Đăng xuất
          </button>
        </div>
      `;
    } else if (user.role === 'CASHIER') {
      // CASHIER: Chỉ thu ngân
      navHtml = `
        <span class="brand">💳 Thu Ngân - Hương Việt</span>
        <a href="/cashier.html" class="active">Thanh Toán & Hóa Đơn</a>
        <div class="user-badge" style="margin-left: auto; display: flex; align-items: center; gap: 0.75rem;">
          <span style="color: #cbd5e1; font-size: 0.85rem; font-weight: 600;">
            👤 <strong>${user.username}</strong> (${this.getRoleLabel(user.role)})
          </span>
          <button id="logoutBtn" class="btn btn-secondary btn-sm" style="padding: 0.3rem 0.75rem; font-size: 0.8rem; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3);">
            Đăng xuất
          </button>
        </div>
      `;
    }

    nav.innerHTML = navHtml;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }
};
