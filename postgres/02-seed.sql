-- ============================================================
-- 02-seed.sql
-- Dữ liệu mẫu: 10 bàn, ~15 món ăn, 3 user
-- Giá tính bằng VND
-- ============================================================

-- 10 bàn ăn (sức chứa khác nhau)
INSERT INTO tables (table_number, capacity, status) VALUES
    (1,  2, 'AVAILABLE'),
    (2,  2, 'AVAILABLE'),
    (3,  4, 'AVAILABLE'),
    (4,  4, 'AVAILABLE'),
    (5,  4, 'AVAILABLE'),
    (6,  6, 'AVAILABLE'),
    (7,  6, 'AVAILABLE'),
    (8,  8, 'AVAILABLE'),
    (9,  8, 'AVAILABLE'),
    (10, 10, 'AVAILABLE');

-- 15 món ăn đủ 4 danh mục
INSERT INTO menu_items (name, category, price, is_available) VALUES
    -- Khai vị (APPETIZER)
    ('Gỏi cuốn tôm thịt',     'APPETIZER', 45000,  TRUE),
    ('Chả giò rế',             'APPETIZER', 55000,  TRUE),
    ('Súp bào ngư',            'APPETIZER', 85000,  TRUE),
    ('Salad trộn dầu giấm',    'APPETIZER', 40000,  TRUE),
    -- Món chính (MAIN)
    ('Phở bò tái nạm',         'MAIN',      65000,  TRUE),
    ('Cơm tấm sườn bì chả',   'MAIN',      55000,  TRUE),
    ('Bún chả Hà Nội',         'MAIN',      60000,  TRUE),
    ('Cá lóc kho tộ',          'MAIN',      95000,  TRUE),
    ('Lẩu thái hải sản',       'MAIN',      250000, TRUE),
    -- Tráng miệng (DESSERT)
    ('Chè khúc bạch',          'DESSERT',   35000,  TRUE),
    ('Bánh flan caramel',      'DESSERT',   25000,  TRUE),
    ('Kem dừa non',            'DESSERT',   30000,  TRUE),
    -- Đồ uống (BEVERAGE)
    ('Trà đá',                 'BEVERAGE',  5000,   TRUE),
    ('Cà phê sữa đá',         'BEVERAGE',  25000,  TRUE),
    ('Nước ép cam tươi',       'BEVERAGE',  35000,  TRUE);

-- 3 user mẫu
-- LƯU Ý: password_hash dưới đây là bcrypt hash của chuỗi "password123"
-- Được sinh bằng: echo "password123" | npx bcryptjs-cli hash
-- Hash bcrypt cost=10, CHỈ dùng cho môi trường phát triển / demo
-- $2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy = "password123"
INSERT INTO users (username, password_hash, role) VALUES
    ('admin',   '$2a$10$otIXAE.QNwrGYDHCgSZn.efqWrDe6r0IMemfD2919MseCqN1KhWYG', 'ADMIN'),
    ('waiter1', '$2a$10$otIXAE.QNwrGYDHCgSZn.efqWrDe6r0IMemfD2919MseCqN1KhWYG', 'WAITER'),
    ('kitchen1','$2a$10$otIXAE.QNwrGYDHCgSZn.efqWrDe6r0IMemfD2919MseCqN1KhWYG', 'KITCHEN'),
    ('cashier1','$2a$10$otIXAE.QNwrGYDHCgSZn.efqWrDe6r0IMemfD2919MseCqN1KhWYG', 'CASHIER');
