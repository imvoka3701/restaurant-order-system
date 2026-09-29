# 🍜 Hệ thống Quản lý Nhà hàng / Order

Hệ thống quản lý đặt món, theo dõi đơn hàng, thanh toán và báo cáo doanh thu cho nhà hàng. Xây dựng bằng Node.js/Express + PostgreSQL, đóng gói Docker Compose với Nginx HTTPS reverse proxy.

## 📐 Kiến trúc

```
                    ┌──────────────────────────────────┐
                    │           Internet / LAN          │
                    └──────────────┬───────────────────┘
                                   │
                          ┌────────┴────────┐
                          │   Nginx Proxy   │ :80 (→301) / :443 (HTTPS)
                          │  nginx:1.25     │
                          │  [frontend-net] │
                          │  [backend-net]  │
                          └───┬─────────┬───┘
                              │         │
               ┌──────────────┘         └──────────────┐
               │                                       │
    ┌──────────┴──────────┐              ┌─────────────┴────────┐
    │  Restaurant App     │              │     pgAdmin 4        │
    │  Node.js/Express    │              │  /pgadmin/           │
    │  :3000 (internal)   │              │  :80 (internal)      │
    │  [backend-net]      │              │  [backend-net]       │
    └──────────┬──────────┘              └──────────────────────┘
               │
    ┌──────────┴──────────┐
    │   PostgreSQL 16     │
    │   :5432 (internal)  │
    │   [backend-net]     │
    └─────────────────────┘

    frontend-net: bridge (publish ports)
    backend-net:  bridge, internal: true (không truy cập từ host)
    monitoring-net: bridge (chuẩn bị cho phase sau)
```

## 📋 Yêu cầu

- **Docker Desktop** (>= 4.x) với backend WSL2
- **Git** (>= 2.x)
- Hệ điều hành: Windows 10/11

## 🚀 Hướng dẫn cài đặt

### Bước 1: Clone repo

```bash
git clone https://github.com/imvoka3701/restaurant-order-system.git
cd restaurant-order-system
```

### Bước 2: Tạo file .env

```bash
# Sao chép file mẫu
cp .env.example .env
# Mở .env và thay đổi mật khẩu (>= 16 ký tự, mật khẩu mạnh)
```

### Bước 3: Sinh TLS Certificate

**Windows (PowerShell):**
```powershell
.\scripts\gen-cert.ps1
```

**Linux/macOS/WSL:**
```bash
chmod +x scripts/gen-cert.sh
./scripts/gen-cert.sh
```

### Bước 4: Thêm domain vào hosts

Mở **PowerShell với quyền Administrator** và chạy:
```powershell
Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value "127.0.0.1 restaurant.local"
```

Hoặc mở file `C:\Windows\System32\drivers\etc\hosts` bằng Notepad (Run as Administrator) và thêm dòng:
```
127.0.0.1 restaurant.local
```

### Bước 5: Khởi chạy hệ thống

```bash
docker compose up -d --build
```

Chờ ~30-60 giây để tất cả services khởi động và healthy:
```bash
docker compose ps
```

### Bước 6: Truy cập

| Trang | URL |
|---|---|
| 🍽️ Đặt món | https://restaurant.local/ |
| 👨‍🍳 Bếp | https://restaurant.local/kitchen.html |
| 💰 Thu ngân | https://restaurant.local/cashier.html |
| 📊 Doanh thu | https://restaurant.local/revenue.html |
| 🔧 pgAdmin | https://restaurant.local/pgadmin/ |

> ⚠️ Trình duyệt sẽ cảnh báo certificate tự ký - nhấn "Advanced" → "Proceed" để tiếp tục.

## 🔌 API Endpoints

| Method | Path | Mô tả |
|---|---|---|
| GET | /health | Kiểm tra sức khỏe (app + DB) |
| GET | /api/tables | Danh sách bàn |
| POST | /api/tables | Thêm bàn mới |
| PATCH | /api/tables/:id | Cập nhật trạng thái/sức chứa |
| GET | /api/menu | Thực đơn (?category=APPETIZER\|MAIN\|DESSERT\|BEVERAGE) |
| POST | /api/menu | Thêm món mới |
| PATCH | /api/menu/:id | Cập nhật giá/tình trạng |
| POST | /api/orders | Tạo đơn hàng (transaction) |
| GET | /api/orders | Danh sách đơn (?status=) |
| GET | /api/orders/:id | Chi tiết đơn kèm items |
| PATCH | /api/orders/:id/status | Chuyển trạng thái (PENDING→PREPARING→SERVED→PAID) |
| GET | /api/revenue/summary | Doanh thu (?from=&to=) |

## 🔄 Quản lý

### Reset toàn bộ dữ liệu
```bash
# Xóa containers VÀ volumes (dữ liệu DB sẽ mất)
docker compose down -v
# Khởi chạy lại (init scripts sẽ chạy lại vì volume trống)
docker compose up -d --build
```

### Xem logs
```bash
docker compose logs -f                  # Tất cả
docker compose logs -f restaurant-app   # Chỉ app
docker compose logs -f postgres         # Chỉ DB
```

### Restart 1 service
```bash
docker compose restart restaurant-app
```

## ⚠️ Lưu ý quan trọng

1. **Init scripts** (`postgres/*.sql`, `postgres/*.sh`) chỉ chạy khi volume `postgres_data` **trống**. Nếu thay đổi schema/seed, cần `docker compose down -v` trước.
2. **File `.env`** chứa mật khẩu thật — **KHÔNG** commit vào git.
3. **Certificate TLS** tự ký — **KHÔNG** commit `.key`/`.crt`.
4. **app_user** chỉ có quyền SELECT/INSERT/UPDATE (không có DELETE/DROP).

## 🛡️ Bảo mật

- PostgreSQL, pgAdmin, App **không publish port** ra host — chỉ truy cập qua Nginx.
- Mạng `backend-net` là `internal: true` — container bên ngoài không truy cập được.
- TLS 1.2/1.3 only, cipher suites mạnh.
- Security headers: HSTS, X-Frame-Options, CSP, X-Content-Type-Options, v.v.
- Ứng dụng chạy bằng user `node` (non-root) trong container.

## 🔮 Hướng phát triển (Phase sau)

- **Phase 2**: Prometheus + Grafana (metrics, dashboard)
- **Phase 3**: Loki + Promtail (centralized logging)
- Đăng nhập / phân quyền (JWT, session)
- WebSocket cho real-time updates
- Quản lý reservation (đặt bàn trước)

## 🐛 Troubleshooting

| Vấn đề | Giải pháp |
|---|---|
| Container không healthy | `docker compose logs <service>` để xem lỗi |
| Port 80/443 bị chiếm | Tắt IIS, Apache, hoặc service khác dùng port |
| Lỗi permission postgres | `docker compose down -v` rồi `up` lại |
| pgAdmin không load | Chờ ~30s, refresh lại; kiểm tra logs pgadmin |
| Certificate warning | Đây là cert tự ký, nhấn Accept/Proceed |
| Lỗi CRLF trên Linux | Đã có `.gitattributes` ép LF; nếu lỗi, chạy `git config core.autocrlf input` |

## 📄 Hạn chế hiện tại

- **Chưa có đăng nhập/phân quyền**: Tất cả các trang đều truy cập được mà không cần xác thực. Đây là hạn chế có chủ đích ở bản MVP, sẽ bổ sung JWT/session ở phiên bản sau.
- **Chưa có real-time**: Bếp và thu ngân dùng polling (refresh 5s) thay vì WebSocket.
