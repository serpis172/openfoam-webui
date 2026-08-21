import { get, post } from './client'
import type { Run, Residuals } from '@/types/run'

export interface JobStatus {
  job_id: string
  state: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'REVOKED' | string
  info: Record<string, any>
}

export const runsApi = {
  start: (caseId: string, processors?: number) =>
    post<{ job_id: string; case_id: string }>('/jobs/run', {
      case_id: caseId,
      processors,
    }),

  // ponytail: GET /jobs/{id} risponde {job_id, state, info} (stato
  // Celery grezzo), non un oggetto Run - erano tipi diversi, l'any
  // implicito nascondeva il mismatch. Per l'elenco run storiche usa
  // list(), che quello si' restituisce Run[] veri dal backend.
  status: (jobId: string) => get<JobStatus>(`/jobs/${jobId}`),

  cancel: (jobId: string) =>
    post<{ status: string }>(`/jobs/${jobId}/cancel`),

  list: async (caseId: string): Promise<Run[]> => {
    const res = await get<{ case_id: string; runs: any[] }>(`/jobs/case/${caseId}/runs`)
    return res.runs.map(r => ({
      id: r.id,
      projectId: r.case_id,
      status: r.status,
      progress: 0, // il backend non calcola una % di avanzamento, solo lo step corrente
      currentStep: r.current_step || '-',
      cores: r.processors ?? 1,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
      error: r.error ?? undefined,
    }))
  },

  residuals: (caseId: string) =>
    get<{ case_id: string; residuals: Residuals }>(`/jobs/case/${caseId}/residuals`),

  logs: (caseId: string) =>
    get<{ case_id: string; logs: any[] }>(`/jobs/case/${caseId}/logs`),

  report: (caseId: string) =>
    get<{ case_id: string; report: any }>(`/jobs/case/${caseId}/report`),
}