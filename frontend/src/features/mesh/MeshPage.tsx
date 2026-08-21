import React, { useEffect, useState } from 'react'
import { MeshSettingsForm } from './MeshSettingsForm'
import { MeshPreview } from './MeshPreview'
import { MeshQuality } from './MeshQuality'
import { Button } from '@/components/ui/Button'
import { Grid, Play, Loader } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useWizardStore } from '@/stores/wizardStore'
import { useProjectStore } from '@/stores/projectStore'
import { useToast } from '@/hooks/useToast'
import { projectsApi } from '@/api/projects'
import { meshApi } from '@/api/mesh'
import { runsApi } from '@/api/runs'
import { buildCaseConfig, ConfigMappingError } from '@/lib/configMapping'

export function MeshPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { meshSettings, setMeshSettings, physicsConfig, boundaryConditions, geometryFile } = useWizardStore()
  const { currentProject } = useProjectStore()
  const [meshJobId, setMeshJobId] = useState<string | null>(null)

  const meshJobQuery = useQuery({
    queryKey: ['meshJob', meshJobId],
    queryFn: () => runsApi.status(meshJobId!),
    enabled: !!meshJobId,
    refetchInterval: q => (['SUCCESS', 'FAILURE'].includes((q.state.data as any)?.state) ? false : 2000),
  })

  const meshReportQuery = useQuery({
    queryKey: ['meshReport', currentProject?.id],
    queryFn: () => meshApi.report(currentProject!.id),
    enabled: !!currentProject,
  })

  const meshJobState = (meshJobQuery.data as any)?.state as string | undefined

  useEffect(() => {
    if (meshJobState === 'SUCCESS' && meshJobId) {
      queryClient.invalidateQueries({ queryKey: ['meshReport', currentProject?.id] })
      toast({ title: 'Mesh generata', description: 'La mesh è pronta, guarda il preview qui sotto.' })
    }
    if (meshJobState === 'FAILURE' && meshJobId) {
      toast({
        title: 'Meshing fallito',
        description: 'Controlla i log nella sezione Esecuzione per i dettagli.',
        variant: 'destructive',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshJobState, meshJobId])

  const generateMeshMutation = useMutation({
    mutationFn: async () => {
      if (!currentProject) throw new Error('Nessun progetto selezionato')

      // ponytail: salvo prima la config accumulata nel wizard, cosi' il
      // worker legge sempre lo stato piu' recente, non uno vecchio
      // rimasto sul backend da un salvataggio precedente.
      const config = buildCaseConfig({
        physics: physicsConfig,
        mesh: meshSettings,
        boundaries: boundaryConditions,
        stlFileName: geometryFile?.name,
      })
      await projectsApi.updateConfig(currentProject.id, config)

      const res = await meshApi.generate(currentProject.id, meshSettings.processors)
      setMeshJobId(res.job_id)
      return res
    },
    onError: (err: any) => {
      const message = err instanceof ConfigMappingError
        ? err.message
        : err?.response?.data?.detail || err?.message || 'Errore sconosciuto'
      toast({ title: 'Impossibile avviare il meshing', description: message, variant: 'destructive' })
    },
  })

  const isGenerating = meshJobState === 'PENDING' || meshJobState === 'STARTED' || generateMeshMutation.isPending

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Mesh</h2>
          <p className="text-muted-foreground">
            Configura e genera la mesh computazionale
          </p>
        </div>

        <Button
          onClick={() => generateMeshMutation.mutate()}
          disabled={isGenerating || !currentProject}
          className="gap-2"
        >
          {isGenerating ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isGenerating ? 'Generazione in corso...' : 'Genera Mesh'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MeshSettingsForm
          settings={meshSettings}
          onChange={setMeshSettings}
        />

        <div className="space-y-6">
          <MeshPreview
            projectId={currentProject?.id}
            report={meshReportQuery.data}
            geometryFile={geometryFile}
          />
          <MeshQuality report={meshReportQuery.data} isGenerating={isGenerating} />
        </div>
      </div>
    </div>
  )
}
