#!/usr/bin/env bash
set -euo pipefail

echo "=== Setup OpenFOAM Web UI ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "Errore: Docker non installato."
  exit 1
fi

# `command -v docker compose` controllava solo "docker": il plugin Compose
# non veniva mai verificato. `docker compose version` lo verifica davvero
# (e fallisce anche se il daemon non e' raggiungibile dal client).
if ! docker compose version >/dev/null 2>&1; then
  echo "Errore: Docker Compose plugin non installato (comando 'docker compose')."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Errore: il daemon Docker non risponde. Avvialo (su WSL2: Docker Desktop"
  echo "aperto con l'integrazione WSL attiva, oppure 'sudo service docker start')"
  echo "e verifica di essere nel gruppo 'docker' (sudo usermod -aG docker \$USER)."
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

if grep -q '^REDIS_PASSWORD=cambia-questa-password' .env; then
  echo "ATTENZIONE: REDIS_PASSWORD e' ancora il valore di esempio. Cambiala in .env"
  echo "(consigliato: openssl rand -hex 16) - solo caratteri alfanumerici."
fi

# Una cartella frontend/dist creata da root (tipicamente da un container avviato
# prima della build del frontend) impedisce a npm di scriverci: EACCES.
if [ -e frontend/dist ] && [ ! -w frontend/dist ]; then
  echo "Errore: frontend/dist non e' scrivibile dal tuo utente (probabilmente creata da root)."
  echo "Rimuovila e rilancia: sudo rm -rf frontend/dist && bash scripts/setup.sh"
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