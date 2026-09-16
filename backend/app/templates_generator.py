import json
from pathlib import Path
from app.models import CaseConfig, BoundaryCondition

# ponytail: unico import dal nuovo package foam_templates per ora - solo
# 0/U e' stato convertito a foamlib (ROADMAP.md, Fase 2, punto 4: "un
# file alla volta"). generate_U/boundary_field_U f-string sono state
# rimosse da qui, sostituite da questa; gli altri campi (0/p, 0/T, 0/k,
# 0/omega, i dict di system/ e constant/) restano sul vecchio percorso
# f-string finche' non vengono convertiti a loro volta, uno alla volta,
# con lo stesso schema di test di confronto usato per U (vedi
# backend/tests/test_foam_templates.py).
#
# solver_info: STEADY_STATE_SOLVERS/BUOYANT_SOLVERS/COMPRESSIBLE_SOLVERS e
# le funzioni is_buoyant/is_compressible/solver_algorithm vivevano qui
# prima - spostate in foam_templates/solver_info.py per evitare un import
# circolare (write_U qui sopra importa da foam_templates, quindi
# foam_templates non puo' importare da questo file).
from app.foam_templates.fields import write_U, write_p, write_g, write_T, write_alphat, write_turbulence_fields
from app.foam_templates.solver_info import (
    BUOYANT_SOLVERS,
    COMPRESSIBLE_SOLVERS,
    STEADY_STATE_SOLVERS,
    is_buoyant,
    is_compressible,
    solver_algorithm,
)


def foam_vector(values) -> str:
    return "(" + " ".join(str(v) for v in values) + ")"


def foam_header(class_name: str, object_name: str, location: str) -> str:
    """Blocco FoamFile obbligatorio in testa a ogni file che OpenFOAM
    legge o scrive. Non e' un commento decorativo: IOobject::readHeader
    pretende "FoamFile" come primo token del file, e senza whitelist di
    questa forma un blockMesh/simpleFoam/checkMesh rifiuta il file con un
    FatalIOError - non un warning, un errore bloccante. Vedi la guida
    ufficiale OpenFOAM, sezione "Basic input/output file format"."""
    return f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       {class_name};
    location    "{location}";
    object      {object_name};
}}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

"""


def write_file(path: Path, content: str, class_name: str | None = None):
    """class_name=None per file che non sono dict OpenFOAM (case.json,
    config.json - metadati interni, non letti da OpenFOAM). Quando
    class_name e' dato, antepone il FoamFile header obbligatorio;
    object/location si derivano dal path stesso, non serve ripeterli
    a ogni chiamata."""
    path.parent.mkdir(parents=True, exist_ok=True)

    if class_name is not None:
        header = foam_header(class_name, path.name, path.parent.name)
        content = header + content

    path.write_text(content, encoding="utf-8")


def generate_case_files(case_dir: Path, config: CaseConfig, meta: dict):
    solver = meta.get("solver", config.physics.solver)

    write_file(case_dir / "case.json", json.dumps(meta, indent=2))
    write_file(case_dir / "config.json", config.model_dump_json(indent=2))

    generate_control_dict(case_dir, config, solver)
    generate_fv_schemes(case_dir, solver)
    generate_fv_solution(case_dir, solver)
    generate_decompose_par_dict(case_dir, config)
    generate_block_mesh_dict(case_dir, config)

    if config.mesh.mesh_type == "snappyHexMesh" and config.mesh.stl_file:
        generate_snappy_hex_mesh_dict(case_dir, config)

    if is_compressible(solver):
        # thermophysicalProperties sostituisce transportProperties per i
        # solver compressibili: nu costante non esiste più, la
        # viscosità viene dal modello termodinamico.
        generate_thermophysical_properties(case_dir, config)
    else:
        generate_transport_properties(case_dir, config)

    generate_turbulence_properties(case_dir, config)

    write_U(case_dir, config)
    write_p(case_dir, config)

    if is_buoyant(solver):
        write_g(case_dir, config)
        write_T(case_dir, config)
        if not config.physics.laminar:
            write_alphat(case_dir, config)

    if not config.physics.laminar:
        write_turbulence_fields(case_dir, config)


def generate_control_dict(case_dir: Path, config: CaseConfig, solver: str):
    functions = []

    for fo in config.function_objects:
        if fo.type == "forces":
            functions.append(f"""    {fo.name}
    {{
        type            forces;
        libs            ("libforces.so");
        writeControl    timeStep;
        writeInterval   1;
        patches         ({' '.join(fo.patches)});
        rho             rhoInf;
        rhoInf          {fo.rho};
        CofR            {foam_vector(fo.origin)};
    }}""")

        if fo.type == "probes":
            probe_locations = "\n        ".join(
                foam_vector(p) for p in fo.probe_locations
            )
            functions.append(f"""    {fo.name}
    {{
        type            probes;
        libs            ("libsampling.so");
        writeControl    timeStep;
        writeInterval   1;
        fields          ({' '.join(fo.fields)});
        probeLocations
        (
            {probe_locations}
        );
    }}""")

        if fo.type == "wallHeatFlux":
            functions.append(f"""    {fo.name}
    {{
        type            wallHeatFlux;
        libs            ("libfieldFunctionObjects.so");
        patches         ({' '.join(fo.patches)});
        writeControl    timeStep;
        writeInterval   1;
    }}""")

    functions_block = "\n".join(functions)

    content = f"""application     {solver};

