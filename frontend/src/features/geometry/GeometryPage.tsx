import React from 'react'
import { GeometryUpload } from './GeometryUpload'
import { GeometryPreview } from './GeometryPreview'
import { GeometryStats } from './GeometryStats'
import { GeometryValidation } from './GeometryValidation'
import { useProjectStore } from '@/stores/projectStore'

export function GeometryPage() {
  const { currentProject } = useProjectStore()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Geometria</h2>
        <p className="text-muted-foreground">
          Carica e gestisci la geometria del tuo modello CAD
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload e Preview */}
        <div className="space-y-6">
          <GeometryUpload projectId={currentProject?.id || ''} />
          <GeometryStats />
        </div>

        {/* Preview 3D */}
        <div className="space-y-6">
          <GeometryPreview />
          <GeometryValidation />
        </div>
      </div>
    </div>
  )
}