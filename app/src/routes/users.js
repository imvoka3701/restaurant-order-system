// ============================================================
// routes/users.js - Quản lý Danh sách Nhân viên (Chỉ Admin)
// ============================================================
'use strict';

const express = require('express');
const { authenticate, bcrypt } = require('../auth');

module.exports = function usersRouter(pool) {
  const router = express.Router();

  // Tất cả endpoint quản lý nhân viên chỉ dành cho ADMIN
  router.use(authenticate(['ADMIN']));

  /**
   * GET /api/users
   * Lấy danh sách nhân viên
   */
  router.get('/', async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT id, username, role, is_active, created_at FROM users ORDER BY id ASC'
      );
      res.json(result.rows);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/users
   * Tạo tài khoản nhân viên mới
   */
  router.post('/', async (req, res, next) => {
    try {
      const { username, password, role } = req.body;

      if (!username || !password || !role) {
        return res.status(400).json({ error: 'Vui lòng điền đủ username, password và role' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
      }

      const validRoles = ['ADMIN', 'WAITER', 'KITCHEN', 'CASHIER'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Vai trò không hợp lệ. Phải là một trong: ${validRoles.join(', ')}` });
      }

      const hash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (username, password_hash, role, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id, username, role, is_active, created_at`,
        [username.trim(), hash, role]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') { // unique_violation
        return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
      }
      next(err);
    }
  });

  /**
   * PATCH /api/users/:id/password
   * Đổi mật khẩu cho nhân viên
   */
  router.patch('/:id/password', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      }

      const hash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username, role, is_active',
        [hash, parseInt(id, 10)]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Không tìm thấy tài khoản nhân viên' });
      }

      res.json({
        message: `Đã đổi mật khẩu thành công cho nhân viên "${result.rows[0].username}"`,
        user: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/users/:id/status
   * Khóa hoặc Mở khóa tài khoản (Soft toggle)
   */
  router.patch('/:id/status', async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = parseInt(id, 10);
      const { is_active } = req.body;

      if (is_active === undefined) {
        return res.status(400).json({ error: 'Thiếu trường is_active (true/false)' });
      }

      // Ràng buộc an toàn: Không cho phép Admin tự khóa tài khoản của chính mình
      if (req.user && req.user.id === userId && !is_active) {
        return res.status(400).json({
          error: 'Bảo vệ an toàn hệ thống: Bạn không thể tự khóa tài khoản của chính mình!',
        });
      }

      const result = await pool.query(
        'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, username, role, is_active',
        [Boolean(is_active), userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Không tìm thấy tài khoản nhân viên' });
      }

      const u = result.rows[0];
      const actionText = u.is_active ? 'Kích hoạt' : 'Khóa';
      res.json({
        message: `Đã ${actionText} thành công tài khoản "${u.username}"`,
        user: u,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
