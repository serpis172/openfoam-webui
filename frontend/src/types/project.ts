export type ProjectStatus = 'draft' | 'ready' | 'running' | 'completed' | 'failed'

export interface Project {
  id: string
  name: string
  description?: string
  solver: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
  thumbnailUrl?: string
  tags: string[]
  lastRunId?: string
  owner?: string
}

export interface ProjectListResponse {
  items: Project[]
  total: number
  page: number
  size: number
}

export interface CreateProjectRequest {
  name: string
  description?: string
  solver?: string
  template?: string
}