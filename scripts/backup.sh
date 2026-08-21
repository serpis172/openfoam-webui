#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="./backups"
DATE="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

docker compose exec api tar -czf "/tmp/openfoam-backup-$DATE.tar.gz" -C /data cases

docker compose cp "api:/tmp/openfoam-backup-$DATE.tar.gz" "$BACKUP_DIR/"

echo "Backup creato: $BACKUP_DIR/openfoam-backup-$DATE.tar.gz"