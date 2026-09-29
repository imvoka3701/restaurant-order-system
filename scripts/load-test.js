import http from 'k6/http';
import { check, sleep } from 'k6';

// Cấu hình k6 load test (~2 phút)
export const options = {
  insecureSkipTLSVerify: true,
  stages: [
    { duration: '20s', target: 5 },   // Ramp-up lên 5 VUs
    { duration: '80s', target: 10 },  // Duy trì tải 10 VUs
    { duration: '20s', target: 0 },   // Ramp-down về 0 VU
  ],
  thresholds: {
    // Cho phép tỷ lệ lỗi hợp lý vì có kịch bản tạo lỗi chủ đích (400, 404)
    http_req_failed: ['rate<0.30'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://restaurant.local';

export default function () {
  const rand = Math.random();

  // 1. Phần lớn là request đọc dữ liệu hợp lệ (GET)
  if (rand < 0.35) {
    // Health check
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'health check 200': (r) => r.status === 200 });
  } else if (rand < 0.60) {
    // Lấy menu
    const res = http.get(`${BASE_URL}/api/menu`);
    check(res, { 'get menu 200': (r) => r.status === 200 });
  } else if (rand < 0.75) {
    // Lấy danh sách bàn
    const res = http.get(`${BASE_URL}/api/tables`);
    check(res, { 'get tables 200': (r) => r.status === 200 });
  } else if (rand < 0.88) {
    // Lấy danh sách đơn hàng
    const res = http.get(`${BASE_URL}/api/orders`);
    check(res, { 'get orders 200': (r) => r.status === 200 });
  } else if (rand < 0.93) {
    // 2. Tạo đơn hợp lệ & chuyển sang PAID (tăng orders_created_total và orders_paid_total)
    const payload = JSON.stringify({
      table_id: 1,
      items: [
        { menu_item_id: 1, quantity: 2 },
        { menu_item_id: 2, quantity: 1 },
      ],
    });
    const params = {
      headers: { 'Content-Type': 'application/json' },
    };
    const res = http.post(`${BASE_URL}/api/orders`, payload, params);
    check(res, { 'create order 201': (r) => r.status === 201 });

    if (res.status === 201) {
      try {
        const order = JSON.parse(res.body);
        if (order && order.id) {
          // Chuyển luồng: PENDING -> PREPARING -> SERVED -> PAID
          http.patch(`${BASE_URL}/api/orders/${order.id}/status`, JSON.stringify({ status: 'PREPARING' }), params);
          http.patch(`${BASE_URL}/api/orders/${order.id}/status`, JSON.stringify({ status: 'SERVED' }), params);
          const paidRes = http.patch(`${BASE_URL}/api/orders/${order.id}/status`, JSON.stringify({ status: 'PAID' }), params);
          check(paidRes, { 'order paid 200': (r) => r.status === 200 });
        }
      } catch (e) {
        // bỏ qua parse error nếu có
      }
    }
  } else if (rand < 0.96) {
    // 3. Request sai chủ đích: POST thiếu items -> 400 Bad Request
    const badPayload = JSON.stringify({ table_id: 1 });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(`${BASE_URL}/api/orders`, badPayload, params);
    check(res, { 'bad request 400': (r) => r.status === 400 });
  } else {
    // 4. Request sai chủ đích: GET đơn hàng không tồn tại -> 404 Not Found
    const res = http.get(`${BASE_URL}/api/orders/999999`);
    check(res, { 'not found 404': (r) => r.status === 404 });
  }

  // Nghỉ giữa các lượt request
  sleep(0.5 + Math.random() * 0.5);
}
