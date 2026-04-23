FROM node:20-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production

CMD ["npm", "start"]
