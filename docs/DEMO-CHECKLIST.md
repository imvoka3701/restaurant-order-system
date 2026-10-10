# Checklist Demo – Hệ thống Quản lý Nhà hàng / Order

> File này **không chứa mật khẩu**. Mọi tài khoản/mật khẩu lấy trong file `.env` (không commit) theo tên khóa ghi bên dưới.

## 1. Bảng URL

| Thành phần | URL | Tài khoản lấy ở đâu |
|---|---|---|
| Ứng dụng đặt món | https://restaurant.local | Không cần đăng nhập |
| Màn hình Bếp | https://restaurant.local/kitchen.html | Không cần |
| Màn hình Thu ngân | https://restaurant.local/cashier.html | Không cần |
| Doanh thu | https://restaurant.local/revenue.html | Không cần |
| pgAdmin | https://restaurant.local/pgadmin/ | Khóa `PGADMIN_EMAIL` / `PGADMIN_PASS` trong `.env` |
| Grafana | http://127.0.0.1:3000 | Khóa `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASS` trong `.env` |
| Prometheus Targets | http://127.0.0.1:9090/targets | Không cần (chỉ bind localhost) |

> Nếu `restaurant.local` chưa vào được, chạy PowerShell **Administrator**:
> `Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value "127.0.0.1 restaurant.local"`

## 2. Kết nối pgAdmin tới PostgreSQL

Trong pgAdmin: *Register → Server*:

- **Host name/address:** `postgres`
- **Port:** `5432`
- **Maintenance database:** `restaurant_db`
- **Username:** `app_user`
- **Password:** lấy từ khóa `APP_DB_PASS` trong `.env`

(pgAdmin và Postgres cùng nằm trong `backend-net` nên dùng tên service `postgres`.)

## 3. Kịch bản demo (~10 phút)

1. **Tạo đơn trên web** (https://restaurant.local): chọn bàn, thêm vài món, gửi đơn. *(1 phút)*
2. **Bếp nhận đơn** (`/kitchen.html`): đơn PENDING hiện ra → bấm chuyển PREPARING → SERVED. *(1 phút)*
3. **Thu ngân thanh toán** (`/cashier.html`): đơn SERVED → PAID, bàn trở về AVAILABLE. *(1 phút)*
4. **Xem doanh thu** (`/revenue.html`). *(30 giây)*
5. **Grafana** (http://127.0.0.1:3000 → dashboard *restaurant-overview*): lần lượt 4 nhóm panel (Container & Host, PostgreSQL, Nginx, Ứng dụng) và nhóm 5 **Logs (Loki)**. *(2 phút)*
6. **Prometheus Targets** (http://127.0.0.1:9090/targets): 6 target đều UP. *(30 giây)*
7. **Explore Loki** (Grafana → Explore → datasource Loki), chạy 3 câu LogQL: *(1,5 phút)*
   - `{container="restaurant-app"} | json | level="ERROR"`
   - `sum(count_over_time({container="nginx-proxy"} |= "POST /api/orders" [5m]))`
   - `{container="postgres-db"} |~ "FATAL|panic"`
8. **Least Privilege:** mở Query Tool trong pgAdmin (user `app_user`) chạy `DELETE FROM order_items;` và `SELECT * FROM users;` → cả hai bị `permission denied`. *(1 phút)*
9. **Cô lập mạng:** chạy
   ```powershell
   docker exec restaurant-app wget -T 3 -qO- http://1.1.1.1
   docker exec postgres-db wget -T 3 -qO- http://1.1.1.1
   ```
   → `Network unreachable` (backend-net là `internal`), trong khi web vẫn chạy bình thường. *(1 phút)*
10. **Security Headers:**
    ```powershell
    curl.exe -kI --resolve restaurant.local:443:127.0.0.1 https://restaurant.local/
    ```
    Chỉ ra X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Strict-Transport-Security, Content-Security-Policy; không có X-Powered-By. *(30 giây)*

## 4. Lệnh chụp ảnh minh họa

```powershell
docker compose ps
docker network inspect restaurant-order-system_backend-net restaurant-order-system_frontend-net restaurant-order-system_monitoring-net
docker ps --format "table {{.Names}}\t{{.Ports}}"
docker ps --format '{{.Names}}' | Sort-Object | % { docker inspect --format '{{.Name}} | user={{printf "%q" .Config.User}} | ro={{.HostConfig.ReadonlyRootfs}} | capdrop={{.HostConfig.CapDrop}} | secopt={{.HostConfig.SecurityOpt}} | priv={{.HostConfig.Privileged}} | mem={{.HostConfig.Memory}}' $_ }
docker stats --no-stream
Get-ChildItem docs/security-scan        # kết quả Trivy / npm audit
```

## 5. Xử lý sự cố nhanh

| Sự cố | Cách xử lý |
|---|---|
| Trình duyệt cảnh báo chứng chỉ tự ký | Bấm **Advanced → Proceed to restaurant.local** |
| Cổng 80 không dùng được | Hệ thống dùng cổng **8080** cho HTTP (tự chuyển hướng 301 sang HTTPS) |
| Sửa `init.sql` nhưng DB không đổi | `init.sql` và script role chỉ chạy khi volume `postgres_data` còn trống → cần `docker compose down -v` |
| Container báo `starting` | Chờ vài chục giây tới khi `healthy` (`docker compose ps`) |
| Máy khởi động lại / Docker tắt | Mở Docker Desktop rồi chạy `docker compose up -d` |
| pgAdmin trả 429 | Rate limit đang hoạt động, chờ vài giây rồi tải lại |

## 6. Reset sạch trước buổi demo thật

> ⚠️ Lệnh dưới **xóa toàn bộ dữ liệu** (đơn hàng, cấu hình Grafana/Loki…).

```powershell
docker compose down -v
docker compose up -d --build
# Chờ các container healthy (khoảng 1–2 phút), rồi sinh số liệu cho dashboard:
./scripts/load-test.ps1
```
