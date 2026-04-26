# Build stage
FROM node:20-slim AS builder

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy compiled output and pre-built node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Run as non-root user
RUN groupadd -r botuser && useradd -r -g botuser botuser \
    && chown -R botuser:botuser /app/data
USER botuser

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
