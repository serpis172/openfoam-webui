import { get, post, del } from './client'
import type { Project, ProjectListResponse, CreateProjectRequest } from '@/types/project'

interface RawCaseMeta {
  id: string
  name: string
  solver: string
  description?: string
  created_at: string
  updated_at: string
  last_job_id?: string | null
}

// ponytail: il backend (CaseMeta in models.py) non ha mai avuto un
// campo "status", "createdAt" o "tags" - il frontend leggeva
// project.status/createdAt direttamente dalla risposta grezza e otteneva
// sempre undefined (StatusBadge con stato sconosciuto, "Invalid Date"
// ovunque). Normalizzo qui, un solo punto.
function normalizeProject(raw: RawCaseMeta): Project {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    solver: raw.solver,
    // Il backend non traccia uno stato "vivo" del progetto (solo
    // l'ultimo job_id). Calcolare running/completed/failed per davvero
    // richiederebbe interrogare Celery per OGNI progetto in lista (N+1
    // chiamate solo per renderizzare la Dashboard). Meglio un segnale
    // onesto e cheap: "ha mai girato qualcosa" si'/no. Lo stato preciso
    // di un job in corso si vede nella pagina Runs del progetto, dove
    // UNA chiamata basta.
    status: raw.last_job_id ? 'ready' : 'draft',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    tags: [],
    lastRunId: raw.last_job_id ?? undefined,
  }
}

export const projectsApi = {
  list: async (params?: { q?: string; page?: number; size?: number }): Promise<ProjectListResponse> => {
    const res = await get<{ items: RawCaseMeta[]; total: number; page: number; size: number }>('/cases/', params)
    return { ...res, items: res.items.map(normalizeProject) }
  },

  get: async (id: string): Promise<{ meta: Project; config: any }> => {
    const res = await get<{ meta: RawCaseMeta; config: any }>(`/cases/${id}`)
    return { meta: normalizeProject(res.meta), config: res.config }
  },

  create: async (data: CreateProjectRequest): Promise<Project> => {
    const res = await post<RawCaseMeta>('/cases/', data)
    return normalizeProject(res)
  },

  delete: (id: string) =>
    del<{ status: string }>(`/cases/${id}`),

  clone: async (id: string, newName: string): Promise<Project> => {
    const res = await post<RawCaseMeta>(`/cases/${id}/clone?new_name=${encodeURIComponent(newName)}`)
    return normalizeProject(res)
  },

  updateConfig: (id: string, config: any) =>
    post<{ status: string }>(`/cases/${id}/config`, config),

  validate: (id: string) =>
    post<{ valid: boolean; errors: string[]; warnings: string[] }>(`/validation/${id}/validate`),
}
