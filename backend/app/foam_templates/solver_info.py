"""Classificazione dei solver OpenFOAM supportati - condivisa tra
templates_generator.py (f-string, in conversione) e foam_templates/
(foamlib, il nuovo percorso). Estratta in un modulo a parte proprio per
evitare un import circolare: templates_generator.py importa da
foam_templates/ (write_U, in futuro altri), quindi foam_templates/ non
può importare da templates_generator.py senza creare un ciclo.

Nota: la whitelist con lo stesso ruolo di sicurezza (ALLOWED_SOLVERS) resta
duplicata di proposito in app/models.py e worker/tasks.py - vedi i
commenti ponytail lì. Questo modulo è diverso: non è una whitelist di
sicurezza, è solo "a quale famiglia appartiene questo solver" per decidere
quale dict scrivere - un solver non in nessuno di questi 3 insiemi si
comporta semplicemente come il caso generico (PIMPLE, non buoyant, non
comprimibile), non è un problema di sicurezza se questi insiemi sono
incompleti."""

# ponytail: "SIMPLE if solver=='simpleFoam' else PIMPLE" era sbagliato
# per metà della whitelist - rhoSimpleFoam/buoyantSimpleFoam sono
# steady-state (SIMPLE) esattamente come simpleFoam, ma finivano con un
# blocco PIMPLE nel fvSolution (nome algoritmo sbagliato, il solver si
# sarebbe rifiutato di leggere il dict all'avvio).
STEADY_STATE_SOLVERS = {"simpleFoam", "rhoSimpleFoam", "buoyantSimpleFoam"}
BUOYANT_SOLVERS = {"buoyantSimpleFoam", "buoyantPimpleFoam"}
COMPRESSIBLE_SOLVERS = {
    "rhoSimpleFoam",
    "rhoPimpleFoam",
    "buoyantSimpleFoam",
    "buoyantPimpleFoam",
}


def solver_algorithm(solver: str) -> str:
    return "SIMPLE" if solver in STEADY_STATE_SOLVERS else "PIMPLE"


def is_buoyant(solver: str) -> bool:
    return solver in BUOYANT_SOLVERS


def is_compressible(solver: str) -> bool:
    return solver in COMPRESSIBLE_SOLVERS
