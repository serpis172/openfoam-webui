# OpenFOAM Web UI

*[🇬🇧 Read in English](../en/README.md)*

Interfaccia web completa per usare [OpenFOAM](https://www.openfoam.com/)
(simulazioni CFD — fluidodinamica computazionale) senza scrivere comandi
da terminale: crea un caso, carica la geometria, configura fisica e
boundary condition da un wizard grafico, genera la mesh, lancia la
simulazione e guarda i risultati in un viewer 3D nel browser.

Pensata per un deploy locale/self-hosted a singolo utente (vedi
[Sicurezza](#sicurezza) più sotto per i limiti di questo modello).

## Indice

- [Funzionalità](#funzionalità)
- [Architettura in breve](#architettura-in-breve)
- [Requisiti](#requisiti)
- [Installazione](#installazione)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Comandi utili](#comandi-utili)
- [Test](#test)
- [Sicurezza](#sicurezza)
- [Risoluzione problemi](#risoluzione-problemi)
- [Struttura del progetto](#struttura-del-progetto)
- [Documentazione](#documentazione)

## Funzionalità

- Creazione casi da wizard grafico.
- Upload geometrie STL/OBJ.
- Configurazione fisica (solver, proprietà del fluido, gravità) da GUI.
- Configurazione boundary condition (U, p, T, k, omega) da GUI, con
  validazione lato client e lato server.
- Generazione automatica dei file di configurazione OpenFOAM
  (`controlDict`, `blockMeshDict`, `0/U`, `0/p`, ...), in parte tramite
  [foamlib](https://github.com/gerlero/foamlib) (migrazione in corso,
  vedi `ROADMAP.md`).
- Mesh con `blockMesh` o `snappyHexMesh`, con pannelli grafici di
  raffinamento e analisi di watertightness.
- Esecuzione seriale o parallela (`mpirun`), con supporto completo per
  il trasferimento di calore via `buoyantSimpleFoam`/`buoyantPimpleFoam`.
- Monitoraggio job in tempo reale (stato, log) via polling SSE.
- Grafici dei residui durante la simulazione.
- Validazione sintattica e di qualità della mesh.
- Editor dei file OpenFOAM integrato nel browser (per chi vuole
  modificare la configurazione generata a mano).
- Viewer 3D interattivo (trame/PyVista lato server, three.js/R3F lato
  client per l'anteprima di geometria e mesh) — vedi
  [Architettura in breve](#architettura-in-breve).
- Download dei risultati e report di simulazione.
- Backup e cleanup dei casi vecchi.
- Test automatici (backend: pytest; frontend: build TypeScript) e CI
  GitHub Actions.

## Architettura in breve

Quattro servizi Docker (`api`, `worker`, `viz`, `redis`), un solo volume
dati condiviso, nessun reverse proxy. Il backend FastAPI serve anche i
file statici del frontend React sulla porta 8000; il viewer 3D è un
servizio trame/PyVista separato sulla porta 8081; i job pesanti
(meshing, solver) girano in un worker Celery dedicato, non nel processo
API.

Per il diagramma completo, il flusso passo-passo di un caso e le scelte
architetturali, vedi **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Requisiti

- Docker
- Docker Compose plugin
- Node.js LTS (per compilare il frontend)
- npm

Non serve installare Python o OpenFOAM sulla macchina host: girano
dentro i container (`backend`, `worker`).

## Installazione

```bash
cp .env.example .env
nano .env   # imposta almeno REDIS_PASSWORD e, se serve, API_KEY

bash scripts/setup.sh
```

Lo script verifica i requisiti, copia `.env.example` in `.env` se manca,
compila il frontend (`npm install && npm run build`), costruisce le
immagini Docker e avvia i servizi.

Apri poi:

```text
http://localhost:8000
```

Il viewer 3D (`viz`) parte in automatico con `docker compose up`, non
serve nessun profilo opzionale — è raggiungibile anche direttamente su
`http://localhost:8081`, oltre che integrato nella pagina Risultati di
ogni progetto.

## Configurazione

Tutte le variabili vivono in `.env` (copiato da `.env.example`). Quelle
che quasi certamente vanno cambiate rispetto al default sono in
**grassetto**.

| Variabile | Descrizione | Default |
|---|---|---|
| **`REDIS_PASSWORD`** | Password per Redis (broker/backend Celery). | `cambia-questa-password` |
| `REDIS_URL` | URL di connessione a Redis, deve includere la stessa password. | `redis://:...@redis:6379/0` |
| `DATA_ROOT` | Root del volume dati condiviso, dentro i container. | `/data` |
| `CASE_ROOT` | Cartella dei casi, dentro i container. | `/data/cases` |
| `OPENFOAM_BASHRC` | Script d'ambiente OpenFOAM da sourciare nel worker. | `/opt/openfoam2406/etc/bashrc` |
| `DEFAULT_PROCESSORS` | Numero di processi MPI di default per l'esecuzione parallela. | `4` |
| `MAX_UPLOAD_MB` | Dimensione massima per un upload di geometria. | `2048` |
| `MAX_CASES` | Numero massimo di casi conservati. | `100` |
| `JOB_TIMEOUT_SECONDS` | Timeout per un singolo job (mesh o run). | `86400` (24h) |
| `ENABLE_TERMINAL` | Abilita l'endpoint di comandi rapidi allowlisted (`/api/terminal/exec`). | `false` |
| `CORS_ORIGINS` | Origini CORS ammesse. | `*` |
| `ALLOWED_GEOMETRY_EXTENSIONS` | Estensioni file geometria accettate in upload. | `.stl,.obj,.vtk,.vtp` |
| **`API_KEY`** | Chiave richiesta su tutti gli endpoint `/api` (header `X-API-Key`). Vuota = nessuna auth, solo per sviluppo locale. Genera con `openssl rand -hex 32`. | *(vuoto)* |
| `VIZ_PORT` | Porta esposta dal servizio `viz`. | `8081` |

## Utilizzo

Flusso tipico, dalla creazione al risultato:

1. **Crea un caso** dal wizard, scegliendo nome e solver (es.
   `simpleFoam`, o un solver buoyant per il trasferimento di calore).
2. **Carica la geometria** (STL/OBJ).
3. **Configura fisica e boundary condition** dalla GUI — i file OpenFOAM
   vengono generati automaticamente non appena salvi.
4. **Genera la mesh** (`blockMesh`/`snappyHexMesh`), controllando qualità
   e watertightness dai pannelli dedicati.
5. **Avvia la simulazione**, seriale o parallela; segui i residui e i
   log in tempo reale, annulla il job se serve.
6. **Guarda i risultati** nel viewer 3D integrato, scarica i dati o il
   report di simulazione.

Per i dettagli tecnici di ogni passaggio (endpoint, file scritti,
gestione della cancellazione) vedi
**[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Comandi utili

```bash
docker compose up -d       # avvia tutti i servizi
docker compose down        # ferma tutti i servizi
docker compose logs -f     # segue i log di tutti i servizi
make frontend               # ricompila solo il frontend
make backup                 # backup dei casi (scripts/backup.sh)
bash scripts/cleanup.sh     # rimuove i casi più vecchi di 30 giorni (con conferma)
```

Vedi `make help` per l'elenco completo.

## Test

```bash
cd backend
pytest tests -v
```

La CI (`.github/workflows/ci.yml`) esegue gli stessi test backend più la
build TypeScript del frontend a ogni push/PR su `main`.

## Sicurezza

- Terminale disabilitato di default (eseguibile davvero via worker se
  abilitato con `ENABLE_TERMINAL=true` — non è uno stub inerte, gira
  comandi reali da una allowlist).
- Upload limitati per dimensione ed estensione.
- Path traversal bloccato.
- Redis protetto da password.
- Job con timeout, annullabili con kill dell'intero process group (non
  solo del PID principale — altrimenti `mpirun` lascia processi orfani).
- Validazione dei file OpenFOAM generati.
- Errori API senza output sensibili.
- Nomi e tipi di boundary condition validati con whitelist prima di
  finire nei dict OpenFOAM generati (`0/U`, `0/p`, ...), per evitare
  injection nei file scritti su disco.

**Limite noto:** `API_KEY` è pensata come lucchetto per un deploy
locale/mono-utente, non come autenticazione vera. È iniettata a
build-time nel bundle frontend (`VITE_API_KEY`), quindi visibile a
chiunque apra i devtools del browser. Va bene per `localhost` o una rete
fidata; se il servizio viene esposto oltre quello, serve un vero
meccanismo di sessione lato server, non solo questa chiave. Vedi
`ROADMAP.md`, voce S4.

## Risoluzione problemi

**`pip install` fallisce nel container `backend` con un errore tipo
"Package 'foamlib' requires a different Python"** — `foamlib` a partire
dalla versione 1.8.0 richiede Python ≥ 3.12 (prima bastava ≥ 3.11).
`backend/Dockerfile` e la CI sono ora allineati su `python:3.12-slim`;
se stai lavorando su un fork o un branch più vecchio con ancora
`python:3.11-slim`, aggiorna la versione dell'immagine base o fissa
`foamlib` a una versione ≤ 1.7.x compatibile con 3.11 (nota: le versioni
di foamlib usate dal codice in `backend/app/foam_templates/` assumono
l'API di 1.8.x, quindi la prima opzione è quella sicura).

**`pytest` (senza argomenti) fallisce con errori su un campo `case_id`
che non esiste** — assicurati di avere l'albero aggiornato: una vecchia
cartella `backend/test/` (singolare, con test obsoleti) duplicava
`backend/tests/` ed è stata rimossa. Esegui sempre `pytest tests -v`
dalla cartella `backend/`, come fa la CI.

**Il viewer 3D su `:8081` non si aggiorna** — il servizio `viz` tiene
uno stato di sessione condiviso globalmente (vedi
[ARCHITECTURE.md](ARCHITECTURE.md), "Limiti noti"): due tab browser sullo
stesso processo vedono lo stesso stato. Ricarica la pagina o riavvia il
container `viz` se resta bloccato su un caso vecchio.

**Un job resta "in esecuzione" dopo l'annullamento** — verifica che
Redis sia raggiungibile dal worker (il flag di cancellazione passa da
lì); se il processo OpenFOAM non risponde, il worker fa comunque
`killpg` sull'intero process group al successivo controllo del job.

## Struttura del progetto

```
backend/    API FastAPI, modelli Pydantic, generazione file OpenFOAM,
            validazione mesh, test (pytest)
worker/     Task Celery, esecuzione OpenFOAM reale (immagine con
            OpenFOAM 2406), export mesh per il preview WebGL
viz/        Servizio trame/PyVista per il viewer 3D dei risultati
frontend/   App React/TypeScript (wizard, editor, grafici, viewer)
scripts/    setup.sh, backup.sh, cleanup.sh
docs/       Questa documentazione (it/ ed en/)
```

## Documentazione

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — architettura dettagliata,
  flusso di un caso, scelte di design. Disponibile anche
  [in inglese](../en/ARCHITECTURE.md).
- **[`ROADMAP.md`](../../ROADMAP.md)** — registro tecnico delle
  decisioni di design, degli audit di sicurezza e della roadmap di
  migrazione a foamlib. Solo in italiano: è un diario di lavoro interno,
  non una guida per chi usa il progetto.
- **[`MESHING_FIXES.md`](../../MESHING_FIXES.md)** — guida dettagliata
  ai bug di meshing risolti e alle relative cause. Solo in inglese (a
  differenza di `ROADMAP.md`): stesso motivo di sopra, è un diario di
  lavoro interno, non una guida per chi usa il progetto.
