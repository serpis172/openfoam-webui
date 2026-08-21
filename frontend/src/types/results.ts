export interface ResultVariable {
  name: string
  label: string
  units: string
  min: number
  max: number
  type: 'scalar' | 'vector'
}

export interface SliceConfig {
  id: string
  normal: 'X' | 'Y' | 'Z'
  position: number
  visible: boolean
}

export interface StreamlineConfig {
  seedPoints: number
  maxLines: number
  visible: boolean
}

export interface ResultsConfig {
  variable: string
  colormap: string
  min: number
  max: number
  slices: SliceConfig[]
  streamlines: StreamlineConfig
  showVectors: boolean
  vectorScale: number
}