startFrom       latestTime;
startTime       0;

stopAt          endTime;
endTime         {config.physics.end_time};

deltaT          {config.physics.delta_t};

writeControl    timeStep;
writeInterval   {config.physics.write_interval};

purgeWrite      0;

writeFormat     ascii;
writePrecision  8;
writeCompression off;

timeFormat      general;
timePrecision   6;

runTimeModifiable true;

functions
{{
{functions_block}
}}
"""

    write_file(case_dir / "system/controlDict", content, "dictionary")


def generate_fv_schemes(case_dir: Path, solver: str):
    ddt_scheme = "steadyState" if solver in STEADY_STATE_SOLVERS else "Euler"
    compressible = is_compressible(solver)

    energy_div = (
        "    div(phi,h)      bounded Gauss upwind;\n"
        "    div(phi,e)      bounded Gauss upwind;\n"
        "    div(phi,K)      bounded Gauss upwind;\n"
        if compressible else ""
    )
    energy_laplacian = (
        "    laplacian(alphaEff,h) Gauss linear corrected;\n"
        if compressible else ""
    )

    content = f"""ddtSchemes
{{
    default         {ddt_scheme};
}}

gradSchemes
{{
    default         Gauss linear;
}}

divSchemes
{{
    default         none;
    div(phi,U)      bounded Gauss linearUpwind grad(U);
    div(phi,k)      bounded Gauss upwind;
    div(phi,omega)  bounded Gauss upwind;
    div(phi,epsilon) bounded Gauss upwind;
{energy_div}    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}}

laplacianSchemes
{{
    default         Gauss linear corrected;
{energy_laplacian}}}

interpolationSchemes
{{
    default         linear;
}}

snGradSchemes
{{
    default         corrected;
}}
"""

    write_file(case_dir / "system/fvSchemes", content, "dictionary")


def generate_fv_solution(case_dir: Path, solver: str):
    algorithm = solver_algorithm(solver)
    buoyant = is_buoyant(solver)
    compressible = is_compressible(solver)

    # ponytail: i solver buoyant risolvono p_rgh (pressione meno il
    # contributo idrostatico rho*g*h), non p direttamente - e' lo
    # standard OpenFOAM (vedi tutorial buoyantSimpleFoam/hotRoom), non
    # una scelta arbitraria. Senza questo blocco il solver non troverebbe
    # il solver lineare per la sua variabile di pressione e si fermerebbe
    # al primo timestep.
    pressure_field_name = "p_rgh" if buoyant else "p"
    pressure_block = f"""    {pressure_field_name}
    {{
        solver          GAMG;
        smoother        DICGaussSeidel;
        tolerance       1e-7;
        relTol          0.01;
    }}
"""
    if buoyant and algorithm == "PIMPLE":
        pressure_block += f"""    {pressure_field_name}Final
    {{
        $p_rgh;
        tolerance       1e-8;
        relTol          0;
    }}
"""

    energy_block = ""
    if compressible:
        energy_block = """    "(h|e)"
    {
        solver          smoothSolver;
        smoother        GaussSeidel;
        tolerance       1e-8;
        relTol          0.01;
    }

    rho
    {
        solver          diagonal;
    }
