// ============================================================
// metrics.js - Cấu hình Prometheus metrics cho ứng dụng
// ============================================================
'use strict';

const client = require('prom-client');

// Thu thập default metrics (process_cpu_*, nodejs_heap_*, nodejs_eventloop_lag_*, etc.)
client.collectDefaultMetrics();

// Counter đo tổng số requests
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Tổng số HTTP requests đã nhận',
  labelNames: ['method', 'route', 'status_code'],
});

// Histogram đo độ trễ request (seconds)
const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý HTTP request tính bằng giây',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// Counter nghiệp vụ: đơn hàng được tạo
const ordersCreatedTotal = new client.Counter({
  name: 'orders_created_total',
  help: 'Tổng số đơn hàng đã tạo thành công',
});

// Counter nghiệp vụ: đơn hàng đã thanh toán
const ordersPaidTotal = new client.Counter({
  name: 'orders_paid_total',
  help: 'Tổng số đơn hàng đã thanh toán thành công (PAID)',
});

module.exports = {
  client,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  ordersCreatedTotal,
  ordersPaidTotal,
};
