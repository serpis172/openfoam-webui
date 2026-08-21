import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Wind, Droplet, Thermometer } from 'lucide-react'
import type { BoundaryCondition } from '@/types/boundaryConditions'
import { emptyBC } from './BCEditDialog'

function makeBc(overrides: Partial<BoundaryCondition>): BoundaryCondition {
  return { ...emptyBC(), ...overrides }
}

const presets: {
  id: string
  name: string
  description: string
  icon: typeof Droplet
  conditions: () => BoundaryCondition[]
}[] = [
  {
    id: 'internal_flow',
    name: 'Internal Flow',
    description: 'Inlet velocity, outlet pressure, walls no-slip',
    icon: Droplet,
    conditions: () => [
      makeBc({ name: 'Inlet', patchName: 'inlet', type: 'velocityInlet', parameters: { velocity: [10, 0, 0] } }),
      makeBc({ name: 'Outlet', patchName: 'outlet', type: 'pressureOutlet', parameters: { pressure: 0 } }),
      makeBc({ name: 'Pareti', patchName: 'walls', type: 'wall' }),
    ],
  },
  {
    id: 'external_aero',
    name: 'External Aerodynamics',
    description: 'Farfield velocity, outlet pressure, body walls',
    icon: Wind,
    conditions: () => [
      makeBc({ name: 'Farfield', patchName: 'farfield', type: 'velocityInlet', parameters: { velocity: [30, 0, 0] } }),
      makeBc({ name: 'Outlet', patchName: 'outlet', type: 'pressureOutlet', parameters: { pressure: 0 } }),
      makeBc({ name: 'Corpo', patchName: 'body', type: 'wall' }),
    ],
  },
  {
    id: 'natural_convection',
    name: 'Natural Convection',
    description: 'Hot/cold walls, open boundaries',
    icon: Thermometer,
    conditions: () => [
      makeBc({ name: 'Parete calda', patchName: 'hotWall', type: 'wall' }),
      makeBc({ name: 'Parete fredda', patchName: 'coldWall', type: 'wall' }),
      makeBc({ name: 'Aperture', patchName: 'openings', type: 'pressureOutlet', parameters: { pressure: 0 } }),
    ],
  },
]

export function BCPresets({ onApply }: { onApply: (conditions: BoundaryCondition[]) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preset</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onApply(preset.conditions())}
              className="w-full p-4 rounded-lg border text-left hover:border-primary/50 transition-all"
              title="Sostituisce le BC correnti con questo set"
            >
              <div className="flex items-center gap-3">
                <preset.icon className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-medium text-sm mb-1">{preset.name}</h3>
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}