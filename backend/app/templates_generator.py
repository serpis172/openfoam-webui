import json
from pathlib import Path
from app.models import CaseConfig, BoundaryCondition


def foam_vector(values) -> str:
    return "(" + " ".join(str(v) for v in values) + ")"


# ponytail: "SIMPLE if solver=='simpleFoam' else PIMPLE" era sbagliato
# per metà della whitelist - rhoSimpleFoam/buoyantSimpleFoam sono
# steady-state (SIMPLE) esattamente come simpleFoam, ma finivano con un
# blocco PIMPLE nel fvSolution (nome algoritmo sbagliato, il solver si
# sarebbe rifiutato di leggere il dict all'avvio).
STEADY_STATE_SOLVERS = {"simpleFoam", "rhoSimpleFoam", "buoyantSimpleFoam"}
BUOYANT_SOLVERS = {"buoyantSimpleFoam", "buoyantPimpleFoam"}
COMPRESSIBLE_SOLVERS = {"rhoSimpleFoam", "rhoPimpleFoam", "buoyantSimpleFoam", "buoyantPimpleFoam"}


def solver_algorithm(solver: str) -> str:
    return "SIMPLE" if solver in STEADY_STATE_SOLVERS else "PIMPLE"


def is_buoyant(solver: str) -> bool:
    return solver in BUOYANT_SOLVERS


def is_compressible(solver: str) -> bool:
    return solver in COMPRESSIBLE_SOLVERS


def write_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
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

    generate_U(case_dir, config)
    generate_p(case_dir, config)

    if is_buoyant(solver):
        generate_g(case_dir, config)
        generate_T(case_dir, config)
        if not config.physics.laminar:
            generate_alphat(case_dir, config)

    if not config.physics.laminar:
        generate_turbulence_fields(case_dir, config, solver)


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

    write_file(case_dir / "system/controlDict", content)


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

    write_file(case_dir / "system/fvSchemes", content)


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

    write_file(case_dir / "system/fvSolution", content)


def generate_decompose_par_dict(case_dir: Path, config: CaseConfig):
    n = max(1, int(config.mesh.processors))

    content = f"""numberOfSubdomains {n};

method          scotch;

distributed     no;

roots           ( );
"""

    write_file(case_dir / "system/decomposeParDict", content)


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

    write_file(case_dir / "system/blockMeshDict", content)


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

    write_file(case_dir / "system/snappyHexMeshDict", content)


def generate_transport_properties(case_dir: Path, config: CaseConfig):
    content = f"""transportModel  Newtonian;

nu              [0 2 -1 0 0 0 0] {config.physics.nu};
"""

    write_file(case_dir / "constant/transportProperties", content)


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

    write_file(case_dir / "constant/thermophysicalProperties", content)


def generate_g(case_dir: Path, config: CaseConfig):
    content = f"""dimensions      [0 1 -2 0 0 0 0];
value           {foam_vector(config.physics.gravity)};
"""
    write_file(case_dir / "constant/g", content)


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

    write_file(case_dir / "constant/turbulenceProperties", content)


def boundary_field_U(config: CaseConfig) -> str:
    entries = []

    for bc in config.boundaries:
        entry = f"{bc.name}\n{{\n"

        if bc.U_type == "fixedValue":
            entry += "    type fixedValue;\n"
            entry += f"    value uniform {foam_vector(bc.U_value)};\n"
        elif bc.U_type == "noSlip":
            entry += "    type noSlip;\n"
        elif bc.U_type == "slip":
            entry += "    type slip;\n"
        elif bc.U_type == "zeroGradient":
            entry += "    type zeroGradient;\n"
        elif bc.U_type == "inletOutlet":
            entry += "    type inletOutlet;\n"
            entry += f"    inletValue uniform {foam_vector(bc.U_value)};\n"
            entry += f"    value uniform {foam_vector(bc.U_value)};\n"
        else:
            entry += "    type zeroGradient;\n"

        entry += "}\n"
        entries.append(entry)

    return "\n".join(entries)


def boundary_field_p(config: CaseConfig, calculated: bool = False) -> str:
    entries = []

    for bc in config.boundaries:
        entry = f"{bc.name}\n{{\n"

        if calculated:
            # per 0/p (assoluto) quando il solver risolve p_rgh: p viene
            # ricalcolato dal solver ad ogni iterazione, tranne dove
            # serve un valore esplicito (patch a pressione fissa).
            if bc.p_type == "fixedValue":
                entry += "    type calculated;\n"
                entry += f"    value uniform {bc.p_value};\n"
            else:
                entry += "    type calculated;\n"
                entry += "    value uniform 0;\n"
        elif bc.p_type == "fixedValue":
            entry += "    type fixedValue;\n"
            entry += f"    value uniform {bc.p_value};\n"
        elif bc.p_type == "zeroGradient":
            entry += "    type zeroGradient;\n"
        else:
            entry += "    type zeroGradient;\n"

        entry += "}\n"
        entries.append(entry)

    return "\n".join(entries)


