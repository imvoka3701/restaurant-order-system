// ============================================================
// routes/tables.js - API quản lý bàn ăn
// GET /api/tables       - Danh sách bàn
// POST /api/tables      - Thêm bàn mới
// PATCH /api/tables/:id - Cập nhật trạng thái/sức chứa
// ============================================================
'use strict';

const { Router } = require('express');

// Trạng thái hợp lệ cho bàn
const VALID_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED'];

module.exports = function createTablesRouter(pool) {
  const router = Router();

  // GET /api/tables - Lấy danh sách tất cả bàn
  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, table_number, capacity, status FROM tables ORDER BY table_number'
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/tables - Thêm bàn mới
  router.post('/', async (req, res, next) => {
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

  // PATCH /api/tables/:id - Cập nhật trạng thái hoặc sức chứa
  router.patch('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, capacity } = req.body;

      // Validate
      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `status phải là một trong: ${VALID_STATUSES.join(', ')}`,
        });
      }
      if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1)) {
        return res.status(400).json({ error: 'capacity phải là số nguyên dương' });
      }
      if (!status && capacity === undefined) {
        return res.status(400).json({ error: 'Cần ít nhất status hoặc capacity để cập nhật' });
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
      next(err);
    }
  });

  return router;
};
