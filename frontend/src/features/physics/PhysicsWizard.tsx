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