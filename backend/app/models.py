from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

# ponytail: whitelist chiuso. Ogni stringa qui finisce cruda in un dict
# OpenFOAM (system/controlDict, turbulenceProperties) o come argv[0] di
# un subprocess (worker/tasks.py). Un solver/turbulenceModel arbitrario
# permette RCE via #codeStream nel dict o exec di binario a piacere.
# Aggiungere qui, non rimuovere il whitelist, se serve un nuovo solver.
ALLOWED_SOLVERS = {
    "simpleFoam", "pimpleFoam", "interFoam", "pisoFoam", "icoFoam",
    "rhoSimpleFoam", "rhoPimpleFoam", "buoyantSimpleFoam",
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