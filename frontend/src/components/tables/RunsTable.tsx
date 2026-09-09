import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Square, Trash2, Loader } from 'lucide-react'
import type { Run } from '@/types/run'
import { formatDate, formatDuration } from '@/lib/utils'
import { runsApi } from '@/api/runs'
import { useToast } from '@/hooks/useToast'

interface RunsTableProps {
  runs: Run[]
  onCancelled?: () => void
}

const CANCELLABLE_STATUSES = new Set(['queued', 'preparing', 'meshing', 'running', 'postprocessing'])

export function RunsTable({ runs, onCancelled }: RunsTableProps) {
  const { toast } = useToast()
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const handleCancel = async (runId: string) => {
    setCancellingId(runId)
    try {
      await runsApi.cancel(runId)
      toast({ title: 'Annullamento richiesto', description: 'La simulazione si fermerà a breve.' })
      onCancelled?.()
    } catch (err: any) {
      toast({ title: 'Impossibile annullare', description: err?.message || 'Errore sconosciuto', variant: 'destructive' })
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-4 text-sm font-medium text-muted-foreground">ID</th>
              <th className="text-left p-4 text-sm font-medium text-muted-foreground">Stato</th>
              <th className="text-left p-4 text-sm font-medium text-muted-foreground">Step</th>
              <th className="text-left p-4 text-sm font-medium text-muted-foreground">Cores</th>
              <th className="text-left p-4 text-sm font-medium text-muted-foreground">Iniziato</th>
              <th className="text-left p-4 text-sm font-medium text-muted-foreground">Durata</th>
              <th className="text-left p-4 text-sm font-medium text-muted-foreground">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const cancellable = CANCELLABLE_STATUSES.has(run.status)
              return (
                <tr key={run.id} className="border-b hover:bg-muted/50">
                  <td className="p-4 font-mono text-sm">{run.id.slice(0, 8)}</td>
                  <td className="p-4">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="p-4 text-sm">{run.currentStep || '-'}</td>
                  <td className="p-4 text-sm">{run.cores}</td>
                  <td className="p-4 text-sm">
                    {run.startedAt ? formatDate(run.startedAt) : '-'}
                  </td>
                  <td className="p-4 text-sm">
                    {run.duration ? formatDuration(run.duration) : '-'}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCancel(run.id)}
                        disabled={!cancellable || cancellingId === run.id}
                        title={cancellable ? 'Annulla simulazione' : 'Non annullabile: già conclusa'}
                      >
                        {cancellingId === run.id ? <Loader className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                      </Button>
                      {/* ponytail: "Refresh" per-riga era ridondante (la
                       * pagina già polla automaticamente); "Delete" non
                       * ha nessun endpoint backend che cancelli una run
                       * storica - disabilitato onestamente invece di un
                       * bottone che non fa nulla. */}
                      <Button variant="ghost" size="icon" disabled title="Non ancora implementato">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Nessuna simulazione. Avvia una nuova simulazione.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}