"""Generatori di campo basati su foamlib, al posto delle f-string a mano
di templates_generator.py (vedi ROADMAP.md, Fase 2).

Perché: templates_generator.py costruiva ogni dict OpenFOAM concatenando
stringhe a mano - nessun parser vero, quindi bug come B0 (header FoamFile
mancante ovunque) o S1 (bc.name iniettabile in un dict senza whitelist)
erano possibili per costruzione, non per distrazione. foamlib scrive un
FoamFile strutturalmente valido: l'header è automatico, i valori passano
per un serializzatore vero, non per un f-string. Questo file converte un
solo campo (0/U) come prova, prima di convertire il resto del generatore -
vedi ROADMAP.md, Fase 2, punto 4 ("un file alla volta, con test di
confronto prima di sostituire").
"""

from pathlib import Path

from foamlib import DimensionSet, FoamFieldFile, FoamFile

from app.models import BoundaryCondition, CaseConfig
from app.foam_templates.solver_info import is_buoyant


def _boundary_condition_U(bc: BoundaryCondition) -> dict:
    """Traduce una BoundaryCondition nella entry boundaryField che
    foamlib scrive per il campo U - stessi 5 rami di
    templates_generator.py::boundary_field_U, stesso comportamento di
    default (else -> zeroGradient) per non cambiare silenziosamente il
    comportamento di configurazioni esistenti."""
    if bc.U_type == "fixedValue":
        return {"type": "fixedValue", "value": list(bc.U_value)}
    if bc.U_type == "noSlip":
        return {"type": "noSlip"}
    if bc.U_type == "slip":
        return {"type": "slip"}
    if bc.U_type == "inletOutlet":
        return {
            "type": "inletOutlet",
            "inletValue": list(bc.U_value),
            "value": list(bc.U_value),
        }
    # bc.U_type == "zeroGradient", o qualunque valore non riconosciuto:
    # stesso fallback sicuro del generatore originale.
    return {"type": "zeroGradient"}


def _boundary_condition_p(bc: BoundaryCondition, calculated: bool = False) -> dict:
    """Stessi rami di templates_generator.py::boundary_field_p.
    calculated=True e' il caso 0/p per i solver buoyant: p viene
    ricalcolato dal solver a ogni iterazione (p = p_rgh + rho*g*h), tranne
    dove serve un valore esplicito (patch a pressione fissa)."""
    if calculated:
        if bc.p_type == "fixedValue":
            return {"type": "calculated", "value": bc.p_value}
        return {"type": "calculated", "value": 0}

    if bc.p_type == "fixedValue":
        return {"type": "fixedValue", "value": bc.p_value}

    # bc.p_type == "zeroGradient", o qualunque valore non riconosciuto:
    # stesso fallback sicuro del generatore originale.
    return {"type": "zeroGradient"}


