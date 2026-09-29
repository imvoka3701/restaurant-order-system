# ============================================================
# gen-cert.ps1 - Sinh certificate TLS tự ký cho restaurant.local
# Chạy trên Windows (dùng Docker container alpine/openssl)
# Không cần cài openssl trên máy host
# Output: nginx/certs/server.crt, nginx/certs/server.key
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$CertDir = Join-Path $ProjectDir "nginx\certs"

# Tạo thư mục nếu chưa có
if (-not (Test-Path $CertDir)) {
    New-Item -ItemType Directory -Path $CertDir -Force | Out-Null
}

Write-Host ">>> Sinh TLS certificate tu ky cho restaurant.local..." -ForegroundColor Green

# Chuyển path Windows sang dạng Docker mount được
$CertDirUnix = $CertDir -replace '\\', '/'

docker run --rm `
    -v "${CertDirUnix}:/certs" `
    alpine/openssl req -x509 -nodes -days 365 `
    -newkey rsa:2048 `
    -keyout /certs/server.key `
    -out /certs/server.crt `
    -subj "/C=VN/ST=HCMC/L=HCMC/O=Restaurant/CN=restaurant.local" `
    -addext "subjectAltName=DNS:restaurant.local,DNS:localhost,IP:127.0.0.1"

Write-Host ">>> Certificate da tao tai:" -ForegroundColor Green
Write-Host "    - $CertDir\server.crt"
Write-Host "    - $CertDir\server.key"
Write-Host ">>> Luu y: File nay KHONG duoc commit vao git (da ignore)" -ForegroundColor Yellow
