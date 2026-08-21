#!/usr/bin/env bash
set -euo pipefail

echo "=== Setup OpenFOAM Web UI ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "Errore: Docker non installato."
  exit 1
fi

if ! command -v docker compose >/dev/null 2>&1; then
  echo "Errore: Docker Compose plugin non installato."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Creato .env da .env.example"
  echo "IMPORTANTE: modifica REDIS_PASSWORD in .env"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Errore: Node.js non installato. Installa Node.js LTS."
  exit 1
fi

echo "Installazione dipendenze frontend..."
cd frontend
npm install
npm run build
cd ..

echo "Build immagini Docker..."
docker compose build

echo "Avvio servizi..."
docker compose up -d

echo ""
echo "Fatto!"
echo "Apri: http://localhost:8000"
echo "Viewer 3D opzionale: docker compose --profile viz up -d viz"