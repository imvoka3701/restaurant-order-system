// ============================================================
// routes/revenue.js - API báo cáo doanh thu
// GET /api/revenue/summary - Doanh thu theo ngày + top món bán chạy
// Chỉ tính đơn đã thanh toán (PAID)
// ============================================================
'use strict';

const { Router } = require('express');

module.exports = function createRevenueRouter(pool) {
  const router = Router();

  // GET /api/revenue/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/summary', async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const params = [];
      let dateFilter = '';
      let idx = 1;

      // Lọc theo khoảng thời gian (tùy chọn)
      if (from) {
        dateFilter += ` AND o.created_at >= $${idx++}::date`;
        params.push(from);
      }
      if (to) {
        // Cộng thêm 1 ngày để bao gồm cả ngày cuối
        dateFilter += ` AND o.created_at < ($${idx++}::date + INTERVAL '1 day')`;
        params.push(to);
      }

      // Doanh thu theo ngày
      const dailyRes = await pool.query(
        `SELECT
           DATE(o.created_at) AS date,
           COUNT(*)::int AS total_orders,
           SUM(o.total_amount) AS revenue
         FROM orders o
         WHERE o.status = 'PAID' ${dateFilter}
         GROUP BY DATE(o.created_at)
         ORDER BY date DESC`,
        params
      );

      // Top 10 món bán chạy nhất
      const topItemsRes = await pool.query(
        `SELECT
           mi.name,
           mi.category,
           SUM(oi.quantity)::int AS total_sold,
           SUM(oi.subtotal) AS total_revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.status = 'PAID' ${dateFilter}
         GROUP BY mi.id, mi.name, mi.category
         ORDER BY total_sold DESC
         LIMIT 10`,
        params
      );

      // Tổng doanh thu
      const totalRes = await pool.query(
        `SELECT
           COUNT(*)::int AS total_orders,
           COALESCE(SUM(o.total_amount), 0) AS total_revenue
         FROM orders o
         WHERE o.status = 'PAID' ${dateFilter}`,
        params
      );

      res.json({
        summary: totalRes.rows[0],
        daily: dailyRes.rows,
        top_items: topItemsRes.rows,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
