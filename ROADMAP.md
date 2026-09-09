# Roadmap — openfoam-webui

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
| S3 | Upload file: `async def upload_file` scrive su disco in modo sincrono (`target.open("wb")` + `out.write(chunk)`) dentro una funzione `async` — blocca l'intero event loop di uvicorn per la durata dello scrivere fino a 2 GB. Con un solo worker uvicorn (nessun `--workers N` in `Dockerfile`/`docker-compose.yml`), un upload grande blocca *tutte* le altre richieste API, inclusi i poll di stato job. | `backend/app/routers/files.py` | 4 | 3 | 2 | 28 |
| S4 | La API key è iniettata a **build-time** nel bundle frontend (`VITE_API_KEY`), quindi visibile in chiaro a chiunque apra la pagina con devtools. Documentato correttamente come "lucchetto sulla porta" per deploy locale — ma se il servizio viene esposto oltre `localhost` (il README parla esplicitamente di "prima di esporre il servizio"), questa chiave non protegge da nessuno che sappia guardare il bundle JS. | `frontend/src/api/client.ts`, `backend/app/security.py` | 4 | 3 | 4 | 7 |
| S5 | `terminal.py`: l'endpoint è uno stub che non esegue nulla (`"Esecuzione ... disponibile solo con integrazione worker"`), ma resta comunque montato ed è menzionato nel README come feature di sicurezza ("Terminale disabilitato di default"). Un endpoint che promette una funzione di sicurezza ma non fa nulla è più confusione che rischio, ma va chiarito. | `backend/app/routers/terminal.py` | 2 | 1 | 2 | 4.5 |

### 4.2 Bug funzionali

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| B1 | **[FATTO]** `list_cases` ordinava con `sorted(cases_root.iterdir(), reverse=True)` — cioè per nome cartella (UUID esadecimale casuale), non per data di creazione. La Dashboard mostrava i casi in un ordine sostanzialmente casuale nonostante l'intento fosse "più recenti prima". | `backend/app/routers/cases.py` | 4 | 2 | 1 | 24 |
| B2 | TOCTOU su `create_case`: `count_cases()` e la creazione della cartella non sono atomiche. Due richieste concorrenti quando si è a un caso dal limite possono superare `max_cases`. Impatto basso per un'app mono-utente, ma è un bug reale. | `backend/app/routers/cases.py` | 1 | 1 | 3 | 0.7 |
| B3 | Il viewer 3D (`viz/trame_app.py`) tiene `plotter`, `_mesh`, `state` come variabili **globali di modulo** — un solo processo trame serve un solo "viewer" condiviso. Due tab browser aperte sullo stesso viewer condividono `case_id`/`time_index`: cambiare caso in una tab lo cambia anche nell'altra. Comportamento a singolo utente per design, ma non documentato come limite noto. | `viz/trame_app.py` | 2 | 1 | 3 | 3 |

### 4.3 Dead code / duplicazioni

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| D1 | **[FATTO]** `backend/test/` era una copia stantia di `backend/tests/` (assertava ancora la vecchia chiave `case_id` invece di `id` — il bug che il commit successivo aveva corretto). La CI esegue solo `pytest tests`, quindi questa cartella era invisibile ma fuorviante per chiunque la trovasse. | `backend/test/` | 3 | 1 | 1 | 8 |
| D2 | **[FATTO]** `.github/workflow/ci.yml` (singolare) — GitHub Actions legge solo `.github/workflows/` (plurale), quindi questo file non veniva mai eseguito. Contenuto identico al workflow reale: copia morta, stesso pattern di D1. | `.github/workflow/` | 2 | 1 | 1 | 6 |
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
| T2 | Copertura test quasi nulla sul worker (`worker/tasks.py`, 337 righe, zero test) — comprensibile perché richiede OpenFOAM reale per un test end-to-end, ma le funzioni pure (`parse_residuals`, `parse_check_mesh`, `clean_case`) sono testabili in isolamento senza Docker. | `worker/tasks.py` | 3 | 2 | 3 | 3.75 |
| T3 | `tsconfig.json` ha `noUnusedLocals: false` e `noUnusedParameters: false` — disabilitati, probabilmente per evitare di rompere la build su codice esistente. Questo è in parte la causa strutturale di D4/P1/P2: niente segnala import o variabili morte finché non le cerchi a mano. | `frontend/tsconfig.json` | 2 | 1 | 3 | 3 |

### 4.7 Documentazione

| # | Problema | File | Impatto | Rischio | Sforzo | Priorità |
|---|----------|------|:-:|:-:|:-:|:-:|
| DOC1 | Nessun `CONTRIBUTING.md` o `ARCHITECTURE.md` — per un progetto con backend/worker/viz/frontend separati, un diagramma dei servizi e dei flussi (upload → mesh → run → risultati) farebbe risparmiare tempo a chiunque riprenda il progetto dopo una pausa, te compreso. | `/` | 2 | 1 | 2 | 4 |
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
- S3: spostare la scrittura file upload fuori dall'event loop (endpoint
  sincrono con `file.file.read()`, oppure `anyio.to_thread.run_sync` per
  restare async). Va testato con un upload reale vicino al limite
  `max_upload_mb` prima di considerarlo chiuso.
