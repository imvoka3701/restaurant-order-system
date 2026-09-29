#!/bin/bash
# ============================================================
# gen-cert.sh - Sinh certificate TLS tự ký cho restaurant.local
# Chạy trên Linux/macOS hoặc WSL (cần openssl)
# Certificate 365 ngày, có SAN cho restaurant.local + localhost
# Output: nginx/certs/server.crt, nginx/certs/server.key
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERT_DIR="$PROJECT_DIR/nginx/certs"

mkdir -p "$CERT_DIR"

echo ">>> Sinh TLS certificate tự ký cho restaurant.local..."

openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.crt" \
  -subj "/C=VN/ST=HCMC/L=HCMC/O=Restaurant/CN=restaurant.local" \
  -addext "subjectAltName=DNS:restaurant.local,DNS:localhost,IP:127.0.0.1"

echo ">>> Certificate đã tạo tại:"
echo "    - $CERT_DIR/server.crt"
echo "    - $CERT_DIR/server.key"
echo ">>> Lưu ý: File này KHÔNG được commit vào git (đã ignore)"
