# Roadmap — openfoam-webui

> 🇮🇹 Diario tecnico interno, solo in italiano. Per la documentazione
> utente (setup, uso, configurazione) vedi **[docs/it/README.md](docs/it/README.md)**.
>
> 🇬🇧 Internal engineering log, Italian only. For user-facing
> documentation (setup, usage, configuration) see
> **[docs/en/README.md](docs/en/README.md)**.

Audit tecnico, piano di lavoro a fasi e checklist di verifica per la repository
`openfoam-webui`. Prodotto analizzando l'intero codice sorgente (non solo i
nomi dei file) e confrontandolo con quattro progetti di riferimento nello
stesso spazio (OpenFOAM + automazione/GUI).

**Come leggere questo file:** la Sezione 5 elenca i fix già applicati e
verificati in questa sessione (codice modificato, test aggiunti, build e
suite di test eseguiti con successo). Tutto il resto è pianificazione —
problemi reali, con priorità e stima, non ancora implementati. Non ho
inventato problemi per riempire una tabella: ogni voce è ancorata a un file e
una riga di codice specifici.

---

## Indice

1. [Stato attuale — cosa funziona già bene](#1-stato-attuale--cosa-funziona-già-bene)
2. [Decisione architetturale: evolvere o riscrivere](#2-decisione-architetturale-evolvere-o-riscrivere)
3. [Metodologia](#3-metodologia)
4. [Audit tecnico prioritizzato](#4-audit-tecnico-prioritizzato)
5. [Fix già applicati in questa sessione](#5-fix-già-applicati-in-questa-sessione)
6. [Repository di riferimento — cosa prendere da ciascuna](#6-repository-di-riferimento--cosa-prendere-da-ciascuna)
7. [Roadmap a fasi](#7-roadmap-a-fasi)
8. [Checklist di verifica finale](#8-checklist-di-verifica-finale)
9. [Prossimi passi immediati](#9-prossimi-passi-immediati)

---

## 1. Stato attuale — cosa funziona già bene

Prima delle criticità, un punto di onestà: questa non è una codebase
trascurata. Ci sono tracce chiare (commenti `ponytail:`) di più sessioni di
hardening reale — bug corretti dopo aver capito la causa, non solo patch
superficiali:

- path traversal bloccato con `is_relative_to` sia in `main.py` (static
  files) sia in `security.py` (file di caso);
- CORS con `allow_credentials` legato esplicitamente a origini non-wildcard;
- API key confrontata con `hmac.compare_digest` (timing-safe);
- whitelist chiusa su solver e modelli di turbolenza, **controllata due
  volte** (Pydantic in `models.py` e di nuovo nel worker) proprio perché
  l'editor di testo integrato permette di bypassare la validazione Pydantic
  scrivendo `config.json` a mano — un vettore RCE reale, chiuso in modo
  corretto;
- cancellazione job con `killpg` sul process group, non solo sul PID
  principale (altrimenti `mpirun` e i processi figli restano orfani);
- gestione robusta di `checkMesh`/residui via regex, con fallback che non
  fanno fallire l'intero job se il parsing del preview WebGL incontra una
  mesh degenere.

Il resto di questo documento si concentra sui problemi perché è quello che
serve per pianificare il lavoro — ma il punto di partenza è solido, non
va buttato.

Detto questo, un controesempio onesto: la voce **B0** (Sezione 4.2) è
mancare del tutto il blocco `FoamFile` obbligatorio in ogni dict generato
— un problema che, se confermato da un run reale, avrebbe impedito a
qualunque caso di essere letto da OpenFOAM fin dall'inizio. L'hardening
sopra è vero, ma copre gli errori *dopo* che OpenFOAM ha accettato di
leggere i file; questo era *prima*. Vale la pena tenerlo a mente quando si
valuta quanto ci si può fidare del codice non ancora verificato contro un
run reale.

---

## 2. Decisione architetturale: evolvere o riscrivere

Nella richiesta originale c'era margine per cambiare completamente stack e
linguaggio se necessario. Dopo aver letto tutto il codice, la mia
raccomandazione è **non riscrivere**, per motivi concreti:

- lo stack (FastAPI + Celery/Redis + React/TypeScript + trame/PyVista) è
  quello che usano anche i progetti di riferimento più moderni nello stesso
  spazio (vedi Sezione 6 — FoamPilot usa la stessa combinazione FastAPI +
  React/TS + Docker);
- la separazione dei servizi (api / worker / viz / redis) è già corretta:
  il worker CPU-bound è isolato dall'API, il viewer 3D è un servizio a
  parte. Un riscritto non cambierebbe questa struttura, la riproporrebbe;
- i problemi trovati (Sezione 4) sono quasi tutti **locali** — un file, una
  funzione, una validazione mancante — non sintomi di un'architettura
  sbagliata. Il monolite `templates_generator.py` da 875 righe è l'unica
  vera eccezione strutturale, e si risolve con un refactor mirato (Fase 2),
  non con un riscritto totale;
- un riscritto completo butterebbe via mesi di hardening reale già fatto
  (Sezione 1) per rifare probabilmente le stesse scelte.

Quello che invece vale la pena cambiare **in modo mirato**:

- **adottare `foamlib`** al posto della generazione di dict OpenFOAM a colpi
  di f-string (Fase 2) — è il cambiamento con il rapporto beneficio/rischio
  migliore di tutta questa roadmap;
- **spezzare `templates_generator.py`** in un package (un modulo per
  categoria di file: mesh, fisica, boundary, controllo);
- valutare **WebSocket** al posto del polling SSE per i log in tempo reale,
  se la latenza a 2s diventa un problema percepito (oggi non lo è per un
  singolo utente).

Se in futuro emergesse un requisito reale di multi-tenancy pesante (molti
utenti concorrenti, isolamento forte tra casi), a quel punto sì, vale la
pena riconsiderare l'architettura — ma non è il problema di oggi, e
inseguirlo ora sarebbe over-engineering.

---

## 3. Metodologia

- Clonata la repository (`git clone`, ultimo commit `87f74a1`) e letto ogni
  file backend/worker/viz riga per riga; per il frontend, letti
  `package.json`, `App.tsx`, il client API e verificato con `grep` quali
  librerie dichiarate sono realmente importate.
- Ogni bug è stato **verificato leggendo il flusso reale**, non dedotto dal
  nome della funzione (es. il bug di ordinamento in `list_cases` è stato
  confermato controllando che `case_id` sia un UUID esadecimale, quindi
  l'ordinamento per nome cartella non ha alcuna relazione con la data).
- Le vulnerabilità npm sono da `npm audit` reale sull'albero delle
  dipendenze dopo la pulizia, non da una checklist generica.
- I test aggiunti in Sezione 5 sono stati eseguiti (`pytest`, 6/6 pass) e la
  build frontend (`tsc && vite build`) è stata eseguita con successo dopo
  ogni modifica a `package.json`.
- Per i repository esterni (Sezione 6) ho verificato licenza, stato di
  manutenzione e compatibilità di versione prima di consigliarli — non solo
  la descrizione del README.

---

## 4. Audit tecnico prioritizzato

Punteggio secondo `Priorità = (Impatto + Rischio) × (6 − Sforzo)`, scale
1–5. Punteggio più alto = da fare prima. Le voci marcate **[FATTO]** sono
già risolte in questa sessione (dettagli in Sezione 5); restano qui per
tracciabilità dell'audit completo.

### 4.1 Sicurezza

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| S1 | **[FATTO]** `BoundaryCondition.name` finisce crudo in 5 punti di `templates_generator.py` (`f"{bc.name}\n{{\n"`) senza whitelist — un nome tipo `inlet\n}\n#codeStream\n{...}` inietta una direttiva OpenFOAM arbitraria nel dict scritto su disco, potenzialmente RCE al primo run del solver. `RefinementBox.name` aveva già il pattern corretto, qui mancava. | `backend/app/models.py` | 5 | 5 | 1 | 50 |
| S2 | **[FATTO]** `patch_type` non validato, stesso rischio di S1 su scala minore (usato in `boundary_field_scalar` per decidere il ramo wall/non-wall). | `backend/app/models.py` | 3 | 4 | 1 | 35 |
| S3 | **[FATTO — vedi nota]** Upload file: `async def upload_file` scrive su disco in modo sincrono (`target.open("wb")` + `out.write(chunk)`) dentro una funzione `async` — blocca l'intero event loop di uvicorn per la durata dello scrivere fino a 2 GB. Con un solo worker uvicorn (nessun `--workers N` in `Dockerfile`/`docker-compose.yml`), un upload grande blocca *tutte* le altre richieste API, inclusi i poll di stato job. | `backend/app/routers/files.py` | 4 | 3 | 2 | 28 |
| S3b | **[FATTO]** Il fix di S3 applicato via PR `phase-1-security-s3-async-upload` (merged su GitHub prima che rivedessi il codice) introduceva una regressione: `except Exception as e: raise HTTPException(500, detail=f"...{str(e)}")` rimandava il messaggio dell'eccezione originale (path su disco, dettagli filesystem) diretto al client, bypassando il `global_exception_handler` già presente in `main.py` che esiste apposta per evitarlo ("Errori API senza output sensibili", principio già nel README). Stessa PR apriva/chiudeva il file una volta per ogni chunk da 1MB in append mode invece di tenerlo aperto — corretto ma inutilmente costoso su file grandi (~2000 open/close per un upload da 2GB). | `backend/app/routers/files.py` | 3 | 3 | 1 | 18 |
| S4 | La API key è iniettata a **build-time** nel bundle frontend (`VITE_API_KEY`), quindi visibile in chiaro a chiunque apra la pagina con devtools. Documentato correttamente come "lucchetto sulla porta" per deploy locale — ma se il servizio viene esposto oltre `localhost` (il README parla esplicitamente di "prima di esporre il servizio"), questa chiave non protegge da nessuno che sappia guardare il bundle JS. | `frontend/src/api/client.ts`, `backend/app/security.py` | 4 | 3 | 4 | 7 |
| S5 | **[FATTO]** `terminal.py`: l'endpoint era uno stub che non eseguiva nulla (`"Esecuzione ... disponibile solo con integrazione worker"`), ma restava comunque montato ed era menzionato nel README come feature di sicurezza ("Terminale disabilitato di default"). Un endpoint che promette una funzione di sicurezza ma non fa nulla è più confusione che rischio, ma andava chiarito. | `backend/app/routers/terminal.py` | 2 | 1 | 2 | 4.5 |
| S6 | **[FATTO]** Stessa classe di S1: `k_type`/`omega_type` finivano crudi nel dict per i patch non-wall (`boundary_field_scalar`: `f"type {bc.k_type};"`) — a differenza di `U_type`/`p_type`/`T_type` (sempre confrontati con un `elif` esplicito, il valore non finisce mai nel file), questi due erano interpolati direttamente. Trovata convertendo il campo a foamlib per la Fase 2, non nell'audit iniziale — un promemoria che questo tipo di bug si trova leggendo il codice riga per riga, non con un pattern di ricerca generico. | `backend/app/models.py` | 5 | 5 | 1 | 50 |

### 4.2 Bug funzionali

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| B0 | **[FATTO — trovato e corretto in questa sessione, non nell'audit iniziale]** Nessuna delle ~20 funzioni `generate_*` scriveva il blocco `FoamFile {...}` in testa ai dict generati (`controlDict`, `blockMeshDict`, `0/U`, `0/p`, ...). Non è un dettaglio cosmetico: la guida ufficiale OpenFOAM ("Basic input/output file format") lo elenca come obbligatorio per ogni file letto o scritto da OpenFOAM, e `IOobject::readHeader` nel codice sorgente lo pretende come primo token del file — senza, `blockMesh`/`checkMesh`/il solver rifiutano il file con un `FatalIOError`. Verificato con `grep -in "foamfile"` su tutto `templates_generator.py`: zero occorrenze, nessun meccanismo alternativo che lo aggiunga altrove (nessun template Jinja nonostante `jinja2` sia una dipendenza dichiarata - anch'essa mai importata, dipendenza morta). **Non ho potuto testare contro un OpenFOAM reale in questo ambiente** (nessun binario disponibile, rete sandboxata) — la correzione è basata sulla documentazione ufficiale, non su un run verificato. Verificala con un `docker compose up` reale prima di fidartene ciecamente, ma la evidenza è solida. | `backend/app/templates_generator.py` | 5 | 5 | 2 | 40 |
| B1 | **[FATTO]** `list_cases` ordinava con `sorted(cases_root.iterdir(), reverse=True)` — cioè per nome cartella (UUID esadecimale casuale), non per data di creazione. La Dashboard mostrava i casi in un ordine sostanzialmente casuale nonostante l'intento fosse "più recenti prima". | `backend/app/routers/cases.py` | 4 | 2 | 1 | 24 |
| B2 | TOCTOU su `create_case`: `count_cases()` e la creazione della cartella non sono atomiche. Due richieste concorrenti quando si è a un caso dal limite possono superare `max_cases`. Impatto basso per un'app mono-utente, ma è un bug reale. | `backend/app/routers/cases.py` | 1 | 1 | 3 | 0.7 |
| M3 | **[FATTO]** Nessuna validazione che i nomi delle boundary condition corrispondano a patch mesh realmente esistenti (Bug #3 di `MESHING_FIXES.md`, collegato all'issue GitHub #2 "meshing fail"). Un utente poteva definire una BC su un patch inesistente, la config veniva accettata, il meshing "completava con successo", e il solver falliva molto più tardi con un errore criptico ("cannot find patch..."). Un modulo di test (`test_boundary_validation.py`) esisteva già e **falliva** perché il validatore non era mai stato scritto in `models.py`. | `backend/app/models.py` | 4 | 2 | 2 | 12 |
| M2 | **[FATTO]** `checkMesh` può completare con exit 0 su una mesh comunque inutilizzabile (0 celle perché la geometria non interseca il dominio, celle invertite, skewness estrema) — Bug #2 di `MESHING_FIXES.md`. Un modulo (`mesh_validation.py`) con test propri esisteva già ma non era collegato a nessun punto della pipeline: dead code funzionalmente identico al pattern D4 (`ProjectWorkspace` orfano). | `worker/mesh_validation.py`, `worker/tasks.py` | 3 | 2 | 2 | 10 |
| M7 | **[FATTO]** Race condition in `_generate_mesh`: due job di mesh concorrenti sullo stesso caso potevano correre insieme, uno cancella `case_dir/0/*` mentre l'altro ci scrive ancora — Bug #7 di `MESHING_FIXES.md`. Un modulo di locking (`file_locking.py`) esisteva già, testato, ma mai collegato. | `worker/tasks.py` | 2 | 2 | 1 | 8 |
| B3 | Il viewer 3D (`viz/trame_app.py`) tiene `plotter`, `_mesh`, `state` come variabili **globali di modulo** — un solo processo trame serve un solo "viewer" condiviso. Due tab browser aperte sullo stesso viewer condividono `case_id`/`time_index`: cambiare caso in una tab lo cambia anche nell'altra. Comportamento a singolo utente per design, ma non documentato come limite noto. | `viz/trame_app.py` | 2 | 1 | 3 | 3 |


### 4.3 Dead code / duplicazioni

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| D1 | **[FATTO — ripetuto]** `backend/test/` era una copia stantia di `backend/tests/` (assertava ancora la vecchia chiave `case_id` invece di `id` — il bug che il commit successivo aveva corretto). La CI esegue solo `pytest tests`, quindi questa cartella era invisibile ma fuorviante per chiunque la trovasse. **Nota:** era ricomparsa su GitHub dopo il primo giro di fix — probabile copia manuale dei singoli file cambiati invece di una sincronizzazione completa della cartella, che non porta con sé le cancellazioni. Ricontrollare dopo ogni applicazione manuale di una patch da questo audit. | `backend/test/` | 3 | 1 | 1 | 8 |
| D2 | **[FATTO — ripetuto]** `.github/workflow/ci.yml` (singolare) — GitHub Actions legge solo `.github/workflows/` (plurale), quindi questo file non veniva mai eseguito. Contenuto identico al workflow reale: copia morta, stesso pattern di D1, stessa ricomparsa e stesso motivo. | `.github/workflow/` | 2 | 1 | 1 | 6 |
| D3 | **[FATTO]** `update_last_job()` definita in `jobs.py`, mai chiamata da nessuna parte — `record_run()` fa già lo stesso aggiornamento. | `backend/app/routers/jobs.py` | 1 | 1 | 1 | 4 |
| D4 | `ProjectWorkspace.tsx` + `Viewport3D.tsx` esistono nel codebase ma non sono raggiungibili da nessuna route (commento nel codice stesso lo conferma: *"non e' collegato a dati reali - Viewport3D mostra un cubo fisso"*). Decidere se completarla o rimuoverla: oggi è solo peso morto che confonde chi esplora il repo. | `frontend/src/features/projects/ProjectWorkspace.tsx`, `frontend/src/components/viewport/Viewport3D.tsx` | 2 | 1 | 3 | 3 |
| D5 | Nessun file `LICENSE` nella repository, nonostante il progetto dipenda da OpenFOAM (GPL-3.0) e — se si adotta la raccomandazione della Sezione 6 — da `foamlib` (GPL-3.0 anch'esso). Non ho aggiunto una licenza di mia iniziativa: è una scelta che spetta a te, ma va fatta prima che il repository sia pubblico o condiviso. | `/` | 2 | 2 | 1 | 8 |

### 4.4 Dipendenze

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| P1 | **[FATTO]** `@tanstack/react-router` installato, **zero import** nel codice (si usa `react-router-dom` ovunque — 10 file). Probabile residuo di una migrazione di routing mai completata o mai iniziata. | `frontend/package.json` | 2 | 1 | 1 | 6 |
| P2 | **[FATTO]** `recharts` + `@types/recharts` installati, **zero import** (il grafico residui usa `echarts`/`echarts-for-react`). Due librerie di grafici nello stesso progetto, una morta. | `frontend/package.json` | 2 | 1 | 1 | 6 |
| P3 | `npm audit` segnala 4 vulnerabilità reali dopo la pulizia: `dompurify` (via `monaco-editor`, XSS multiple, moderate), `echarts` <6.1.0 (XSS, moderate — richiede bump maggiore a 6.1.0), `esbuild` ≤0.24.2 (via `vite`, il dev server accetta richieste da qualunque sito, moderate), `react-router` 6.0.0–7.17.0 (open redirect, moderate). Non ho forzato i bump perché tre su quattro sono **breaking change** (major bump di `vite`, `echarts`, `react-router-dom`) che vanno testati manualmente, non applicati alla cieca. | `frontend/package-lock.json` | 3 | 3 | 3 | 12 |
| P4 | Backend pinnato a `fastapi==0.109.2`, `pydantic==2.6.1` — versioni di inizio 2024, oggi (2026) datate di oltre un anno e mezzo. Nessuna CVE nota bloccante trovata, ma vale un giro di aggiornamento pianificato con test di regressione. | `backend/requirements.txt` | 2 | 2 | 2 | 8 |
| P5 | Immagine OpenFOAM installata con `apt-get install -y openfoam2406-default` — nessun pin di patch version. Due build in giorni diversi possono installare patch diverse dello stesso 2406, silenziosamente. Rischio di riproducibilità, non di sicurezza. | `worker/Dockerfile` | 2 | 2 | 2 | 8 |
| P6 | **[FATTO]** `jinja2` dichiarata in `backend/requirements.txt`, **zero import** in tutto backend/worker/viz (verificato con grep sull'intero albero, non solo su `templates_generator.py`). I dict OpenFOAM sono generati con f-string dirette, non con template Jinja — la dipendenza non è mai stata usata. Rimossa; test suite verificata senza (`pip uninstall jinja2` + `pytest` → verde). | `backend/requirements.txt` | 1 | 1 | 1 | 4 |

### 4.5 Architettura / debito strutturale

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| A1 | `templates_generator.py`, 875 righe, 24 funzioni tutte in un file — genera ogni dict OpenFOAM (controlDict, fvSchemes, fvSolution, blockMeshDict, snappyHexMeshDict, transportProperties, thermophysicalProperties, turbulenceProperties, 0/U, 0/p, 0/T, 0/alphat, 0/k, 0/omega...) a colpi di f-string concatenate. Funziona, ma ogni nuovo campo o solver richiede di navigare un file enorme, e — come mostra S1 — è facile dimenticare una validazione in un punto e non negli altri quattro. | `backend/app/templates_generator.py` | 3 | 3 | 4 | 4.5 |
| A2 | Parsing di log e mesh (`parse_residuals`, `parse_check_mesh` in `worker/tasks.py`; `validate_foam_file`, `extract_boundary_names` in `validation.py`) è tutto regex scritto a mano. Ha già avuto almeno un bug noto e corretto (il regex di skewness cercava `:` invece di `=`, mai fatto match). Un vero parser toglierebbe questa classe di bug alla radice — vedi `foamlib` in Sezione 6. | `worker/tasks.py`, `backend/app/routers/validation.py` | 3 | 2 | 4 | 3.75 |
| A3 | Il worker gira con `--concurrency=1`: un solo job OpenFOAM alla volta, a livello di intero deployment (coerente con `mem_limit: 16g` / `cpus: 8` dedicati a un job pesante). Va bene per un utente singolo; se in futuro serve eseguire più mesh/run leggeri in parallelo, serve ripensare l'allocazione risorse per job, non solo alzare la concorrenza. | `worker/Dockerfile`, `docker-compose.yml` | 1 | 1 | 3 | 0.7 |
| A4 | Bundle frontend: il chunk `charts` (echarts) pesa 1.05 MB minificato / 350 KB gzip da solo, Vite stesso segnala il superamento della soglia di 500 KB. Nessun code-splitting per rotta. | `frontend/vite.config.ts` | 2 | 1 | 3 | 3 |

### 4.6 Test e qualità

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| T1 | **[FATTO]** Zero test di regressione sulla validazione dei boundary condition (il bug S1 non sarebbe stato preso da nessun test esistente). Aggiunti 3 test mirati (Sezione 5). | `backend/tests/test_api.py` | 3 | 2 | 1 | 15 |
| T2 | Copertura test quasi nulla sul worker (`worker/tasks.py`, 337 righe, zero test) — comprensibile perché richiede OpenFOAM reale per un test end-to-end, ma le funzioni pure (`parse_residuals`, `parse_check_mesh`, `clean_case`) sono testabili in isolamento senza Docker. **Aggiornamento:** `worker/` ora ha 33 test (`file_locking.py`, `mesh_validation.py`), ma non ancora su `parse_residuals`/`parse_check_mesh`/`clean_case` stessi — voce parzialmente chiusa, non completamente. | `worker/tasks.py` | 2 | 2 | 3 | 2.5 |
| T3 | `tsconfig.json` ha `noUnusedLocals: false` e `noUnusedParameters: false` — disabilitati, probabilmente per evitare di rompere la build su codice esistente. Questo è in parte la causa strutturale di D4/P1/P2: niente segnala import o variabili morte finché non le cerchi a mano. | `frontend/tsconfig.json` | 2 | 1 | 3 | 3 |
| T4 | **[FATTO]** La CI (`ci.yml`) eseguiva `pytest` solo su `backend/tests/` — `worker/tests/` (33 test, incluse le due voci M2/M7 sopra) non girava mai in CI, solo manualmente. Un contributor poteva rompere `file_locking.py`/`mesh_validation.py` senza che nessun check se ne accorgesse. Aggiunto un job `worker` dedicato in `ci.yml`. | `.github/workflows/ci.yml` | 3 | 2 | 1 | 15 |
| T5 | **[FATTO]** `mesh_validation.py::format_mesh_report` — `f"{metrics.get('cells', 'N/A'):,}"`: lo spec di formattazione `:,` (migliaia) applicato al fallback stringa `"N/A"` solleva `ValueError` non appena una metrica manca dal report. 3 test (già scritti, mai passati) lo confermavano. | `worker/mesh_validation.py` | 3 | 1 | 1 | 12 |
| T6 | **[FATTO]** Nessun test eseguiva mai `blockMesh`/`checkMesh` reali — ogni verifica su B0/write_U si fermava a "il parser di foamlib lo legge" o "inizia con FoamFile", mai un binario OpenFOAM vero. Aggiunto il job CI `openfoam-integration` (Sezione 5, riconciliazione). | `.github/workflows/ci.yml` | 4 | 3 | 2 | 21 |

### 4.7 Documentazione

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| DOC1 | **[FATTO]** Nessun `CONTRIBUTING.md` o `ARCHITECTURE.md` — per un progetto con backend/worker/viz/frontend separati, un diagramma dei servizi e dei flussi (upload → mesh → run → risultati) farebbe risparmiare tempo a chiunque riprenda il progetto dopo una pausa, te compreso. | `/` | 2 | 1 | 2 | 4 |
| DOC2 | **[FATTO]** Manca licenza (vedi D5, ripetuto qui perché è anche un gap di documentazione oltre che legale). | `/` | — | — | — | — |

---

## 5. Fix già applicati in questa sessione

Modifiche fatte, testate e verificate — non solo proposte. Diff minimo,
nessuna riscrittura non richiesta (principio "lazy": la correzione più
piccola che risolve la causa reale, non il sintomo).

1. **Chiusa l'iniezione in `BoundaryCondition.name`/`patch_type`**
   (`backend/app/models.py`): aggiunto `pattern=r"^[a-zA-Z0-9_]+$"` su
   `name` (stesso pattern già usato da `RefinementBox.name`) e un
   `field_validator` con whitelist su `patch_type`
   (`patch, wall, symmetry, symmetryPlane, empty, wedge, cyclic`).
2. **Fix ordinamento `list_cases`** (`backend/app/routers/cases.py`):
   ordina per `created_at` (stringa ISO 8601, l'ordine lessicografico
   coincide con quello cronologico) invece che per nome cartella.
3. **Rimossa `update_last_job()`**, funzione morta in
   `backend/app/routers/jobs.py`.
4. **Rimossa `backend/test/`**, copia stantia con assert sulla vecchia
   shape dell'API (`case_id` invece di `id`).
5. **Rimossa `.github/workflow/`** (typo di directory, mai eseguita da
   GitHub Actions).
6. **Rimosso il file spurio** `openfoam-webui-completo(1).zip:Zone.Identifier`
   (metadato di Windows, finito nel repo per errore).
7. **Rimosse le dipendenze frontend morte**: `@tanstack/react-router`,
   `recharts`, `@types/recharts` da `frontend/package.json`; lockfile
   rigenerato con `npm install`, build (`tsc && vite build`) verificata con
   successo.
8. **Applicato `npm audit fix`** (solo fix non-breaking); documentate in
   P3 le 4 vulnerabilità restanti che richiedono bump maggiori e test
   manuale prima di essere applicate.
9. **Aggiunti 3 test di regressione** in `backend/tests/test_api.py`:
   - `test_boundary_condition_name_rejects_dict_injection` — verifica che
     un nome con `#codeStream` venga rifiutato con 422;
   - `test_boundary_condition_patch_type_whitelisted` — verifica che un
     `patch_type` non in whitelist venga rifiutato;
   - `test_list_cases_sorted_by_creation_date_not_uuid` — verifica che il
     secondo caso creato appaia prima del primo nella lista.
10. **Aggiunto un commento di cross-reference** in `models.py` che spiega
    perché `ALLOWED_SOLVERS` è duplicato (non per errore) in
    `worker/tasks.py`, con istruzione esplicita di tenerli sincronizzati.

Verifica eseguita: `pytest tests -v` → **6/6 pass**; `npm run build` →
build completata senza errori TypeScript.

### Riconciliazione con GitHub (questa sessione)

Nel frattempo hai applicato tu stesso i fix sopra al repository GitHub
(commit `72f840a`, identici a quelli consegnati) e hai aggiunto in proprio
un fix per S3 (commit `0f723ea`, PR `phase-1-security-s3-async-upload`).
Ho riclonato da GitHub invece di ripartire dal mio archivio locale, e ho
trovato due cose da correggere prima di andare avanti:

1. **`backend/test/` e `.github/workflow/` (D1, D2) erano ricomparse.**
   La copia dei file cambiati non porta con sé le cancellazioni — se in
   futuro applichi le patch di questo audit a mano invece che scaricando
   lo zip intero, ricontrolla che i file rimossi restino rimossi.
   Ri-eliminate.
2. **Il tuo fix per S3 introduceva una regressione reale (S3b)**: l'except
   generico rimandava `str(e)` al client nel body della risposta 500,
   bypassando il `global_exception_handler` che esiste apposta in
   `main.py` per non farlo (principio già scritto nel vostro stesso
   README, "Errori API senza output sensibili"). Corretto sostituendo il
   `raise HTTPException(500, detail=f"...{str(e)}")` con un `raise` nudo,
   che lascia gestire l'errore al handler globale esistente (logga il
   dettaglio vero server-side, risponde al client con un messaggio
   generico). Ho anche semplificato l'apertura del file: la tua versione
   riapriva il file in append mode per ogni chunk da 1MB (~2000 cicli di
   apertura per un upload da 2GB); ora si apre una volta sola e si
   offload solo la `write()` sul thread pool — stesso comportamento,
   meno overhead.

Verifica ripetuta dopo la riconciliazione: `pytest tests -v` →
**10/10 pass**.

### Fase 1 (eseguita in questa sessione, sopra la riconciliazione)

11. **Implementato `terminal.py` per davvero (S5)**: aggiunto il task
    Celery `tasks.run_terminal_command` in `worker/tasks.py` (riusa
    `run_step` — stessa infrastruttura di log/timeout/cancellazione di
    mesh e run, con un timeout più corto, 120s, coerente con comandi di
    ispezione rapida). Il router ora fa `celery_app.send_task(...)` e
    restituisce un `job_id` pollabile su `GET /api/jobs/{job_id}` come
    qualunque altro job, invece di rispondere con un messaggio statico.
    Resta disabilitato di default (`ENABLE_TERMINAL=false`), invariato.
    **Nota:** non esiste ancora una UI collegata a questo endpoint (verificato
    via grep — l'unico riferimento a "terminal" nel frontend è l'icona
    Lucide della tab "Logs", non un client reale) — l'endpoint ora
    funziona correttamente, ma va agganciato a un componente nella Fase 3.
    Aggiunti 3 test (`disabled_by_default`, `rejects_unknown_command`,
    `requires_existing_case`) che non richiedono un broker Redis reale,
    coerenti con la scelta della suite esistente di non esercitare mai
    `send_task` nei test.
12. **Scritto `ARCHITECTURE.md`** (DOC1): diagramma dei 4 servizi, flusso
    completo caso→mesh→run→risultati, motivazione della separazione in
    servizi, limiti noti con rimando alle voci di questo file.
13. **Nota di sicurezza aggiunta al README** (S4, solo documentazione):
    chiarito esplicitamente il limite della API key da build-time, con
    rimando a questo file. Nessuna modifica di codice: implementare un
    vero meccanismo di sessione è un lavoro a parte, da fare solo se/quando
    il servizio deve essere esposto oltre `localhost`.
14. **Aggiunto `anyio` esplicito** a `backend/requirements.txt` (prima
    usato solo come dipendenza transitiva di Starlette, mai dichiarato).

Verifica eseguita dopo Fase 1: `pytest tests -v` → **10/10 pass**;
`npm run build` → build completata senza errori TypeScript.

### Trovato durante il lavoro su Fase 2, corretto prima di continuare (B0)

Studiando `templates_generator.py` per la Fase 2 (foamlib) ho trovato il
problema più grave di tutto questo audit, non presente nella Sezione 4
originale perché non emerso durante la prima lettura:

15. **Aggiunto il blocco `FoamFile` obbligatorio a tutti i dict OpenFOAM
    generati (B0)**: nessuna delle ~20 funzioni `generate_*` lo scriveva.
    Aggiunta una funzione `foam_header()` e un parametro `class_name` a
    `write_file()` che la usa quando presente (i due file non-OpenFOAM,
    `case.json`/`config.json`, restano senza — corretto, non li legge
    OpenFOAM). Aggiornate tutte le 18 chiamate a `write_file()` con la
    `class` corretta (`dictionary`, `volVectorField`, `volScalarField`,
    `uniformDimensionedVectorField`). Aggiunto
    `test_generated_files_have_foam_file_header`, che genera un caso
    completo (solver buoyant + snappyHexMesh, per coprire tutti i rami:
    g, T, alphat, snappyHexMeshDict) e verifica che ogni file scritto
    inizi con `FoamFile`. **Non testabile contro un OpenFOAM reale in
    questo ambiente** (nessun binario disponibile) — verifica con un
    `docker compose up` prima di considerarla chiusa, vedi Sezione 8.
16. **Rimossa `jinja2` (P6)**, dipendenza dichiarata ma mai importata da
    nessuna parte — probabile residuo di un tentativo di generare i dict
    via template Jinja poi abbandonato in favore delle f-string dirette.

Verifica eseguita: `pytest tests -v` → **11/11 pass** (il nuovo test sul
FoamFile header incluso).

### Fase 2 — foamlib (0/U e 0/p convertiti)

17. **Aggiunto `foamlib==1.8.1`** a `backend/requirements.txt`.
18. **Creato `backend/app/foam_templates/`**, il package promesso per
    spezzare `templates_generator.py` (A1). Struttura ad oggi:
    `fields.py` (i campi convertiti a foamlib) e `solver_info.py`
    (`STEADY_STATE_SOLVERS`/`BUOYANT_SOLVERS`/`COMPRESSIBLE_SOLVERS` e le
    funzioni `is_buoyant`/`is_compressible`/`solver_algorithm`, estratte
    da `templates_generator.py` per evitare un import circolare: questo
    importa da `foam_templates`, quindi `foam_templates` non può
    importare da questo).
19. **`0/U` convertito**: `write_U()` sostituisce
    `generate_U`/`boundary_field_U` (rimossi, non lasciati come codice
    morto). Validato prima del cutover con un confronto semantico contro
    la versione vecchia (dimensioni, internalField, tutti e 5 i tipi di
    boundary condition), poi il vecchio codice è stato rimosso.
20. **`0/p` convertito**: `write_p()` sostituisce
    `generate_p`/`boundary_field_p` (rimossi). Copre entrambi i rami —
    solver buoyant (scrive sia `0/p_rgh` sia `0/p` con boundary
    `calculated`) e non-buoyant (solo `0/p`) — con lo stesso
    comportamento del generatore f-string originale.
21. Test in `backend/tests/test_foam_templates.py`: la copertura dei tipi
    di boundary condition (per U e per p) è testata chiamando le funzioni
    di mappatura pure (`_boundary_condition_U`/`_boundary_condition_p`)
    direttamente, non attraverso un `CaseConfig` completo — da quando
    esiste la validazione dei patch (M3), un `CaseConfig` con nomi patch
    inventati verrebbe respinto a monte, quindi testare la funzione di
    mappatura in isolamento è sia più semplice sia più corretto.

Verifica eseguita: `pytest` in `backend/` → **37/37 pass**; `pytest` in
`worker/` → **33/33 pass** (invariati, nessuna interazione con questi
file); smoke test manuale di `generate_case_files` con un caso
buoyant+snappyHexMesh completo → ogni file scritto inizia ancora con
`FoamFile`, nessuna regressione introdotta dal refactor dei moduli
solver.

### Fase 2 — continua (0/g, 0/T, 0/alphat, 0/k, 0/omega convertiti)

Convertiti tutti i campi rimasti in `0/` e `constant/g` — con questo,
**tutti** i campi (contrapposti ai dict puri di `system/`) sono ora su
foamlib, non più su f-string.

22. **`constant/g` convertito**: `write_g()`. Caso particolare — `g` è un
    `uniformDimensionedVectorField`, non un volField: niente
    internalField/boundaryField, solo `dimensions`+`value` a livello di
    file. `FoamFieldFile` non si applica; usato `FoamFile` generico con
    `field["FoamFile", "class"] = "uniformDimensionedVectorField"` per
    forzare la classe (foamlib non ha modo di dedurla da un dict senza
    forma standard di campo).
23. **`0/T` e `0/alphat` convertiti**: `write_T()`/`write_alphat()`
    sostituiscono `generate_T`/`boundary_field_T`/`generate_alphat`
    (rimossi).
24. **`0/k` e `0/omega` convertiti**: `write_turbulence_fields()`
    sostituisce `generate_turbulence_fields`/`boundary_field_scalar`
    (rimossi).
25. **Trovata un'altra falla della stessa classe di S1, convertendo
    proprio questo campo**: `k_type`/`omega_type` finivano **crudi** nel
    dict per i patch non-wall
    (`boundary_field_scalar`: `f"type {bc.k_type};"`) — a differenza di
    `U_type`/`p_type`/`T_type`, che passano sempre per un `elif`
    esplicito (un valore sconosciuto cade in un ramo sicuro, il valore
    stesso non finisce mai nel file), `k_type`/`omega_type` erano
    interpolati direttamente. Stesso identico rischio di S1 (injection di
    una direttiva OpenFOAM tramite un nome di tipo malevolo). **Corretto**
    in `models.py`: aggiunto `pattern=r"^[a-zA-Z0-9_]+$"` a entrambi,
    aggiunto un test di regressione
    (`test_boundary_condition_k_omega_type_rejects_dict_injection`) sullo
    stesso modello del test per S1.
26. `templates_generator.py` è sceso da ~906 a **659 righe** (comprese le
    righe vuote e i commenti) — i dict puri restano lì, tutti i campi
    scalari/vettoriali sono usciti.

Verifica eseguita: `pytest` in `backend/` → **48/48 pass** (37 + 11
nuovi); `pytest` in `worker/` → **33/33 pass** (invariati). Smoke test
manuale con 4 combinazioni solver/turbolenza/mesh diverse (`simpleFoam`
laminare, `simpleFoam` con `kOmegaSST`, `buoyantSimpleFoam` con
`kEpsilon`+snappyHexMesh, `rhoSimpleFoam` con `kOmegaSST`) → ogni file
generato inizia con `FoamFile` in tutte e 4 le combinazioni.

**Cosa resta di Fase 2**: solo i dict puri di `system/`/`constant/`
restano sul vecchio percorso f-string (`generate_control_dict`,
`generate_fv_schemes`, `generate_fv_solution`, `generate_block_mesh_dict`,
`generate_snappy_hex_mesh_dict`, `generate_decompose_par_dict`,
`generate_transport_properties`, `generate_thermophysical_properties`,
`generate_turbulence_properties`) — sono i più complessi strutturalmente
(specialmente `blockMeshDict`/`snappyHexMeshDict`, con liste di vertici,
blocchi, controlli di raffinamento annidati), quindi anche i più costosi
da convertire, ma anche i meno a rischio: non hanno lo stesso pattern di
"stringa utente inserita cruda in un dict" che ha causato S1 e questa
nuova falla - i loro parametri sono quasi tutti numerici o già passati
per una validazione Pydantic con whitelist di valori. Il parsing dei log
nel worker (`parse_residuals`, `parse_check_mesh`) non è stato toccato.

**Non toccati in questa sessione, per scelta esplicita (richiedono una tua
decisione, non solo lavoro tecnico):**
- **D4** (`ProjectWorkspace`/`Viewport3D` orfani) — completarli è una
  feature nuova, rimuoverli cancella codice WIP tuo: non ho voluto
  decidere al posto tuo su codice non ancora finito.
- **D5** (licenza) — GPL-3.0 resta la scelta tecnicamente più coerente
  (vedi Sezione 6), ma è una decisione con conseguenze legali/di business
  che spetta a te, non a un'esecuzione automatica di roadmap.

### Seconda riconciliazione: issue GitHub, 8 test falliti, moduli orfani

Ri-analizzando la repository su tuo esplicito invito ("continua
rianalizzando... per i cambiamenti, issue, azioni") ho trovato altri 5
commit nuovi su GitHub (`ff1119e`…`98f2384`), non presenti nella mia copia
locale. Ho riclonato di nuovo prima di continuare, stesso principio delle
volte precedenti: non sovrascrivere lavoro fatto nel frattempo.

**Trovato un issue GitHub aperto**, **#2 "meshing fail"**, aperto da te
stesso il 10 settembre, ancora aperto: *"Meshing fails on initialization
with lack of control in meshing generation and visualization. [...] No
named selection support, No 3D viewer editor."* Insieme a `ff1119e` c'era
anche `MESHING_FIXES.md` (909 righe), un'analisi indipendente di 7 bug
legati a questo issue, con fix proposti e codice di esempio — chiaramente
scritta da un altro strumento/sessione IA dopo aver visto il mio
`ROADMAP.md` (lo cita per nome). Buona analisi, in parte solo abbozzata:
due dei fix proposti (`mesh_validation.py`, `file_locking.py`) erano stati
scritti come moduli standalone, con test propri, ma **mai collegati alla
pipeline reale** — stesso pattern del `ProjectWorkspace` orfano (D4), non
un caso isolato in questa codebase.

**Eseguendo `pytest` sullo stato reale di GitHub, 8 test fallivano**, non
solo mancanze teoriche:

| Test | Causa | Fix |
|---|---|---|
| `test_rejects_undefined_patch_for_blockmesh` e altri 4 in `test_boundary_validation.py` | Bug #3 (MESHING_FIXES.md): nessun validatore che verifica che i nomi delle boundary condition corrispondano a patch mesh reali — la validazione era stata *testata* ma mai *scritta* in `models.py`. | Implementato `validate_boundary_patches_exist` su `CaseConfig`, esattamente come specificato nel documento. |
| `test_format_valid_mesh_report`, `test_format_invalid_mesh_report`, `test_format_report_includes_metrics` in `test_mesh_validation.py` | `format_mesh_report()` in `mesh_validation.py` faceva `f"{metrics.get('cells', 'N/A'):,}"` — lo spec di formattazione `:,` (separatore delle migliaia) applicato alla stringa di fallback `"N/A"` solleva `ValueError: Cannot specify ',' with 's'` non appena una metrica manca. | Riscritta con un helper `fmt()` che formatta solo se il valore è davvero numerico. |

Sistemando questi ho trovato **altri 2 bug** non ancora coperti da test
falliti visibili (mascherati dai fallimenti sopra):

1. Il nome patch derivato da un file STL con più punti nel nome (es.
   `"geometry.v2.final.stl"` → patch `"geometry.v2.final"`, caso reale
   testato da `test_stl_with_multiple_dots`) veniva rifiutato dal
   whitelist di sicurezza S1 su `BoundaryCondition.name`
   (`^[a-zA-Z0-9_]+$`, niente punti). **Allargato** a
   `^[a-zA-Z0-9_.-]+$`: punto e trattino non abilitano l'injection che S1
   doveva chiudere (non chiudono un blocco dict, non introducono
   direttive OpenFOAM), restano esclusi solo i caratteri realmente
   pericolosi.
2. `test_lock_with_special_characters_in_case_id` in
   `worker/tests/test_file_locking.py` controllava l'esistenza di un file
   `test.lock` che il codice non scrive mai (`mesh_generation_lock` crea
   sempre `.mesh_lock`, nome hardcoded) — bug nel test, non
   nell'implementazione. Corretto il nome nel test.

**Poi ho effettivamente collegato i due moduli orfani**, seguendo
l'integrazione che MESHING_FIXES.md stesso descrive:

- **`mesh_validation.py` era nel posto sbagliato**: viveva in
  `backend/app/`, ma la generazione dict è nel processo API mentre
  l'esecuzione (e quindi il posto naturale per validare l'output di
  `checkMesh`) è nel **worker** — due container Docker separati, senza
  filesystem/Python path condiviso (`worker/Dockerfile` copia solo
  `tasks.py`/`mesh_export.py`, non `backend/app/`). Il modulo non ha
  nessuna dipendenza da FastAPI/Pydantic, quindi l'ho **spostato in
  `worker/mesh_validation.py`** (e il suo test in
  `worker/tests/test_mesh_validation.py`) invece di inventare un modo per
  condividerlo tra container.
- In `worker/tasks.py::_generate_mesh`, dopo `parse_check_mesh()`, ora
  chiama `validate_mesh_quality()` sul report e scrive `mesh_valid`,
  `quality_issues`, `quality_warnings` dentro `mesh_report.json`. Se la
  mesh non è valida (0 celle, skewness estrema, ...), la funzione si
  ferma lì — non ha senso lanciare `foamToVTK`/il preview su una mesh che
  il solver rifiuterebbe comunque, e prima ci si arrivava sempre.
- `_generate_mesh` ora gira interamente dentro
  `mesh_generation_lock(case_dir, ...)` (rinominata la logica originale in
  `_generate_mesh_locked`, chiamata da dentro il lock). Chiude il bug #7
  di MESHING_FIXES.md: due job di mesh concorrenti sullo stesso caso non
  possono più correre e corrompere la cartella a vicenda.
- Aggiornato `worker/Dockerfile` per copiare anche `mesh_validation.py` e
  `file_locking.py` nell'immagine (prima mancavano dalla riga `COPY`,
  quindi anche se li avessi importati il container avrebbe fallito
  all'avvio con `ModuleNotFoundError`).

**Trovato anche**: la CI (`ci.yml`) eseguiva `pytest` solo su
`backend/tests/` — **`worker/tests/` (33 test) non girava mai in CI**,
solo a mano. Aggiunto un job `worker` dedicato.

**Aggiunto un job CI nuovo, `openfoam-integration`**, che chiude il
"non verificato contro OpenFOAM reale" ripetuto per tutto questo
documento (B0, write_U): usa
[`gerlero/setup-openfoam`](https://github.com/gerlero/setup-openfoam)
(stesso autore di `foamlib`) per installare OpenFOAM 2406 vero nel runner
GitHub Actions, genera un caso completo, e lancia `blockMesh`/`checkMesh`
per davvero contro i file prodotti da questa codebase — più un controllo
sintattico di `snappyHexMeshDict` via `foamDictionary` (senza geometria
reale, solo per verificare che il dict sia parsabile). D'ora in poi ogni
push/PR lo verifica automaticamente, non serve più fidarsi della sola
documentazione OpenFOAM o del parser di foamlib.

Verifica eseguita: `pytest` in `backend/` → **31/31 pass**; `pytest` in
`worker/` → **33/33 pass** (totale 64, includendo i moduli appena
collegati); YAML della CI validato con `python3 -c "import yaml; ..."`.
**Non verificato**: il job `openfoam-integration` stesso — non ho un
runner GitHub Actions qui per eseguirlo, solo la sintassi YAML e la
logica Python che genera i case sono state controllate in locale. La
prima esecuzione reale sarà al prossimo push.

---

## 6. Repository di riferimento — cosa prendere da ciascuna

| Repository | Stato reale | Cosa prendere |
|---|---|---|
| **[gerlero/foamlib](https://github.com/gerlero/foamlib)** | Attivamente mantenuta (144 release, ultima v1.5.7 di marzo 2026), pubblicata su JOSS, licenza **GPL-3.0** (compatibile con la catena OpenFOAM → foamlib già presente per transitività). | **La raccomandazione più importante di questo documento.** `FoamFile`/`FoamFieldFile` leggono e scrivono i dict OpenFOAM come `dict` Python veri, con un parser reale — non regex. `FoamCase`/`AsyncFoamCase` gestiscono run, clean, accesso ai risultati, e includono già monitoraggio di avanzamento via log file. Adottarla permette di eliminare gran parte di `templates_generator.py` (A1) e dei parser regex fatti in casa (A2) con codice mantenuto da terzi e testato su un caso d'uso più ampio del nostro. Dettagli d'uso in Fase 2. |
| **[olaafrossi/FoamPilot](https://github.com/olaafrossi/FoamPilot)** | Progetto giovane (11 star), ma **architettura quasi identica alla nostra** (FastAPI + React/TS + Docker + OpenFOAM) e un wizard a 6 step concettualmente sovrapponibile. Licenza MIT. | Non c'è codice da copiare (licenze diverse, stack a parte non identico — loro sono un'app Electron desktop, noi web), ma tre **idee di feature** concrete e ben scoping-abili: **(1)** "Aero Intelligence Engine" — classifica la geometria caricata (bounding box → lunghezza caratteristica, area frontale, aspect ratio) e suggerisce dominio/raffinamento/y+ in base al numero di Reynolds, invece di lasciare tutti i campi della mesh a compilazione manuale; **(2)** un calcolatore di **y+** per la prima cella, dato velocità e target y+; **(3)** **template di caso pronti** (airfoil, motorbike-like, cavity) selezionabili all'inizio del wizard invece di partire sempre da zero. La nostra UI ha già un componente `SolverRecommendation.tsx` — è il punto naturale dove agganciare (1) e (2). |
| **[openfoamtutorials/OpenFOAM\_Tutorials\_](https://github.com/openfoamtutorials/OpenFOAM_Tutorials_)** | Repository di case OpenFOAM companion di un canale YouTube, "non più mantenuto attivamente" per esplicita dichiarazione dell'autore, ma i case in sé non richiedono manutenzione (sono dati statici, non codice che invecchia). | Fonte di case di partenza per i template consigliati sopra (voce FoamPilot). **Attenzione:** prima di vendorizzare qualunque case, verificarne la licenza caso per caso — repository di tutorial community spesso non dichiarano una licenza esplicita sui singoli case. Se manca, non redistribuirli: o si chiede il permesso, o si usano i tutorial ufficiali di OpenFOAM (distribuiti sotto GPL-3.0 insieme a OpenFOAM stesso, quindi già compatibili) come base per i template. |
| **[SimFlowCFD/RapidCFD-dev](https://github.com/SimFlowCFD/RapidCFD-dev)** | Fork di OpenFOAM **2.3.x** (2016) con solver portati su CUDA. Issue aperte irrisolte da anni, richiede CUDA 8.0 / gcc 4.8 / Ubuntu 16.04 — **incompatibile con OpenFOAM 2406/2606** usato da questa repository. Non utilizzabile as-is. | Nessun codice riusabile direttamente. Se in futuro interessa l'accelerazione GPU (Fase 6, opzionale), il percorso attuale supportato è diverso: **PETSc come interfaccia solver esterna** con backend CUDA/HIP, combinato con **`petsc4Foam`** e la libreria **AmgX** di NVIDIA per il solo solver lineare (non l'intera pipeline). Benchmark pubblici recenti parlano di 8–10× di speedup sul solo solve lineare, ma 1.7–2.2× sulla simulazione completa per via di colli di bottiglia altrove (assemblaggio matrice, I/O) — utile saperlo prima di investirci tempo aspettandosi il 10× end-to-end. |

Ho anche cercato altri progetti nello stesso spazio, per completezza:
**CfdOF** (workbench FreeCAD, GUI open source matura per OpenFOAM — utile
come riferimento di UX per il flusso geometria→mesh→fisica→risultati, non
per il codice: è un plugin FreeCAD in Python/C++, stack non comparabile) e
**FoamScience/openfoam-wasm** (OpenFOAM compilato in WebAssembly, gira
interamente nel browser senza backend — sperimentale, oggi limitato a
`blockMesh` + `scalarTransportFoam`, non copre `snappyHexMesh` o run
parallele; interessante come direzione a lungo termine per demo leggere
lato client, non come sostituto dell'attuale backend Docker/Celery per casi
reali).

---

## 7. Roadmap a fasi

Ogni fase ha un criterio di uscita chiaro: non si passa alla fase
successiva finché quello della fase corrente non è vero.

### Fase 0 — Fondamenta (fatta in questa sessione)
Voci S1, S2, B1, D1, D2, D3, P1, P2, T1 della Sezione 4.
**Uscita:** `pytest tests -v` verde, `npm run build` verde. ✅ Verificato.

### Fase 1 — Sicurezza e correttezza residua (1–2 giorni)
- ~~S3: spostare la scrittura file upload fuori dall'event loop~~ **Fatto**
  (tuo fix + mia correzione della regressione, Sezione 5) — resta comunque
  da fare un test manuale con un upload vicino al limite `max_upload_mb`
  su un deployment Docker reale, non solo il test automatico con un file
  piccolo.
- S4: decidere se questo progetto resterà solo-localhost (in tal caso, la
  nota già aggiunta al README in questa sessione basta e la voce si chiude)
  o se è previsto un deploy raggiungibile da rete — in quel caso serve un
  vero meccanismo di sessione lato server, non solo la chiave nel bundle.
- ~~S5: implementare `terminal.py` per davvero~~ **Fatto** (Sezione 5,
  punto 11) — manca ancora l'interfaccia frontend che lo richiami: oggi è
  un'API funzionante senza pulsante che la usi.
- D4: decidere il destino di `ProjectWorkspace`/`Viewport3D` — completarli
  agganciandoli a dati reali, o rimuoverli.
- D5: scegliere e aggiungere una licenza (GPL-3.0 è la scelta più coerente
  vista la catena di dipendenze OpenFOAM/foamlib, ma è una tua decisione).
- ~~DOC1: un `ARCHITECTURE.md`~~ **Fatto** (Sezione 5, punto 12).

**Uscita:** nessun endpoint che promette una funzione che non ha; licenza
dichiarata; test di S3 aggiunto e verde. → *Endpoint e test: fatto. Licenza
e destino di `ProjectWorkspace`: in attesa di una tua decisione.*

### Fase 2 — Adozione di `foamlib` (core refactor, 1–2 settimane)
Il pezzo più grosso e con il rapporto valore/rischio migliore.

1. ~~Aggiungere `foamlib` a `backend/requirements.txt`~~ **Fatto**
   (`foamlib==1.8.1`). `worker/requirements.txt` non ancora — il worker
   non genera file, li esegue soltanto (vedi `ARCHITECTURE.md`); serve
   solo quando si converte il punto 2 qui sotto (log parsing).
2. Nel worker, sostituire la lettura/scrittura manuale dei log
   (`parse_residuals`, `parse_check_mesh`) con l'accesso ai campi via
   `FoamCase`/`FoamFieldFile` e con il monitoraggio di progresso nativo di
   `foamlib` (elimina la classe di bug vista in A2 — il regex di skewness
   sbagliato non sarebbe potuto succedere con un parser vero). **Non
   ancora fatto.**
3. In `templates_generator.py`, sostituire progressivamente le funzioni
   `generate_*` con la scrittura via `FoamFile` (dict-like, gestisce da
   solo l'escaping strutturale — chiude *strutturalmente* la classe di bug
   di S1, non solo con una whitelist a monte). **Tutti i campi fatti**
   (`0/U`, `0/p`, `0/p_rgh`, `0/T`, `0/alphat`, `0/k`, `0/omega`,
   `constant/g`). Restano solo i dict puri: `controlDict`, `fvSchemes`,
   `fvSolution`, `blockMeshDict`, `snappyHexMeshDict`,
   `decomposeParDict`, `transportProperties`,
   `thermophysicalProperties`, `turbulenceProperties`.
4. ~~Fare il refactor un file alla volta, con test di regressione prima
   di sostituirlo~~ **Fatto per tutti i campi**: creato
   `backend/app/foam_templates/fields.py` con una funzione `write_*` per
   ciascuno, ognuna validata prima del cutover, poi il vecchio codice
   f-string **rimosso** (non lasciato come codice morto).
   `templates_generator.py` sceso da ~906 a 659 righe.
5. Split di `templates_generator.py` in un package — **in corso**:
   `backend/app/foam_templates/` esiste con `fields.py` (tutti i campi) e
   `solver_info.py` (classificazione solver, estratta per evitare un
   import circolare). Manca ancora un modulo per i dict puri
   (mesh/controllo/proprietà fisiche).

**Uscita:** `templates_generator.py` sotto ~150 righe (o rimosso), tutti i
test esistenti verdi, nessuna regex per il parsing dei log rimasta in
`worker/tasks.py`. → *In corso: tutti gli 8 campi convertiti (48/48 test
backend verdi), restano i 9 dict puri e tutto il punto 2 (worker).*

### Fase 3 — Feature parity ispirata a FoamPilot (1–2 settimane)
- Calcolatore **y+** e suggerimento raffinamento/dominio basato su
  Reynolds, agganciato a `SolverRecommendation.tsx` (già presente ma oggi
  presumibilmente statico — verificarne la logica attuale prima di
  estenderlo).
- 3–4 **template di caso predefiniti** selezionabili all'avvio del wizard
  (partendo da tutorial ufficiali OpenFOAM per evitare problemi di
  licenza — vedi nota in Sezione 6).
- Classificazione automatica della geometria caricata (bounding box →
  lunghezza caratteristica, area frontale) per pre-compilare i default di
  `MeshSettingsForm`.

**Uscita:** un nuovo caso da STL a mesh configurata richiede meno click e
meno valori inseriti a mano rispetto a oggi, misurabile confrontando il
numero di campi obbligatori nel wizard prima/dopo.

### Fase 4 — Performance e scalabilità (3–5 giorni)
- A4: code-splitting per rotta nel frontend (dynamic `import()` sulle
  pagine `features/*`, così il chunk `charts` si carica solo sulla pagina
  Risultati).
- Valutare WebSocket al posto del polling SSE a 2s per i log job (oggi
  accettabile, ma se si aggiunge il monitoraggio y+/residui in tempo reale
  della Fase 3, la latenza percepita cresce).
- T2: test unitari sulle funzioni pure del worker (`clean_case`,
  `parse_residuals` prima della migrazione a `foamlib`, o le loro
  controparti dopo).
- T3: riabilitare `noUnusedLocals`/`noUnusedParameters` in `tsconfig.json`
  e risolvere gli errori che emergono — chiude la causa strutturale dietro
  P1/P2/D4.

**Uscita:** nessun chunk sopra i 500 KB nel build Vite; suite di test
worker non vuota.

### Fase 5 — Aggiornamento dipendenze (2–3 giorni, dopo le fasi precedenti)
- P3: bump mirati e testati singolarmente di `vite`, `echarts`,
  `react-router-dom` (major bump, uno alla volta, con smoke test manuale
  del flusso wizard completo dopo ciascuno — **non** `npm audit fix
  --force` in un colpo solo).
- P4: aggiornamento di `fastapi`/`pydantic`/`celery` a versioni correnti,
  con la suite di test come rete di sicurezza.
- P5: pin esplicito della patch version di OpenFOAM nel `worker/Dockerfile`
  invece di `openfoam2406-default` generico; valutare l'aggiornamento a una
  release più recente (v2506 o v2606 sono le più recenti al momento di
  questo audit) solo dopo aver validato che i dict generati restino
  compatibili.

**Uscita:** `npm audit` a zero vulnerabilità moderate/alte; versioni pinnate
esplicitamente ovunque.

### Fase 6 — GPU acceleration (opzionale, solo se necessaria)
Non è debito tecnico, è una feature nuova — la includo solo perché era tra
i repository di riferimento forniti. Percorso consigliato: `petsc4Foam` +
NVIDIA AmgX per accelerare il solo solver lineare (vedi Sezione 6), non il
fork RapidCFD-dev che è incompatibile con la versione di OpenFOAM in uso.
Da valutare solo se emerge un caso d'uso reale con mesh abbastanza grandi
da giustificare la complessità aggiuntiva (build CUDA nel worker, hardware
NVIDIA richiesto in produzione).

---

## 8. Checklist di verifica finale

Cosa ho controllato concretamente su questa consegna, con esito:

- [x] `pytest` in `backend/` → **48/48 pass** (31 dopo la riconciliazione
      + 6 per `write_p`/estrazione `solver_info` + 11 per
      `write_g`/`write_T`/`write_alphat`/`write_turbulence_fields` e il
      fix di sicurezza S6).
- [x] `pytest` in `worker/` → **33/33 pass** (prima non esisteva nessuna
      suite worker eseguibile in isolamento; ora esiste e passa).
- [x] I file zip precedenti erano diventati obsoleti: **riclonato da
      GitHub due volte in questa sessione** (non solo una), l'ultima
      dopo aver trovato 5 commit nuovi che includevano `MESHING_FIXES.md`
      e i moduli `mesh_validation.py`/`file_locking.py`. Confrontato ogni
      volta il diff prima di procedere, non assunto che il mio stato
      locale fosse ancora quello giusto.
- [x] Eseguita l'intera suite **prima** di ogni fix per confermare quali
      test fallissero davvero e perché (8 fallimenti reali, non
      supposizioni), non solo dopo per dire "ora passa".
- [x] `npm run build` → build completata, zero errori TypeScript.
- [x] YAML di `.github/workflows/ci.yml` validato con
      `python3 -c "import yaml; yaml.safe_load(...)"` dopo ogni modifica.
- [x] Verificato con `grep` che `mesh_validation.py`/`file_locking.py`
      non fossero importati da nessuna parte prima di spostare/collegare
      il primo — non stavo rompendo un uso esistente che non avevo visto.
- [x] Verificato che il nuovo pattern `^[a-zA-Z0-9_.-]+$` su
      `BoundaryCondition.name` non riaprisse la falla S1: il payload di
      test già esistente (`inlet\n}\n#codeStream\n{\n`) contiene solo
      caratteri ancora esclusi dal pattern, il test
      `test_boundary_condition_name_rejects_dict_injection` resta verde.
- [ ] **Non verificato — resta la voce più importante di tutto questo
      documento**: né B0 né `write_U` (Fase 2) né i dict generati in
      generale sono mai stati letti da un `blockMesh`/`checkMesh` reale
      da *me* — solo dal parser di foamlib, che non è lo stesso codice.
      Ho aggiunto il job CI `openfoam-integration` apposta per chiudere
      questo buco in modo permanente e automatico, ma **non ho un runner
      GitHub Actions in questo ambiente per eseguirlo**: la sua prima
      esecuzione reale sarà al prossimo push. Se fallisce, è la cosa da
      guardare per prima.
- [ ] **Non verificato**: `mesh_generation_lock` e `validate_mesh_quality`
      ora sono collegati in `_generate_mesh`, ma non ho potuto eseguire
      un job di mesh reale (serve Celery + Redis + OpenFOAM) per
      confermare che l'integrazione funzioni end-to-end, solo che i due
      moduli superano i loro test unitari in isolamento e che
      `tasks.py` continua a fare parsing sintattico corretto (AST).
- [ ] **Non verificato** (richiede infrastruttura Docker che non ho in
      questo ambiente): build reale di `worker/Dockerfile` con le due
      righe `COPY` aggiornate, upload reale vicino al limite di
      dimensione, comportamento del viewer trame con dati reali. Prima di
      considerare tutti i fix di questa sessione "in produzione", esegui
      un ciclo completo wizard → mesh → run → risultati con
      `docker compose up`.

---

## 9. Prossimi passi immediati

Se vuoi partire subito, in ordine di rapporto valore/sforzo:

1. **Fai il push e guarda il job `openfoam-integration`** — è la prima
   volta che un `blockMesh` vero legge i file generati da questa
   codebase in modo automatico e ripetibile. Se rosso, è la priorità
   assoluta su tutto il resto di questo documento.
2. **Verifica in locale** con `docker compose up` le parti che non ho
   potuto testare da qui (checklist sopra): upload grande, un job di
   mesh reale con lock/validazione attivi, un caso `snappyHexMesh` con
   geometria vera.
3. **Chiudi il loop sull'issue #2** ("meshing fail") — commenta o chiudi
   l'issue una volta che `openfoam-integration` è verde e hai confermato
   in locale che il meshing completa; se il mesh_report ora mostra
   `mesh_valid: false` con un messaggio chiaro invece di un fallimento
   criptico più tardi, è la conferma che serviva.
4. **Decidi le due voci aperte di Fase 1**: licenza (D5) e destino di
   `ProjectWorkspace`/`Viewport3D` (D4, citato anche in MESHING_FIXES.md
   come Bug #4 con due opzioni di fix, quick e completa).
5. **Continua Fase 2** (foamlib): tutti i campi (`0/*`, `constant/g`) sono
   convertiti e testati, restano solo i 9 dict puri di
   `system/`/`constant/` — stesso schema (converti, testa, sostituisci,
   rimuovi il vecchio).
6. Le Fasi 3–5 sono feature/manutenzione, non urgenti — named selection
   (Bug #5 di MESHING_FIXES.md) e il 3D viewer completo sono lavoro
   sostanziale, non "fix": pianificale quando il resto è stabile.
7. **Processo, di nuovo:** in questa sessione ho trovato *due volte* file
   morti ricomparsi e *una volta* moduli scritti-ma-mai-collegati. Se il
   flusso di lavoro prevede più strumenti/sessioni IA in parallelo su
   questo repo, vale la pena, dopo ogni sessione, controllare non solo
   "i test passano" ma "i test nuovi sono collegati a qualcosa che gira
   davvero" — `grep -rn nome_modulo` prima di considerare una feature
   fatta è un controllo da 10 secondi che avrebbe preso sia
   `mesh_validation.py` sia `file_locking.py` sia `ProjectWorkspace.tsx`.
