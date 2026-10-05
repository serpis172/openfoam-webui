# Roadmap — OpenFOAM Web UI (SimFlow Parity)

> 🇮🇹 Diario tecnico interno e piano di implementazione graduale.
> Questo documento sostituisce le precedenti iterazioni della roadmap e definisce il percorso ingegneristico esatto per portare la piattaforma da un wrapper OpenFOAM a una piattaforma CFD web nativa, in grado di competere con software commerciali come SimFlow.

**Obiettivo Finale:** Creare un'interfaccia web CFD completa, visivamente coerente con SimFlow (layout a 3 pannelli), con visualizzazione 3D integrata (VTK nativo nel browser), meshing intelligente, validazione proattiva dei CAD e accelerazione GPU per la risoluzione dei sistemi lineari.

**Principio Guida:** L'implementazione segue un ordine rigoroso a "strati concentrici". Nessuna feature di visualizzazione o accelerazione verrà toccata prima che il core di validazione dei dati (meshing e dizionari) sia strutturalmente infallibile. Questo previene regressioni e debug a cascata.

---

## 0. Design System e Palette Visiva

Prima di scrivere codice, l'architettura frontend deve adottare rigorosamente la seguente palette per garantire leggibilità dei dati scientifici e coerenza visiva.

*   **Background Canvas (UI Generale):** `HEX #dddddd` (Grigio Chiaro)
*   **Pannelli Strutturali (Tree View, Sidebar, Proprietà):** `HEX #22223B` (Colore 1 - Blu/Grigio Scuro)
*   **Viewport 3D (Background del Canvas WebGL):** `HEX #071013` (Colore 2 - Nero/Blu Profondo per massimo contrasto con la mesh)
*   **Testo Globale e Icone:** `HEX #dddddd`
*   **Dettagli Positivi (Mesh Quality OK, Residui Convergenti):** `HEX #ccffdd` (Verde Menta Chiaro)
*   **Dettagli Negativi (Skewness alta, Divergenza, Errori):** `HEX #ffaaaa` (Rosso/Rosa Chiaro)

---

## 1. Fase 1: Consolidamento del Core e Sicurezza Strutturale

**Obiettivo:** Eliminare i crash silenziosi del worker e le iniezioni di codice nei dizionari OpenFOAM. Nessun lavoro di UI o visualizzazione può iniziare se il motore di generazione dei file non è deterministico.

### 1.1. Chiusura della falla di escaping nei dizionari
*   **Problema Trovato:** `templates_generator.py` genera dizionari complessi (`blockMeshDict`, `snappyHexMeshDict`) tramite f-strings. Caratteri speciali nei nomi delle patch corrompono la sintassi OpenFOAM.
*   **Soluzione:** Completare la migrazione a `foamlib` (`FoamFile`, `FoamFieldFile`). La libreria gestisce nativamente l'escaping strutturale dei dizionari Python, rendendo impossibile l'iniezione di sintassi OpenFOAM arbitraria.
*   **Implementazione:** Rimuovere definitivamente `templates_generator.py` a favore di un package `backend/app/foam_templates/` che restituisce dizionari Python puri, serializzati da `foamlib`.

### 1.2. Validazione Proattiva delle Boundary Conditions
*   **Problema Trovato:** L'utente può configurare una BC su una patch (es. `inlet2`) che non esiste nella mesh generata. Il solver crasha ore dopo con errori criptici.
*   **Soluzione:** Implementare un `@model_validator(mode="after")` in `models.py` su `CaseConfig`. Il validatore deve incrociare i nomi delle BC con l'output atteso del meshatore (nomi STL + patch hardcoded di `blockMesh`).
*   **Implementazione:** Se una patch non esiste, l'API restituisce un errore `422` immediato con l'elenco delle patch disponibili, bloccando il submit del job.

### 1.3. Gestione Deterministica delle Mesh Degeneri
*   **Problema Trovato:** `mesh_export.py` crasha (PyVista exception) se la mesh ha 0 celle o volumi negativi, causando un errore 500 nel worker e nessun feedback a UI.
*   **Soluzione:** Inserire un blocco di validazione geometrica *prima* della conversione VTK.
*   **Implementazione:** Calcolare `mesh.n_cells` e `mesh.compute_cell_sizes()["Volume"]`. Se i volumi negativi superano una soglia o le celle sono zero, il worker scrive `mesh_valid: false` nel report e popola il campo `issues` (es. "Geometria fuori dal dominio", "Celli invertite"). Il worker si ferma prima di invocare `foamToVTK`.

