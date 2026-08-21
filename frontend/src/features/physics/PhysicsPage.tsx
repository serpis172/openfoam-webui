import React from 'react'
import { PhysicsWizard } from './PhysicsWizard'
import { MaterialSelector } from './MaterialSelector'
import { SolverRecommendation } from './SolverRecommendation'
import { useWizardStore } from '@/stores/wizardStore'

export function PhysicsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Fisica</h2>
        <p className="text-muted-foreground">
          Configura la fisica della simulazione
        </p>
      </div>

      <PhysicsWizard />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MaterialSelector />
        <SolverRecommendation />
      </div>
    </div>
  )
}