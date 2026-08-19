export type RunStatus = 
  | 'queued' 
  | 'preparing' 
  | 'meshing' 
  | 'running' 
  | 'postprocessing'
  | 'completed' 
  | 'failed' 
  | 'cancelled'

export interface Run {
  id: string
  projectId: string
  status: RunStatus
  progress: number
  currentStep: string
  cores: number
  startedAt?: string
  finishedAt?: string
  duration?: number
  logsUrl?: string
  resultsUrl?: string
  error?: string
}

export interface Residuals {
  Ux: number[]
  Uy: number[]
  Uz: number[]
  p: number[]
  k: number[]
  omega: number[]
  epsilon: number[]
}

export interface RunMetrics {
  residuals: Residuals
  forces?: {
    drag: number[]
    lift: number[]
    moment: number[]
  }
  continuityErrors: number[]
  courantNumbers?: number[]
  timeStep?: number[]
}