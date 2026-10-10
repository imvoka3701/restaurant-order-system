// ============================================================
// routes/orders.js - API quản lý đơn hàng với Ràng buộc Nghiệp vụ Chặt chẽ
// POST   /api/orders              - Tạo đơn mới (chỉ Waiter/Khách, cấm Admin)
// POST   /api/orders/:id/items    - Gọi thêm món vào đơn hiện tại
// GET    /api/orders              - Danh sách đơn (?status=)
// GET    /api/orders/:id          - Chi tiết đơn (kèm items & unit_price)
// PATCH  /api/orders/:id/status   - Chuyển trạng thái & Ghi nhận Thu ngân/Thanh toán
// ============================================================
'use strict';

const { Router } = require('express');
const { ordersCreatedTotal, ordersPaidTotal } = require('../metrics');
const { optionalAuth, authenticate } = require('../auth');

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
  router.post('/', optionalAuth(), async (req, res, next) => {
    const client = await pool.connect();
    try {
      // 1. Phân quyền Strict: Admin KHÔNG được tạo đơn
      if (req.user) {
        if (req.user.role === 'ADMIN') {
          return res.status(403).json({
            error: 'Quản trị viên không được phép tạo đơn đặt món. Nghiệp vụ này thuộc về nhân viên bồi bàn (WAITER)!',
          });
        }
        if (req.user.role === 'KITCHEN' || req.user.role === 'CASHIER') {
          return res.status(403).json({
            error: `Tài khoản vai trò "${req.user.role}" không có quyền tạo đơn đặt món.`,
          });
        }
      }

      const waiterId = req.user && req.user.role === 'WAITER' ? req.user.id : null;
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

      // 2. Ràng buộc: Kiểm tra bàn tồn tại
      const tableRes = await client.query('SELECT id, status FROM tables WHERE id = $1', [table_id]);
      if (tableRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy bàn' });
      }

      // 3. Ràng buộc: 1 BÀN CHỈ CÓ TỐI ĐA 1 ĐƠN HOẠT ĐỘNG
      const activeOrderRes = await client.query(
        "SELECT id, status FROM orders WHERE table_id = $1 AND status IN ('PENDING', 'PREPARING', 'SERVED')",
        [table_id]
      );
      if (activeOrderRes.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Bàn đang có đơn #${activeOrderRes.rows[0].id} (${activeOrderRes.rows[0].status}) chưa thanh toán. Vui lòng chọn "Gọi thêm món" vào đơn hiện tại!`,
          active_order_id: activeOrderRes.rows[0].id,
        });
      }

      // 4. Lấy giá từ DB (KHÔNG tin giá từ client) và kiểm tra món còn phục vụ
      const menuIds = items.map((i) => i.menu_item_id);
      const menuRes = await client.query(
        'SELECT id, name, price, is_available FROM menu_items WHERE id = ANY($1)',
        [menuIds]
      );

      const menuMap = new Map();
      for (const mi of menuRes.rows) {
        menuMap.set(mi.id, mi);
      }

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

      // 5. Tính tổng tiền & chốt unit_price
      let totalAmount = 0;
      const orderItems = items.map((item) => {
        const mi = menuMap.get(item.menu_item_id);
        const unitPrice = parseFloat(mi.price);
        const subtotal = unitPrice * item.quantity;
        totalAmount += subtotal;
        return {
          ...item,
          unit_price: unitPrice,
          subtotal,
          item_notes: (item.note || item.item_notes || '').trim(),
        };
      });

      // 6. Tạo đơn hàng với waiter_id
      const orderRes = await client.query(
        `INSERT INTO orders (table_id, status, total_amount, waiter_id)
         VALUES ($1, 'PENDING', $2, $3) RETURNING *`,
        [table_id, totalAmount, waiterId]
      );
      const order = orderRes.rows[0];

      // 7. Thêm chi tiết đơn hàng (lưu rõ unit_price và item_notes)
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal, item_notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.menu_item_id, item.quantity, item.unit_price, item.subtotal, item.item_notes]
        );
      }

      // 8. Đổi trạng thái bàn thành OCCUPIED
      await client.query(
        "UPDATE tables SET status = 'OCCUPIED' WHERE id = $1",
        [table_id]
      );

      await client.query('COMMIT');
      ordersCreatedTotal.inc();

      res.status(201).json({
        ...order,
        items: orderItems.map((item) => {
          const mi = menuMap.get(item.menu_item_id);
          return {
            ...item,
            menu_item_name: mi.name,
          };
        }),
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  // POST /api/orders/:id/items - Gọi thêm món vào đơn đang mở của bàn
  router.post('/:id/items', optionalAuth(), async (req, res, next) => {
    const client = await pool.connect();
    try {
      if (req.user && req.user.role === 'ADMIN') {
        return res.status(403).json({
          error: 'Quản trị viên không được thao tác gọi thêm món ăn.',
        });
      }

      const { id } = req.params;
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items phải là mảng không rỗng' });
      }

      await client.query('BEGIN');

      // Kiểm tra đơn hàng có đang active không
      const orderRes = await client.query(
        "SELECT id, table_id, status, total_amount FROM orders WHERE id = $1 FOR UPDATE",
        [parseInt(id, 10)]
      );

      if (orderRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      }

      const order = orderRes.rows[0];
      if (order.status === 'PAID' || order.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Đơn #${order.id} đã ở trạng thái ${order.status}, không thể gọi thêm món!`,
        });
      }

      // Lấy thông tin giá từ menu_items
      const menuIds = items.map(i => i.menu_item_id);
      const menuRes = await client.query(
        'SELECT id, name, price, is_available FROM menu_items WHERE id = ANY($1)',
        [menuIds]
      );
      const menuMap = new Map();
      menuRes.rows.forEach(m => menuMap.set(m.id, m));

      let addedTotal = 0;
      const newItems = [];
      for (const item of items) {
        const mi = menuMap.get(item.menu_item_id);
        if (!mi) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Không tìm thấy món ID ${item.menu_item_id}` });
        }
        if (!mi.is_available) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Món "${mi.name}" hiện không phục vụ` });
        }

        const unitPrice = parseFloat(mi.price);
        const subtotal = unitPrice * item.quantity;
        addedTotal += subtotal;

        const insertRes = await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal, item_notes)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [order.id, item.menu_item_id, item.quantity, unitPrice, subtotal, (item.note || item.item_notes || '').trim()]
        );
        newItems.push({
          ...insertRes.rows[0],
          menu_item_name: mi.name,
        });
      }

      // Cập nhật tổng tiền đơn hàng và đưa trạng thái về PENDING nếu trước đó đã SERVED
      const newStatus = order.status === 'SERVED' ? 'PENDING' : order.status;
      const updatedTotal = parseFloat(order.total_amount) + addedTotal;

      await client.query(
        "UPDATE orders SET total_amount = $1, status = $2 WHERE id = $3",
        [updatedTotal, newStatus, order.id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Đã gọi thêm món thành công',
        order_id: order.id,
        new_total_amount: updatedTotal,
        status: newStatus,
        added_items: newItems,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  // GET /api/orders - Danh sách đơn hàng
  router.get('/', async (req, res, next) => {
    try {
      const { status } = req.query;
      let query = `
        SELECT o.id, o.table_id, t.table_number, o.status, o.total_amount,
               o.payment_method, o.created_at,
               u_waiter.username AS waiter_name,
               u_cashier.username AS cashier_name
        FROM orders o
        JOIN tables t ON t.id = o.table_id
        LEFT JOIN users u_waiter ON u_waiter.id = o.waiter_id
        LEFT JOIN users u_cashier ON u_cashier.id = o.cashier_id
      `;
      const params = [];

      if (status) {
        query += ' WHERE o.status = $1';
        params.push(status.toUpperCase());
      }
      query += ' ORDER BY o.created_at DESC';

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders/:id - Chi tiết 1 đơn hàng (kèm món)
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      const orderRes = await pool.query(
        `SELECT o.id, o.table_id, t.table_number, o.status, o.total_amount,
                o.payment_method, o.created_at,
                u_waiter.username AS waiter_name,
                u_cashier.username AS cashier_name
         FROM orders o
         JOIN tables t ON t.id = o.table_id
         LEFT JOIN users u_waiter ON u_waiter.id = o.waiter_id
         LEFT JOIN users u_cashier ON u_cashier.id = o.cashier_id
         WHERE o.id = $1`,
        [parseInt(id, 10)]
      );

      if (orderRes.rowCount === 0) {
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      }

      const itemsRes = await pool.query(
        `SELECT oi.id, oi.menu_item_id, mi.name AS menu_item_name,
                oi.quantity, oi.unit_price, oi.subtotal, oi.item_notes
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
  router.patch('/:id/status', optionalAuth(), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { status: newStatus, payment_method } = req.body;

      if (!newStatus) {
        return res.status(400).json({ error: 'Thiếu trường status' });
      }

      const targetStatus = newStatus.toUpperCase();

      // Kiểm tra vai trò:
      if (req.user) {
        if (req.user.role === 'ADMIN') {
          return res.status(403).json({
            error: 'Quản trị viên không được phép can thiệp trực tiếp vào luồng nấu bếp hoặc thu tiền!',
          });
        }
        if (targetStatus === 'PREPARING' || targetStatus === 'SERVED') {
          if (req.user.role !== 'KITCHEN') {
            return res.status(403).json({ error: 'Chỉ nhân viên Bếp (KITCHEN) mới được cập nhật nấu/phục vụ món!' });
          }
        }
        if (targetStatus === 'PAID') {
          if (req.user.role !== 'CASHIER') {
            return res.status(403).json({ error: 'Chỉ nhân viên Thu ngân (CASHIER) mới được thực hiện thanh toán!' });
          }
        }
      }

      await client.query('BEGIN');

      const orderRes = await client.query(
        'SELECT id, table_id, status FROM orders WHERE id = $1 FOR UPDATE',
        [parseInt(id, 10)]
      );

      if (orderRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      }

      const order = orderRes.rows[0];

      // Xử lý HỦY ĐƠN (CANCELLED)
      if (targetStatus === 'CANCELLED') {
        if (order.status === 'PAID') {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Đơn đã thanh toán, không thể hủy!' });
        }
        await client.query("UPDATE orders SET status = 'CANCELLED' WHERE id = $1", [order.id]);
        await client.query("UPDATE tables SET status = 'AVAILABLE' WHERE id = $1", [order.table_id]);
        await client.query('COMMIT');
        return res.json({ message: 'Đã hủy đơn hàng thành công', id: order.id, status: 'CANCELLED' });
      }

      // Xử lý luồng PENDING -> PREPARING -> SERVED -> PAID
      const expectedNext = STATUS_FLOW[order.status];
      if (!expectedNext) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Đơn đã ở trạng thái cuối (${order.status}), không thể chuyển tiếp`,
        });
      }
      if (targetStatus !== expectedNext) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Không thể chuyển từ ${order.status} sang ${targetStatus}. Trạng thái tiếp theo phải là ${expectedNext}`,
        });
      }

      // Nếu chuyển sang PAID -> Bắt buộc kiểm tra phương thức thanh toán
      let cashierId = null;
      let payMethod = 'CASH';
      if (targetStatus === 'PAID') {
        cashierId = req.user && req.user.role === 'CASHIER' ? req.user.id : null;
        payMethod = payment_method || 'CASH';
        if (!['CASH', 'TRANSFER_QR', 'CARD'].includes(payMethod)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Phương thức thanh toán phải là CASH, TRANSFER_QR hoặc CARD' });
        }
      }

      // Cập nhật trạng thái đơn
      const sets = ['status = $1'];
      const values = [targetStatus];
      let idx = 2;

      if (targetStatus === 'PAID') {
        sets.push(`cashier_id = COALESCE($${idx++}::integer, cashier_id)`);
        values.push(cashierId);
        sets.push(`payment_method = $${idx++}`);
        values.push(payMethod);
      }

      values.push(parseInt(id, 10));
      const updated = await client.query(
        `UPDATE orders SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      // Khi thanh toán xong (PAID) → giải phóng bàn về AVAILABLE
      if (targetStatus === 'PAID') {
        await client.query(
          "UPDATE tables SET status = 'AVAILABLE' WHERE id = $1",
          [order.table_id]
        );
      }

      await client.query('COMMIT');
      if (targetStatus === 'PAID') {
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
