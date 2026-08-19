import React from 'react'
import { MeshSettingsForm } from './MeshSettingsForm'
import { MeshPreview } from './MeshPreview'
import { MeshQuality } from './MeshQuality'
import { Button } from '@/components/ui/Button'
import { Grid, Play, Loader } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWizardStore } from '@/stores/wizardStore'
import { useProjectStore } from '@/stores/projectStore'
import { useToast } from '@/hooks/useToast'

export function MeshPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { meshSettings, setMeshSettings } = useWizardStore()
  const { currentProject } = useProjectStore()

  const generateMeshMutation = useMutation({
    mutationFn: async () => {
      // API call per generare mesh
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', currentProject?.id] })
      toast({
        title: 'Mesh generata',
        description: 'La mesh è stata generata con successo.',
      })
    },
  })

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
          disabled={generateMeshMutation.isPending}
          className="gap-2"
        >
          {generateMeshMutation.isPending ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Genera Mesh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MeshSettingsForm
          settings={meshSettings}
          onChange={setMeshSettings}
        />
        
        <div className="space-y-6">
          <MeshPreview />
          <MeshQuality />
        </div>
      </div>
    </div>
  )
}