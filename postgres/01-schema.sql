-- ============================================================
-- 01-schema.sql
-- Khởi tạo schema cho Hệ thống Quản lý Nhà hàng
-- Tạo 5 bảng: tables, menu_items, orders, order_items, users
-- ============================================================

-- Bảng quản lý bàn ăn
CREATE TABLE IF NOT EXISTS tables (
    id          SERIAL PRIMARY KEY,
    table_number INTEGER NOT NULL UNIQUE,                    -- Số bàn (duy nhất)
    capacity    INTEGER NOT NULL DEFAULT 4,                  -- Sức chứa
    status      VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'     -- Trạng thái bàn
        CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED'))
);

-- Bảng thực đơn
CREATE TABLE IF NOT EXISTS menu_items (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,                       -- Tên món ăn
    category     VARCHAR(20) NOT NULL                         -- Danh mục món
        CHECK (category IN ('APPETIZER', 'MAIN', 'DESSERT', 'BEVERAGE')),
    price        DECIMAL(10, 2) NOT NULL CHECK (price >= 0),  -- Giá (VND)
    is_available BOOLEAN NOT NULL DEFAULT TRUE,               -- Còn phục vụ?
    image_url    TEXT                                         -- Đường dẫn / Base64 hình ảnh món
);

-- Bảng đơn hàng
CREATE TABLE IF NOT EXISTS orders (
    id            SERIAL PRIMARY KEY,
    table_id      INTEGER NOT NULL REFERENCES tables(id),      -- Bàn đặt đơn
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING'       -- Trạng thái đơn
        CHECK (status IN ('PENDING', 'PREPARING', 'SERVED', 'PAID', 'CANCELLED')),
    total_amount  DECIMAL(12, 2) NOT NULL DEFAULT 0,           -- Tổng tiền
    waiter_id     INTEGER REFERENCES users(id),                -- Nhân viên tạo đơn
    cashier_id    INTEGER REFERENCES users(id),                -- Thu ngân thu tiền
    payment_method VARCHAR(20)                                 -- Phương thức thanh toán
        CHECK (payment_method IN ('CASH', 'TRANSFER_QR', 'CARD')),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()             -- Thời điểm tạo
);

-- Chi tiết đơn hàng (các món trong đơn)
CREATE TABLE IF NOT EXISTS order_items (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,  -- Thuộc đơn nào
    menu_item_id  INTEGER NOT NULL REFERENCES menu_items(id),                -- Món nào
    quantity      INTEGER NOT NULL CHECK (quantity > 0),                      -- Số lượng (> 0)
    unit_price    DECIMAL(10, 2) NOT NULL DEFAULT 0,                         -- Đơn giá tại thời điểm đặt
    subtotal      DECIMAL(12, 2) NOT NULL DEFAULT 0,                         -- Thành tiền
    item_notes    VARCHAR(255) DEFAULT ''                                    -- Ghi chú chế biến
);

-- Bảng người dùng (phục vụ đăng nhập ở phase sau)
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50) NOT NULL UNIQUE,                  -- Tên đăng nhập
    password_hash VARCHAR(255) NOT NULL,                        -- Mật khẩu đã hash (bcrypt)
    role          VARCHAR(20) NOT NULL DEFAULT 'WAITER'         -- Vai trò
        CHECK (role IN ('ADMIN', 'WAITER', 'KITCHEN', 'CASHIER')),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,                -- Trạng thái tài khoản (true: hoạt động, false: bị khóa)
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()              -- Ngày tạo
);

-- ============================================================
-- Index tối ưu truy vấn thường dùng
-- ============================================================

-- Tìm đơn theo trạng thái (Bếp xem PENDING, Thu ngân xem SERVED)
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Sắp xếp / lọc đơn theo thời gian (báo cáo doanh thu)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Tìm nhanh các món trong 1 đơn hàng
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Ràng buộc 1 bàn chỉ có tối đa 1 đơn hàng active tại một thời điểm
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_order_per_table 
    ON orders(table_id) 
    WHERE status IN ('PENDING', 'PREPARING', 'SERVED');

-- ============================================================
-- Bảng đặt bàn trước (Reservations)
-- ============================================================
CREATE TABLE IF NOT EXISTS reservations (
    id              SERIAL PRIMARY KEY,
    table_id        INTEGER NOT NULL REFERENCES tables(id),
    customer_name   VARCHAR(100) NOT NULL,
    customer_phone  VARCHAR(20) NOT NULL,
    guest_count     INTEGER NOT NULL DEFAULT 2,
    booking_time    TIMESTAMP NOT NULL,
    special_request TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'CHECKED_IN', 'CANCELLED')),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_table_id ON reservations(table_id);

