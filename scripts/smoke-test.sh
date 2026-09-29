#!/bin/bash
# ============================================================
# smoke-test.sh - Kiểm thử nhanh hệ thống
# Chạy sau khi docker compose up -d --build
# ============================================================
set -e

BASE="https://restaurant.local"
CURL="curl -sk --resolve restaurant.local:443:127.0.0.1 --resolve restaurant.local:80:127.0.0.1"

echo "=== SMOKE TEST ==="

echo -n "1. Health check... "
STATUS=$($CURL -o /dev/null -w "%{http_code}" "$BASE/health")
[ "$STATUS" = "200" ] && echo "PASS ($STATUS)" || echo "FAIL ($STATUS)"

echo -n "2. HTTP → HTTPS redirect... "
STATUS=$(curl -sk --resolve restaurant.local:80:127.0.0.1 -o /dev/null -w "%{http_code}" "http://restaurant.local/")
[ "$STATUS" = "301" ] && echo "PASS ($STATUS)" || echo "FAIL ($STATUS)"

echo -n "3. Security headers... "
HEADERS=$($CURL -I "$BASE/" 2>&1)
echo "$HEADERS" | grep -qi "x-frame-options" && echo "PASS" || echo "FAIL (missing X-Frame-Options)"

echo -n "4. GET /api/tables... "
STATUS=$($CURL -o /dev/null -w "%{http_code}" "$BASE/api/tables")
[ "$STATUS" = "200" ] && echo "PASS" || echo "FAIL ($STATUS)"

echo -n "5. GET /api/menu... "
STATUS=$($CURL -o /dev/null -w "%{http_code}" "$BASE/api/menu")
[ "$STATUS" = "200" ] && echo "PASS" || echo "FAIL ($STATUS)"

echo -n "6. POST /api/orders... "
RESULT=$($CURL -X POST "$BASE/api/orders" \
  -H "Content-Type: application/json" \
  -d '{"table_id":1,"items":[{"menu_item_id":1,"quantity":2},{"menu_item_id":5,"quantity":1}]}')
echo "$RESULT" | grep -q '"id"' && echo "PASS" || echo "FAIL"

echo "=== DONE ==="
