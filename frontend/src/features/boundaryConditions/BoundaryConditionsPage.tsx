import React, { useState } from 'react'
import { BoundaryConditionsTable } from '@/components/tables/BoundaryConditionsTable'
import { BCSelector } from './BCSelector'
import { BCPresets } from './BCPresets'
import { BCEditDialog, emptyBC } from './BCEditDialog'
import { Button } from '@/components/ui/Button'
import { Plus } from 'lucide-react'
import { useWizardStore } from '@/stores/wizardStore'
import type { BoundaryCondition, BCType } from '@/types/boundaryConditions'

export function BoundaryConditionsPage() {
  const { boundaryConditions, setBoundaryConditions } = useWizardStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBc, setEditingBc] = useState<BoundaryCondition | null>(null)

  const openCreate = (type?: BCType) => {
    setEditingBc(type ? emptyBC(type) : null)
    setDialogOpen(true)
  }

  const openEdit = (bc: BoundaryCondition) => {
    setEditingBc(bc)
    setDialogOpen(true)
  }

  const saveBc = (bc: BoundaryCondition) => {
    const exists = boundaryConditions.some(c => c.id === bc.id)
    setBoundaryConditions(
      exists
        ? boundaryConditions.map(c => (c.id === bc.id ? bc : c))
        : [...boundaryConditions, bc]
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Boundary Conditions</h2>
          <p className="text-muted-foreground">
            Definisci le condizioni al contorno
          </p>
        </div>

        <Button className="gap-2" onClick={() => openCreate()}>
          <Plus className="w-4 h-4" />
          Aggiungi BC
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <BoundaryConditionsTable
            conditions={boundaryConditions}
            onChange={setBoundaryConditions}
            onEdit={openEdit}
          />
        </div>

        <div className="space-y-6">
          <BCSelector onSelect={openCreate} />
          <BCPresets onApply={setBoundaryConditions} />
        </div>
      </div>

      <BCEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editingBc}
        onSave={saveBc}
      />
    </div>
  )
}