def boundary_field_scalar(config: CaseConfig, field: str) -> str:
    entries = []

    for bc in config.boundaries:
        entry = f"{bc.name}\n{{\n"

        if bc.patch_type == "wall":
            if field == "k":
                entry += "    type kqRWallFunction;\n"
                entry += f"    value uniform {bc.k_value};\n"
            elif field == "omega":
                entry += "    type omegaWallFunction;\n"
                entry += f"    value uniform {bc.omega_value};\n"
            else:
                entry += "    type zeroGradient;\n"
        else:
            if field == "k":
                entry += f"    type {bc.k_type};\n"
                entry += f"    value uniform {bc.k_value};\n"
            elif field == "omega":
                entry += f"    type {bc.omega_type};\n"
                entry += f"    value uniform {bc.omega_value};\n"

        entry += "}\n"
        entries.append(entry)

    return "\n".join(entries)


def boundary_field_T(config: CaseConfig) -> str:
    """fixedValue = temperatura imposta (parete calda/fredda, es. le
    alette di un radiatore, o un flusso in ingresso a temperatura nota).
    zeroGradient = adiabatica/nessuno scambio. inletOutlet = si comporta
    come un ingresso quando il flusso entra, zeroGradient quando esce
    (utile su outlet dove non si vuole imporre una temperatura fissa)."""
    entries = []

    for bc in config.boundaries:
        entry = f"{bc.name}\n{{\n"

        if bc.T_type == "fixedValue":
            entry += "    type fixedValue;\n"
            entry += f"    value uniform {bc.T_value};\n"
        elif bc.T_type == "inletOutlet":
            entry += "    type inletOutlet;\n"
            entry += f"    inletValue uniform {bc.T_value};\n"
            entry += f"    value uniform {bc.T_value};\n"
        else:
            entry += "    type zeroGradient;\n"

        entry += "}\n"
        entries.append(entry)

    return "\n".join(entries)


def generate_U(case_dir: Path, config: CaseConfig):
    internal = foam_vector(config.physics.velocity)

    content = f"""dimensions      [0 1 -1 0 0 0 0];

internalField   uniform {internal};

boundaryField
{{
{boundary_field_U(config)}
}}
"""

    write_file(case_dir / "0/U", content)


def generate_p(case_dir: Path, config: CaseConfig):
    if is_buoyant(config.physics.solver):
        # ponytail: i solver buoyant risolvono p_rgh e derivano p a
        # runtime (p = p_rgh + rho*g*h), ma vogliono comunque trovare
        # 0/p_rgh in avvio E un 0/p iniziale coerente per le condizioni
        # al contorno che referenziano la pressione assoluta - struttura
        # identica al tutorial ufficiale buoyantSimpleFoam/hotRoom.
        p_rgh_content = f"""dimensions      [1 -1 -2 0 0 0 0];

internalField   uniform {config.physics.pressure};

boundaryField
{{
{boundary_field_p(config)}
}}
"""
        write_file(case_dir / "0/p_rgh", p_rgh_content)

        p_content = f"""dimensions      [1 -1 -2 0 0 0 0];

internalField   uniform {config.physics.pressure};

boundaryField
{{
{boundary_field_p(config, calculated=True)}
}}
"""
        write_file(case_dir / "0/p", p_content)
        return

    content = f"""dimensions      [0 2 -2 0 0 0 0];

internalField   uniform {config.physics.pressure};

boundaryField
{{
{boundary_field_p(config)}
}}
"""

    write_file(case_dir / "0/p", content)


def generate_T(case_dir: Path, config: CaseConfig):
    """Solo per solver con scambio termico. Senza questo file
    buoyantSimpleFoam/buoyantPimpleFoam non partono nemmeno (il campo T
    e' obbligatorio per risolvere l'equazione dell'energia)."""
    content = f"""dimensions      [0 0 0 1 0 0 0];

internalField   uniform {config.physics.temperature};

boundaryField
{{
{boundary_field_T(config)}
}}
"""
    write_file(case_dir / "0/T", content)


def generate_alphat(case_dir: Path, config: CaseConfig):
    """Diffusività termica turbolenta: richiesta da qualunque solver
    compressibile con turbolenza RAS attiva. Senza, i solver buoyant si
    fermano subito cercando 0/alphat che non esiste."""
    entries = []
    for bc in config.boundaries:
        entry = f"{bc.name}\n{{\n"
        if bc.patch_type == "wall":
            entry += "    type alphatJayatillekeWallFunction;\n"
            entry += "    Prt 0.85;\n"
            entry += "    value uniform 0;\n"
        else:
            entry += "    type calculated;\n"
            entry += "    value uniform 0;\n"
        entry += "}\n"
        entries.append(entry)

    content = f"""dimensions      [1 -1 -1 0 0 0 0];

internalField   uniform 0;

boundaryField
{{
{chr(10).join(entries)}
}}
"""
    write_file(case_dir / "0/alphat", content)


def generate_turbulence_fields(case_dir: Path, config: CaseConfig, solver: str):
    if config.physics.turbulence in ["kOmegaSST", "kEpsilon"]:
        k_content = f"""dimensions      [0 2 -2 0 0 0 0];

internalField   uniform 0.1;

boundaryField
{{
{boundary_field_scalar(config, 'k')}
}}
"""
        write_file(case_dir / "0/k", k_content)

        omega_content = f"""dimensions      [0 0 -1 0 0 0 0];

internalField   uniform 1.0;

boundaryField
{{
{boundary_field_scalar(config, 'omega')}
}}
"""
        write_file(case_dir / "0/omega", omega_content)