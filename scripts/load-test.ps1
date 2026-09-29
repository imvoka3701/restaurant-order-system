# ============================================================
# scripts/load-test.ps1 - Script PowerShell chạy k6 qua Docker
# ============================================================
$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$JsFile = Join-Path $ScriptDir "load-test.js"

if (-not (Test-Path $JsFile)) {
    Write-Error "Không tìm thấy file k6 script: $JsFile"
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Khởi chạy k6 load test (~2 phút)..." -ForegroundColor Cyan
Write-Host "Script: $JsFile" -ForegroundColor Cyan
Write-Host "Target: https://restaurant.local" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Đọc file script và pipe qua stdin vào container k6 với host-gateway
Get-Content -Raw $JsFile | docker run --rm -i --add-host restaurant.local:host-gateway grafana/k6 run -

# Nếu k6 qua host-gateway không kết nối được (exit code khác 0), thử fallback sang frontend-net
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Kết nối qua host-gateway không thành công. Thử nghiệm kết nối qua Docker network 'frontend-net'..."
    Get-Content -Raw $JsFile | docker run --rm -i --network restaurant-order-system_frontend-net --add-host restaurant.local:nginx-proxy grafana/k6 run -
}
