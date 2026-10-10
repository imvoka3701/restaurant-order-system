// ============================================================
// routes/reservations.js - API Đặt Bàn Trực Tuyến & Quản Lý Check-In
// POST  /api/reservations            - Khách đặt bàn trực tuyến (Public)
// GET   /api/reservations            - Lấy danh sách đặt bàn (?status=)
// PATCH /api/reservations/:id/checkin - Khách đến nhận bàn (Check-in -> OCCUPIED)
// PATCH /api/reservations/:id/cancel  - Hủy giữ chỗ (Cancel -> AVAILABLE)
// ============================================================
'use strict';

const { Router } = require('express');
const { authenticate, optionalAuth } = require('../auth');

module.exports = function createReservationsRouter(pool) {
  const router = Router();

  /**
   * POST /api/reservations
   * Thực khách tự gửi thông tin đặt bàn trực tuyến (Public API)
   */
  router.post('/', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const {
        table_id,
        customer_name,
        customer_phone,
        guest_count,
        booking_time,
        special_request,
      } = req.body;

      // 1. Validate đầu vào
      if (!customer_name || typeof customer_name !== 'string' || customer_name.trim().length < 2) {
        return res.status(400).json({ error: 'Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự)' });
      }

      if (!customer_phone || typeof customer_phone !== 'string' || customer_phone.trim().length < 8) {
        return res.status(400).json({ error: 'Vui lòng nhập số điện thoại liên hệ hợp lệ (tối thiểu 8 số)' });
      }

      const tableId = parseInt(table_id, 10);
      if (!tableId || isNaN(tableId)) {
        return res.status(400).json({ error: 'Vui lòng chọn bàn ăn hợp lệ' });
      }

      const guests = parseInt(guest_count, 10) || 2;
      if (guests < 1 || guests > 50) {
        return res.status(400).json({ error: 'Số lượng khách phải từ 1 đến 50 người' });
      }

      if (!booking_time) {
        return res.status(400).json({ error: 'Vui lòng chọn thời gian nhận bàn' });
      }

      const parsedBookingTime = new Date(booking_time);
      if (isNaN(parsedBookingTime.getTime())) {
        return res.status(400).json({ error: 'Thời gian đặt bàn không hợp lệ' });
      }

      await client.query('BEGIN');

      // 2. Kiểm tra trạng thái bàn ăn (Chỉ được đặt bàn AVAILABLE)
      const tableRes = await client.query(
        'SELECT id, table_number, capacity, status FROM tables WHERE id = $1 FOR UPDATE',
        [tableId]
      );

      if (tableRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy bàn ăn được chọn' });
      }

      const table = tableRes.rows[0];

      if (table.status !== 'AVAILABLE') {
        await client.query('ROLLBACK');
        const statusText = table.status === 'OCCUPIED' ? 'đang có khách ngồi' : 'đã được khách khác đặt trước';
        return res.status(409).json({
          error: `Bàn số ${table.table_number} hiện ${statusText}. Quý khách vui lòng chọn bàn khác còn trống!`,
        });
      }

      // 3. Tạo bản ghi đặt bàn
      const insertRes = await client.query(
        `INSERT INTO reservations (table_id, customer_name, customer_phone, guest_count, booking_time, special_request, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
         RETURNING *`,
        [
          tableId,
          customer_name.trim(),
          customer_phone.trim(),
          guests,
          parsedBookingTime.toISOString(),
          (special_request || '').trim(),
        ]
      );

      // 4. Khóa bàn sang trạng thái RESERVED
      await client.query(
        "UPDATE tables SET status = 'RESERVED' WHERE id = $1",
        [tableId]
      );

      await client.query('COMMIT');

      const reservation = insertRes.rows[0];

      res.status(201).json({
        message: 'Đặt bàn thành công! Nhà hàng đã giữ chỗ sẵn sàng cho quý khách.',
        reservation: {
          ...reservation,
          table_number: table.table_number,
          table_capacity: table.capacity,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/reservations
   * Lấy danh sách đặt bàn (kèm số bàn và sức chứa)
   */
  router.get('/', optionalAuth(), async (req, res, next) => {
    try {
      const { status } = req.query;
      let query = `
        SELECT 
          r.id, r.table_id, t.table_number, t.capacity AS table_capacity,
          r.customer_name, r.customer_phone, r.guest_count,
          r.booking_time, r.special_request, r.status, r.created_at
        FROM reservations r
        JOIN tables t ON t.id = r.table_id
      `;
      const params = [];

      if (status) {
        query += ' WHERE r.status = $1';
        params.push(status.toUpperCase());
      }

      query += ' ORDER BY r.booking_time ASC, r.id DESC';

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /api/reservations/:id/checkin
   * Khách đến nhà hàng nhận bàn: chuyển reservation -> CHECKED_IN, tables -> OCCUPIED
   */
  router.patch('/:id/checkin', authenticate(['WAITER', 'ADMIN']), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const resId = parseInt(id, 10);

      await client.query('BEGIN');

      const rRes = await client.query(
        'SELECT id, table_id, status, customer_name FROM reservations WHERE id = $1 FOR UPDATE',
        [resId]
      );

      if (rRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy thông tin đặt bàn' });
      }

      const reservation = rRes.rows[0];

      if (reservation.status !== 'ACTIVE') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Phiếu đặt bàn #${reservation.id} đang ở trạng thái ${reservation.status}, không thể nhận bàn!`,
        });
      }

      // Đổi trạng thái reservation
      await client.query(
        "UPDATE reservations SET status = 'CHECKED_IN' WHERE id = $1",
        [resId]
      );

      // Đổi trạng thái bàn thành OCCUPIED
      await client.query(
        "UPDATE tables SET status = 'OCCUPIED' WHERE id = $1",
        [reservation.table_id]
      );

      await client.query('COMMIT');

      res.json({
        message: `Đã hoàn tất nhận bàn cho khách "${reservation.customer_name}"! Bàn đã chuyển sang trạng thái Có khách (OCCUPIED).`,
        id: resId,
        status: 'CHECKED_IN',
        table_id: reservation.table_id,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  /**
   * PATCH /api/reservations/:id/cancel
   * Hủy đặt bàn (do khách hủy hoặc quá giờ): chuyển reservation -> CANCELLED, tables -> AVAILABLE
   */
  router.patch('/:id/cancel', authenticate(['WAITER', 'ADMIN']), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const resId = parseInt(id, 10);

      await client.query('BEGIN');

      const rRes = await client.query(
        'SELECT id, table_id, status, customer_name FROM reservations WHERE id = $1 FOR UPDATE',
        [resId]
      );

      if (rRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy thông tin đặt bàn' });
      }

      const reservation = rRes.rows[0];

      if (reservation.status !== 'ACTIVE') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Phiếu đặt bàn #${reservation.id} đã ở trạng thái ${reservation.status}, không thể hủy!`,
        });
      }

      // Đổi trạng thái reservation
      await client.query(
        "UPDATE reservations SET status = 'CANCELLED' WHERE id = $1",
        [resId]
      );

      // Kiểm tra xem bàn có đơn active nào không trước khi trả về AVAILABLE
      const orderRes = await client.query(
        "SELECT id FROM orders WHERE table_id = $1 AND status IN ('PENDING', 'PREPARING', 'SERVED')",
        [reservation.table_id]
      );

      if (orderRes.rowCount === 0) {
        await client.query(
          "UPDATE tables SET status = 'AVAILABLE' WHERE id = $1",
          [reservation.table_id]
        );
      }

      await client.query('COMMIT');

      res.json({
        message: `Đã hủy đặt bàn của khách "${reservation.customer_name}". Bàn đã được giải phóng sẵn sàng đón khách mới!`,
        id: resId,
        status: 'CANCELLED',
        table_id: reservation.table_id,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  return router;
};
