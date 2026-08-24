from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

# ponytail: whitelist chiuso. Ogni stringa qui finisce cruda in un dict
# OpenFOAM (system/controlDict, turbulenceProperties) o come argv[0] di
# un subprocess (worker/tasks.py). Un solver/turbulenceModel arbitrario
# permette RCE via #codeStream nel dict o exec di binario a piacere.
# Aggiungere qui, non rimuovere il whitelist, se serve un nuovo solver.
ALLOWED_SOLVERS = {
    "simpleFoam", "pimpleFoam", "interFoam", "pisoFoam", "icoFoam",
    "rhoSimpleFoam", "rhoPimpleFoam", "buoyantSimpleFoam", "buoyantPimpleFoam",
}
ALLOWED_TURBULENCE_MODELS = {
    "kOmegaSST", "kEpsilon", "SpalartAllmaras", "realizableKE", "RNGkEpsilon",
}


class CaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    solver: str = "simpleFoam"
    description: str = Field(default="", max_length=2000)

    @field_validator("solver")
    @classmethod
    def check_solver(cls, v: str) -> str:
        if v not in ALLOWED_SOLVERS:
            raise ValueError(f"Solver non consentito: {v}")
        return v


class CaseMeta(BaseModel):
    id: str
    name: str
    solver: str = "simpleFoam"
    description: str = ""
    created_at: str = ""
    updated_at: str = ""
    last_job_id: Optional[str] = None


class PhysicsConfig(BaseModel):
    solver: str = "simpleFoam"
    fluid: str = "air"
    nu: float = 1.5e-05
    rho: float = 1.225
    turbulence: str = "kOmegaSST"
    laminar: bool = False
    velocity: List[float] = [10.0, 0.0, 0.0]
    pressure: float = 0.0
    end_time: float = 1000.0
    write_interval: float = 100.0
    delta_t: float = 1.0

    @field_validator("solver")
    @classmethod
    def check_solver(cls, v: str) -> str:
        if v not in ALLOWED_SOLVERS:
            raise ValueError(f"Solver non consentito: {v}")
        return v

    @field_validator("turbulence")
    @classmethod
    def check_turbulence(cls, v: str) -> str:
        if v not in ALLOWED_TURBULENCE_MODELS:
            raise ValueError(f"Modello di turbolenza non consentito: {v}")
        return v


class BoundaryCondition(BaseModel):
    name: str = "inlet"
    patch_type: str = "patch"
    U_type: str = "fixedValue"
    U_value: List[float] = [10.0, 0.0, 0.0]
    p_type: str = "zeroGradient"
    p_value: float = 0.0
    k_type: str = "fixedValue"
    k_value: float = 0.1
    omega_type: str = "fixedValue"
    omega_value: float = 1.0


class RefinementDistance(BaseModel):
    """Una fascia di raffinamento a distanza crescente dalla geometria:
    mappa 1:1 su refinementRegions/mode distance di snappyHexMesh. Livelli
    più alti = celle più piccole. Ordinate per distanza crescente, oltre
    l'ultima si torna al livello base della mesh."""
    distance: float = Field(gt=0)
    level: int = Field(ge=0, le=10)


class RefinementBox(BaseModel):
    """Regione di raffinamento indipendente dalla geometria (es. la
    scia dietro un'auto): un box searchableBox + refinementRegions in
    modalità 'inside', livello uniforme su tutto il volume del box."""
    name: str = Field(min_length=1, max_length=40, pattern=r"^[a-zA-Z0-9_]+$")
    min: List[float]
    max: List[float]
    level: int = Field(ge=0, le=10)

    @field_validator("min", "max")
    @classmethod
    def check_three_components(cls, v: List[float]) -> List[float]:
        if len(v) != 3:
            raise ValueError("min/max del box devono avere esattamente 3 componenti (x, y, z)")
        return v


class MeshSettings(BaseModel):
    mesh_type: str = "blockMesh"
    domain_min: List[float] = [-1.0, -1.0, -1.0]
    domain_max: List[float] = [5.0, 1.0, 1.0]
    cells: List[int] = [60, 20, 20]
    stl_file: str = ""
    location_in_mesh: List[float] = [0.0, 0.0, 0.0]
    surface_refinement: int = 3
    refinement_levels: int = 2
    layers: int = 3
    first_layer_thickness: float = 0.001
    growth_ratio: float = 1.2
    processors: int = Field(default=4, ge=1, le=64)
    # Vuoti di default = comportamento invariato (livello unico costante
    # vicino alla geometria, come prima). Se valorizzati, sostituiscono
    # surface_refinement con un raffinamento graduato per distanza.
    refinement_distances: List[RefinementDistance] = []
    refinement_boxes: List[RefinementBox] = []

    @field_validator("refinement_distances")
    @classmethod
    def sort_and_dedupe_distances(cls, v: List["RefinementDistance"]) -> List["RefinementDistance"]:
        # snappyHexMesh richiede le distanze in ordine crescente: invece
        # di rifiutare un input disordinato (l'utente lo trascina su un
        # pannello grafico, l'ordine con cui li aggiunge e' arbitrario)
        # lo normalizziamo qui, un punto solo.
        distances_seen = set()
        for item in v:
            if item.distance in distances_seen:
                raise ValueError(f"Distanza duplicata nel raffinamento: {item.distance}")
            distances_seen.add(item.distance)
        return sorted(v, key=lambda item: item.distance)

    @field_validator("refinement_boxes")
    @classmethod
    def unique_box_names(cls, v: List["RefinementBox"]) -> List["RefinementBox"]:
        names = [box.name for box in v]
        if len(names) != len(set(names)):
            raise ValueError("I nomi delle regioni di raffinamento devono essere unici")
        return v


class FunctionObject(BaseModel):
    type: str = "forces"
    name: str = "forces"
    patches: List[str] = ["walls"]
    fields: List[str] = ["p", "U"]
    rho: float = 1.225
    origin: List[float] = [0.0, 0.0, 0.0]
    probe_locations: List[List[float]] = []


class RunSettings(BaseModel):
    clean_start: bool = True
    vtk_all_times: bool = False
    run_check_mesh: bool = True


class CaseConfig(BaseModel):
    physics: PhysicsConfig = PhysicsConfig()
    boundaries: List[BoundaryCondition] = [
        BoundaryCondition(name="inlet"),
        BoundaryCondition(
            name="outlet",
            U_type="zeroGradient",
            p_type="fixedValue",
            p_value=0.0,
        ),
        BoundaryCondition(
            name="walls",
            patch_type="wall",
            U_type="noSlip",
            p_type="zeroGradient",
        ),
    ]
    mesh: MeshSettings = MeshSettings()
    function_objects: List[FunctionObject] = [
        FunctionObject(type="forces", name="forces")
    ]
    run: RunSettings = RunSettings()