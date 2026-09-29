# ============================================================
# Dockerfile - Multi-stage build cho ứng dụng Nhà hàng
# Stage 1: Cài dependencies (builder)
# Stage 2: Runtime gọn nhẹ (alpine)
# ============================================================

# --- Stage 1: Builder ---
FROM node:20-alpine AS builder
WORKDIR /app

# Sao chép package files trước (tận dụng Docker cache)
COPY package.json package-lock.json ./

# Cài dependencies production only
RUN npm ci --omit=dev

# --- Stage 2: Runtime ---
FROM node:20-alpine AS runtime

# Biến môi trường production
ENV NODE_ENV=production

WORKDIR /app

# Sao chép dependencies từ builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Sao chép mã nguồn ứng dụng
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/

# Chạy bằng user non-root (bảo mật)
USER node

# Expose port (tài liệu hóa, không tự publish)
EXPOSE 3000

# Health check: kiểm tra endpoint /health mỗi 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Khởi chạy ứng dụng
CMD ["node", "server.js"]
