import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { ProgressSteps } from '@/components/ui/ProgressSteps'
import { Viewport3D } from '@/components/viewport/Viewport3D'
import { PropertiesPanel } from '@/components/panels/PropertiesPanel'
import { BottomPanel } from '@/components/panels/BottomPanel'
import { useWizardStore } from '@/stores/wizardStore'

const workflowSteps = [
  'Geometria',
  'Mesh',
  'Fisica',
  'Boundary Conditions',
  'Numerica',
  'Simulazione',
  'Risultati',
]

export function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const { currentStep, setStep } = useWizardStore()

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Caricamento progetto...</p>
      </div>
    )
  }

  const project = data?.meta
  const config = data?.config

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{project?.name}</h1>
            <p className="text-muted-foreground">{project?.description}</p>
          </div>
        </div>

        {/* Workflow Stepper */}
        <ProgressSteps
          steps={workflowSteps}
          current={workflowSteps.indexOf(currentStep)}
          onStepClick={(index) => setStep(workflowSteps[index].toLowerCase() as any)}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Viewport */}
        <div className="flex-1 flex flex-col">
          <Viewport3D mode={currentStep} />
          
          {/* Bottom Panel */}
          <BottomPanel projectId={projectId!} />
        </div>

        {/* Properties Panel */}
        <PropertiesPanel
          step={currentStep}
          projectId={projectId!}
        />
      </div>
    </div>
  )
}