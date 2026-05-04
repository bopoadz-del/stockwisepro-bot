# Build stage
FROM node:22-slim AS builder

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm_config_build_from_source=true npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

# Copy compiled output and pre-built node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Copy seed data to a read-only location (persistent disk mounts over /app/data)
COPY --from=builder /app/data ./data-seed

# Copy entrypoint that seeds missing JSON files before startup
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create data directory for SQLite and JSON files
# Render mounts a persistent disk here; make it writable for any user
RUN mkdir -p /app/data && chmod 777 /app/data

# Create botuser for privilege dropping in entrypoint
RUN groupadd -r botuser && useradd -r -g botuser botuser

ENV NODE_ENV=production

CMD ["/app/entrypoint.sh"]