### 1.4. Atomicità dei Job Concorrenti
*   **Problema Trovato:** I file lock (`fcntl`) mitigano le race condition ma non sono atomici a livello di database/Redis.
*   **Soluzione:** Implementare un sistema di lock distribuito basato su Redis (`redis-py` con `SET NX EX`). Prima di eseguire `clean_case` o avviare il solver, il worker deve acquisire un lock sul `case_id`. Se il lock esiste, il job viene rifiutato a monte con un messaggio "Simulazione già in corso".

---

## 2. Fase 2: Architettura UI e Layout (SimFlow Parity)

**Obiettivo:** Trasformare l'interfaccia in un ambiente di lavoro professionale a 3 pannelli, eliminando i componenti orfani e modernizzando il flusso dei dati.

### 2.1. Refactoring del Layout a 3 Pannelli
*   **Problema Trovato:** `ProjectWorkspace.tsx` e `Viewport3D.tsx` sono orfani, non collegati a `App.tsx`. L'UI attuale è un wizard sequenziale piatto.
*   **Soluzione:** Eliminare i componenti orfani. Creare un layout globale persistente:
    *   **Sinistra (Tree View - `#22223B`):** Navigazione gerarchica (Geometria, Mesh, Regioni Fisiche, BC, Solutori).
    *   **Centro (Viewport 3D - `#071013`):** Canvas WebGL sempre visibile che reagisce alla selezione nella Tree View.
    *   **Destra (Pannello Proprietà - `#22223B`):** Form dinamici che popolano il modello Pydantic.

### 2.2. Sostituzione del Polling con WebSocket
*   **Problema Trovato:** Il polling SSE a 2 secondi per i log e i residui satura le connessioni e introduce latenza inaccettabile per il monitoring CFD.
*   **Soluzione:** Implementare WebSocket nativi in FastAPI (`fastapi.WebSocket`).
*   **Implementazione:** Il worker, durante il run del solver, invia i pacchetti dei residui e le metriche di avanzamento direttamente a un canale Redis Pub/Sub. Il backend FastAPI sottoscrive il canale e lo inoltra via WebSocket al client. Questo permette grafici dei residui in tempo reale con latenza < 50ms.

---

## 3. Fase 3: Intelligenza CAD e Meshing Avanzato

**Obiettivo:** Dotare il software di un "Aero Intelligence Engine" che guidi l'utente, riducendo gli errori di setup tipici dei neofiti.

### 3.1. Integrazione di `trimesh` per l'Analisi Geometrica
*   **Problema Trovato:** L'utente deve inserire manualmente dominio, raffinamento e condizioni al contorno senza conoscere le proprietà del CAD.
*   **Soluzione:** Integrare la libreria Python `trimesh` nel backend al momento dell'upload STL.
*   **Implementazione:**
    *   **Riparazione Automatica:** Chiudere buchi e normali invertite.
    *   **Calcolo Metriche:** Estrarre Bounding Box, Area Frontale, Lunghezza Caratteristica.
    *   **Aero Intelligence Engine:** Calcolare il Numero di Reynolds in base alla velocità di ingresso e suggerire automaticamente il modello di turbolenza (es. $k-\omega$ SST per strati limite) e la dimensione della prima cella ($y+$) direttamente nel pannello Mesh.

### 3.2. Supporto per Named Selections e Meshatori Alternativi
*   **Problema Trovato:** Il raffinamento è limitato a bounding box globali. `snappyHexMesh` è potente ma fallisce su CAD complessi.
*   **Soluzione:**
    *   **Named Selections:** Permettere all'utente di cliccare su una patch nel Viewport 3D e assegnarle un nome logico (es. "ala_aereo"). Il backend genera le `refinementRegions` in `snappyHexMeshDict` basandosi su queste selezioni.
    *   **Integrazione `cfmesh`:** Aggiungere `cfmesh` (open source) come opzione alternativa a `snappyHexMesh` nel `worker/Dockerfile`. `cfmesh` è notoriamente più robusto e rapido per geometrie industriali "sporche".

---

## 4. Fase 4: Visualizzazione 3D Integrata (VTK Nativo)

**Obiettivo:** Eliminare la dipendenza dal container `viz` separato e portare il rendering VTK direttamente nel browser, come fa SimFlow.

### 4.1. Abbandono del Container `viz` Isolato
*   **Problema Trovato:** Il container `viz` (porta 8081) è un silos. L'utente deve cambiare URL o usare iframe goffi per vedere i risultati, distruggendo l'esperienza "tutto in uno".
*   **Soluzione:** Il backend genera i risultati in formato VTK XML (`.vtu` per volumi, `.vtp` per superfici) tramite `foamToVTK` e li serve come static assets.

