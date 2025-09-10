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
FROM node:24-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    sqlite \
    dumb-init

# Set working directory
WORKDIR /app

# Copy built application with root ownership initially
COPY --from=builder /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./

# Create data directory that can be accessed by any user
RUN mkdir -p /app/data && chmod 777 /app/data

# Create an entrypoint script to handle user permissions dynamically
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo '# If running as root, create a user matching the mounted volume permissions' >> /docker-entrypoint.sh && \
    echo 'if [ "$(id -u)" = "0" ]; then' >> /docker-entrypoint.sh && \
    echo '    # Find the owner of /app/data to determine what user we should run as' >> /docker-entrypoint.sh && \
    echo '    if [ -d /app/data ]; then' >> /docker-entrypoint.sh && \
    echo '        DATA_UID=$(stat -c %u /app/data 2>/dev/null || echo 1001)' >> /docker-entrypoint.sh && \
    echo '        DATA_GID=$(stat -c %g /app/data 2>/dev/null || echo 1001)' >> /docker-entrypoint.sh && \
    echo '    else' >> /docker-entrypoint.sh && \
    echo '        DATA_UID=1001' >> /docker-entrypoint.sh && \
    echo '        DATA_GID=1001' >> /docker-entrypoint.sh && \
    echo '    fi' >> /docker-entrypoint.sh && \
    echo '    ' >> /docker-entrypoint.sh && \
    echo '    # Create group and user if they do not exist' >> /docker-entrypoint.sh && \
    echo '    if ! getent group "$DATA_GID" >/dev/null 2>&1; then' >> /docker-entrypoint.sh && \
    echo '        addgroup -g "$DATA_GID" -S docsearch' >> /docker-entrypoint.sh && \
    echo '    fi' >> /docker-entrypoint.sh && \
    echo '    if ! getent passwd "$DATA_UID" >/dev/null 2>&1; then' >> /docker-entrypoint.sh && \
    echo '        adduser -S -u "$DATA_UID" -G "$(getent group "$DATA_GID" | cut -d: -f1)" docsearch' >> /docker-entrypoint.sh && \
    echo '    fi' >> /docker-entrypoint.sh && \
    echo '    ' >> /docker-entrypoint.sh && \
    echo '    # Change ownership of app files to match the data directory' >> /docker-entrypoint.sh && \
    echo '    chown -R "$DATA_UID:$DATA_GID" /app' >> /docker-entrypoint.sh && \
    echo '    ' >> /docker-entrypoint.sh && \
    echo '    # Re-execute this script as the correct user' >> /docker-entrypoint.sh && \
    echo '    exec su-exec "$DATA_UID:$DATA_GID" "$0" "$@"' >> /docker-entrypoint.sh && \
    echo 'fi' >> /docker-entrypoint.sh && \
    echo '' >> /docker-entrypoint.sh && \
    echo '# Execute the original command with dumb-init' >> /docker-entrypoint.sh && \
    echo 'exec dumb-init -- "$@"' >> /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

# Install su-exec for user switching
RUN apk add --no-cache su-exec

# Create volume for persistent data
VOLUME ["/app/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node dist/server/mcp.js --help || exit 1

# Expose port for MCP server (if running in server mode)
EXPOSE 3000

# Use our custom entrypoint script
ENTRYPOINT ["/docker-entrypoint.sh"]

# Default command (can be overridden)
CMD ["node", "dist/server/mcp.js"]