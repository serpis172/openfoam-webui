import { get, post } from './client'
import type { Run, Residuals } from '@/types/run'

export const runsApi = {
  start: (caseId: string, processors?: number) =>
    post<{ job_id: string; case_id: string }>('/jobs/run', {
      case_id: caseId,
      processors,
    }),

  status: (jobId: string) =>
    get<Run>(`/jobs/${jobId}`),

  cancel: (jobId: string) =>
    post<{ status: string }>(`/jobs/${jobId}/cancel`),

  residuals: (caseId: string) =>
    get<{ case_id: string; residuals: Residuals }>(`/jobs/case/${caseId}/residuals`),

  logs: (caseId: string) =>
    get<{ case_id: string; logs: any[] }>(`/jobs/case/${caseId}/logs`),

  report: (caseId: string) =>
    get<{ case_id: string; report: any }>(`/jobs/case/${caseId}/report`),
}