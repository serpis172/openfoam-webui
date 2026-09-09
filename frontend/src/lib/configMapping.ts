import type { MeshSettings } from '@/types/mesh'
import type { PhysicsConfig } from '@/types/physics'
import type { BoundaryCondition } from '@/types/boundaryConditions'
import { getMaterial } from '@/lib/materials'

// Deve restare sincronizzato con backend/app/models.py ALLOWED_SOLVERS
// e ALLOWED_TURBULENCE_MODELS: il backend rifiuta (422) qualunque cosa
// fuori da questi due insiemi, per bloccare injection nei dict OpenFOAM.
const BACKEND_ALLOWED_SOLVERS = new Set([
  'simpleFoam', 'pimpleFoam', 'interFoam', 'pisoFoam', 'icoFoam',
  'rhoSimpleFoam', 'rhoPimpleFoam', 'buoyantSimpleFoam', 'buoyantPimpleFoam',
])

const TURBULENCE_MODEL_MAP: Record<string, string> = {
  kOmegaSST: 'kOmegaSST',
  kEpsilon: 'kEpsilon',
  SpalartAllmaras: 'SpalartAllmaras',
  // 'LES' non e' un RASModel: in OpenFOAM richiede un simulationType e
  // un dict turbulenceProperties strutturati diversamente. Non ancora
  // supportato: chi lo seleziona viene bloccato con un messaggio chiaro
  // invece di mandare una config che il worker interpreterebbe male.
}

// Le proprietà materiale vengono da materials.ts (frontend/src/lib), la
// stessa lista che popola MaterialSelector.tsx: prima erano due copie
// diverse ("Olio" esisteva nella UI ma non qui sotto, e cadeva
// silenziosamente sui valori dell'Aria).

export class ConfigMappingError extends Error {}

function toSnakeVector(v: [number, number, number]): number[] {
  return [v[0], v[1], v[2]]
}

export function mapPhysicsConfig(physics: PhysicsConfig) {
  if (!BACKEND_ALLOWED_SOLVERS.has(physics.solver)) {
    throw new ConfigMappingError(`Solver "${physics.solver}" non supportato dal backend.`)
  }

  const BUOYANT_SOLVERS_LOCAL = new Set(['buoyantSimpleFoam', 'buoyantPimpleFoam'])
  if (BUOYANT_SOLVERS_LOCAL.has(physics.solver) && physics.materialId !== 'air') {
    // ponytail: stesso vincolo del backend (models.py), replicato qui
    // per un feedback immediato invece di scoprirlo solo al salvataggio.
    // I solver buoyant qui usano equationOfState perfectGas (valido per
    // un gas): un liquido richiederebbe un modello Boussinesq con un
    // coefficiente di dilatazione termica che questa UI non raccoglie.
    throw new ConfigMappingError(
      `Il solver ${physics.solver} (scambio termico) supporta solo Aria come fluido: ${physics.materialId} richiederebbe un modello non ancora implementato.`
    )
  }

  const turbulence = physics.turbulenceModel === 'laminar'
    ? 'kOmegaSST' // valore placeholder, ignorato quando laminar=true
    : TURBULENCE_MODEL_MAP[physics.turbulenceModel]

  if (!turbulence) {
    throw new ConfigMappingError(
      `Modello di turbolenza "${physics.turbulenceModel}" non ancora supportato dal backend.`
    )
  }

  const material = getMaterial(physics.materialId)

  return {
    solver: physics.solver,
    fluid: physics.materialId,
    nu: physics.referenceValues?.viscosity ?? material.kinematicViscosity ?? 1.5e-5,
    rho: physics.referenceValues?.density ?? material.density,
    turbulence,
    laminar: physics.turbulenceModel === 'laminar',
    velocity: physics.referenceValues ? [physics.referenceValues.velocity, 0, 0] : [10, 0, 0],
    pressure: 0,
    temperature: physics.temperature ?? 300,
    gravity: physics.gravity ?? [0, 0, -9.81],
    end_time: 1000,
    write_interval: 100,
    delta_t: 1,
  }
}

export function mapMeshSettings(mesh: MeshSettings, stlFileName?: string) {
  if (mesh.meshType === 'cfMesh') {
    throw new ConfigMappingError(
      'cfMesh non è ancora implementato lato worker: usa blockMesh o snappyHexMesh.'
    )
  }

  return {
    mesh_type: mesh.meshType,
    domain_min: toSnakeVector(mesh.domainMin),
    domain_max: toSnakeVector(mesh.domainMax),
    cells: toSnakeVector(mesh.cells).map(Math.round),
    stl_file: stlFileName ?? '',
    location_in_mesh: [0, 0, 0],
    surface_refinement: mesh.surfaceRefinement,
    refinement_levels: mesh.volumeRefinement,
    layers: mesh.boundaryLayers,
    first_layer_thickness: mesh.firstLayerThickness,
    growth_ratio: mesh.growthRatio,
    processors: mesh.processors,
    refinement_distances: mesh.refinementDistances.map(d => ({
      distance: d.distance,
      level: d.level,
    })),
    refinement_boxes: mesh.refinementBoxes.map(b => ({
      name: b.name,
      min: [...b.min],
      max: [...b.max],
      level: b.level,
    })),
  }
}

