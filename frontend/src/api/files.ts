import { upload, downloadBlob } from './client'

export const filesApi = {
  uploadGeometry: (caseId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return upload<{ status: string; path: string }>(
      `/files/${caseId}/upload/constant/triSurface/${encodeURIComponent(file.name)}`,
      formData
    )
  },

  downloadUrl: (caseId: string, relPath: string) =>
    `/api/files/${caseId}/download/${relPath}`,

  downloadAll: (caseId: string) =>
    downloadBlob(`/files/${caseId}/download-all`, `${caseId}.zip`),
}
