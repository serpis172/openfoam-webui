import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'

interface ResultsViewerProps {
  projectId: string
}

export function ResultsViewer({ projectId }: ResultsViewerProps) {
  const viewerUrl = `http://${window.location.hostname}:8081/?case=${projectId}`

  return (
    <Card>
      <CardContent className="p-0">
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