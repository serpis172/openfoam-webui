import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import type { MeshSettings } from '@/types/mesh'
import { baseCellSize, cellSizeAtLevel, estimateCellCount } from '@/lib/meshEstimate'

interface MeshSettingsFormProps {
  settings: MeshSettings
  onChange: (settings: Partial<MeshSettings>) => void
}

function round(n: number, decimals = 4): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

export function MeshSettingsForm({ settings, onChange }: MeshSettingsFormProps) {
  const base = baseCellSize(settings)
  const avgBase = (base[0] + base[1] + base[2]) / 3
  const estimate = estimateCellCount(settings)

  // ponytail: prima "Dimensione Cella Globale" e "Numero Celle" erano
  // due controlli scollegati - muovere lo slider non cambiava nulla di
  // quello che veniva davvero meshato. Ora lo slider guida i conteggi,
  // come fa SimFlow (specifichi una dimensione, il numero di celle
  // per riempire il dominio viene calcolato per te).
  const applyGlobalSize = (size: number) => {
    const cells: [number, number, number] = [0, 1, 2].map(i => {
      const span = Math.abs(settings.domainMax[i] - settings.domainMin[i])
      return Math.max(1, Math.round(span / size))
    }) as [number, number, number]
    onChange({ globalSize: size, cells })
  }

  const addRefinementDistance = () => {
    const lastLevel = settings.refinementDistances.length > 0
      ? settings.refinementDistances[settings.refinementDistances.length - 1].level
      : settings.surfaceRefinement
    onChange({
      refinementDistances: [
        ...settings.refinementDistances,
        { distance: avgBase * 2, level: Math.max(0, lastLevel - 1) },
      ],
    })
  }

  const updateRefinementDistance = (index: number, patch: Partial<{ distance: number; level: number }>) => {
    const next = settings.refinementDistances.map((d, i) => (i === index ? { ...d, ...patch } : d))
    onChange({ refinementDistances: next })
  }

  const removeRefinementDistance = (index: number) => {
    onChange({ refinementDistances: settings.refinementDistances.filter((_, i) => i !== index) })
  }

  const addRefinementBox = () => {
    const n = settings.refinementBoxes.length + 1
    onChange({
      refinementBoxes: [
        ...settings.refinementBoxes,
        {
          name: `region${n}`,
          min: [settings.domainMin[0] * 0.3, settings.domainMin[1] * 0.5, settings.domainMin[2] * 0.5] as [number, number, number],
          max: [settings.domainMax[0] * 0.3, settings.domainMax[1] * 0.5, settings.domainMax[2] * 0.5] as [number, number, number],
          level: settings.surfaceRefinement,
        },
      ],
    })
  }

  const updateRefinementBox = (index: number, patch: Partial<MeshSettings['refinementBoxes'][number]>) => {
    const next = settings.refinementBoxes.map((b, i) => (i === index ? { ...b, ...patch } : b))
    onChange({ refinementBoxes: next })
  }

  const removeRefinementBox = (index: number) => {
    onChange({ refinementBoxes: settings.refinementBoxes.filter((_, i) => i !== index) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parametri Mesh</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Tipo Mesh</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onChange({ meshType: 'blockMesh' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                settings.meshType === 'blockMesh' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">blockMesh</h3>
              <p className="text-xs text-muted-foreground">Mesh strutturata uniforme, per domini semplici</p>
            </button>
            <button
              onClick={() => onChange({ meshType: 'snappyHexMesh' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                settings.meshType === 'snappyHexMesh' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">snappyHexMesh</h3>
              <p className="text-xs text-muted-foreground">Mesh automatica da STL, con raffinamento locale</p>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Dimensione Cella Base: {settings.globalSize} m
          </label>
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={settings.globalSize}
            onChange={(e) => applyGlobalSize(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Fine (0.01m)</span>
            <span>Grossolana (1m)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Celle calcolate sul dominio attuale: {settings.cells.join(' × ')} = {(settings.cells[0] * settings.cells[1] * settings.cells[2]).toLocaleString()} celle base
          </p>
        </div>

        {settings.meshType === 'snappyHexMesh' && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">
                Raffinamento Superficiale: Livello {settings.surfaceRefinement}
                {' '}<span className="text-muted-foreground font-normal">(~{round(cellSizeAtLevel(avgBase, settings.surfaceRefinement) * 1000, 2)} mm sulla superficie)</span>
              </label>
              <input
                type="range" min="1" max="8" step="1"
                value={settings.surfaceRefinement}
                onChange={(e) => onChange({ surfaceRefinement: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Raffinamento graduato per distanza</h3>
                <Button variant="outline" size="sm" onClick={addRefinementDistance} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  Aggiungi fascia
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Ogni fascia dice "entro questa distanza dal modello, usa questo livello". Livelli più alti = celle più piccole. Oltre l'ultima fascia si torna alla cella base.
              </p>

              {settings.refinementDistances.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Nessuna fascia definita: tutta la superficie usa il livello {settings.surfaceRefinement} sopra, senza transizione graduale verso l'esterno.
                </p>
              )}

              {settings.refinementDistances.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-muted-foreground">Distanza dal modello (m)</label>
                    <input
                      type="number" step="0.01" min="0.001"
                      value={d.distance}
                      onChange={(e) => updateRefinementDistance(i, { distance: parseFloat(e.target.value) || 0.01 })}
                      className="w-full px-2 py-1.5 rounded-lg border bg-background text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-muted-foreground">Livello</label>
                    <input
                      type="number" step="1" min="0" max="10"
                      value={d.level}
                      onChange={(e) => updateRefinementDistance(i, { level: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 rounded-lg border bg-background text-sm"
                    />
                  </div>
                  <div className="flex-1 text-xs text-muted-foreground pt-4">
                    ≈ {round(cellSizeAtLevel(avgBase, d.level) * 1000, 2)} mm
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeRefinementDistance(i)} className="mt-4">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Regioni di raffinamento (es. scia)</h3>
                <Button variant="outline" size="sm" onClick={addRefinementBox} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  Aggiungi box
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Box indipendenti dalla geometria: utile per raffinare una zona (la scia dietro un'auto o un'ala) senza legarla alla superficie. Visibili nel pannello Mesh a fianco.
              </p>

              {settings.refinementBoxes.map((box, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={box.name}
                      onChange={(e) => updateRefinementBox(i, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                      className="flex-1 px-2 py-1.5 rounded-lg border bg-background text-sm font-mono"
                    />
                    <div className="w-20">
                      <input
                        type="number" step="1" min="0" max="10"
                        value={box.level}
                        onChange={(e) => updateRefinementBox(i, { level: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 rounded-lg border bg-background text-sm"
                        title="Livello"
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeRefinementBox(i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-muted-foreground">Min (x y z)</label>
                      <input
                        type="text"
                        value={box.min.join(' ')}
                        onChange={(e) => {
                          const v = e.target.value.split(/\s+/).map(Number)
                          if (v.length === 3 && v.every(n => !Number.isNaN(n))) updateRefinementBox(i, { min: v as [number, number, number] })
                        }}
                        className="w-full px-2 py-1.5 rounded-lg border bg-background text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground">Max (x y z)</label>
                      <input
                        type="text"
                        value={box.max.join(' ')}
                        onChange={(e) => {
                          const v = e.target.value.split(/\s+/).map(Number)
                          if (v.length === 3 && v.every(n => !Number.isNaN(n))) updateRefinementBox(i, { max: v as [number, number, number] })
                        }}
                        className="w-full px-2 py-1.5 rounded-lg border bg-background text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Boundary Layers: {settings.boundaryLayers}</label>
              <input
                type="range" min="0" max="20" step="1"
                value={settings.boundaryLayers}
                onChange={(e) => onChange({ boundaryLayers: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Spessore Primo Layer (m)</label>
              <input
                type="number" value={settings.firstLayerThickness}
                onChange={(e) => onChange({ firstLayerThickness: parseFloat(e.target.value) })}
                step="0.0001"
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Growth Ratio: {settings.growthRatio}</label>
              <input
                type="range" min="1.0" max="2.0" step="0.05"
                value={settings.growthRatio}
                onChange={(e) => onChange({ growthRatio: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>
          </>
        )}

        <div className="space-y-4">
          <h3 className="font-medium">Dominio Computazionale</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Min (x y z)</label>
              <input
                type="text"
                value={settings.domainMin.join(' ')}
                onChange={(e) => {
                  const values = e.target.value.split(/\s+/).map(Number)
                  if (values.length === 3 && values.every(n => !Number.isNaN(n))) onChange({ domainMin: values as [number, number, number] })
                }}
                className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Max (x y z)</label>
              <input
                type="text"
                value={settings.domainMax.join(' ')}
                onChange={(e) => {
                  const values = e.target.value.split(/\s+/).map(Number)
                  if (values.length === 3 && values.every(n => !Number.isNaN(n))) onChange({ domainMax: values as [number, number, number] })
                }}
                className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Processori: {settings.processors}</label>
          <input
            type="range" min="1" max="64" step="1"
            value={settings.processors}
            onChange={(e) => onChange({ processors: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Stima celle finali (approssimata)</span>
            <span className="font-semibold">{estimate.withRefinement.toLocaleString()}</span>
          </div>
          {estimate.withRefinement > 15_000_000 && (
            <div className="flex items-start gap-2 text-amber-600 text-xs mt-2 bg-amber-50 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Mesh molto grande: il meshing può richiedere parecchia RAM e tempo. Considera di alzare la dimensione cella base o ridurre i livelli di raffinamento.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
