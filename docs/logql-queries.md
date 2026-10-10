# LogQL Queries - Tham chiếu nhanh
# Hệ thống Quản lý Nhà hàng - Grafana Loki

> **LƯU Ý quan trọng:**
> - Tên container thực tế: `restaurant-app`, `nginx-proxy`, `postgres-db` (khác với tài liệu mẫu)
> - Cú pháp `|= "FATAL" or "panic"` trong tài liệu mẫu là **SAI** — dùng `|~ "FATAL|panic"` (regex)

---

## 1. Lỗi ứng dụng Node.js (JSON log, level ERROR)

**Mục đích:** Tìm tất cả log lỗi từ ứng dụng Express. App ghi log JSON một dòng, trường `level` chứa severity.

```logql
{container="restaurant-app"} | json | level="ERROR"
```

**Giải thích:**
- `{container="restaurant-app"}`: chọn stream log từ container app
- `| json`: parse dòng log theo JSON
- `| level="ERROR"`: lọc chỉ giữ dòng có `level` = `ERROR`

---

## 2. Đếm số đơn hàng tạo mới qua Nginx log (5 phút)

**Mục đích:** Đếm số request POST /api/orders trong 5 phút gần nhất, phản ánh tốc độ tạo đơn.

```logql
sum(count_over_time({container="nginx-proxy"} |= "POST /api/orders" [5m]))
```

**Giải thích:**
- `{container="nginx-proxy"}`: log Nginx access
- `|= "POST /api/orders"`: lọc dòng chứa đúng chuỗi POST /api/orders
- `count_over_time(...[5m])`: đếm số dòng khớp trong cửa sổ 5 phút
- `sum(...)`: tổng hợp tất cả stream

---

## 3. Log PostgreSQL nghiêm trọng (FATAL hoặc panic)

**Mục đích:** Phát hiện lỗi nghiêm trọng của PostgreSQL: kết nối bị từ chối, authentication failure, crash.

```logql
{container="postgres-db"} |~ "FATAL|panic"
```

**Giải thích:**
- `{container="postgres-db"}`: stream log từ PostgreSQL
- `|~ "FATAL|panic"`: lọc regex, khớp dòng chứa "FATAL" HOẶC "panic"
- **KHÔNG dùng** `|= "FATAL" or "panic"` — cú pháp này sai trong LogQL

---

## 4. HTTP Status Code từ Nginx Access Log (per minute)

**Mục đích:** Phân tích phân bố status code (200, 404, 429, 500...) từ access log Nginx theo thời gian.

```logql
sum by (status) (count_over_time(
  {container="nginx-proxy"} | regexp `" (?P<status>\d{3}) \d+` [1m]
))
```

**Giải thích:**
- `| regexp ...`: trích xuất trường `status` (3 chữ số) từ dòng log Nginx combined format
- Pattern: `" 200 1234` → status=200
- `count_over_time(...[1m])`: đếm theo cửa sổ 1 phút
- `sum by (status)`: nhóm theo status code

---

## 5. Số dòng log/phút theo Container

**Mục đích:** Giám sát tốc độ sinh log từ mỗi container, phát hiện container nào đang "ồn" bất thường.

```logql
sum by (container) (count_over_time({container=~".+"}[1m]))
```

**Giải thích:**
- `{container=~".+"}`: chọn tất cả container (regex match bất kỳ tên nào)
- `count_over_time(...[1m])`: đếm số dòng log trong 1 phút
- `sum by (container)`: nhóm kết quả theo tên container

---

## 6. Tìm slow requests (response time > 1s) từ app log

**Mục đích:** Phát hiện request chậm dựa trên trường `duration_ms` trong JSON log của app.

```logql
{container="restaurant-app"} | json | duration_ms > 1000
```

**Giải thích:**
- `| json`: parse JSON log
- `| duration_ms > 1000`: lọc request có thời gian xử lý > 1000ms

---

## 7. Log từ tất cả container monitoring stack

**Mục đích:** Xem tổng hợp log từ các service giám sát để debug pipeline monitoring.

```logql
{container=~"prometheus|grafana|loki|promtail|cadvisor|node-exporter"}
```

**Giải thích:**
- `container=~"..."`: regex match nhiều tên container cùng lúc
- Hữu ích khi cần debug vấn đề scraping, ingestion, hoặc dashboard
