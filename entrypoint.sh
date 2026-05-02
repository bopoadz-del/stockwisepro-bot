#!/bin/bash
set -e

# Fix permissions on the persistent disk mount (Render may mount as root)
if [ -d /app/data ] && [ "$(id -u)" = "0" ]; then
    chown -R botuser:botuser /app/data
fi

# Seed JSON data files on first boot (Render disk starts empty)
for f in /app/data-seed/*.json; do
  [ -e "$f" ] || continue
  target="/app/data/$(basename "$f")"
  if [ ! -f "$target" ]; then
    cp "$f" "$target"
  fi
done

# Drop to botuser if running as root, otherwise run as current user
if [ "$(id -u)" = "0" ]; then
    exec su -s /bin/sh botuser -c 'exec node dist/index.js'
else
    exec node dist/index.js
fi
