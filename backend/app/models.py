from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

# ponytail: whitelist chiuso. Ogni stringa qui finisce cruda in un dict
# OpenFOAM (system/controlDict, turbulenceProperties) o come argv[0] di
# un subprocess (worker/tasks.py). Un solver/turbulenceModel arbitrario
# permette RCE via #codeStream nel dict o exec di binario a piacere.
# Aggiungere qui, non rimuovere il whitelist, se serve un nuovo solver.
#
# DUPLICAZIONE VOLUTA, non DRY da correggere: worker/tasks.py ha la stessa
# whitelist ALLOWED_SOLVERS ripetuta perche' config.json puo' essere
# riscritto a mano dall'editor di testo (PUT /files/{id}/text/config.json),
# che bypassa questa validazione pydantic - il worker e' l'ultima linea di
# difesa prima che "solver" diventi argv[0] di un subprocess reale. Se
# aggiungi/rimuovi un solver qui, aggiorna anche worker/tasks.py.
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
    # Solo per solver buoyant (scambio termico): temperatura di
    # riferimento in Kelvin e vettore gravità. Ignorati per solver
    # incompressibili puri (nessun effetto sul dict generato).
    temperature: float = Field(default=300.0, gt=0, description="Kelvin")
    gravity: List[float] = [0.0, 0.0, -9.81]

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

    @model_validator(mode="after")
    def check_buoyant_fluid_compatibility(self):
        # ponytail: i solver buoyant qui generano thermophysicalProperties
        # con equationOfState perfectGas, valido per un gas (aria), non
        # per un liquido (acqua/olio - servirebbe Boussinesq o un EOS
        # diverso, con un coefficiente di dilatazione termica che questa
        # UI non raccoglie ancora). Meglio bloccare con un errore chiaro
        # che generare un dict fisicamente sbagliato che il solver
        # accetta ma calcola densità assurde.
        buoyant_solvers = {"buoyantSimpleFoam", "buoyantPimpleFoam"}
        if self.solver in buoyant_solvers and self.fluid != "air":
            raise ValueError(
                f"Il solver {self.solver} (scambio termico) supporta solo aria come fluido "
                f"in questa versione: {self.fluid} richiederebbe un modello Boussinesq non ancora implementato."
            )
        return self


# ponytail: geometrici, non fisici - il tipo di boundary condition per U/p/k
# (fixedValue, zeroGradient...) resta libero perche' templates_generator.py lo
# confronta sempre con un elif esplicito (un valore ignoto cade nel ramo
# "else" sicuro). "name" e "patch_type" invece finiscono crudi dentro il
# dict OpenFOAM generato (vedi templates_generator.py, boundary_field_*):
# senza whitelist un nome tipo '"};\n#codeStream\n{...}' chiude il blocco
# in anticipo e inietta una direttiva OpenFOAM arbitraria nel file scritto
# su disco (potenzialmente RCE al primo run del solver). RefinementBox.name
# aveva gia' questo pattern, qui mancava.
ALLOWED_PATCH_TYPES = {
    "patch", "wall", "symmetry", "symmetryPlane", "empty", "wedge", "cyclic",
}


class BoundaryCondition(BaseModel):
    # ponytail: pattern allargato da ^[a-zA-Z0-9_]+$ a includere '.' e '-'
    # (vedi Bug #3/MESHING_FIXES.md, test_stl_with_multiple_dots): il nome
    # patch per snappyHexMesh viene derivato dal filename STL senza
    # estensione (Path.stem), e file STL reali hanno spesso nomi come
    # "geometry.v2.final.stl". Punto e trattino non abilitano l'injection
    # descritta sopra (non chiudono un blocco dict, non introducono
    # direttive OpenFOAM) - restano esclusi solo i caratteri realmente
    # pericolosi: {} ; # " ' \ newline e gli spazi.
    name: str = Field(default="inlet", min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    patch_type: str = "patch"
    U_type: str = "fixedValue"
    U_value: List[float] = [10.0, 0.0, 0.0]
    p_type: str = "zeroGradient"
    p_value: float = 0.0
    # ponytail: a differenza di U_type/p_type/T_type (confrontati sempre
    # con un elif esplicito - un valore ignoto cade in un ramo sicuro,
    # il valore stesso non finisce mai nel dict), k_type/omega_type
    # venivano scritti CRUDI nel dict per i patch non-wall
    # (templates_generator.py::boundary_field_scalar: f"type {bc.k_type};").
    # Stessa classe di injection di S1 (bc.name) - trovata convertendo
    # questo campo a foamlib per la Fase 2, non nell'audit iniziale.
    k_type: str = Field(default="fixedValue", pattern=r"^[a-zA-Z0-9_]+$")
    k_value: float = 0.1
    omega_type: str = Field(default="fixedValue", pattern=r"^[a-zA-Z0-9_]+$")
    omega_value: float = 1.0
    # Solo per solver con scambio termico. zeroGradient = parete
    # adiabatica (default, nessun scambio); fixedValue = temperatura
    # imposta (parete calda/fredda, es. le alette di un radiatore).
    T_type: str = "zeroGradient"
    T_value: float = Field(default=300.0, gt=0, description="Kelvin")

    @field_validator("patch_type")
    @classmethod
    def check_patch_type(cls, v: str) -> str:
        if v not in ALLOWED_PATCH_TYPES:
            raise ValueError(f"Tipo di patch non consentito: {v!r}")
        return v


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

    @model_validator(mode="after")
    def validate_boundary_patches_exist(self):
        """Bug #3 (MESHING_FIXES.md): una boundary condition che referenzia
        un patch inesistente passava questa validazione e falliva molto più
        tardi, con un errore OpenFOAM criptico ("cannot find patch ...")
        durante l'inizializzazione del solver - non durante la generazione
        mesh, che completava "con successo" nonostante il caso fosse rotto.
        Qui il fallimento è immediato, in fase di validazione della config,
        e dice esattamente quali patch sono realmente disponibili."""
        available = self._available_patches()

        for bc in self.boundaries:
            if bc.name not in available:
                raise ValueError(
                    f"Boundary condition '{bc.name}' does not match any mesh patch. "
                    f"Available patches: {', '.join(available)}"
                )

        return self

    def _available_patches(self) -> list[str]:
        """blockMesh genera sempre questi 3 patch (vedi
        generate_block_mesh_dict in templates_generator.py, hardcoded).
        snappyHexMesh aggiunge un patch dalla geometria STL, con nome
        derivato dal filename senza estensione (Path.stem gestisce
        correttamente anche filename con più punti, es.
        "geometry.v2.final.stl" -> "geometry.v2.final")."""
        patches = {"inlet", "outlet", "walls"}

        if self.mesh.mesh_type == "snappyHexMesh" and self.mesh.stl_file:
            patches.add(Path(self.mesh.stl_file).stem)

        return sorted(patches)