# Multi-stage build for optimal image size and security
FROM node:20-alpine AS base

# Install system dependencies required for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    && ln -sf python3 /usr/bin/python

# Enable corepack for pnpm
RUN corepack enable

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod=false --ignore-scripts

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the project
RUN pnpm run build

# Production dependencies
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Final production image
FROM node:20-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    sqlite \
    dumb-init \
    && addgroup -g 1001 -S docsearch \
    && adduser -S docsearch -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=docsearch:docsearch /app/dist ./dist
COPY --from=prod-deps --chown=docsearch:docsearch /app/node_modules ./node_modules
COPY --chown=docsearch:docsearch package.json ./

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown docsearch:docsearch /app/data

# Switch to non-root user
USER docsearch

# Create volume for persistent data
VOLUME ["/app/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node dist/server/mcp.js --help || exit 1

# Expose port for MCP server (if running in server mode)
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command (can be overridden)
CMD ["node", "dist/server/mcp.js"]