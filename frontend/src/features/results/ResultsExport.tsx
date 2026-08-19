import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Download, FileText, Camera, Video } from 'lucide-react'

interface ResultsExportProps {
  projectId: string
}

export function ResultsExport({ projectId }: ResultsExportProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Esporta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button variant="outline" className="w-full gap-2">
          <Download className="w-4 h-4" />
          Scarica VTK
        </Button>
        
        <Button variant="outline" className="w-full gap-2">
          <FileText className="w-4 h-4" />
          Esporta CSV
        </Button>
        
        <Button variant="outline" className="w-full gap-2">
          <Camera className="w-4 h-4" />
          Screenshot
        </Button>
        
        <Button variant="outline" className="w-full gap-2">
          <Video className="w-4 h-4" />
          Animazione
        </Button>
        
        <Button className="w-full gap-2 mt-4">
          <Download className="w-4 h-4" />
          Scarica Tutto (ZIP)
        </Button>
      </CardContent>
    </Card>
  )
}