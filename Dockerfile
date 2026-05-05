# ─── Stage 1: Build web frontend ───
FROM node:22-slim AS web-builder

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ─── Stage 2: Build bot ───
FROM node:22-slim AS bot-builder

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm_config_build_from_source=true npm ci
COPY . .
RUN npm run build

# ─── Stage 3: Production ───
FROM node:22-slim

WORKDIR /app

# Copy compiled bot output and pre-built node_modules from builder
COPY --from=bot-builder /app/node_modules ./node_modules
COPY --from=bot-builder /app/dist ./dist
COPY --from=bot-builder /app/package*.json ./

# Copy built web frontend
COPY --from=web-builder /app/web/dist ./web-dist

# Copy seed data to a read-only location (persistent disk mounts over /app/data)
COPY --from=bot-builder /app/data ./data-seed

# Copy entrypoint that seeds missing JSON files before startup
COPY --from=bot-builder /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create data directory for SQLite and JSON files
# Render mounts a persistent disk here; make it writable for any user
RUN mkdir -p /app/data && chmod 777 /app/data

# Create botuser for privilege dropping in entrypoint
RUN groupadd -r botuser && useradd -r -g botuser botuser

ENV NODE_ENV=production

CMD ["/app/entrypoint.sh"]