"""

    residual_energy = '        "(h|e)"        1e-6;\n' if compressible else ""
    relax_energy = "        h               0.7;\n" if compressible else ""

    algorithm_extra = "\n    consistent      no;" if buoyant else ""

    content = f"""solvers
{{
{pressure_block}
    U
    {{
        solver          smoothSolver;
        smoother        GaussSeidel;
        tolerance       1e-8;
        relTol          0;
    }}

    "(k|omega|epsilon|nuTilda)"
    {{
        solver          smoothSolver;
        smoother        GaussSeidel;
        tolerance       1e-8;
        relTol          0;
    }}
{energy_block}}}

{algorithm}
{{
    nNonOrthogonalCorrectors 0;
    pRefCell        0;
    pRefValue       0;{algorithm_extra}

    residualControl
    {{
        {pressure_field_name}               1e-5;
        U               1e-5;
        "(k|omega|epsilon|nuTilda)" 1e-5;
{residual_energy}    }}
}}

relaxationFactors
{{
    fields
    {{
        {pressure_field_name}               0.3;
    }}
    equations
    {{
        U               0.7;
        k               0.7;
        omega           0.7;
        epsilon         0.7;
{relax_energy}    }}
}}
"""

    write_file(case_dir / "system/fvSolution", content, "dictionary")


def generate_decompose_par_dict(case_dir: Path, config: CaseConfig):
    n = max(1, int(config.mesh.processors))

    content = f"""numberOfSubdomains {n};

method          scotch;

distributed     no;

roots           ( );
"""

    write_file(case_dir / "system/decomposeParDict", content, "dictionary")


def generate_block_mesh_dict(case_dir: Path, config: CaseConfig):
    xmin, ymin, zmin = config.mesh.domain_min
    xmax, ymax, zmax = config.mesh.domain_max
    nx, ny, nz = config.mesh.cells

    vertices = [
        (xmin, ymin, zmin),
        (xmax, ymin, zmin),
        (xmax, ymax, zmin),
        (xmin, ymax, zmin),
        (xmin, ymin, zmax),
        (xmax, ymin, zmax),
        (xmax, ymax, zmax),
        (xmin, ymax, zmax),
    ]

    vertex_lines = "\n".join(
        f"    ({x} {y} {z})" for x, y, z in vertices
    )

    content = f"""convertToMeters 1;

vertices
(
{vertex_lines}
);

blocks
(
    hex (0 1 2 3 4 5 6 7) ({nx} {ny} {nz}) simpleGrading (1 1 1)
);

edges
(
);

boundary
(
    inlet
    {{
        type patch;
        faces
        (
            (0 4 7 3)
        );
    }}

    outlet
    {{
        type patch;
        faces
        (
            (1 2 6 5)
        );
    }}

    walls
    {{
        type wall;
        faces
        (
            (0 1 5 4)
            (2 3 7 6)
            (0 3 2 1)
            (4 5 6 7)
        );
    }}
);

mergePatchPairs
(
);
"""

    write_file(case_dir / "system/blockMeshDict", content, "dictionary")


def generate_snappy_hex_mesh_dict(case_dir: Path, config: CaseConfig):
    stl_name = Path(config.mesh.stl_file).name
    location = foam_vector(config.mesh.location_in_mesh)
    level = config.mesh.surface_refinement

    # ponytail: se non sono state definite fasce di raffinamento graduato,
    # comportamento identico a prima (un livello costante vicino alla
    # geometria) - non rompo case esistenti che non usano questo campo.
    if config.mesh.refinement_distances:
        levels_str = " ".join(
            f"({d.distance} {d.level})" for d in config.mesh.refinement_distances
        )
        geometry_refinement_region = f"""    geometry
    {{
        mode distance;
        levels ({levels_str});
    }}
"""
    else:
        geometry_refinement_region = ""

    box_geometry_entries = ""
    box_refinement_regions = ""
    for box in config.mesh.refinement_boxes:
        box_min = foam_vector(box.min)
        box_max = foam_vector(box.max)
        box_geometry_entries += f"""    {box.name}
    {{
        type searchableBox;
        min {box_min};
        max {box_max};
    }}
