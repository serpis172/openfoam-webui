export type AnalysisType = 'steady' | 'transient'
export type Compressibility = 'incompressible' | 'compressible'
export type ThermalMode = 'isothermal' | 'heatTransfer'
export type TurbulenceModel = 'laminar' | 'kEpsilon' | 'kOmegaSST' | 'SpalartAllmaras' | 'LES'

export interface PhysicsConfig {
  analysisType: AnalysisType
  compressibility: Compressibility
  thermal: ThermalMode
  turbulenceModel: TurbulenceModel
  solver: string
  materialId: string
  gravity?: [number, number, number]
  referenceValues?: {
    velocity: number
    length: number
    density: number
    viscosity: number
  }
}

export interface Material {
  id: string
  name: string
  type: 'fluid' | 'solid'
  density: number
  viscosity?: number
  kinematicViscosity?: number
  thermalConductivity?: number
  specificHeat?: number
  equationOfState?: string
}