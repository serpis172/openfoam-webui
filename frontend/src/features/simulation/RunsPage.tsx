import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Square, RefreshCw, Loader } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { RunsTable } from '@/components/tables/RunsTable'
import { RunMonitoring } from './RunMonitoring'
import { runsApi } from '@/api/runs'
import { useProjectStore } from '@/stores/projectStore'
import { useToast } from '@/hooks/useToast'

export function RunsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { currentProject } = useProjectStore()

  const { data: runs } = useQuery({
    queryKey: ['runs', currentProject?.id],
    queryFn: () => runsApi.logs(currentProject!.id),
    enabled: !!currentProject,
    refetchInterval: 5000,
  })

  const startRunMutation = useMutation({
    mutationFn: () => runsApi.start(currentProject!.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runs', currentProject?.id] })
      toast({
        title: 'Simulazione avviata',
        description: `Job ID: ${data.job_id}`,
      })
    },
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Simulazioni</h2>
          <p className="text-muted-foreground">
            Gestisci e monitora le simulazioni
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Aggiorna
          </Button>
          <Button
            onClick={() => startRunMutation.mutate()}
            disabled={startRunMutation.isPending}
            className="gap-2"
          >
            {startRunMutation.isPending ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Avvia Simulazione
          </Button>
        </div>
      </div>

      <RunsTable runs={runs?.logs || []} />
      
      <RunMonitoring projectId={currentProject?.id || ''} />
    </div>
  )
}