export interface CaseMeta {
  id: string
  name: string
  solver: string
  description?: string
  created_at?: string
  updated_at?: string
  last_job_id?: string | null
}

export interface CaseListResponse {
  items: CaseMeta[]
  total: number
  page: number
  size: number
}

export interface BoundaryCondition {
  name: string
  patch_type: string
  U_type: string
  U_value: number[]
  p_type: string
  p_value: number
  k_type: string
  k_value: number
  omega_type: string
  omega_value: number
}

export interface MeshSettings {
  mesh_type: string
  domain_min: number[]
  domain_max: number[]
  cells: number[]
  stl_file: string
  location_in_mesh: number[]
  surface_refinement: number
  refinement_levels: number
  layers: number
  first_layer_thickness: number
  growth_ratio: number
  processors: number
}

export interface PhysicsConfig {
  solver: string
  fluid: string
  nu: number
  rho: number
  turbulence: string
  laminar: boolean
  velocity: number[]
  pressure: number
  end_time: number
  write_interval: number
  delta_t: number
}

export interface FunctionObject {
  type: string
  name: string
  patches: string[]
  fields: string[]
  rho: number
  origin: number[]
  probe_locations: number[][]
}

export interface RunSettings {
  clean_start: boolean
  vtk_all_times: boolean
  run_check_mesh: boolean
}

export interface CaseConfig {
  physics: PhysicsConfig
  boundaries: BoundaryCondition[]
  mesh: MeshSettings
  function_objects: FunctionObject[]
  run: RunSettings
}

export interface JobStatus {
  job_id: string
  state: string
  info: {
    step?: string
    message?: string
    [key: string]: any
  }
}