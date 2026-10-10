// ============================================================
// routes/auth.js - API Đăng nhập và Kiểm tra Phiên làm việc
// ============================================================
'use strict';

const express = require('express');
const { generateToken, authenticate, bcrypt } = require('../auth');

module.exports = function authRouter(pool) {
  const router = express.Router();

  /**
   * POST /api/auth/login
   * Đăng nhập với username và password
   */
  router.post('/login', async (req, res, next) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu' });
      }

      const result = await pool.query(
        'SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1',
        [username.trim()]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
      }

      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
      }

      // Kiểm tra tài khoản có bị khóa không
      if (user.is_active === false) {
        return res.status(403).json({
          error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên để mở khóa!',
        });
      }

      const token = generateToken(user);

      res.json({
        success: true,
        message: 'Đăng nhập thành công',
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/auth/me
   * Lấy thông tin tài khoản hiện tại từ Token
   */
  router.get('/me', authenticate(), (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  });

  return router;
};
