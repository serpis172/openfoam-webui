const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  if (!response.ok) {
    let detail = 'Errore API'

    try {
      const data = await response.json()
      detail = data.detail || JSON.stringify(data)
    } catch {
      detail = response.statusText
    }

    throw new Error(detail)
  }

  return response.json()
}

export const api = {
  health: () => request('/health'),

  listCases: (q = '', page = 1, size = 20) =>
    request(`/cases/?q=${encodeURIComponent(q)}&page=${page}&size=${size}`),

  getCase: (caseId: string) => request(`/cases/${caseId}`),

  createCase: (payload: { name: string; solver: string; description?: string }) =>
    request('/cases/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteCase: (caseId: string) =>
    request(`/cases/${caseId}`, {
      method: 'DELETE',
    }),

  cloneCase: (caseId: string, newName: string) =>
    request(`/cases/${caseId}/clone?new_name=${encodeURIComponent(newName)}`, {
      method: 'POST',
    }),

  saveConfig: (caseId: string, config: any) =>
    request(`/cases/${caseId}/config`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  runCase: (caseId: string, processors?: number) =>
    request('/jobs/run', {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId, processors }),
    }),

  jobStatus: (jobId: string) => request(`/jobs/${jobId}`),

  cancelJob: (jobId: string) =>
    request(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    }),

  residuals: (caseId: string) => request(`/jobs/case/${caseId}/residuals`),

  logs: (caseId: string) => request(`/jobs/case/${caseId}/logs`),

  logContent: (caseId: string, logName: string) =>
    request(`/jobs/case/${caseId}/log/${encodeURIComponent(logName)}?tail=300`),

  report: (caseId: string) => request(`/jobs/case/${caseId}/report`),

  validate: (caseId: string) =>
    request(`/validation/${caseId}/validate`, {
      method: 'POST',
    }),

  listFiles: (caseId: string) => request(`/files/${caseId}/list`),

  readFile: (caseId: string, path: string) =>
    request(`/files/${caseId}/text/${encodeURIComponent(path)}`),

  saveFile: (caseId: string, path: string, content: string) =>
    request(`/files/${caseId}/text/${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  deleteFile: (caseId: string, path: string) =>
    request(`/files/${caseId}/delete/${encodeURIComponent(path)}`, {
      method: 'DELETE',
    }),

  uploadFile: async (caseId: string, path: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(
      `${BASE}/files/${caseId}/upload/${encodeURIComponent(path)}`,
      {
        method: 'POST',
        body: formData,
      }
    )

    if (!response.ok) {
      throw new Error('Upload fallito')
    }

    return response.json()
  },
}