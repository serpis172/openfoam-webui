import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { MeshSettings } from '@/types/mesh'

interface MeshSettingsFormProps {
  settings: MeshSettings
  onChange: (settings: Partial<MeshSettings>) => void
}

export function MeshSettingsForm({ settings, onChange }: MeshSettingsFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parametri Mesh</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mesh Type */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Tipo Mesh
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onChange({ meshType: 'blockMesh' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                settings.meshType === 'blockMesh'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">blockMesh</h3>
              <p className="text-xs text-muted-foreground">
                Mesh strutturata per geometrie semplici
              </p>
            </button>
            <button
              onClick={() => onChange({ meshType: 'snappyHexMesh' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                settings.meshType === 'snappyHexMesh'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">snappyHexMesh</h3>
              <p className="text-xs text-muted-foreground">
                Mesh automatica da geometria STL
              </p>
            </button>
          </div>
        </div>

        {/* Global Size */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Dimensione Cella Globale: {settings.globalSize} m
          </label>
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={settings.globalSize}
            onChange={(e) => onChange({ globalSize: parseFloat(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Fine (0.01m)</span>
            <span>Grossolana (1m)</span>
          </div>
        </div>

        {/* Surface Refinement */}
        {settings.meshType === 'snappyHexMesh' && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">
                Refinement Superficiale: Livello {settings.surfaceRefinement}
              </label>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={settings.surfaceRefinement}
                onChange={(e) => onChange({ surfaceRefinement: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Boundary Layers: {settings.boundaryLayers}
              </label>
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={settings.boundaryLayers}
                onChange={(e) => onChange({ boundaryLayers: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Spessore Primo Layer (m)
              </label>
              <input
                type="number"
                value={settings.firstLayerThickness}
                onChange={(e) => onChange({ firstLayerThickness: parseFloat(e.target.value) })}
                step="0.0001"
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Growth Ratio: {settings.growthRatio}
              </label>
              <input
                type="range"
                min="1.0"
                max="2.0"
                step="0.05"
                value={settings.growthRatio}
                onChange={(e) => onChange({ growthRatio: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>
          </>
        )}

        {/* Domain */}
        <div className="space-y-4">
          <h3 className="font-medium">Dominio Computazionale</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Min (x y z)
              </label>
              <input
                type="text"
                value={settings.domainMin.join(' ')}
                onChange={(e) => {
                  const values = e.target.value.split(' ').map(Number)
                  if (values.length === 3) onChange({ domainMin: values as [number, number, number] })
                }}
                className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Max (x y z)
              </label>
              <input
                type="text"
                value={settings.domainMax.join(' ')}
                onChange={(e) => {
                  const values = e.target.value.split(' ').map(Number)
                  if (values.length === 3) onChange({ domainMax: values as [number, number, number] })
                }}
                className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Cells */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Numero Celle (nx ny nz)
          </label>
          <input
            type="text"
            value={settings.cells.join(' ')}
            onChange={(e) => {
              const values = e.target.value.split(' ').map(Number)
              if (values.length === 3) onChange({ cells: values as [number, number, number] })
            }}
            className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-sm"
          />
        </div>

        {/* Processors */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Processori: {settings.processors}
          </label>
          <input
            type="range"
            min="1"
            max="32"
            step="1"
            value={settings.processors}
            onChange={(e) => onChange({ processors: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  )
}