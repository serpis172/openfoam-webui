# OpenFOAM Web UI

Interfaccia web completa per usare OpenFOAM senza scrivere comandi.

## Funzionalità

- Creazione casi da wizard.
- Upload geometrie STL/OBJ.
- Configurazione fisica da GUI.
- Configurazione boundary conditions da GUI.
- Generazione automatica file OpenFOAM.
- Mesh con blockMesh o snappyHexMesh.
- Esecuzione parallela con mpirun.
- Monitoraggio stato job.
- Grafici residui.
- Validazione sintattica.
- Editor file OpenFOAM nel browser.
- Visualizzazione 3D con trame/PyVista.
- Download risultati.
- Report simulazione.
- Backup e cleanup.
- Test automatici.
- CI GitHub Actions.

## Requisiti

- Docker
- Docker Compose plugin
- Node.js LTS
- npm

## Installazione

```bash
cp .env.example .env
nano .env

bash scripts/setup.sh
```

Apri:

```text
http://localhost:8000
```

## Viewer 3D

Il servizio `viz` parte in automatico con `docker compose up`, non serve
nessun profilo opzionale. Il viewer è integrato nella pagina Risultati
di ogni progetto, e raggiungibile anche direttamente su
`http://localhost:8081`.

## Comandi utili

```bash
docker compose up -d
docker compose down
docker compose logs -f
make frontend
make backup
bash scripts/cleanup.sh
```

## Test

```bash
cd backend
pytest tests -v
```

## Sicurezza

- Terminale disabilitato di default.
- Upload limitati.
- Path traversal bloccato.
- Redis con password.
- Job con timeout.
- Annullamento job con kill del process group.
- Validazione file OpenFOAM.
- Errori API senza output sensibili.

## Note

Questo progetto non usa reverse proxy.

- Frontend e API sono serviti da FastAPI sulla porta 8000.
- Il viewer 3D gira sulla porta 8081.