### 4.2. Implementazione Viewer con `@kitware/vtk.js`
*   **Scelta Tecnologica:** `vtk.js` è lo standard industriale per il rendering VTK WebGL.
*   **Implementazione Frontend:**
    *   Creare il componente `Viewport3D` usando `vtk.js`.
    *   Caricare i file `.vtu` direttamente nel browser.
    *   **Interattività:** Implementare i widget nativi di VTK per **Clip Planes** (piani di taglio interattivi per vedere l'interno del dominio), **Streamlines** (linee di flusso calcolate sul client) e **Iso-surfaces** (es. isobare).
    *   **Color Maps:** Mappare i campi (`p`, `U`, `k`, `omega`) su scale di colori scientifiche, usando la palette definita (es. gradiente dal `#ccffdd` al `#ffaaaa` per la pressione).

---

## 5. Fase 5: Ottimizzazione Computazionale (GPU e I/O)

**Obiettivo:** Rendere il software competitivo su mesh di grandi dimensioni (> 5 milioni di celle).

### 5.1. Accelerazione GPU con Ginkgo
*   **Problema Trovato:** OpenFOAM nativo non sfrutta CUDA in modo trasparente. Fork come RapidCFD sono obsoleti e incompatibili con OpenFOAM 2406+.
*   **Soluzione:** Integrare **Ginkgo** (libreria matematica open source per algebra lineare su GPU).
*   **Implementazione:**
    *   Compilare OpenFOAM nel `worker/Dockerfile` con il supporto Ginkgo.
    *   Configurare `fvSolution` per usare i solver Ginkgo (es. `GinkgoPCG`, `GinkgoPBiCGStab`) per i sistemi lineari di pressione e velocità.
    *   **Risultato Atteso:** Speedup del 500-800% sulla fase di solve lineare, riducendo drasticamente i tempi di simulazione per mesh complesse.

### 5.2. Ottimizzazione I/O e Thumbnailing Automatico
*   **Problema Trovato:** La dashboard dei casi non mostra anteprime visive, costringendo l'utente ad aprire il viewer 3D per ogni run.
*   **Soluzione:** Usare `pyvista` nel worker per il rendering server-side.
*   **Implementazione:** Al termine di ogni simulazione, il worker genera automaticamente screenshot (PNG) di piani di taglio predefiniti (es. piano Y a metà dominio per pressione e velocità). Questi vengono salvati nella cartella del caso e mostrati come thumbnail nella dashboard, permettendo una valutazione visiva immediata.

---

## 6. Architettura Tecnologica Finale

Al termine di questa roadmap, lo stack sarà così composto:

| Layer | Tecnologia | Scopo |
| :--- | :--- | :--- |
| **Frontend** | React, TypeScript, Tailwind, **vtk.js** | UI 3-pannelli, rendering VTK nativo, WebSocket client. |
| **Backend** | FastAPI, **foamlib**, Pydantic, WebSockets | Validazione CAD (trimesh), generazione dizionari, routing real-time. |
| **Worker** | Celery, Redis, **Ginkgo (GPU)**, **cfmesh**, PyVista | Esecuzione OpenFOAM, meshing robusto, thumbnailing, lock distribuiti. |
| **Storage** | Docker Volumes, Postgres (opzionale per metadata) | Persistenza casi, file VTK (.vtu/.vtp). |

---

## 7. Checklist di Validazione Finale (Definition of Done)

Prima di considerare il progetto completato, ogni rilascio deve superare:

1.  **Zero Parser Regex:** Nessun parser regex sopravvive nel worker; tutto è gestito da `foamlib`.
2.  **Validazione Pydantic:** Impossibile salvare una configurazione con patch inesistenti o parametri fisici incoerenti.
3.  **Viewport 3D Integrato:** I file `.vtu` si caricano nel browser con Clip Planes e Streamlines funzionanti senza server esterni.
4.  **Resilienza Mesh:** Mesh a 0 celle o degenerate mostrano un report di errore chiaro in UI, senza crash 500 del worker.
5.  **Palette Visiva:** Tutti i componenti rispettano rigorosamente i codici HEX definiti nella sezione 0.
6.  **Performance GPU:** I job di benchmark (es. DrivAer) mostrano speedup misurabili usando i solver Ginkgo.

Questo documento rappresenta il contratto ingegneristico per lo sviluppo. Ogni modifica al codice deve essere tracciabile a uno di questi punti.
