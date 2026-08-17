#!/usr/bin/env bash
set -euo pipefail

echo "Pulizia casi vecchi di oltre 30 giorni..."

docker compose exec api find /data/cases -mindepth 1 -maxdepth 1 -type d -mtime +30 -print

read -p "Vuoi eliminare davvero questi casi? [y/N] " answer

if [[ "$answer" == "y" ]]; then
  docker compose exec api find /data/cases -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
  echo "Pulizia completata."
else
  echo "Annullato."
fi