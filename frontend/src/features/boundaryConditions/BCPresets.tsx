import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Wind, Droplet, Thermometer } from 'lucide-react'

const presets = [
  {
    id: 'internal_flow',
    name: 'Internal Flow',
    description: 'Inlet velocity, outlet pressure, walls no-slip',
    icon: Droplet,
  },
  {
    id: 'external_aero',
    name: 'External Aerodynamics',
    description: 'Farfield velocity, outlet pressure, body walls',
    icon: Wind,
  },
  {
    id: 'natural_convection',
    name: 'Natural Convection',
    description: 'Hot/cold walls, open boundaries',
    icon: Thermometer,
  },
]

export function BCPresets() {
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
              className="w-full p-4 rounded-lg border text-left hover:border-primary/50 transition-all"
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