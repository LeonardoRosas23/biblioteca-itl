#!/usr/bin/env bash
# Trae los últimos cambios de GitHub y reconstruye lo que cambió. Los datos se conservan.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
