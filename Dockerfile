FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production

CMD ["npm", "start"]
