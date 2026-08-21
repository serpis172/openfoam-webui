import React, { useState } from 'react'
import { GeometryUpload } from './GeometryUpload'
import { GeometryPreview } from './GeometryPreview'
import { GeometryStats } from './GeometryStats'
import { GeometryValidation } from './GeometryValidation'
import { useProjectStore } from '@/stores/projectStore'
import type { GeometryStats as GeometryStatsType, GeometryValidation as GeometryValidationType } from '@/types/geometry'

export function GeometryPage() {
  const { currentProject } = useProjectStore()

  // stats e validazione arrivano dallo stesso caricamento STL fatto da
  // GeometryPreview (STLModel): non ricarichiamo il file altre due
  // volte solo per calcolare numeri, sarebbe tre parse dello stesso
  // buffer per niente.
  const [stats, setStats] = useState<GeometryStatsType | null>(null)
  const [validation, setValidation] = useState<GeometryValidationType | null>(null)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Geometria</h2>
        <p className="text-muted-foreground">
          Carica e gestisci la geometria del tuo modello CAD
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <GeometryUpload projectId={currentProject?.id || ''} />
          <GeometryStats stats={stats} />
        </div>

        <div className="space-y-6">
          <GeometryPreview onStats={setStats} onValidation={setValidation} />
          <GeometryValidation validation={validation} />
        </div>
      </div>
    </div>
  )
}
