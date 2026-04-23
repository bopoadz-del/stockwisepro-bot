#!/bin/bash
set -e

# StockWiseBot VPS Deploy Script
# Run as root on Ubuntu/Debian

APP_DIR="/opt/stockwisepro-bot"
USER="botuser"

# Install Node.js 20 if missing
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "20" ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install build tools for native modules
apt-get install -y python3 make g++ git

# Create user
id -u $USER &>/dev/null || useradd -m -s /bin/bash $USER

# Clone or pull latest
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git pull origin main
else
  git clone https://github.com/bopoadz-del/stockwisepro-bot.git "$APP_DIR"
  cd "$APP_DIR"
fi

# Install & build
npm install
npm run build

# Set permissions
chown -R $USER:$USER "$APP_DIR"
chmod 600 "$APP_DIR/.env" 2>/dev/null || true

# Install systemd service
cp deploy/stockwisepro-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable stockwisepro-bot
systemctl restart stockwisepro-bot

echo "✅ Bot deployed. Check status with: systemctl status stockwisepro-bot"
echo "📋 View logs with: journalctl -u stockwisepro-bot -f"
