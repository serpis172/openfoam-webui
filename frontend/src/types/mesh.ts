export type MeshType = 'blockMesh' | 'snappyHexMesh' | 'cfMesh'

export interface MeshSettings {
  meshType: MeshType
  globalSize: number
  surfaceRefinement: number
  volumeRefinement: number
  boundaryLayers: number
  firstLayerThickness: number
  growthRatio: number
  processors: number
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  cells: [number, number, number]
}

export interface MeshQuality {
  cells: number
  points: number
  faces: number
  maxSkewness: number
  maxNonOrthogonality: number
  maxAspectRatio: number
  minYPlus?: number
  maxYPlus?: number
  estimatedMemory: string
  estimatedRuntime: string
}

export type MeshStatus = 'not_generated' | 'generating' | 'ready' | 'error'