# 🍜 Hệ thống Quản lý Nhà hàng / Order

Hệ thống quản lý đặt món, theo dõi đơn hàng, thanh toán và báo cáo doanh thu cho nhà hàng.
Xây dựng bằng **Node.js/Express + PostgreSQL 16**, đóng gói **Docker Compose** với:
- **Nginx** HTTPS reverse proxy + rate limiting
- **Prometheus + Grafana** giám sát metrics
- **Loki + Promtail** log tập trung
- **Security hardening** toàn diện (read_only, cap_drop, network isolation)

---

## 📐 Kiến trúc hệ thống

```
                              Internet / LAN
                                    │
                    ┌───────────────┴────────────────┐
                    │    Nginx Reverse Proxy (HTTPS)  │ :443 (HTTPS) / :8080→80 (→301)
                    │    nginx:1.25-alpine            │
                    │    [frontend / backend / mon]   │
                    └──────┬──────────┬──────────┬────┘
                           │          │          │
          ┌────────────────┘          │          └─────────────────────┐
          │                           │                               │
  ┌───────┴──────────┐   ┌────────────┴───────────┐   ┌──────────────┴──────┐
  │ Restaurant App   │   │      pgAdmin 4         │   │  nginx-exporter     │
  │ Node.js/Express  │   │   /pgadmin/            │   │  (stub_status→      │
  │ :3000 (internal) │   │   :80 (internal)       │   │   Prometheus)       │
  │ [backend-net]    │   │   [backend-net]        │   │  [monitoring-net]   │
  └───────┬──────────┘   └────────────────────────┘   └─────────────────────┘
          │
  ┌───────┴──────────┐     ═══════ MONITORING (127.0.0.1 only) ═══════
  │  PostgreSQL 16   │
  │  :5432 (internal)│     ┌──────────┐  ┌────────┐  ┌─────────┐
  │  [backend-net]   │     │Prometheus│→ │Grafana │→ │Dashboard│
  └──────────────────┘     │ :9090    │  │ :3000  │  │(JSON)   │
                           │[mon+back]│  │ [mon]  │  └─────────┘
  ┌──────────────────┐     └────┬─────┘  └───┬────┘
  │postgres-exporter │          │            │
  │ [backend-net]    │←─────────┘            │
  └──────────────────┘                       │
                            ═══════ LOGGING ═══════
  ┌──────────────────┐
  │   cAdvisor       │     ┌──────────┐  ┌──────────┐
  │  [monitoring-net]│     │ Promtail │→ │  Loki    │→ Grafana
  ├──────────────────┤     │ docker_sd│  │ :3100    │
  │  node-exporter   │     │ [mon]    │  │ [mon]    │
  │  [monitoring-net]│     └──────────┘  └──────────┘
  └──────────────────┘

  ═══════ NETWORKS ═══════
  frontend-net : bridge       │ Nginx (publish port ra ngoài)
  backend-net  : bridge,      │ Nginx, App, Postgres, pgAdmin,
                 internal:true│ postgres-exporter, Prometheus
  monitoring-net: bridge      │ Nginx, Prometheus, Grafana, Loki,
                              │ Promtail, cAdvisor, node-exporter,
                              │ nginx-exporter
```

### Luồng dữ liệu

| Luồng | Mô tả |
|---|---|
| **Request** | Client → Nginx (:443) → App (:3000) → PostgreSQL (:5432) |
| **Metrics** | Prometheus scrape → App, cAdvisor, node-exporter, postgres-exporter, nginx-exporter (15s) |
| **Log** | Container stdout → Docker json-file → Promtail (docker_sd) → Loki → Grafana Explore |

---

## 📋 Bảng Service

