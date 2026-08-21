import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Download, FileText, Camera, Video, Loader } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { filesApi } from '@/api/files'

interface ResultsExportProps {
  projectId: string
}

export function ResultsExport({ projectId }: ResultsExportProps) {
  const { toast } = useToast()
  const [downloading, setDownloading] = useState(false)

  const handleDownloadAll = async () => {
    setDownloading(true)
    try {
      await filesApi.downloadAll(projectId)
    } catch (err: any) {
      toast({
        title: 'Download fallito',
        description: err?.message || 'Errore sconosciuto',
        variant: 'destructive',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Esporta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* ponytail: niente pulsanti finti. Screenshot/CSV/Animazione
            richiederebbero funzioni lato server che non esistono ancora
            (il pulsante "Screenshot" reale vive nella toolbar del
            viewer trame, non qui). Meglio disabilitati con un motivo
            chiaro che finti e silenziosamente rotti. */}
        <Button variant="outline" className="w-full gap-2" disabled title="Usa il pulsante Screenshot nella toolbar del viewer 3D">
          <Camera className="w-4 h-4" />
          Screenshot (nel viewer 3D)
        </Button>

        <Button variant="outline" className="w-full gap-2" disabled title="Non ancora implementato">
          <FileText className="w-4 h-4" />
          Esporta CSV
        </Button>

        <Button variant="outline" className="w-full gap-2" disabled title="Non ancora implementato">
          <Video className="w-4 h-4" />
          Animazione
        </Button>

        <Button className="w-full gap-2 mt-4" onClick={handleDownloadAll} disabled={downloading || !projectId}>
          {downloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Scarica Tutto (ZIP)
        </Button>
      </CardContent>
    </Card>
  )
}
