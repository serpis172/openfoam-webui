import React from 'react'
import { BoundaryConditionsTable } from '@/components/tables/BoundaryConditionsTable'
import { BCSelector } from './BCSelector'
import { BCPresets } from './BCPresets'
import { Button } from '@/components/ui/Button'
import { Plus } from 'lucide-react'
import { useWizardStore } from '@/stores/wizardStore'

export function BoundaryConditionsPage() {
  const { boundaryConditions, setBoundaryConditions } = useWizardStore()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Boundary Conditions</h2>
          <p className="text-muted-foreground">
            Definisci le condizioni al contorno
          </p>
        </div>

        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Aggiungi BC
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <BoundaryConditionsTable
            conditions={boundaryConditions}
            onChange={setBoundaryConditions}
          />
        </div>

        <div className="space-y-6">
          <BCSelector />
          <BCPresets />
        </div>
      </div>
    </div>
  )
}