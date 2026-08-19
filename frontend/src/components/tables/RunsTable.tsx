import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Square, RefreshCw, Trash2 } from 'lucide-react'
import type { Run } from '@/types/run'
import { formatDate, formatDuration } from '@/lib/utils'

interface RunsTableProps {
  runs: Run[]
}

export function RunsTable({ runs }: RunsTableProps) {
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
            {runs.map((run) => (
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
                    <Button variant="ghost" size="icon">
                      <Square className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
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