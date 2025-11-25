# BunBun - Unified API Gateway for OgelBase
# Lightweight Bun-based container

FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --production

# Copy source code
COPY src/ ./src/
COPY packages/ ./packages/

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run the server
CMD ["bun", "run", "src/api/server.ts"]
