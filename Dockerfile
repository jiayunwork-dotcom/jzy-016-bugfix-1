# ---- 构建阶段 ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
# 有锁文件走 npm ci，否则回退 npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# 裁剪为生产依赖
RUN npm prune --omit=dev || true

# ---- 运行阶段 ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# 非 root 用户运行
RUN groupadd -r appuser && useradd -r -g appuser appuser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

USER appuser
EXPOSE 3000

# 基础存活探针（wget 自带于 slim 镜像）
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "dist/main.js"]
