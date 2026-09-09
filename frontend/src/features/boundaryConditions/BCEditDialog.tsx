import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import type { BoundaryCondition, BCType } from '@/types/boundaryConditions'

const BC_TYPE_OPTIONS: { id: BCType; name: string; needsVelocity?: boolean; needsPressure?: boolean }[] = [
  { id: 'velocityInlet', name: 'Velocity Inlet', needsVelocity: true },
  { id: 'pressureInlet', name: 'Pressure Inlet', needsPressure: true },
  { id: 'pressureOutlet', name: 'Pressure Outlet', needsPressure: true },
  { id: 'flowRateInlet', name: 'Flow Rate Inlet', needsVelocity: true },
  { id: 'wall', name: 'Wall (no-slip)' },
  { id: 'movingWall', name: 'Moving Wall', needsVelocity: true },
  { id: 'noSlipWall', name: 'No-Slip Wall' },
  { id: 'slipWall', name: 'Slip Wall' },
  { id: 'symmetry', name: 'Symmetry' },
  { id: 'cyclic', name: 'Cyclic' },
  { id: 'empty', name: 'Empty (2D)' },
  { id: 'wedge', name: 'Wedge (assialsimmetrico)' },
]

interface BCEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: BoundaryCondition | null
  onSave: (bc: BoundaryCondition) => void
}

function emptyBC(type: BCType = 'velocityInlet'): BoundaryCondition {
  return {
    id: `bc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    patchName: '',
    type,
    parameters: {},
    faceIds: [],
    color: '#60a5fa',
    valid: true,
    errors: [],
  }
}

export function BCEditDialog({ open, onOpenChange, initial, onSave }: BCEditDialogProps) {
  const [bc, setBc] = useState<BoundaryCondition>(initial ?? emptyBC())

  useEffect(() => {
    if (open) setBc(initial ?? emptyBC())
  }, [open, initial])

  const typeInfo = BC_TYPE_OPTIONS.find(t => t.id === bc.type)
  const velocity = (bc.parameters.velocity as number[] | undefined) ?? [0, 0, 0]
  const pressure = (bc.parameters.pressure as number | undefined) ?? 0
  const temperatureType = (bc.parameters.temperatureType as string | undefined) ?? 'zeroGradient'
  const temperature = (bc.parameters.temperature as number | undefined) ?? 300

  const canSave = bc.name.trim().length > 0 && bc.patchName.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    onSave({ ...bc, valid: true, errors: [] })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] p-6 space-y-4">
        <h3 className="text-lg font-semibold">
          {initial ? 'Modifica Boundary Condition' : 'Nuova Boundary Condition'}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Nome</label>
            <input
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              value={bc.name}
              onChange={e => setBc({ ...bc, name: e.target.value })}
              placeholder="es. Inlet principale"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Patch (nome OpenFOAM)</label>
            <input
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono"
              value={bc.patchName}
              onChange={e => setBc({ ...bc, patchName: e.target.value })}
              placeholder="es. inlet"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Tipo</label>
          <select
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            value={bc.type}
            onChange={e => setBc({ ...bc, type: e.target.value as BCType })}
          >
            {BC_TYPE_OPTIONS.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {typeInfo?.needsVelocity && (
          <div>
            <label className="block text-xs font-medium mb-1">Velocità (x y z) [m/s]</label>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map(i => (
                <input
                  key={i}
                  type="number"
                  className="px-3 py-2 rounded-lg border bg-background text-sm"
                  value={velocity[i]}
                  onChange={e => {
                    const next = [...velocity]
                    next[i] = Number(e.target.value)
                    setBc({ ...bc, parameters: { ...bc.parameters, velocity: next } })
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {typeInfo?.needsPressure && (
          <div>
            <label className="block text-xs font-medium mb-1">Pressione [Pa, relativa]</label>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              value={pressure}
              onChange={e => setBc({ ...bc, parameters: { ...bc.parameters, pressure: Number(e.target.value) } })}
            />
          </div>
        )}

        {/* Temperatura: rilevante per qualunque tipo di patch quando il
         * caso ha scambio termico attivo. zeroGradient (default) = nessuno
         * scambio (parete adiabatica / temperatura non imposta). */}
        <div className="border-t pt-3">
          <label className="block text-xs font-medium mb-1">Temperatura (solo se il caso ha scambio termico attivo)</label>
          <div className="flex gap-2">
            <select
              className="px-3 py-2 rounded-lg border bg-background text-sm"
              value={temperatureType}
              onChange={e => setBc({ ...bc, parameters: { ...bc.parameters, temperatureType: e.target.value } })}
            >
              <option value="zeroGradient">Adiabatica (nessuno scambio)</option>
              <option value="fixedValue">Temperatura imposta</option>
              <option value="inletOutlet">Temperatura di ingresso flusso</option>
            </select>
            {temperatureType !== 'zeroGradient' && (
              <input
                type="number"
                className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm"
                value={temperature}
                onChange={e => setBc({ ...bc, parameters: { ...bc.parameters, temperature: Number(e.target.value) } })}
                placeholder="Kelvin"
              />
            )}
          </div>
          {temperatureType !== 'zeroGradient' && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {temperature} K ≈ {round(temperature - 273.15)} °C
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={!canSave}>Salva</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function round(n: number, decimals = 1): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

export { emptyBC }