| Service | Image | Network | Port publish | Vai trò |
|---|---|---|---|---|
| nginx | nginx:1.25-alpine | frontend, backend, monitoring | 0.0.0.0:443, 0.0.0.0:8080 | Reverse proxy HTTPS |
| restaurant-app | node:20-alpine (build) | backend | — | Ứng dụng đặt món |
| postgres | postgres:16-alpine | backend | — | Database chính |
| pgadmin | dpage/pgadmin4:8 | backend | — | Quản lý DB qua web |
| prometheus | prom/prometheus:v2.53.0 | monitoring, backend | 127.0.0.1:9090 | Thu thập metrics |
| grafana | grafana/grafana:10.4.2 | monitoring | 127.0.0.1:3000 | Dashboard & log viewer |
| cadvisor | gcr.io/cadvisor/cadvisor:v0.49.1 | monitoring | — | Metrics container |
| node-exporter | prom/node-exporter:v1.7.0 | monitoring | — | Metrics host (WSL2 VM) |
| postgres-exporter | prometheuscommunity/postgres-exporter:v0.15.0 | backend | — | Metrics PostgreSQL |
| nginx-exporter | nginx/nginx-prometheus-exporter:1.1.0 | monitoring | — | Metrics Nginx |
| loki | grafana/loki:2.9.4 | monitoring | — | Log aggregation |
| promtail | grafana/promtail:2.9.4 | monitoring | — | Log collector |

---

## 📋 Yêu cầu

- **Docker Desktop** (>= 4.x) với backend WSL2
- **Git** (>= 2.x)
- **RAM khuyến nghị**: 6-8 GB cho Docker Desktop
- Hệ điều hành: Windows 10/11

### Cấu hình WSL2 (khuyến nghị)

Tạo file `%USERPROFILE%\.wslconfig`:
```ini
[wsl2]
memory=6GB
processors=4
swap=2GB
```

Khởi động lại WSL: `wsl --shutdown` rồi mở lại Docker Desktop.

---

## 🚀 Hướng dẫn cài đặt

### Bước 1: Clone repo

```bash
git clone https://github.com/imvoka3701/restaurant-order-system.git
cd restaurant-order-system
```

### Bước 2: Tạo file `.env`

```bash
cp .env.example .env
# Mở .env và thay đổi tất cả mật khẩu (>= 16 ký tự, mật khẩu mạnh)
# EXPORTER_DB_PASS: chỉ chữ + số, >= 24 ký tự
```

> ⚠️ **Bí mật hiện truyền qua biến môi trường**, có thể lộ qua `docker inspect`. Hướng nâng cấp: dùng Docker Secrets với biến `*_FILE`.

### Bước 3: Sinh TLS Certificate

**Windows (PowerShell):**
```powershell
.\scripts\gen-cert.ps1
```

**Linux/macOS/WSL:**
```bash
chmod +x scripts/gen-cert.sh && ./scripts/gen-cert.sh
```

### Bước 4: Thêm domain vào hosts (cần quyền Administrator)

Mở **PowerShell với quyền Administrator**:
```powershell
Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value "127.0.0.1 restaurant.local"
```

### Bước 5: Khởi chạy hệ thống

```bash
docker compose up -d --build
```

Chờ ~60-90 giây để 12 container khởi động và healthy:
```bash
docker compose ps
```

### Bước 6: Truy cập

> 💡 **Cổng HTTP:** Do `http.sys` (PID 4) chiếm cổng 80 trên Windows, Nginx HTTP được map `8080:80` (redirect 301 sang HTTPS). URL chính: **`https://restaurant.local`** (cổng 443).

| Trang | URL |
|---|---|
| 🍽️ Đặt món | https://restaurant.local/ |
| 👨‍🍳 Bếp | https://restaurant.local/kitchen.html |
| 💰 Thu ngân | https://restaurant.local/cashier.html |
| 📊 Doanh thu | https://restaurant.local/revenue.html |
| 🔧 pgAdmin | https://restaurant.local/pgadmin/ |
| 📈 Grafana | http://127.0.0.1:3000 |
| 📡 Prometheus | http://127.0.0.1:9090 |

> Tài khoản Grafana & pgAdmin lấy từ `.env` (`GRAFANA_ADMIN_USER`/`GRAFANA_ADMIN_PASS` và `PGADMIN_EMAIL`/`PGADMIN_PASS`).

> ⚠️ Trình duyệt cảnh báo certificate tự ký — nhấn "Advanced" → "Proceed".

---

## 🔌 API Endpoints

