import React from 'react'
import { ResultsViewer } from './ResultsViewer'
import { ResultsControls } from './ResultsControls'
import { ResultsExport } from './ResultsExport'
import { useProjectStore } from '@/stores/projectStore'

export function ResultsPage() {
  const { currentProject } = useProjectStore()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Risultati</h2>
        <p className="text-muted-foreground">
          Visualizza e analizza i risultati della simulazione
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <ResultsViewer projectId={currentProject?.id || ''} />
        </div>

        <div className="space-y-6">
          <ResultsControls />
          <ResultsExport projectId={currentProject?.id || ''} />
        </div>
      </div>
    </div>
  )
}