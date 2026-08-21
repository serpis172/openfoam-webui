import { get, post } from './client'
import type { MeshQuality, MeshStatus } from '@/types/mesh'

interface RawMeshReport {
  points?: number
  faces?: number
  cells?: number
  max_non_orthogonality?: number
  max_skewness?: number
  max_aspect_ratio?: number
  mesh_type?: string
  generated_at?: string
  preview_error?: string
  preview?: {
    original_cells: number
    exported_triangles: number
    decimated: boolean
    points: number
  }
}

export interface MeshReport {
  status: MeshStatus
  meshType?: string
  generatedAt?: string
  quality?: MeshQuality
  previewError?: string
  hasPreview: boolean
}

// ponytail: il backend parla snake_case (e' Python), il resto del
// frontend parla camelCase (vedi types/mesh.ts) - normalizzo qui, un
// solo punto, invece di far filtrare snake_case ovunque nei componenti.
function normalizeMeshReport(raw: RawMeshReport | null): MeshReport {
  if (!raw || raw.cells === undefined) {
    return { status: 'not_generated', hasPreview: false }
  }

  return {
    status: 'ready',
    meshType: raw.mesh_type,
    generatedAt: raw.generated_at,
    previewError: raw.preview_error,
    hasPreview: !!raw.preview && !raw.preview_error,
    quality: {
      cells: raw.cells,
      points: raw.points ?? 0,
      faces: raw.faces ?? 0,
      // il backend riporta solo quello che checkMesh ha davvero
      // stampato: nessun valore inventato per quello che manca
      // (yPlus/memoria/tempo stimato richiedono dati che checkMesh
      // da solo non da').
      maxSkewness: raw.max_skewness ?? 0,
      maxNonOrthogonality: raw.max_non_orthogonality ?? 0,
      maxAspectRatio: raw.max_aspect_ratio ?? 0,
      estimatedMemory: 'N/D',
      estimatedRuntime: 'N/D',
    },
  }
}

export const meshApi = {
  /** Job leggero: solo meshing + checkMesh + preview, niente solve.
   * Usa lo stesso /jobs/{jobId} di runsApi.status per il polling. */
  generate: (caseId: string, processors?: number) =>
    post<{ job_id: string; case_id: string }>('/jobs/mesh', {
      case_id: caseId,
      processors,
    }),

  report: async (caseId: string): Promise<MeshReport> => {
    const res = await get<{ case_id: string; mesh_report: RawMeshReport | null }>(
      `/jobs/case/${caseId}/mesh-report`
    )
    return normalizeMeshReport(res.mesh_report)
  },

  /** URL del preview .gltf generato dal worker (worker/mesh_export.py).
   * Il timestamp evita che il browser serva una cache stale dopo una
   * rigenerazione mesh. */
  previewUrl: (caseId: string, generatedAt?: string) =>
    `/api/files/${caseId}/download/postProcessing/mesh_preview.gltf${generatedAt ? `?t=${encodeURIComponent(generatedAt)}` : ''}`,
}