| Method | Path | Mô tả |
|---|---|---|
| GET | /health | Kiểm tra sức khỏe (app + DB) |
| GET | /metrics | Prometheus metrics (bị chặn qua Nginx, chỉ scrape nội bộ) |
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

---

## 🏋️ Load Test

Sử dụng [k6](https://k6.io/) để kiểm tra tải:

```powershell
.\scripts\load-test.ps1
```

Hoặc chạy trực tiếp:
```bash
docker run --rm --network host -e BASE_URL=https://localhost \
  -v $(pwd)/scripts/load-test.js:/scripts/load-test.js \
  grafana/k6 run --insecure-skip-tls-verify /scripts/load-test.js
```

---

## 📋 Xem Log trong Grafana (Loki)

1. Mở Grafana: http://127.0.0.1:3000
2. Chọn **Explore** (biểu tượng la bàn)
3. Chọn datasource **Loki**
4. Nhập LogQL query, ví dụ:

```logql
{container="restaurant-app"} | json | level="ERROR"
```

Xem thêm: [`docs/logql-queries.md`](docs/logql-queries.md) — 7 câu LogQL mẫu với giải thích.

---

## 🛡️ Hardening

### Biện pháp áp dụng

| Biện pháp | Chi tiết |
|---|---|
| **Network isolation** | `backend-net` (internal: true) cô lập app, DB khỏi Internet |
| **read_only rootfs** | 9/12 container chạy read_only + tmpfs cho thư mục ghi tạm |
| **cap_drop: ALL** | 10/12 container bỏ toàn bộ Linux capabilities |
| **no-new-privileges** | 11/12 container không cho phép leo thang đặc quyền |
| **Resource limits** | mem_limit + pids_limit cho mọi container |
| **Rate limiting** | Nginx: API 50r/s, pgAdmin 5r/s (trả 429) |
| **TLS 1.2/1.3** | Chỉ cipher suites mạnh, HSTS |
| **Security headers** | X-Frame-Options, CSP, HSTS, X-Content-Type-Options, v.v. |
| **X-Powered-By** | Bị ẩn ở cả Express và Nginx |
| **Log rotation** | json-file driver, max 10MB × 3 file/container |
| **Non-root user** | App chạy `USER node`; Loki chạy user 10001 |

### Bảng ngoại lệ Hardening

| Service | Biện pháp nới lỏng | Lý do |
|---|---|---|
| **cadvisor** | `privileged: true`, không cap_drop | Cần đọc cgroups, /sys, /dev/kmsg để giám sát container |
| **promtail** | Chạy root, mount docker.sock | Cần đọc Docker socket để phát hiện và thu thập log container |
| **pgadmin** | Không read_only, không cap_drop | pgAdmin ghi nhiều file runtime (sessions, config cache); chỉ giữ no-new-privileges |
| **nginx** | cap_add: CHOWN, SETUID, SETGID, NET_BIND_SERVICE | Cần bind port <1024 và chuyển owner trong entrypoint |
| **postgres** | cap_add: CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID | Init entrypoint cần chuyển owner thư mục data |
| **node-exporter** | Không mount rootfs / | Docker Desktop WSL2 không hỗ trợ rslave mount; chỉ đo metrics WSL2 VM |

---

## 🔄 Quản lý

### Reset toàn bộ dữ liệu
```bash
docker compose down -v
docker compose up -d --build
```

### Xem logs (Docker CLI)
```bash
docker compose logs -f                  # Tất cả
docker compose logs -f restaurant-app   # Chỉ app
```

### Quét bảo mật
```powershell
.\scripts\security-scan.ps1    # Windows
# hoặc
bash scripts/security-scan.sh  # Linux/WSL
# Kết quả: docs/security-scan/
```

---

## ⚠️ Hạn chế và Hướng phát triển

### Hạn chế hiện tại

| Hạn chế | Ghi chú |
|---|---|
| **Chưa có đăng nhập/phân quyền** | Mọi trang đều public; MVP có chủ đích |
| **pgAdmin public qua 443** | Chỉ được bảo vệ bởi login riêng của pgAdmin, chưa có IP whitelist |
| **Certificate tự ký** | Production cần Let's Encrypt hoặc CA trust |
| **Bí mật qua env vars** | `docker inspect` có thể thấy; nên dùng Docker Secrets (`*_FILE`) |
| **Nginx status code** | stub_status không phân biệt status code; phân tích qua access log/Loki |
| **Promtail deprecated** | Grafana đã ngừng phát triển Promtail; production nên dùng **Grafana Alloy** |
| **node-exporter** | Trên Docker Desktop chỉ đo WSL2 VM, không phải Windows host |

### Hướng phát triển

- Alertmanager + alert rules cho Prometheus
- Đăng nhập JWT / session + RBAC
- WebSocket real-time cho Kitchen/Cashier
- Docker Secrets thay cho env vars
- Grafana Alloy thay thế Promtail
- CI/CD pipeline (GitHub Actions)

---

## 🐛 Troubleshooting

| Vấn đề | Giải pháp |
|---|---|
| Cổng 80 bị chiếm | `http.sys` (Windows) chiếm port 80 → dùng 8080 redirect. Tắt IIS nếu muốn dùng 80 |
| Không resolve `restaurant.local` | Kiểm tra file `hosts` (cần quyền Administrator) |
| Init SQL không chạy | Chỉ chạy khi volume `postgres_data` **trống**. Cần `docker compose down -v` |
| cAdvisor lỗi mount | Docker Desktop WSL2 có thể gặp lỗi `/dev/kmsg`; thêm `privileged: true` |
| node-exporter lỗi mount | Không mount `/` trên Docker Desktop; chỉ đo WSL2 VM |
| pgAdmin chậm load | Chờ 30-60s sau khi start; kiểm tra healthcheck |
| Container OOM killed | Tăng `mem_limit` trong docker-compose.yml và RAM Docker Desktop |
| Loki không ready | Kiểm tra volume `/loki` có quyền ghi (user 10001); xem `docker compose logs loki` |
| Grafana không hiện Loki data | Chờ Promtail phát hiện container (refresh 5s); chạy query trong Explore |
| Certificate warning | Cert tự ký → nhấn Accept/Proceed trong trình duyệt |
| CRLF errors trên Linux | Đã có `.gitattributes` ép LF; chạy `git config core.autocrlf input` |

---

## 📂 Cấu trúc thư mục

```
restaurant-order-system/
├── app/                          # Ứng dụng Node.js
│   ├── Dockerfile                # Multi-stage build, USER node
│   ├── server.js                 # Entry point Express
│   ├── src/
│   │   ├── routes/orders.js      # API routes đơn hàng
│   │   └── metrics.js            # Prometheus metrics (prom-client)
│   └── public/                   # Frontend (HTML/CSS/JS)
├── nginx/
│   ├── nginx.conf                # Reverse proxy + rate limiting + security
│   └── certs/                    # TLS certificates (gitignored)
├── postgres/
│   ├── 01-schema.sql             # Tạo bảng
│   ├── 02-seed.sql               # Dữ liệu mẫu
│   └── 03-roles.sh              # Tạo role app_user, exporter
├── monitoring/
│   ├── prometheus.yml            # Scrape config (6 jobs)
│   └── grafana/
│       ├── dashboards/
│       │   └── restaurant-overview.json  # 5 row, 20+ panel
│       └── provisioning/
│           ├── dashboards/dashboards.yml
│           └── datasources/
│               ├── prometheus.yml
│               └── loki.yml
├── logging/
│   ├── loki-config.yaml          # Loki single binary, 7d retention
│   └── promtail-config.yaml      # docker_sd_configs
├── scripts/
│   ├── gen-cert.ps1 / .sh        # Sinh TLS certificate
│   ├── load-test.js / .ps1       # k6 load test
│   └── security-scan.ps1 / .sh   # Trivy + npm audit
├── docs/
│   ├── logql-queries.md          # 7 câu LogQL mẫu
│   └── security-scan/            # Kết quả quét Trivy
├── docker-compose.yml            # 12 services, hardening
├── .env.example                  # Mẫu biến môi trường
├── .gitignore
├── .gitattributes
└── README.md
```
