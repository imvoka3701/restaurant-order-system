#!/bin/bash
# ============================================================
# 03-roles.sh
# Tạo role app_user (least privilege) và exporter (cho phase sau)
# Script idempotent: có thể chạy lại mà không lỗi
# Chạy bởi postgres entrypoint với quyền superuser
# ============================================================
set -e

# Biến môi trường cần thiết:
# APP_DB_USER  - tên role ứng dụng (ví dụ: app_user)
# APP_DB_PASS  - mật khẩu role ứng dụng
# POSTGRES_DB  - tên database
# POSTGRES_USER - superuser PostgreSQL
# EXPORTER_DB_PASS - mật khẩu cho role exporter (Prometheus)

echo ">>> Tạo role ${APP_DB_USER} (least privilege)..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Tạo role app_user nếu chưa tồn tại
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${APP_DB_USER}') THEN
            CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASS}';
            RAISE NOTICE 'Role % đã được tạo', '${APP_DB_USER}';
        ELSE
            -- Cập nhật mật khẩu nếu role đã tồn tại
            ALTER ROLE ${APP_DB_USER} WITH PASSWORD '${APP_DB_PASS}';
            RAISE NOTICE 'Role % đã tồn tại, cập nhật mật khẩu', '${APP_DB_USER}';
        END IF;
    END
    \$\$;

    -- Đảm bảo KHÔNG có quyền superuser/createdb/createrole
    ALTER ROLE ${APP_DB_USER} NOSUPERUSER NOCREATEDB NOCREATEROLE;

    -- Thu hồi quyền mặc định từ PUBLIC
    REVOKE ALL ON DATABASE ${POSTGRES_DB} FROM PUBLIC;

    -- Cấp quyền kết nối database
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};

    -- Cấp quyền sử dụng schema public
    GRANT USAGE ON SCHEMA public TO ${APP_DB_USER};

    -- Cấp SELECT, INSERT, UPDATE trên TẤT CẢ bảng (KHÔNG có DELETE, DROP, TRUNCATE)
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ${APP_DB_USER};

    -- Thu hẹp quyền: thu hồi toàn bộ quyền trên bảng users (app chưa dùng bảng này)
    REVOKE ALL ON TABLE users FROM ${APP_DB_USER};

    -- Cấp quyền dùng SEQUENCE (bắt buộc cho INSERT với SERIAL/IDENTITY)
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_USER};

    -- Đặt quyền mặc định cho các bảng/sequence tạo sau
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE ON TABLES TO ${APP_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO ${APP_DB_USER};

EOSQL

echo ">>> Tạo role exporter (cho Prometheus ở phase sau)..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Tạo role exporter nếu chưa tồn tại
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'exporter') THEN
            CREATE ROLE exporter LOGIN PASSWORD '${EXPORTER_DB_PASS}';
            RAISE NOTICE 'Role exporter đã được tạo';
        ELSE
            ALTER ROLE exporter WITH PASSWORD '${EXPORTER_DB_PASS}';
            RAISE NOTICE 'Role exporter đã tồn tại, cập nhật mật khẩu';
        END IF;
    END
    \$\$;

    -- Cấp pg_monitor để đọc thống kê PostgreSQL
    GRANT pg_monitor TO exporter;
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO exporter;

EOSQL

echo ">>> Hoàn tất cấu hình roles!"
