# OpenFOAM Web UI

[![CI](https://github.com/serpis172/openfoam-webui/actions/workflows/ci.yml/badge.svg)](https://github.com/serpis172/openfoam-webui/actions/workflows/ci.yml)

*[🇬🇧 Read in English](../en/README.md)*

Interfaccia web per eseguire simulazioni CFD con
[OpenFOAM](https://www.openfoam.com/) senza usare il terminale: si crea un
caso, si carica la geometria, si configurano fisica e condizioni al
contorno da un wizard, si genera la mesh, si lancia la simulazione e si
guardano i risultati in un viewer 3D nel browser.

Il progetto è pensato per un **deploy locale o self-hosted a singolo
utente**. I limiti di questo modello sono descritti in
[Sicurezza](#sicurezza).

## Indice

1. [Funzionalità](#funzionalità)
2. [Architettura in breve](#architettura-in-breve)
3. [Requisiti](#requisiti)
4. [Installazione](#installazione)
5. [Aggiornamento](#aggiornamento)
6. [Configurazione](#configurazione)
7. [Utilizzo](#utilizzo)
8. [Guida al meshing](#guida-al-meshing)
9. [Comandi utili](#comandi-utili)
10. [Test e integrazione continua](#test-e-integrazione-continua)
11. [Sicurezza](#sicurezza)
12. [Risoluzione dei problemi](#risoluzione-dei-problemi)
13. [Struttura del progetto](#struttura-del-progetto)
14. [Documentazione](#documentazione)

## Funzionalità

- Creazione dei casi da wizard grafico; upload di geometrie STL.
- Fisica (solver, fluido, turbolenza, gravità) e condizioni al contorno
  (U, p, T, k, omega) da interfaccia grafica, con validazione sia nel
  browser sia sul server.
- Generazione automatica dei file OpenFOAM (`controlDict`, `blockMeshDict`,
  `snappyHexMeshDict`, `0/U`, `0/p`, …), in parte tramite
  [foamlib](https://github.com/gerlero/foamlib) (migrazione in corso,
  vedi `ROADMAP.md`).
- Mesh con `blockMesh` o `snappyHexMesh`, pannelli grafici di
  raffinamento, analisi di watertightness e validazione automatica della
  qualità (`checkMesh` + soglie su skewness e non-ortogonalità).
- Esecuzione seriale o parallela (`mpirun`); scambio termico con
  `buoyantSimpleFoam` / `buoyantPimpleFoam` (solo aria).
- Monitoraggio in tempo reale di stato, log e residui; annullamento dei
  job con terminazione dell'intero gruppo di processi.
- Editor dei file OpenFOAM integrato, per modifiche manuali.
- Viewer 3D interattivo (trame/PyVista lato server; three.js lato client
  per l'anteprima di geometria e mesh).
- Download dei risultati, report di simulazione, backup e pulizia dei
  casi vecchi.

## Architettura in breve

Quattro servizi Docker (`api`, `worker`, `viz`, `redis`) e un volume dati
condiviso, senza reverse proxy:

| Servizio | Ruolo | Porta |
|---|---|---|
| `api` | FastAPI; serve anche il frontend React compilato | 8000 |
| `worker` | Celery; esegue `blockMesh`, `snappyHexMesh`, solver, `foamToVTK` (OpenFOAM v2406 nell'immagine) | – |
| `viz` | trame + PyVista; viewer 3D dei risultati, in sola lettura | 8081 |
| `redis` | broker/backend Celery e flag di cancellazione dei job | – |

Diagramma, flusso passo-passo di un caso e motivazioni delle scelte:
**[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Requisiti

| Componente | Note |
|---|---|
| Docker + plugin Compose | verifica con `docker compose version` |
| Node.js LTS + npm | serve **sull'host** per compilare il frontend |
| RAM / CPU | il servizio `worker` è limitato a 16 GB e 8 CPU in `docker-compose.yml` (`mem_limit`, `cpus`): adattali alla tua macchina |
| Spazio disco | l'immagine del worker include OpenFOAM (alcuni GB) più i casi di simulazione |
| Rete | al primo build il worker scarica OpenFOAM da `dl.openfoam.com` |

**Windows:** usa WSL2 con Docker Desktop (integrazione WSL attiva) e
lavora nel filesystem Linux (`~/openfoam-webui`), non sotto `/mnt/c`:
gli accessi ai file sono molto più lenti e i permessi meno affidabili.

Python e OpenFOAM **non** vanno installati sull'host: girano nei container.

## Installazione

```bash
git clone https://github.com/serpis172/openfoam-webui.git
cd openfoam-webui

cp .env.example .env
# imposta almeno REDIS_PASSWORD (solo caratteri alfanumerici, es.
# `openssl rand -hex 16`) e, se serve, API_KEY (`openssl rand -hex 32`)
nano .env

bash scripts/setup.sh
```

`scripts/setup.sh` verifica Docker, Compose e Node, compila il frontend
(`npm install && npm run build`), costruisce le immagini e avvia i
servizi. **Il primo build è lungo** (scarica e installa OpenFOAM).

Verifica che tutto sia attivo:

```bash
docker compose ps                      # api, worker, viz, redis: "running"/"healthy"
curl http://localhost:8000/api/health  # risposta di stato dell'API
```

Poi apri **<http://localhost:8000>**. Il viewer 3D è integrato nella
pagina Risultati ed è raggiungibile anche su <http://localhost:8081>.

> Il frontend va compilato **prima** di avviare i container
> (`scripts/setup.sh` lo fa nell'ordine giusto). Se `frontend/dist` non
> esiste quando parte `docker compose up`, Docker la crea come `root` e
> `npm run build` non potrà più scriverci (vedi
> [Risoluzione dei problemi](#risoluzione-dei-problemi)).

## Aggiornamento

```bash
git pull
make frontend                 # ricompila il frontend
docker compose build          # ricostruisce le immagini modificate
docker compose up -d
```

I casi di simulazione stanno nel volume Docker `cases` e sopravvivono
all'aggiornamento.

## Configurazione

Tutte le variabili sono in `.env` (copiato da `.env.example`). In
**grassetto** quelle da cambiare quasi sempre.

| Variabile | Descrizione | Default |
|---|---|---|
| **`REDIS_PASSWORD`** | Password di Redis. Solo caratteri alfanumerici: finisce dentro un URL. In Docker `REDIS_URL` è costruita automaticamente da questa. | `cambia-questa-password` |
| `REDIS_URL` | Usata solo fuori da Docker; in Compose viene sovrascritta. | `redis://:…@localhost:6379/0` |
| `DATA_ROOT` / `CASE_ROOT` | Volume dati e cartella dei casi, dentro i container. | `/data`, `/data/cases` |
| `OPENFOAM_BASHRC` | Script d'ambiente OpenFOAM nel worker. Se il percorso non esiste, il worker cerca in `/usr/lib/openfoam` e `/opt`. | `/opt/openfoam2406/etc/bashrc` |
| `DEFAULT_PROCESSORS` | Processi MPI di default. | `4` |
| `MAX_UPLOAD_MB` | Dimensione massima di un upload. | `2048` |
| `MAX_CASES` | Numero massimo di casi conservati. | `100` |
| `JOB_TIMEOUT_SECONDS` | Timeout di un singolo passo (mesh o solver). | `86400` (24 h) |
| `ENABLE_TERMINAL` | Abilita l'endpoint di comandi rapidi in allowlist (`/api/terminal/exec`). | `false` |
| `CORS_ORIGINS` | Origini CORS ammesse. | `*` |
| `ALLOWED_GEOMETRY_EXTENSIONS` | Estensioni accettate in upload. Il meshing con `snappyHexMesh` usa solo **STL**. | `.stl,.obj,.vtk,.vtp` |
| **`API_KEY`** | Richiesta su tutti gli endpoint `/api` (header `X-API-Key`). Vuota = nessuna autenticazione, solo per sviluppo locale. | *(vuota)* |
| `VIZ_PORT` | Porta esposta dal viewer. | `8081` |

Dopo ogni modifica al `.env`: `docker compose up -d` (ricrea i container
interessati).

## Utilizzo

1. **Crea un caso** dal wizard: nome e solver (es. `simpleFoam`; per lo
   scambio termico `buoyantSimpleFoam`).
2. **Carica la geometria** (STL) e selezionala nelle impostazioni mesh.
3. **Configura fisica e condizioni al contorno.** Al salvataggio i file
   OpenFOAM vengono generati subito, e i nomi dei patch delle condizioni
   al contorno sono validati contro quelli che la mesh avrà davvero.
4. **Genera la mesh** e controlla il report di qualità
   (`postProcessing/mesh_report.json`, mostrato nell'interfaccia). Una
   mesh inutilizzabile blocca la simulazione con il motivo, invece di
   fallire ore dopo nel solver. Vedi la [guida al meshing](#guida-al-meshing).
5. **Avvia la simulazione** (seriale o parallela); segui log e residui,
   annulla se necessario.
6. **Guarda i risultati** nel viewer 3D; scarica dati e report.

## Guida al meshing

Quasi tutti gli errori di meshing nascono da input geometrici, non da
bug. Controlla nell'ordine:

**Geometria (STL)**
- Deve essere **chiusa** (watertight) con normali coerenti e verso
  l'esterno; usa il pannello di analisi di watertightness prima di
  meshare.
- Le unità sono **metri**. Un STL in millimetri viene letto 1000 volte
  più grande: scalalo prima del caricamento.
- Il nome del file (senza estensione) diventa il **nome del patch**
  generato da `snappyHexMesh`. Le condizioni al contorno per la
  geometria devono usare esattamente quel nome (`auto.stl` → patch
  `auto`).

**Dominio (`blockMesh`)**
- `domain_min`/`domain_max` devono contenere l'intera geometria con un
  margine ampio (indicativamente diverse lunghezze caratteristiche a
  monte e più ancora a valle per flussi esterni).
- `cells` = celle di sfondo per direzione; la dimensione cella è
  `(domain_max − domain_min) / cells`. Ogni livello di raffinamento di
  `snappyHexMesh` dimezza la dimensione della cella.
- Il validatore rifiuta subito: celle < 1, dominio invertito, componenti
  diverse da 3.

**`location_in_mesh` (il punto più delicato)**
- Deve essere un punto **nel fluido**: dentro il dominio, **fuori** dalla
  geometria, e non su una faccia di cella. Il default `(0, 0, 0)` cade
  dentro la geometria se questa è centrata nell'origine: risultato,
  **mesh a 0 celle**.
- Il validatore rifiuta subito un punto fuori dal dominio; non può
  sapere se cade dentro il solido (lo rileva la validazione della mesh
  dopo l'esecuzione).

**Qualità: cosa succede dopo la mesh**

| Condizione | Esito |
|---|---|
| 0 celle o 0 punti | **non valida**: la simulazione non parte |
| celle invertite (volume negativo) | **non valida** |
| skewness > 0.85 | avviso |
| skewness > 0.95 | **non valida** |
| non-ortogonalità > 65° | avviso |
| non-ortogonalità > 85° | **non valida** |

I log di ogni passo (`log.blockMesh`, `log.snappyHexMesh`,
`log.checkMesh`, `log.<solver>`) sono nella cartella del caso e nella
pagina dei job.

## Comandi utili

```bash
docker compose ps                          # stato dei servizi
docker compose logs -f worker              # log del worker (mesh, solver)
docker compose exec worker ls /data/cases  # casi nel volume
make frontend                              # ricompila solo il frontend
make backup                                # backup dei casi
bash scripts/cleanup.sh                    # rimuove i casi più vecchi di 30 giorni (con conferma)
make clean                                 # ATTENZIONE: cancella anche il volume dei casi (chiede conferma)
```

`make help` mostra l'elenco completo.

## Test e integrazione continua

Tre livelli, dal più veloce al più fedele:

```bash
# 1. Backend (nessun servizio esterno; i test di integrazione vengono saltati)
cd backend && pytest tests -v

# 2. Worker (funzioni di controllo: clean_case, pre-check, validazione mesh)
cd worker && pytest tests -v

# 3. Integrazione con OpenFOAM reale (richiede OpenFOAM installato)
cd backend && OPENFOAM_BASHRC=/percorso/etc/bashrc pytest tests/integration -v
```

La CI (`.github/workflows/ci.yml`) esegue a ogni push e pull request su
`main`: test backend, test worker, build TypeScript del frontend e il job
**`openfoam-integration`**, che installa OpenFOAM v2406 e lancia
`blockMesh`, `snappyHexMesh`, `checkMesh` e `simpleFoam` sui file generati
dal progetto. Se quel job è rosso, il messaggio contiene la coda del log
OpenFOAM del comando fallito.

## Sicurezza

- Terminale disabilitato di default (con `ENABLE_TERMINAL=true` esegue
  comandi reali, ma solo da una allowlist).
- Upload limitati per dimensione ed estensione; path traversal bloccato.
- Redis protetto da password; job con timeout, annullabili con
  terminazione dell'intero gruppo di processi.
- Nomi e tipi delle condizioni al contorno validati con whitelist prima
  di finire nei dict OpenFOAM generati (prevenzione dell'injection).
- Errori dell'API senza output sensibili.

**Limite noto:** `API_KEY` è un lucchetto per uso locale, non
autenticazione vera. Viene incorporata nel bundle del frontend
(`VITE_API_KEY`) ed è quindi leggibile da chiunque apra gli strumenti di
sviluppo del browser. Va bene su `localhost` o su una rete fidata; per
un'esposizione più ampia serve un meccanismo di sessione lato server
(`ROADMAP.md`, voce S4).

## Risoluzione dei problemi

Prima cosa da fare in ogni caso: leggere il log del passo fallito
(`docker compose logs worker` oppure `log.<passo>` nella cartella del
caso).

### Installazione e avvio

| Sintomo | Causa | Soluzione |
|---|---|---|
| `EACCES: permission denied, mkdir '…/frontend/dist/assets'` | `frontend/dist` è stata creata da `root` (un container è partito prima della build del frontend) | `sudo rm -rf frontend/dist` poi `bash scripts/setup.sh` |
| `Package 'foamlib' requires a different Python` durante il build del backend | `foamlib` ≥ 1.8.0 richiede Python ≥ 3.12 | usa `python:3.12-slim` in `backend/Dockerfile` (già così su `main`) |
| Build del worker fallisce con `OpenFOAM non utilizzabile via …` | il percorso in `OPENFOAM_BASHRC` non esiste nell'immagine, oppure il download da `dl.openfoam.com` è fallito | controlla la rete (proxy/VPN) e rilancia `docker compose build worker`; il messaggio precede l'errore con il percorso cercato |
| `docker info` non risponde / `permission denied` sul socket | daemon spento o utente non nel gruppo `docker` | avvia Docker Desktop (WSL2) o `sudo service docker start`; `sudo usermod -aG docker $USER` e riapri la shell |
| Ogni job fallisce con `Authentication required` | Redis e servizi hanno password diverse (dopo aver cambiato `REDIS_PASSWORD`) | `docker compose down && docker compose up -d`; usa una password alfanumerica |
| La pagina non si carica (`404`/vuota) | frontend non compilato | `make frontend && docker compose up -d` |

### Meshing

| Messaggio | Causa | Soluzione |
|---|---|---|
| `Mesh has zero cells — the geometry does not intersect the domain` | `location_in_mesh` dentro il solido, dominio che non contiene la geometria, oppure STL in unità sbagliate | vedi [guida al meshing](#guida-al-meshing): sposta il punto nel fluido, allarga il dominio, controlla le unità |
| `Nessun file STL selezionato` / `File STL '…' non trovato in constant/triSurface` | geometria non caricata o non selezionata | carica di nuovo l'STL e selezionalo |
| `system/blockMeshDict mancante` / `system/snappyHexMeshDict mancante` | configurazione mai salvata dopo l'ultima modifica | salva di nuovo la configurazione del caso |
| `Ambiente OpenFOAM non trovato` | `OPENFOAM_BASHRC` errato e nessuna installazione trovata nel worker | correggi `.env`, poi `docker compose build worker` |
| `Case … is locked by another process` | un altro job di mesh è in corso sullo stesso caso | attendi la fine o annullalo; il lock si libera da solo a job terminato |
| `Extreme mesh skewness` / `Extreme mesh non-orthogonality` | geometria con difetti o raffinamento inadeguato | ripara l'STL, aumenta la risoluzione di sfondo o i livelli di raffinamento |
| `Mesh non valida, simulazione non avviata: …` | la mesh non ha superato la validazione | leggi i motivi elencati (`quality_issues` nel report) |
| Errore `422` al salvataggio (`cells`, `domain_max`, `location_in_mesh`) | parametri di dominio incoerenti | il messaggio dice quale parametro e perché |

### Simulazione

| Messaggio | Causa | Soluzione |
|---|---|---|
| `Cannot find patchField entry for …` | una condizione al contorno usa un nome che non corrisponde a nessun patch della mesh | il patch della geometria si chiama come il file STL senza estensione; correggi il nome nelle condizioni al contorno |
| `cannot find file "0/U"` | i campi iniziali mancano (caso creato con una versione precedente) | salva di nuovo la configurazione per rigenerarli |
| Job "in esecuzione" dopo l'annullamento | Redis non raggiungibile dal worker | verifica `docker compose ps`; al controllo successivo il worker termina comunque l'intero gruppo di processi |
| Il viewer 3D su `:8081` mostra un caso vecchio | lo stato del viewer è condiviso (vedi [ARCHITECTURE.md](ARCHITECTURE.md), «Limiti noti») | ricarica la pagina o `docker compose restart viz` |

### Sviluppo

| Sintomo | Soluzione |
|---|---|
| `pytest` senza argomenti raccoglie test obsoleti | esegui sempre `pytest tests -v` da `backend/` (o `worker/`), come la CI |
| I test di integrazione risultano `SKIPPED` | normale senza OpenFOAM: imposta `OPENFOAM_BASHRC` per eseguirli |

## Struttura del progetto

```
backend/    API FastAPI, modelli Pydantic, generazione dei file OpenFOAM
            (templates_generator.py, foam_templates/), test (pytest)
            backend/tests/integration/  test con OpenFOAM reale
worker/     Task Celery, esecuzione di OpenFOAM, validazione mesh,
            export dell'anteprima WebGL, test
viz/        Servizio trame/PyVista per il viewer 3D
frontend/   App React/TypeScript (wizard, editor, grafici, viewer)
scripts/    setup.sh, backup.sh, cleanup.sh
docs/       Questa documentazione (it/ ed en/)
```

## Documentazione

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — architettura, flusso di un
  caso, scelte di design. Anche [in inglese](../en/ARCHITECTURE.md).
- **[`ROADMAP.md`](../../ROADMAP.md)** — registro tecnico di decisioni,
  audit di sicurezza, difetti trovati e roadmap. Solo in italiano.
- **[`MESHING_FIXES.md`](../../MESHING_FIXES.md)** — analisi dei bug di
  meshing e delle cause. Solo in inglese.

Non è ancora presente un file di licenza (`ROADMAP.md`, voce D5).
