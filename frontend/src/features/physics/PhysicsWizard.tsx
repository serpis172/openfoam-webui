import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { useWizardStore } from '@/stores/wizardStore'
import type { AnalysisType, Compressibility, ThermalMode, TurbulenceModel } from '@/types/physics'

export function PhysicsWizard() {
  const { physicsConfig, setPhysicsConfig } = useWizardStore()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurazione Fisica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Analysis Type */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Tipo Analisi
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPhysicsConfig({ analysisType: 'steady' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.analysisType === 'steady'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">Steady</h3>
              <p className="text-xs text-muted-foreground">
                Stato stazionario
              </p>
            </button>
            <button
              onClick={() => setPhysicsConfig({ analysisType: 'transient' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.analysisType === 'transient'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">Transient</h3>
              <p className="text-xs text-muted-foreground">
                Tempo-dipendente
              </p>
            </button>
          </div>
        </div>

        {/* Compressibility */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Comprimibilità
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPhysicsConfig({ compressibility: 'incompressible' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.compressibility === 'incompressible'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">Incomprimibile</h3>
              <p className="text-xs text-muted-foreground">
                Densità costante (liquidi, gas a bassa velocità)
              </p>
            </button>
            <button
              onClick={() => setPhysicsConfig({ compressibility: 'compressible' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.compressibility === 'compressible'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">Comprimibile</h3>
              <p className="text-xs text-muted-foreground">
                Densità variabile (gas ad alta velocità)
              </p>
            </button>
          </div>
        </div>

        {/* Thermal */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Trasferimento Termico
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPhysicsConfig({ thermal: 'isothermal' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.thermal === 'isothermal'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">Isotermo</h3>
              <p className="text-xs text-muted-foreground">
                Temperatura costante
              </p>
            </button>
            <button
              onClick={() => setPhysicsConfig({ thermal: 'heatTransfer' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.thermal === 'heatTransfer'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">Heat Transfer</h3>
              <p className="text-xs text-muted-foreground">
                Con trasferimento di calore
              </p>
            </button>
          </div>

          {physicsConfig.thermal === 'heatTransfer' && (
            <div className="mt-3 p-3 border rounded-lg space-y-3 bg-muted/30">
              {physicsConfig.materialId !== 'air' && (
                <p className="text-xs text-amber-600">
                  Il fluido selezionato è "{physicsConfig.materialId}": lo scambio termico qui è supportato solo con Aria (richiede un modello a gas perfetto). Cambia fluido nel passo Materiale.
                </p>
              )}
              <div>
                <label className="block text-xs font-medium mb-1">Temperatura ambiente/riferimento</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="w-32 px-3 py-2 rounded-lg border bg-background text-sm"
                    value={physicsConfig.temperature ?? 300}
                    onChange={e => setPhysicsConfig({ temperature: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">
                    K ({round((physicsConfig.temperature ?? 300) - 273.15)} °C)
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Temperatura del fluido in ingresso, se non impostata diversamente nella boundary condition.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Direzione gravità</label>
                <select
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
                  value={(physicsConfig.gravity ?? [0, 0, -9.81]).join(',')}
                  onChange={e => setPhysicsConfig({ gravity: e.target.value.split(',').map(Number) as [number, number, number] })}
                >
                  <option value="0,0,-9.81">-Z (convenzione ingegneristica standard)</option>
                  <option value="0,-9.81,0">-Y</option>
                  <option value="0,0,9.81">+Z (capovolto)</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Rilevante per convezione naturale: determina dove "sale" l'aria calda.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Turbulence Model */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Modello Turbolenza
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPhysicsConfig({ turbulenceModel: 'laminar' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.turbulenceModel === 'laminar'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">Laminare</h3>
              <p className="text-xs text-muted-foreground">
                Flusso ordinato, basso Reynolds
              </p>
            </button>
            <button
              onClick={() => setPhysicsConfig({ turbulenceModel: 'kOmegaSST' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.turbulenceModel === 'kOmegaSST'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">k-ω SST</h3>
              <p className="text-xs text-muted-foreground">
                Robusto e accurato, consigliato
              </p>
            </button>
            <button
              onClick={() => setPhysicsConfig({ turbulenceModel: 'kEpsilon' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.turbulenceModel === 'kEpsilon'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">k-ε</h3>
              <p className="text-xs text-muted-foreground">
                Standard industriale
              </p>
            </button>
            <button
              onClick={() => setPhysicsConfig({ turbulenceModel: 'SpalartAllmaras' })}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.turbulenceModel === 'SpalartAllmaras'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <h3 className="font-medium text-sm mb-1">Spalart-Allmaras</h3>
              <p className="text-xs text-muted-foreground">
                Ottimo per aerodinamica
              </p>
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function round(n: number, decimals = 1): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}