"""
        box_refinement_regions += f"""    {box.name}
    {{
        mode inside;
        levels ((1e15 {box.level}));
    }}
"""

    content = f"""castellatedMesh true;
snap            true;
addLayers       {'true' if config.mesh.layers > 0 else 'false'};

geometry
{{
    {stl_name}
    {{
        type triSurfaceMesh;
        name geometry;
    }}
{box_geometry_entries}}};

castellatedMeshControls
{{
    maxLocalCells       2000000;
    maxGlobalCells      10000000;
    minRefinementCells  10;
    maxLoadUnbalance    0.10;
    nCellsBetweenLevels 3;

    features
    (
    );

    refinementSurfaces
    {{
        geometry
        {{
            level ({level} {level});
        }}
    }}

    resolveFeatureAngle 30;

    refinementRegions
    {{
{geometry_refinement_region}{box_refinement_regions}    }}

    locationInMesh {location};

    allowFreeStandingZoneFaces true;
}}

snapControls
{{
    nSmoothPatch    3;
    tolerance       2.0;
    nSolveIter      30;
    nRelaxIter      5;
    nFeatureSnapIter 10;
    explicitFeatures false;
}}

addLayersControls
{{
    relativeSizes   true;

    layers
    {{
        geometry
        {{
            nSurfaceLayers {config.mesh.layers};
        }}
    }}

    expansionRatio      {config.mesh.growth_ratio};
    finalLayerThickness 0.3;
    minThickness        0.1;
    nGrow               0;

    featureAngle        60;
    slipFeatureAngle    30;
    nRelaxIter          3;
    nSmoothSurfaceNormals 1;
    nSmoothNormals      3;
    nSmoothThickness    10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedianAxisAngle  90;
    nBufferCellsNoExtrude 0;
    nLayerIter          50;
}}

meshQualityControls
{{
    maxNonOrtho       65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave        80;
    minFlatness       0.5;
    minVol            1e-13;
    minTetQuality     1e-30;
    minArea           -1;
    minTwist          0.02;
    minDeterminant    0.001;
    minFaceWeight     0.05;
    minVolRatio       0.01;
    minTriangleTwist  -1;

    nSmoothScale      4;
    errorReduction    0.75;
}}

debug 0;

mergeTolerance 1e-6;
"""

    write_file(case_dir / "system/snappyHexMeshDict", content, "dictionary")


def generate_transport_properties(case_dir: Path, config: CaseConfig):
    content = f"""transportModel  Newtonian;

nu              [0 2 -1 0 0 0 0] {config.physics.nu};
"""

    write_file(case_dir / "constant/transportProperties", content, "dictionary")


def generate_thermophysical_properties(case_dir: Path, config: CaseConfig):
    """Solo per solver compressibili/buoyant. Struttura standard
    heRhoThermo/pureMixture/const/hConst/perfectGas/sensibleEnthalpy:
    è la stessa usata nel tutorial ufficiale buoyantSimpleFoam/hotRoom,
    stabile da molte versioni di OpenFOAM. perfectGas richiede un gas
    (aria): per liquidi il validator su PhysicsConfig blocca prima che
    si arrivi qui.
    """
    mu_dynamic = config.physics.nu * config.physics.rho

    content = f"""thermoType
{{
    type            heRhoThermo;
    mixture         pureMixture;
    transport       const;
    thermo          hConst;
    equationOfState perfectGas;
    specie          specie;
    energy          sensibleEnthalpy;
}}

mixture
{{
    specie
    {{
        molWeight   28.9;
    }}
    thermodynamics
    {{
        Cp          1005;
        Hf          0;
    }}
    transport
    {{
        mu          {mu_dynamic};
        Pr          0.7;
    }}
}}
"""

    write_file(case_dir / "constant/thermophysicalProperties", content, "dictionary")


def generate_turbulence_properties(case_dir: Path, config: CaseConfig):
    if config.physics.laminar:
        simulation = "laminar"
        block = ""
    else:
        simulation = "RAS"
        block = f"""RAS
{{
    RASModel        {config.physics.turbulence};
    turbulence      on;
    printCoeffs     on;
}}
"""

    content = f"""simulationType  {simulation};

{block}
"""

    write_file(case_dir / "constant/turbulenceProperties", content, "dictionary")

