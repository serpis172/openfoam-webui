.PHONY: help build up down logs frontend clean backup

help:
	@echo "Comandi disponibili:"
	@echo "  make build     - costruisce le immagini Docker"
	@echo "  make up        - avvia il sistema"
	@echo "  make down      - ferma il sistema"
	@echo "  make logs      - mostra i log"
	@echo "  make frontend  - costruisce il frontend"
	@echo "  make backup    - backup dei casi"
	@echo "  make clean     - rimuove volumi e cache"

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

frontend:
	cd frontend && npm install && npm run build

backup:
	bash scripts/backup.sh

clean:
	docker compose down -v
	rm -rf frontend/dist frontend/node_modules