- S4: decidere se questo progetto resterà solo-localhost (in tal caso,
  documentarlo esplicitamente e chiudere la voce) o se è previsto un deploy
  raggiungibile da rete — in quel caso serve un vero meccanismo di sessione
  lato server, non solo la chiave nel bundle.
- S5: implementare `terminal.py` per davvero (accodare il comando
  allowlisted come task Celery, come già fanno `/run` e `/mesh`) oppure
  rimuovere l'endpoint e la relativa voce dal README finché non lo è.
- D4: decidere il destino di `ProjectWorkspace`/`Viewport3D` — completarli
  agganciandoli a dati reali, o rimuoverli.
- D5: scegliere e aggiungere una licenza (GPL-3.0 è la scelta più coerente
  vista la catena di dipendenze OpenFOAM/foamlib, ma è una tua decisione).
- DOC1: un `ARCHITECTURE.md` con lo schema dei 4 servizi e il flusso
  upload → mesh → run → risultati.

**Uscita:** nessun endpoint che promette una funzione che non ha; licenza
dichiarata; test di S3 aggiunto e verde.

### Fase 2 — Adozione di `foamlib` (core refactor, 1–2 settimane)
Il pezzo più grosso e con il rapporto valore/rischio migliore.

1. Aggiungere `foamlib` a `backend/requirements.txt` e `worker/requirements.txt`.
2. Nel worker, sostituire la lettura/scrittura manuale dei log
   (`parse_residuals`, `parse_check_mesh`) con l'accesso ai campi via
   `FoamCase`/`FoamFieldFile` e con il monitoraggio di progresso nativo di
   `foamlib` (elimina la classe di bug vista in A2 — il regex di skewness
   sbagliato non sarebbe potuto succedere con un parser vero).
3. In `templates_generator.py`, sostituire progressivamente le funzioni
   `generate_*` con la scrittura via `FoamFile` (dict-like, gestisce da
   solo l'escaping strutturale — chiude *strutturalmente* la classe di bug
   di S1, non solo con una whitelist a monte).
4. Fare il refactor **un file OpenFOAM alla volta** (partire da
   `0/U`/`0/p`, i più semplici), con il test di regressione che confronta
   l'output character-per-character col generatore attuale prima di
   sostituirlo, così ogni step è verificabile in isolamento.
5. Split di `templates_generator.py` in un package
   (`backend/app/foam_templates/{mesh,physics,boundaries,control}.py`) man
   mano che si converte, invece che in un colpo solo (A1).

**Uscita:** `templates_generator.py` sotto ~150 righe (o rimosso), tutti i
test esistenti + quelli di regressione character-diff verdi, nessuna regex
per il parsing dei log rimasta in `worker/tasks.py`.

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

- [x] `pytest tests -v` nella cartella `backend` → **6/6 pass** (3 test
      preesistenti + 3 nuovi di regressione).
- [x] `npm install` con `package.json` ripulito → lockfile rigenerato senza
      errori.
- [x] `npm run build` (`tsc && vite build`) → build completata, **zero
      errori TypeScript**, nessuna rottura dovuta alla rimozione delle
      dipendenze morte.
- [x] `npm audit` eseguito e letto per intero → 4 vulnerabilità moderate
      residue, tutte documentate in P3 con motivo per cui non sono state
      forzate automaticamente.
- [x] Verificato con `grep` che nessun import residuo puntasse alle
      dipendenze rimosse (`@tanstack/react-router`, `recharts`) prima di
      toglierle da `package.json`.
- [x] Verificato che `update_last_job` non fosse chiamata da nessuna parte
      prima di rimuoverla.
- [x] Diff dei due file duplicati (`backend/test/` vs `backend/tests/`,
      `.github/workflow/` vs `.github/workflows/`) per confermare che
      fossero davvero copie morte e non versioni divergenti da conciliare.
- [x] Cartelle `node_modules/`, `dist/`, `__pycache__/`, `.pytest_cache/`
      rimosse prima dell'archiviazione (già in `.gitignore`, ma non devono
      finire nello zip).
- [ ] **Non verificato** (richiede infrastruttura che non ho a
      disposizione in questo ambiente): build Docker reale di
      `worker/Dockerfile` (scarica ~2 GB di pacchetti OpenFOAM da rete
      esterna), esecuzione end-to-end di un caso reale (mesh + solve),
      comportamento del viewer trame con dati reali. Prima di considerare
      i fix di Fase 0 "in produzione", esegui almeno un ciclo completo
      wizard → mesh → run → risultati con `docker compose up`.

---

## 9. Prossimi passi immediati

Se vuoi partire subito, in ordine di rapporto valore/sforzo:

1. **Verifica in locale** i fix di questa sessione con `docker compose up`
   (checklist finale, ultimo punto non verificabile da qui).
2. **Fase 1** (S3, S4, S5, D4, D5, DOC1) — tutte voci piccole e
   indipendenti, si possono fare in ordine sparso.
2. **Fase 2** (foamlib) è l'investimento con il ritorno più alto: parti da
   un solo file (`0/U`) come proof of concept prima di convertire tutto
   `templates_generator.py`.
3. Le Fasi 3–5 sono feature/manutenzione, non urgenti — pianificale quando
   Fase 2 è stabile, non in parallelo.
