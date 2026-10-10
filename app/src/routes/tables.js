// ============================================================
// routes/tables.js - API quản lý bàn ăn
// GET /api/tables       - Danh sách bàn (kèm mã đơn active nếu có)
// POST /api/tables      - Thêm bàn mới (Chỉ Admin)
// PATCH /api/tables/:id - Cập nhật trạng thái/sức chứa (Chỉ Admin)
// DELETE /api/tables/:id - Xóa bàn an toàn (Chỉ Admin)
// ============================================================
'use strict';

const { Router } = require('express');
const { authenticate } = require('../auth');

// Trạng thái hợp lệ cho bàn
const VALID_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED'];

module.exports = function createTablesRouter(pool) {
  const router = Router();

  // GET /api/tables - Lấy danh sách tất cả bàn kèm thông tin đơn đang mở (nếu có)
  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT 
          t.id, 
          t.table_number, 
          t.capacity, 
          t.status,
          o.id AS active_order_id,
          o.status AS active_order_status,
          r.id AS active_reservation_id,
          r.customer_name,
          r.customer_phone,
          r.booking_time,
          r.guest_count,
          r.special_request
        FROM tables t
        LEFT JOIN orders o ON o.table_id = t.id AND o.status IN ('PENDING', 'PREPARING', 'SERVED')
        LEFT JOIN reservations r ON r.table_id = t.id AND r.status = 'ACTIVE'
        ORDER BY t.table_number
      `);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/tables - Thêm bàn mới (Chỉ ADMIN)
  router.post('/', authenticate(['ADMIN']), async (req, res, next) => {
    try {
      const { table_number, capacity } = req.body;

      // Validate input
      if (!table_number || !Number.isInteger(table_number) || table_number < 1) {
        return res.status(400).json({ error: 'table_number phải là số nguyên dương' });
      }
      if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1)) {
        return res.status(400).json({ error: 'capacity phải là số nguyên dương' });
      }

      const { rows } = await pool.query(
        'INSERT INTO tables (table_number, capacity) VALUES ($1, $2) RETURNING *',
        [table_number, capacity || 4]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      // Xử lý lỗi unique constraint (trùng số bàn)
      if (err.code === '23505') {
        return res.status(409).json({ error: `Bàn số ${req.body.table_number} đã tồn tại` });
      }
      next(err);
    }
  });

  // PATCH /api/tables/:id - Cập nhật trạng thái hoặc sức chứa (Chỉ ADMIN)
  router.patch('/:id', authenticate(['ADMIN']), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, capacity, table_number } = req.body;

      // Validate
      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `status phải là một trong: ${VALID_STATUSES.join(', ')}`,
        });
      }
      if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1)) {
        return res.status(400).json({ error: 'capacity phải là số nguyên dương' });
      }
      if (table_number !== undefined && (!Number.isInteger(table_number) || table_number < 1)) {
        return res.status(400).json({ error: 'table_number phải là số nguyên dương' });
      }
      if (!status && capacity === undefined && table_number === undefined) {
        return res.status(400).json({ error: 'Cần ít nhất status, capacity hoặc table_number để cập nhật' });
      }

      // Xây dựng câu UPDATE động
      const sets = [];
      const values = [];
      let idx = 1;

      if (status) {
        sets.push(`status = $${idx++}`);
        values.push(status);
      }
      if (capacity !== undefined) {
        sets.push(`capacity = $${idx++}`);
        values.push(capacity);
      }
      if (table_number !== undefined) {
        sets.push(`table_number = $${idx++}`);
        values.push(table_number);
      }
      values.push(parseInt(id, 10));

      const { rows, rowCount } = await pool.query(
        `UPDATE tables SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (rowCount === 0) {
        return res.status(404).json({ error: 'Không tìm thấy bàn' });
      }
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: `Số bàn ${req.body.table_number} đã trùng với bàn khác` });
      }
      next(err);
    }
  });

  // DELETE /api/tables/:id - Xóa bàn an toàn (Chỉ ADMIN)
  router.delete('/:id', authenticate(['ADMIN']), async (req, res, next) => {
    try {
      const { id } = req.params;
      const tableId = parseInt(id, 10);

      // 1. Kiểm tra bàn tồn tại
      const tableRes = await pool.query('SELECT id, table_number, status FROM tables WHERE id = $1', [tableId]);
      if (tableRes.rowCount === 0) {
        return res.status(404).json({ error: 'Không tìm thấy bàn' });
      }
      const table = tableRes.rows[0];

      // 2. Ràng buộc an toàn: Không được xóa bàn đang có đơn hàng mở
      const activeRes = await pool.query(
        "SELECT id, status FROM orders WHERE table_id = $1 AND status IN ('PENDING', 'PREPARING', 'SERVED')",
        [tableId]
      );
      if (activeRes.rowCount > 0) {
        return res.status(409).json({
          error: `Bàn số ${table.table_number} đang có đơn #${activeRes.rows[0].id} (${activeRes.rows[0].status}) chưa thanh toán. Không thể xóa bàn!`,
        });
      }

      // 3. Kiểm tra lịch sử đơn hàng cũ
      const histRes = await pool.query('SELECT COUNT(*)::int AS count FROM orders WHERE table_id = $1', [tableId]);
      const histCount = histRes.rows[0].count;
      if (histCount > 0) {
        return res.status(409).json({
          error: `Bàn số ${table.table_number} đã gắn với ${histCount} đơn hàng trong lịch sử. Để bảo toàn số liệu doanh thu, vui lòng đổi trạng thái bàn thành RESERVED hoặc bảo trì thay vì xóa vĩnh viễn!`,
        });
      }

      // 4. Bàn mới chưa từng có đơn -> Cho phép xóa
      await pool.query('DELETE FROM tables WHERE id = $1', [tableId]);
      res.json({ message: `Đã xóa bàn số ${table.table_number} thành công`, id: tableId });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
