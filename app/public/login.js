// ============================================================
// login.js - Xử lý logic đăng nhập
// ============================================================
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorAlert = document.getElementById('errorAlert');
  const submitBtn = document.getElementById('submitBtn');

  // Nếu đã đăng nhập từ trước, tự động chuyển hướng
  const currentUser = Auth.getUser();
  if (currentUser && Auth.getToken()) {
    redirectByRole(currentUser.role);
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAlert.style.display = 'none';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
      showError('Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xác thực...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Đăng nhập không thành công');
      }

      // Lưu phiên làm việc
      Auth.setSession(data.token, data.user);

      // Chuyển hướng
      const params = new URLSearchParams(window.location.search);
      const redirectUrl = params.get('redirect');

      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        redirectByRole(data.user.role);
      }
    } catch (err) {
      showError(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Đăng Nhập';
    }
  });

  function showError(msg) {
    errorAlert.textContent = msg;
    errorAlert.style.display = 'block';
  }

  function redirectByRole(role) {
    if (role === 'ADMIN') {
      window.location.href = '/admin.html';
    } else if (role === 'KITCHEN') {
      window.location.href = '/kitchen.html';
    } else if (role === 'CASHIER') {
      window.location.href = '/cashier.html';
    } else {
      window.location.href = '/index.html';
    }
  }
});
