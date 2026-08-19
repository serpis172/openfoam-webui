export type BCType = 
  | 'velocityInlet'
  | 'pressureInlet'
  | 'pressureOutlet'
  | 'flowRateInlet'
  | 'wall'
  | 'movingWall'
  | 'noSlipWall'
  | 'slipWall'
  | 'symmetry'
  | 'cyclic'
  | 'empty'
  | 'wedge'

export interface BoundaryCondition {
  id: string
  name: string
  patchName: string
  type: BCType
  parameters: Record<string, unknown>
  faceIds: string[]
  color: string
  valid: boolean
  errors: string[]
}

export interface BCPreset {
  id: string
  name: string
  description: string
  conditions: Partial<BoundaryCondition>[]
}