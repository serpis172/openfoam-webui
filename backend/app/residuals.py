import json
import re
from pathlib import Path

PATTERN = re.compile(
    r"Solving for (?P<field>[A-Za-z0-9_]+), "
    r"Initial residual = (?P<initial>[0-9.eE+-]+), "
    r"Final residual = (?P<final>[0-9.eE+-]+), "
    r"No Iterations (?P<iterations>[0-9]+)"
)


def parse_openfoam_log(log_path: Path):
    if not log_path.exists():
        return {}

    residuals = {}

    try:
        text = log_path.read_text(errors="ignore")
    except Exception:
        return {}

    for match in PATTERN.finditer(text):
        field = match.group("field")
        final = float(match.group("final"))
        residuals.setdefault(field, []).append(final)

    return residuals


def parse_latest_residuals(case_dir: Path):
    """ponytail: prima prendeva il log.* con mtime più recente - durante
    il solve e' quello giusto (il log del solver si aggiorna
    continuamente), ma appena la run finisce foamToVTK gira per ultimo
    e diventa il file più recente, che non contiene NESSUN residuo. Il
    grafico si svuotava esattamente quando l'utente voleva vedere la
    convergenza finale.

    Ordine corretto:
    1. postProcessing/residuals.json se esiste: e' il risultato già
       completo e corretto scritto dal worker a fine run (merge di
       tutti i log, stesso codice usato per generare il report finale).
    2. altrimenti (run ancora in corso) il log del SOLVER specifico,
       letto da config.json - non "il più recente".
    3. fallback finale: merge di tutti i log.*, come fa il worker.
    """
    residuals_file = case_dir / "postProcessing" / "residuals.json"
    if residuals_file.exists():
        try:
            return json.loads(residuals_file.read_text())
        except Exception:
            pass

    config_file = case_dir / "config.json"
    if config_file.exists():
        try:
            config = json.loads(config_file.read_text())
            solver = config.get("physics", {}).get("solver")
            if solver:
                solver_log = case_dir / f"log.{solver}"
                if solver_log.exists():
                    return parse_openfoam_log(solver_log)
        except Exception:
            pass

    merged = {}
    for log in sorted(case_dir.glob("log.*")):
        for field, values in parse_openfoam_log(log).items():
            merged.setdefault(field, []).extend(values)
    return merged