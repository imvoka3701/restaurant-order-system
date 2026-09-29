// ============================================================
// server.js - Entry point cho Hệ thống Quản lý Nhà hàng
// Express server + PostgreSQL connection pool
// ============================================================
'use strict';

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

// --- Cấu hình từ biến môi trường ---
const PORT = parseInt(process.env.PORT, 10) || 3000;
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'restaurant_db',
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASS || 'password',
  max: 20,                    // Số kết nối tối đa trong pool
  idleTimeoutMillis: 30000,   // Thời gian chờ trước khi đóng kết nối rảnh
  connectionTimeoutMillis: 5000,
};

// --- Khởi tạo Pool PostgreSQL ---
const pool = new Pool(DB_CONFIG);

// Xử lý lỗi pool
pool.on('error', (err) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    message: 'Unexpected pool error',
    error: err.message,
  }));
});

// --- Khởi tạo Express ---
const app = express();
app.set('trust proxy', 1); // Tin tưởng proxy (Nginx) cho X-Forwarded-*

// Parse JSON body
app.use(express.json());

// --- Middleware ghi log JSON (mỗi request 1 dòng) ---
// Format phù hợp cho Loki truy vấn ở phase sau
app.use((req, res, next) => {
  const start = Date.now();
  // Ghi log khi response hoàn tất
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
    }));
  });
  next();
});

// --- Phục vụ file tĩnh (Frontend) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Health Check ---
// Kiểm tra kết nối DB, trả 200 nếu OK, 503 nếu lỗi
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// --- Placeholder cho /metrics (Phase sau sẽ cài prom-client) ---
app.get('/metrics', (req, res) => {
  res.status(501).json({
    message: 'Metrics endpoint chưa được kích hoạt. Sẽ tích hợp prom-client ở phase sau.',
  });
});

// --- Load Routes ---
const tablesRouter = require('./src/routes/tables');
const menuRouter = require('./src/routes/menu');
const ordersRouter = require('./src/routes/orders');
const revenueRouter = require('./src/routes/revenue');

app.use('/api/tables', tablesRouter(pool));
app.use('/api/menu', menuRouter(pool));
app.use('/api/orders', ordersRouter(pool));
app.use('/api/revenue', revenueRouter(pool));

// --- Xử lý lỗi tập trung ---
app.use((err, req, res, _next) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.originalUrl,
  }));
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
});

// --- Retry kết nối DB khi khởi động (tối đa ~30s) ---
async function waitForDB(retries = 10, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Kết nối DB thành công (lần thử ${i})`,
      }));
      return;
    } catch (err) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        message: `Kết nối DB thất bại (lần ${i}/${retries}): ${err.message}`,
      }));
      if (i === retries) throw new Error('Không thể kết nối database sau nhiều lần thử');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// --- Khởi động server ---
let server;

async function start() {
  await waitForDB();
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `Server đang chạy tại port ${PORT}`,
    }));
  });
}

// --- Graceful Shutdown ---
// Đóng server và pool khi nhận SIGTERM (Docker stop)
function shutdown(signal) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message: `Nhận ${signal}, đang tắt server...`,
  }));
  if (server) {
    server.close(() => {
      pool.end().then(() => {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: 'Server và DB pool đã đóng. Tạm biệt!',
        }));
        process.exit(0);
      });
    });
  } else {
    pool.end().then(() => process.exit(0));
  }
  // Force exit sau 10s nếu graceful shutdown không xong
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    message: `Không thể khởi động: ${err.message}`,
  }));
  process.exit(1);
});
