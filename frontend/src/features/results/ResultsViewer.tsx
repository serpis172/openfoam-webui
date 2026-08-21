import React from 'react'
import { ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

interface ResultsViewerProps {
  projectId: string
}

export function ResultsViewer({ projectId }: ResultsViewerProps) {
  if (!projectId) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            title="Nessun progetto selezionato"
            description="Seleziona un progetto per vedere i risultati."
            className="h-[600px]"
          />
        </CardContent>
      </Card>
    )
  }

  // "case_id" deve combinare esattamente col nome dello stato reattivo
  // in viz/trame_app.py (server.state.case_id): trame_client fa il
  // merge automatico dei query param nello stato iniziale alla prima
  // connessione. Con "case" (il nome usato qui prima) il viewer non
  // selezionava mai il caso giusto: partiva sempre sull'ultimo caso
  // modificato, chiunque lo guardasse.
  const viewerUrl = `http://${window.location.hostname}:8081/?case_id=${encodeURIComponent(projectId)}`

  return (
    <Card>
      <CardContent className="p-0 relative">
        <a
          href={viewerUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-xs bg-slate-900/80 text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-900"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Schermo intero
        </a>
        <iframe
          src={viewerUrl}
          className="w-full h-[600px] border-0"
          title="Results Viewer"
          allow="fullscreen"
        />
      </CardContent>
    </Card>
  )
}
