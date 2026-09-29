// ============================================================
// routes/orders.js - API quản lý đơn hàng
// POST   /api/orders              - Tạo đơn mới (transaction)
// GET    /api/orders              - Danh sách đơn (?status=)
// GET    /api/orders/:id          - Chi tiết đơn (kèm items)
// PATCH  /api/orders/:id/status   - Chuyển trạng thái (luồng 1 chiều)
// ============================================================
'use strict';

const { Router } = require('express');
const { ordersCreatedTotal, ordersPaidTotal } = require('../metrics');

// Luồng trạng thái hợp lệ (chỉ tiến, không lùi)
const STATUS_FLOW = {
  PENDING: 'PREPARING',
  PREPARING: 'SERVED',
  SERVED: 'PAID',
};

module.exports = function createOrdersRouter(pool) {
  const router = Router();

  // POST /api/orders - Tạo đơn hàng mới
  // Chạy trong TRANSACTION để đảm bảo tính nhất quán
  router.post('/', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { table_id, items } = req.body;

      // Validate input
      if (!table_id || !Number.isInteger(table_id)) {
        return res.status(400).json({ error: 'table_id phải là số nguyên' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items phải là mảng không rỗng' });
      }

      // Validate từng item
      for (const item of items) {
        if (!item.menu_item_id || !Number.isInteger(item.menu_item_id)) {
          return res.status(400).json({ error: 'menu_item_id phải là số nguyên' });
        }
        if (!item.quantity || !Number.isInteger(item.quantity) || item.quantity < 1) {
          return res.status(400).json({ error: 'quantity phải là số nguyên > 0' });
        }
      }

      await client.query('BEGIN');

      // Kiểm tra bàn tồn tại
      const tableRes = await client.query('SELECT id, status FROM tables WHERE id = $1', [table_id]);
      if (tableRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy bàn' });
      }

      // Lấy giá từ DB (KHÔNG tin giá từ client) và kiểm tra món còn phục vụ
      const menuIds = items.map((i) => i.menu_item_id);
      const menuRes = await client.query(
        'SELECT id, name, price, is_available FROM menu_items WHERE id = ANY($1)',
        [menuIds]
      );

      // Map menu items theo id
      const menuMap = new Map();
      for (const mi of menuRes.rows) {
        menuMap.set(mi.id, mi);
      }

      // Kiểm tra tất cả món có tồn tại và còn phục vụ
      for (const item of items) {
        const mi = menuMap.get(item.menu_item_id);
        if (!mi) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            error: `Không tìm thấy món có id ${item.menu_item_id}`,
          });
        }
        if (!mi.is_available) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Món "${mi.name}" hiện không phục vụ`,
          });
        }
      }

      // Tính tổng tiền
      let totalAmount = 0;
      const orderItems = items.map((item) => {
        const mi = menuMap.get(item.menu_item_id);
        const subtotal = parseFloat(mi.price) * item.quantity;
        totalAmount += subtotal;
        return { ...item, subtotal };
      });

      // Tạo đơn hàng
      const orderRes = await client.query(
        `INSERT INTO orders (table_id, status, total_amount)
         VALUES ($1, 'PENDING', $2) RETURNING *`,
        [table_id, totalAmount]
      );
      const order = orderRes.rows[0];

      // Thêm chi tiết đơn hàng
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, subtotal)
           VALUES ($1, $2, $3, $4)`,
          [order.id, item.menu_item_id, item.quantity, item.subtotal]
        );
      }

      // Đặt bàn thành OCCUPIED
      await client.query(
        "UPDATE tables SET status = 'OCCUPIED' WHERE id = $1",
        [table_id]
      );

      await client.query('COMMIT');
      ordersCreatedTotal.inc();

      // Trả kết quả kèm chi tiết items
      const result = await pool.query(
        `SELECT oi.id, oi.menu_item_id, mi.name AS menu_item_name,
                oi.quantity, oi.subtotal
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = $1`,
        [order.id]
      );

      res.status(201).json({
        ...order,
        items: result.rows,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  // GET /api/orders - Danh sách đơn (lọc theo status)
  router.get('/', async (req, res, next) => {
    try {
      const { status } = req.query;
      let query = `SELECT o.*, t.table_number
                    FROM orders o
                    JOIN tables t ON t.id = o.table_id`;
      const params = [];

      if (status) {
        const upper = status.toUpperCase();
        if (!['PENDING', 'PREPARING', 'SERVED', 'PAID'].includes(upper)) {
          return res.status(400).json({ error: 'status không hợp lệ' });
        }
        query += ' WHERE o.status = $1';
        params.push(upper);
      }
      query += ' ORDER BY o.created_at DESC';

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders/:id - Chi tiết đơn kèm danh sách món
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const orderRes = await pool.query(
        `SELECT o.*, t.table_number
         FROM orders o
         JOIN tables t ON t.id = o.table_id
         WHERE o.id = $1`,
        [parseInt(id, 10)]
      );

      if (orderRes.rowCount === 0) {
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      }

      const itemsRes = await pool.query(
        `SELECT oi.id, oi.menu_item_id, mi.name AS menu_item_name,
                oi.quantity, oi.subtotal
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [parseInt(id, 10)]
      );

      res.json({
        ...orderRes.rows[0],
        items: itemsRes.rows,
      });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/orders/:id/status - Chuyển trạng thái đơn
  // Luồng: PENDING → PREPARING → SERVED → PAID
  // Sai luồng trả 409 Conflict
  router.patch('/:id/status', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { status: newStatus } = req.body;

      if (!newStatus) {
        return res.status(400).json({ error: 'Thiếu trường status' });
      }

      await client.query('BEGIN');

      // Lấy đơn hiện tại (lock row để tránh race condition)
      const orderRes = await client.query(
        'SELECT id, table_id, status FROM orders WHERE id = $1 FOR UPDATE',
        [parseInt(id, 10)]
      );

      if (orderRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      }

      const order = orderRes.rows[0];
      const expectedNext = STATUS_FLOW[order.status];

      // Kiểm tra luồng trạng thái
      if (!expectedNext) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Đơn đã ở trạng thái cuối (${order.status}), không thể chuyển tiếp`,
        });
      }
      if (newStatus.toUpperCase() !== expectedNext) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Không thể chuyển từ ${order.status} sang ${newStatus}. Trạng thái tiếp theo phải là ${expectedNext}`,
        });
      }

      // Cập nhật trạng thái đơn
      const updated = await client.query(
        'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
        [newStatus.toUpperCase(), parseInt(id, 10)]
      );

      // Khi thanh toán xong (PAID) → trả bàn về AVAILABLE
      if (newStatus.toUpperCase() === 'PAID') {
        // Kiểm tra xem bàn còn đơn chưa PAID nào không
        const activeOrders = await client.query(
          "SELECT COUNT(*) FROM orders WHERE table_id = $1 AND status != 'PAID'",
          [order.table_id]
        );
        // Nếu không còn đơn active nào, trả bàn về AVAILABLE
        if (parseInt(activeOrders.rows[0].count, 10) === 0) {
          await client.query(
            "UPDATE tables SET status = 'AVAILABLE' WHERE id = $1",
            [order.table_id]
          );
        }
      }

      await client.query('COMMIT');
      if (newStatus.toUpperCase() === 'PAID') {
        ordersPaidTotal.inc();
      }
      res.json(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  return router;
};
