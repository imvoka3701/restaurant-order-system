#!/usr/bin/env pwsh
# ============================================================
# security-scan.ps1 - Quét bảo mật image Docker bằng Trivy + npm audit
# Lưu kết quả vào docs/security-scan/
# ============================================================

$ErrorActionPreference = "Continue"
$scanDir = Join-Path $PSScriptRoot ".." "docs" "security-scan"
New-Item -ItemType Directory -Path $scanDir -Force | Out-Null

# Danh sách image cần quét
$images = @(
    "restaurant-order-system-restaurant-app",
    "nginx:1.25-alpine",
    "postgres:16-alpine",
    "grafana/grafana:10.4.2",
    "prom/prometheus:v2.53.0"
)

Write-Host "============================================"
Write-Host "  QUÉT BẢO MẬT TRIVY - Hệ thống Nhà hàng"
Write-Host "============================================"

foreach ($image in $images) {
    $safeName = $image -replace "[:/]", "_"
    $outFile = Join-Path $scanDir "$safeName.txt"
    Write-Host "`n>>> Quét image: $image ..."
    
    docker run --rm `
        -v /var/run/docker.sock:/var/run/docker.sock `
        aquasec/trivy image `
        --severity HIGH,CRITICAL `
        --scanners vuln `
        --no-progress `
        $image 2>&1 | Tee-Object -FilePath $outFile
    
    Write-Host "  -> Lưu kết quả: $outFile"
}

# npm audit cho ứng dụng Node.js
Write-Host "`n>>> Chạy npm audit cho ứng dụng..."
$npmAuditFile = Join-Path $scanDir "npm-audit.txt"
Push-Location (Join-Path $PSScriptRoot ".." "app")
npm audit --omit=dev 2>&1 | Tee-Object -FilePath $npmAuditFile
Pop-Location
Write-Host "  -> Lưu kết quả: $npmAuditFile"

Write-Host "`n============================================"
Write-Host "  QUÉT HOÀN TẤT - Kết quả trong docs/security-scan/"
Write-Host "============================================"
