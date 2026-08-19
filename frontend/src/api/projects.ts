import { get, post, del } from './client'
import type { Project, ProjectListResponse, CreateProjectRequest } from '@/types/project'

export const projectsApi = {
  list: (params?: { q?: string; page?: number; size?: number }) =>
    get<ProjectListResponse>('/cases/', params),

  get: (id: string) =>
    get<{ meta: Project; config: any }>(`/cases/${id}`),

  create: (data: CreateProjectRequest) =>
    post<Project>('/cases/', data),

  delete: (id: string) =>
    del<{ status: string }>(`/cases/${id}`),

  clone: (id: string, newName: string) =>
    post<Project>(`/cases/${id}/clone?new_name=${encodeURIComponent(newName)}`),

  updateConfig: (id: string, config: any) =>
    post<{ status: string }>(`/cases/${id}/config`, config),

  validate: (id: string) =>
    post<{ valid: boolean; errors: string[]; warnings: string[] }>(`/validation/${id}/validate`),
}