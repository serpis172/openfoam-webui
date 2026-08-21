export interface GeometryFile {
  id: string
  name: string
  path: string
  size: number
  format: 'stl' | 'obj' | 'step' | 'vtk'
  uploadedAt: string
  status: 'uploading' | 'processing' | 'ready' | 'error'
}

export interface GeometryStats {
  vertices: number
  faces: number
  edges: number
  volume?: number
  surfaceArea?: number
  boundingBox: {
    min: [number, number, number]
    max: [number, number, number]
  }
}

export interface GeometryValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}