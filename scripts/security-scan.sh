#!/bin/bash
# ============================================================
# security-scan.sh - Quét bảo mật image Docker bằng Trivy + npm audit
# Lưu kết quả vào docs/security-scan/
# ============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCAN_DIR="$SCRIPT_DIR/../docs/security-scan"
mkdir -p "$SCAN_DIR"

# Danh sách image cần quét
IMAGES=(
    "restaurant-order-system-restaurant-app"
    "nginx:1.25-alpine"
    "postgres:16-alpine"
    "grafana/grafana:10.4.2"
    "prom/prometheus:v2.53.0"
)

echo "============================================"
echo "  QUÉT BẢO MẬT TRIVY - Hệ thống Nhà hàng"
echo "============================================"

for image in "${IMAGES[@]}"; do
    safe_name=$(echo "$image" | tr '/:' '_')
    out_file="$SCAN_DIR/${safe_name}.txt"
    echo ""
    echo ">>> Quét image: $image ..."
    
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        aquasec/trivy image \
        --severity HIGH,CRITICAL \
        --scanners vuln \
        --no-progress \
        "$image" 2>&1 | tee "$out_file"
    
    echo "  -> Lưu kết quả: $out_file"
done

# npm audit cho ứng dụng Node.js
echo ""
echo ">>> Chạy npm audit cho ứng dụng..."
npm_audit_file="$SCAN_DIR/npm-audit.txt"
cd "$SCRIPT_DIR/../app"
npm audit --omit=dev 2>&1 | tee "$npm_audit_file" || true
echo "  -> Lưu kết quả: $npm_audit_file"

echo ""
echo "============================================"
echo "  QUÉT HOÀN TẤT - Kết quả trong docs/security-scan/"
echo "============================================"