def _write_scalar_field(path: Path, dimensions: DimensionSet, internal_field, boundary_field: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    field = FoamFieldFile(path)
    field.dimensions = dimensions
    field.internal_field = internal_field
    field.boundary_field = boundary_field


def write_p(case_dir: Path, config: CaseConfig) -> None:
    """Equivalente a templates_generator.py::generate_p via foamlib. I
    solver buoyant scrivono sia 0/p_rgh (la variabile che risolvono
    davvero) sia 0/p (pressione assoluta iniziale, con boundary
    "calculated" - struttura identica al tutorial ufficiale
    buoyantSimpleFoam/hotRoom); gli altri solver scrivono solo 0/p."""
    physics = config.physics
    boundary = {bc.name: _boundary_condition_p(bc) for bc in config.boundaries}

    if is_buoyant(physics.solver):
        _write_scalar_field(
            case_dir / "0" / "p_rgh",
            DimensionSet(mass=1, length=-1, time=-2),
            physics.pressure,
            boundary,
        )
        calculated_boundary = {
            bc.name: _boundary_condition_p(bc, calculated=True) for bc in config.boundaries
        }
        _write_scalar_field(
            case_dir / "0" / "p",
            DimensionSet(mass=1, length=-1, time=-2),
            physics.pressure,
            calculated_boundary,
        )
        return

    _write_scalar_field(
        case_dir / "0" / "p",
        DimensionSet(length=2, time=-2),
        physics.pressure,
        boundary,
    )


def write_g(case_dir: Path, config: CaseConfig) -> None:
    """constant/g e' un uniformDimensionedVectorField, non un volField:
    non ha internalField/boundaryField, solo dimensions+value a livello
    di file. FoamFieldFile non fa al caso - si usa FoamFile generico e si
    forza esplicitamente class="uniformDimensionedVectorField" via
    f["FoamFile", "class"], perche' senza valori scalari/vettoriali su
    internal_field foamlib non ha modo di dedurla da solo."""
    g_path = case_dir / "constant" / "g"
    g_path.parent.mkdir(parents=True, exist_ok=True)

    field = FoamFile(g_path)
    field["FoamFile", "class"] = "uniformDimensionedVectorField"
    field["dimensions"] = DimensionSet(length=1, time=-2)
    field["value"] = list(config.physics.gravity)


def _boundary_condition_T(bc: BoundaryCondition) -> dict:
    """Stessi rami di templates_generator.py::boundary_field_T.
    fixedValue = temperatura imposta (parete calda/fredda, o un flusso in
    ingresso a temperatura nota). zeroGradient = adiabatica/nessuno
    scambio. inletOutlet = si comporta come un ingresso quando il flusso
    entra, zeroGradient quando esce."""
    if bc.T_type == "fixedValue":
        return {"type": "fixedValue", "value": bc.T_value}
    if bc.T_type == "inletOutlet":
        return {"type": "inletOutlet", "inletValue": bc.T_value, "value": bc.T_value}
    return {"type": "zeroGradient"}


def write_T(case_dir: Path, config: CaseConfig) -> None:
    """Solo per solver con scambio termico. Senza questo file
    buoyantSimpleFoam/buoyantPimpleFoam non partono nemmeno (il campo T
    e' obbligatorio per risolvere l'equazione dell'energia)."""
    boundary = {bc.name: _boundary_condition_T(bc) for bc in config.boundaries}
    _write_scalar_field(
        case_dir / "0" / "T",
        DimensionSet(temperature=1),
        config.physics.temperature,
        boundary,
    )


def write_alphat(case_dir: Path, config: CaseConfig) -> None:
    """Diffusività termica turbolenta: richiesta da qualunque solver
    compressibile con turbolenza RAS attiva. Senza, i solver buoyant si
    fermano subito cercando 0/alphat che non esiste. Nessun campo del
    modello BoundaryCondition personalizza alphat per singolo patch -
    dipende solo da patch_type, esattamente come nel generatore f-string
    originale (non e' una semplificazione mia)."""
    boundary = {}
    for bc in config.boundaries:
        if bc.patch_type == "wall":
            boundary[bc.name] = {
                "type": "alphatJayatillekeWallFunction",
                "Prt": 0.85,
                "value": 0,
            }
        else:
            boundary[bc.name] = {"type": "calculated", "value": 0}

    _write_scalar_field(
        case_dir / "0" / "alphat",
        DimensionSet(mass=1, length=-1, time=-1),
        0,
        boundary,
    )


def _boundary_condition_turbulence(bc: BoundaryCondition, field: str) -> dict:
    """Stessi rami di templates_generator.py::boundary_field_scalar.
    A differenza di U/p/T, sui patch non-wall il *tipo* stesso viene da
    bc.k_type/bc.omega_type (validati in models.py con una whitelist di
    caratteri, non di valori - qualunque nome di boundary condition
    OpenFOAM valido passa)."""
    if bc.patch_type == "wall":
        if field == "k":
            return {"type": "kqRWallFunction", "value": bc.k_value}
        if field == "omega":
            return {"type": "omegaWallFunction", "value": bc.omega_value}
        return {"type": "zeroGradient"}

    if field == "k":
        return {"type": bc.k_type, "value": bc.k_value}
    if field == "omega":
        return {"type": bc.omega_type, "value": bc.omega_value}
    return {"type": "zeroGradient"}


def write_turbulence_fields(case_dir: Path, config: CaseConfig) -> None:
    """0/k e 0/omega, solo per i modelli di turbolenza che li usano
    davvero (kOmegaSST, kEpsilon - altri modelli RAS useranno altre
    variabili in futuro, stesso guard del generatore f-string
    originale)."""
    if config.physics.turbulence not in ("kOmegaSST", "kEpsilon"):
        return

    k_boundary = {
        bc.name: _boundary_condition_turbulence(bc, "k") for bc in config.boundaries
    }
    _write_scalar_field(
        case_dir / "0" / "k", DimensionSet(length=2, time=-2), 0.1, k_boundary
    )

    omega_boundary = {
        bc.name: _boundary_condition_turbulence(bc, "omega") for bc in config.boundaries
    }
    _write_scalar_field(
        case_dir / "0" / "omega", DimensionSet(time=-1), 1.0, omega_boundary
    )


def write_U(case_dir: Path, config: CaseConfig) -> None:
    """Equivalente a templates_generator.py::generate_U, ma via foamlib
    invece di f-string. L'header FoamFile (class/location/object) è
    dedotto automaticamente da foamlib dal path e dal tipo del valore
    assegnato a internal_field (vettore a 3 componenti -> volVectorField),
    non serve specificarlo a mano come nella versione f-string (dove va
    passato esplicitamente a write_file - vedi B0)."""
    u_path = case_dir / "0" / "U"
    u_path.parent.mkdir(parents=True, exist_ok=True)

    field = FoamFieldFile(u_path)
    field.dimensions = DimensionSet(length=1, time=-1)
    field.internal_field = list(config.physics.velocity)
    field.boundary_field = {
        bc.name: _boundary_condition_U(bc) for bc in config.boundaries
    }
