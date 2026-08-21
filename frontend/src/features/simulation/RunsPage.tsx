import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Square, RefreshCw, Loader } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { RunsTable } from '@/components/tables/RunsTable'
import { RunMonitoring } from './RunMonitoring'
import { runsApi } from '@/api/runs'
import { projectsApi } from '@/api/projects'
import { useProjectStore } from '@/stores/projectStore'
import { useWizardStore } from '@/stores/wizardStore'
import { useToast } from '@/hooks/useToast'
import { buildCaseConfig, ConfigMappingError } from '@/lib/configMapping'

export function RunsPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { currentProject } = useProjectStore()
  const { meshSettings, physicsConfig, boundaryConditions, geometryFile } = useWizardStore()

  // ponytail: prima leggeva runsApi.logs() (file di log, {name, tail})
  // e lo passava a RunsTable che si aspetta Run[] ({id, status, ...}) -
  // crash garantito al primo log scritto (run.id.slice su undefined).
  const { data: runs, refetch } = useQuery({
    queryKey: ['runs', currentProject?.id],
    queryFn: () => runsApi.list(currentProject!.id),
    enabled: !!currentProject,
    refetchInterval: q => {
      const list = q.state.data as any[] | undefined
      const stillRunning = list?.some(r => !['completed', 'failed', 'cancelled'].includes(r.status))
      return stillRunning ? 3000 : 8000
    },
  })

  const startRunMutation = useMutation({
    mutationFn: async () => {
      if (!currentProject) throw new Error('Nessun progetto selezionato')

      // stesso motivo del meshing: la config accumulata nel wizard va
      // salvata prima di lanciare, altrimenti il worker potrebbe
      // leggere una config vecchia se l'utente non e' mai passato dallo
      // step Mesh in questa sessione.
      const config = buildCaseConfig({
        physics: physicsConfig,
        mesh: meshSettings,
        boundaries: boundaryConditions,
        stlFileName: geometryFile?.name,
      })
      await projectsApi.updateConfig(currentProject.id, config)

      return runsApi.start(currentProject.id, meshSettings.processors)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runs', currentProject?.id] })
      toast({
        title: 'Simulazione avviata',
        description: `Job ID: ${data.job_id}`,
      })
    },
    onError: (err: any) => {
      const message = err instanceof ConfigMappingError
        ? err.message
        : err?.response?.data?.detail || err?.message || 'Errore sconosciuto'
      toast({ title: 'Impossibile avviare la simulazione', description: message, variant: 'destructive' })
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
          <Button variant="outline" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            Aggiorna
          </Button>
          <Button
            onClick={() => startRunMutation.mutate()}
            disabled={startRunMutation.isPending || !currentProject}
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

      <RunsTable runs={runs || []} />

      <RunMonitoring projectId={currentProject?.id || ''} />
    </div>
  )
}