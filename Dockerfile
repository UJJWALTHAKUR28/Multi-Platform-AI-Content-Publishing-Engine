# ── Stage 1: Build ─────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
# Install dependencies first (cacheable layer)
COPY package.json package-lock.json ./
RUN npm ci
# Copy source and build
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# Generate Prisma client + compile TypeScript
RUN npm run build

# ── Stage 2: Dependencies only ─────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm prune --production && npm cache clean --force

# ── Stage 3: Production ───────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init wget
WORKDIR /app
ENV NODE_ENV=production
# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
# Copy only production node_modules (no build artifacts)
COPY --from=deps /app/node_modules ./node_modules
# Copy generated Prisma Client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Copy Prisma schema + generated client from builder
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma.config.ts ./
COPY package.json ./
# Switch to non-root user
USER nodejs
# Expose the port the app listens on
EXPOSE 3000
# Health check — prevents deploying a broken container
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
# Run migrations then start the server
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]