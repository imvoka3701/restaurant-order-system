// ============================================================
// routes/menu.js - API quản lý thực đơn
// GET /api/menu        - Danh sách món (?category= lọc theo loại)
// POST /api/menu       - Thêm món mới
// PATCH /api/menu/:id  - Cập nhật giá, tình trạng (ẩn món thay vì xóa)
// ============================================================
'use strict';

const { Router } = require('express');

const VALID_CATEGORIES = ['APPETIZER', 'MAIN', 'DESSERT', 'BEVERAGE'];

module.exports = function createMenuRouter(pool) {
  const router = Router();

  // GET /api/menu - Lấy thực đơn (có thể lọc theo danh mục) kèm ảnh và cờ best seller
  router.get('/', async (req, res, next) => {
    try {
      const { category } = req.query;
      let query = `
        WITH top_sellers AS (
          SELECT oi.menu_item_id
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.status = 'PAID'
          GROUP BY oi.menu_item_id
          HAVING SUM(oi.quantity) > 0
          ORDER BY SUM(oi.quantity) DESC
          LIMIT 3
        )
        SELECT 
          m.id, 
          m.name, 
          m.category, 
          m.price, 
          m.is_available,
          m.image_url,
          CASE WHEN ts.menu_item_id IS NOT NULL THEN true ELSE false END AS is_best_seller
        FROM menu_items m
        LEFT JOIN top_sellers ts ON m.id = ts.menu_item_id
      `;
      const params = [];

      if (category) {
        const upper = category.toUpperCase();
        if (!VALID_CATEGORIES.includes(upper)) {
          return res.status(400).json({
            error: `category phải là một trong: ${VALID_CATEGORIES.join(', ')}`,
          });
        }
        query += ' WHERE m.category = $1';
        params.push(upper);
      }
      query += ' ORDER BY m.category, m.name';

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/menu - Thêm món mới
  router.post('/', async (req, res, next) => {
    try {
      const { name, category, price, is_available, image_url } = req.body;

      // Validate
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Tên món (name) không được trống' });
      }
      if (!category || !VALID_CATEGORIES.includes(category.toUpperCase())) {
        return res.status(400).json({
          error: `category phải là một trong: ${VALID_CATEGORIES.join(', ')}`,
        });
      }
      if (price === undefined || typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: 'price phải là số >= 0' });
      }

      const { rows } = await pool.query(
        `INSERT INTO menu_items (name, category, price, is_available, image_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name.trim(), category.toUpperCase(), price, is_available !== false, image_url ? image_url.trim() : null]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/menu/:id - Cập nhật món (giá, tình trạng phục vụ, hình ảnh)
  // Ẩn món thay vì xóa: set is_available = false
  router.patch('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, price, is_available, category, image_url } = req.body;

      const sets = [];
      const values = [];
      let idx = 1;

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          return res.status(400).json({ error: 'name không được trống' });
        }
        sets.push(`name = $${idx++}`);
        values.push(name.trim());
      }
      if (category !== undefined) {
        if (!VALID_CATEGORIES.includes(category.toUpperCase())) {
          return res.status(400).json({
            error: `category phải là: ${VALID_CATEGORIES.join(', ')}`,
          });
        }
        sets.push(`category = $${idx++}`);
        values.push(category.toUpperCase());
      }
      if (price !== undefined) {
        if (typeof price !== 'number' || price < 0) {
          return res.status(400).json({ error: 'price phải >= 0' });
        }
        sets.push(`price = $${idx++}`);
        values.push(price);
      }
      if (is_available !== undefined) {
        sets.push(`is_available = $${idx++}`);
        values.push(Boolean(is_available));
      }
      if (image_url !== undefined) {
        sets.push(`image_url = $${idx++}`);
        values.push(image_url ? image_url.trim() : null);
      }

      if (sets.length === 0) {
        return res.status(400).json({ error: 'Không có trường nào để cập nhật' });
      }

      values.push(parseInt(id, 10));
      const { rows, rowCount } = await pool.query(
        `UPDATE menu_items SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (rowCount === 0) {
        return res.status(404).json({ error: 'Không tìm thấy món' });
      }
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/menu/:id - Ngừng kinh doanh món (Soft delete: set is_available = false)
  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const { rows, rowCount } = await pool.query(
        'UPDATE menu_items SET is_available = false WHERE id = $1 RETURNING *',
        [parseInt(id, 10)]
      );

      if (rowCount === 0) {
        return res.status(404).json({ error: 'Không tìm thấy món' });
      }
      res.json({ message: 'Đã ngừng kinh doanh món', item: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
