import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.security import safe_join, validate_case_id

router = APIRouter(tags=["validation"])

COMMENT_LINE = re.compile(r"//.*?$", re.MULTILINE)
COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.DOTALL)


def strip_comments(text: str) -> str:
    text = COMMENT_BLOCK.sub("", text)
    text = COMMENT_LINE.sub("", text)
    return text


def check_braces(text: str) -> list[str]:
    errors = []
    depth = 0

    for i, ch in enumerate(text):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1

        if depth < 0:
            errors.append(f"Parentesi graffa chiusa inattesa vicino al carattere {i}")
            break

    if depth > 0:
        errors.append(f"Mancano {depth} parentesi graffe chiuse")

    return errors


def validate_foam_file(path: Path) -> list[str]:
    if not path.exists():
        return [f"File mancante: {path.name}"]

    try:
        text = path.read_text(errors="ignore")
    except Exception as exc:
        return [f"Impossibile leggere {path.name}: {exc}"]

    text = strip_comments(text)
    return check_braces(text)


def extract_boundary_names(path: Path) -> set[str]:
    if not path.exists():
        return set()

    text = strip_comments(path.read_text(errors="ignore"))

    boundary_block = re.search(r"boundary\s*\{(.*?)\}\s*\Z", text, re.DOTALL)

    if not boundary_block:
        return set()

    names = re.findall(r"^\s*([A-Za-z0-9_]+)\s*\{", boundary_block.group(1), re.MULTILINE)
    return set(names)


def extract_boundary_field_names(path: Path) -> set[str]:
    if not path.exists():
        return set()

    text = strip_comments(path.read_text(errors="ignore"))

    boundary_block = re.search(r"boundaryField\s*\{(.*?)\}\s*\Z", text, re.DOTALL)

    if not boundary_block:
        return set()

    names = re.findall(r"^\s*([A-Za-z0-9_]+)\s*\{", boundary_block.group(1), re.MULTILINE)
    return set(names)


@router.post("/{case_id}/validate")
def validate_case(case_id: str):
    validate_case_id(case_id)
    case_dir = safe_join(settings.cases_root, case_id)

    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Caso non trovato")

    errors = []
    warnings = []

    # ponytail: "constant/transportProperties" era negli obbligatori per
    # QUALUNQUE caso, sempre. Ma i solver compressibili/buoyant (scambio
    # termico) generano thermophysicalProperties AL POSTO di
    # transportProperties - un caso radiatore corretto veniva segnalato
    # come rotto da un file che non deve nemmeno esistere per quel
    # solver. Leggo il solver da config.json per sapere cosa serve
    # davvero.
    config_file = case_dir / "config.json"
    solver = None
    if config_file.exists():
        try:
            solver = json.loads(config_file.read_text()).get("physics", {}).get("solver")
        except Exception:
            pass

    compressible_solvers = {"rhoSimpleFoam", "rhoPimpleFoam", "buoyantSimpleFoam", "buoyantPimpleFoam"}
    buoyant_solvers = {"buoyantSimpleFoam", "buoyantPimpleFoam"}

    required = [
        "system/controlDict",
        "system/fvSchemes",
        "system/fvSolution",
        "0/U",
        "0/p",
        "constant/turbulenceProperties",
    ]

    if solver in compressible_solvers:
        required.append("constant/thermophysicalProperties")
    else:
        required.append("constant/transportProperties")

    if solver in buoyant_solvers:
        required += ["0/T", "constant/g", "0/p_rgh"]

    for rel in required:
        file_path = case_dir / rel
        if not file_path.exists():
            errors.append(f"File mancante: {rel}")
            continue

        errors.extend(
            f"{rel}: {err}"
            for err in validate_foam_file(file_path)
        )

    mesh_files = case_dir / "constant/polyMesh"
    if not mesh_files.exists():
        warnings.append("Mesh non presente. Genera la mesh prima del run.")

    stl_files = list((case_dir / "constant/triSurface").glob("*.stl"))
    snappy = case_dir / "system/snappyHexMeshDict"

    if snappy.exists() and not stl_files:
        errors.append("snappyHexMeshDict presente ma nessun file STL in constant/triSurface")

    block_mesh = case_dir / "system/blockMeshDict"
    u_file = case_dir / "0/U"
    p_file = case_dir / "0/p"

    mesh_boundaries = extract_boundary_names(block_mesh)
    u_boundaries = extract_boundary_field_names(u_file)
    p_boundaries = extract_boundary_field_names(p_file)

    if mesh_boundaries:
        missing_u = mesh_boundaries - u_boundaries
        missing_p = mesh_boundaries - p_boundaries

        if missing_u:
            errors.append(f"In 0/U mancano le boundary: {', '.join(sorted(missing_u))}")

        if missing_p:
            errors.append(f"In 0/p mancano le boundary: {', '.join(sorted(missing_p))}")

    if not config_file.exists():
        warnings.append("config.json mancante: salva la configurazione dalla GUI")

    return {
        "case_id": case_id,
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }