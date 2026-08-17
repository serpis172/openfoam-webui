import json
from pathlib import Path
from app.models import CaseConfig, BoundaryCondition


def foam_vector(values) -> str:
    return "(" + " ".join(str(v) for v in values) + ")"


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

    generate_transport_properties(case_dir, config)
    generate_turbulence_properties(case_dir, config)

    generate_U(case_dir, config)
    generate_p(case_dir, config)

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
    ddt_scheme = "steadyState" if solver == "simpleFoam" else "Euler"

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
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}}

laplacianSchemes
{{
    default         Gauss linear corrected;
}}

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
    algorithm = "SIMPLE" if solver == "simpleFoam" else "PIMPLE"

    content = f"""solvers
{{
    p
    {{
        solver          GAMG;
        smoother        DICGaussSeidel;
        tolerance       1e-7;
        relTol          0.01;
    }}

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
}}

{algorithm}
{{
    nNonOrthogonalCorrectors 0;
    pRefCell        0;
    pRefValue       0;

    residualControl
    {{
        p               1e-5;
        U               1e-5;
        "(k|omega|epsilon|nuTilda)" 1e-5;
    }}
}}

relaxationFactors
{{
    fields
    {{
        p               0.3;
    }}
    equations
    {{
        U               0.7;
        k               0.7;
        omega           0.7;
        epsilon         0.7;
    }}
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
}};

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
    }}

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


def boundary_field_p(config: CaseConfig) -> str:
    entries = []

    for bc in config.boundaries:
        entry = f"{bc.name}\n{{\n"

        if bc.p_type == "fixedValue":
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
    content = f"""dimensions      [0 2 -2 0 0 0 0];

internalField   uniform {config.physics.pressure};

boundaryField
{{
{boundary_field_p(config)}
}}
"""

    write_file(case_dir / "0/p", content)


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