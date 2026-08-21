import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import type { BCType } from '@/types/boundaryConditions'

const bcTypes: { id: BCType; name: string; description: string }[] = [
  { id: 'velocityInlet', name: 'Velocity Inlet', description: 'Ingresso con velocità imposta' },
  { id: 'pressureInlet', name: 'Pressure Inlet', description: 'Ingresso con pressione imposta' },
  { id: 'pressureOutlet', name: 'Pressure Outlet', description: 'Uscita con pressione imposta' },
  { id: 'flowRateInlet', name: 'Flow Rate Inlet', description: 'Ingresso con portata imposta' },
  { id: 'wall', name: 'Wall', description: 'Parete con no-slip' },
  { id: 'movingWall', name: 'Moving Wall', description: 'Parete in movimento' },
  { id: 'symmetry', name: 'Symmetry', description: 'Piano di simmetria' },
  { id: 'cyclic', name: 'Cyclic', description: 'Condizione periodica' },
]

export function BCSelector({ onSelect }: { onSelect: (type: BCType) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipi Boundary Condition</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {bcTypes.map((bc) => (
            <button
              key={bc.id}
              onClick={() => onSelect(bc.id)}
              className="w-full p-3 rounded-lg border text-left hover:border-primary/50 transition-all"
            >
              <h3 className="font-medium text-sm mb-1">{bc.name}</h3>
              <p className="text-xs text-muted-foreground">{bc.description}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}