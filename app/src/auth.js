// ============================================================
// auth.js - Quản lý Xác thực & Phân quyền (JWT + Bcrypt)
// ============================================================
'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-jwt-secure-secret-2026';
const JWT_EXPIRES_IN = '8h';

/**
 * Tạo JWT token từ thông tin user
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Xác thực token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Middleware xác thực và phân quyền
 * @param {string[]} requiredRoles - Mảng các vai trò được phép (ví dụ: ['ADMIN', 'KITCHEN'])
 */
function authenticate(requiredRoles = []) {
  return (req, res, next) => {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Yêu cầu đăng nhập (Thiếu token xác thực)' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ' });
    }

    req.user = decoded;

    // Strict role check: Phải thuộc đúng role được cấp phép
    if (requiredRoles.length > 0) {
      if (!requiredRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: `Tài khoản vai trò "${req.user.role}" không có quyền thực hiện chức năng này. Nghiệp vụ chỉ dành cho: ${requiredRoles.join(', ')}`,
        });
      }
    }

    next();
  };
}

/**
 * Middleware tùy chọn: Giải mã token nếu có, không chặn nếu không có
 */
function optionalAuth() {
  return (req, res, next) => {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        req.user = decoded;
      }
    }

    next();
  };
}

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  optionalAuth,
  bcrypt,
};