const BC_TYPE_MAP: Record<string, { U_type: string; p_type: string }> = {
  velocityInlet: { U_type: 'fixedValue', p_type: 'zeroGradient' },
  pressureInlet: { U_type: 'zeroGradient', p_type: 'fixedValue' },
  pressureOutlet: { U_type: 'zeroGradient', p_type: 'fixedValue' },
  flowRateInlet: { U_type: 'fixedValue', p_type: 'zeroGradient' },
  wall: { U_type: 'noSlip', p_type: 'zeroGradient' },
  movingWall: { U_type: 'movingWallVelocity', p_type: 'zeroGradient' },
  noSlipWall: { U_type: 'noSlip', p_type: 'zeroGradient' },
  slipWall: { U_type: 'slip', p_type: 'zeroGradient' },
  symmetry: { U_type: 'symmetry', p_type: 'symmetry' },
  cyclic: { U_type: 'cyclic', p_type: 'cyclic' },
  empty: { U_type: 'empty', p_type: 'empty' },
  wedge: { U_type: 'wedge', p_type: 'wedge' },
}

export function mapBoundaryConditions(boundaries: BoundaryCondition[]) {
  const cyclicWithoutPair = boundaries.find(bc => bc.type === 'cyclic')
  if (cyclicWithoutPair) {
    // ponytail: OpenFOAM richiede che un patch "cyclic" dichiari il suo
    // neighbourPatch accoppiato nel boundary file - la UI qui non
    // raccoglie quell'accoppiamento. Meglio bloccare con un errore
    // chiaro che scrivere un boundary file che il solver rifiuta a
    // runtime con un messaggio criptico.
    throw new ConfigMappingError(
      `La boundary condition "${cyclicWithoutPair.name}" è di tipo cyclic, non ancora supportato: richiede un neighbourPatch accoppiato che questa UI non permette ancora di configurare. Usa un altro tipo.`
    )
  }

  return boundaries.map(bc => {
    const mapped = BC_TYPE_MAP[bc.type] ?? { U_type: 'zeroGradient', p_type: 'zeroGradient' }
    const velocity = (bc.parameters?.velocity as number[]) ?? [0, 0, 0]

    let patchType = 'patch'
    if (bc.type === 'wall' || bc.type === 'movingWall' || bc.type === 'noSlipWall' || bc.type === 'slipWall') {
      patchType = 'wall'
    } else if (bc.type === 'symmetry') {
      patchType = 'symmetry'
    } else if (bc.type === 'empty') {
      patchType = 'empty'
    } else if (bc.type === 'wedge') {
      patchType = 'wedge'
    }

    // Temperatura: presente solo se l'utente l'ha impostata in
    // BCEditDialog (parete calda/fredda, o temperatura di un flusso in
    // ingresso). Default onesto: zeroGradient (adiabatica, nessuno
    // scambio termico), non un valore inventato.
    const temperatureType = (bc.parameters?.temperatureType as string) ?? 'zeroGradient'
    const temperatureValue = (bc.parameters?.temperature as number) ?? 300

    return {
      name: bc.patchName || bc.name,
      patch_type: patchType,
      U_type: mapped.U_type,
      U_value: velocity,
      p_type: mapped.p_type,
      p_value: (bc.parameters?.pressure as number) ?? 0,
      T_type: temperatureType,
      T_value: temperatureValue,
      k_type: 'fixedValue',
      k_value: 0.1,
      omega_type: 'fixedValue',
      omega_value: 1,
    }
  })
}

const BUOYANT_SOLVERS = new Set(['buoyantSimpleFoam', 'buoyantPimpleFoam'])

export function buildCaseConfig(input: {
  physics: PhysicsConfig
  mesh: MeshSettings
  boundaries: BoundaryCondition[]
  stlFileName?: string
}) {
  const wallPatchNames = input.boundaries
    .filter(bc => bc.type === 'wall' || bc.type === 'movingWall' || bc.type === 'noSlipWall' || bc.type === 'slipWall')
    .map(bc => bc.patchName || bc.name)

  // ponytail: report del calore scambiato alle pareti attivato in
  // automatico per i solver termici, non serve un pannello dedicato
  // per una cosa che ha senso sempre in questo caso - se non ci sono
  // pareti non viene aggiunto nulla di inutile.
  const functionObjects = (BUOYANT_SOLVERS.has(input.physics.solver) && wallPatchNames.length > 0)
    ? [{ type: 'wallHeatFlux', name: 'wallHeatFlux', patches: wallPatchNames, fields: [], rho: 1.225, origin: [0, 0, 0], probe_locations: [] }]
    : []

  return {
    physics: mapPhysicsConfig(input.physics),
    mesh: mapMeshSettings(input.mesh, input.stlFileName),
    boundaries: mapBoundaryConditions(input.boundaries),
    function_objects: functionObjects,
    run: { clean_start: true, vtk_all_times: false, run_check_mesh: true },
  }
}
