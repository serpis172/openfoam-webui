import React, { useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useWizardStore } from '@/stores/wizardStore'

function getRecommendedSolver(physicsConfig: ReturnType<typeof useWizardStore.getState>['physicsConfig']) {
  if (physicsConfig.compressibility === 'compressible') {
    return physicsConfig.analysisType === 'steady' ? 'rhoSimpleFoam' : 'rhoPimpleFoam'
  }

  if (physicsConfig.thermal === 'heatTransfer') {
    return physicsConfig.analysisType === 'steady' ? 'buoyantSimpleFoam' : 'buoyantPimpleFoam'
  }

  return physicsConfig.analysisType === 'steady' ? 'simpleFoam' : 'pimpleFoam'
}

export function SolverRecommendation() {
  const { physicsConfig, setPhysicsConfig } = useWizardStore()
  const solver = getRecommendedSolver(physicsConfig)

  // ponytail: prima questo pannello CALCOLAVA il solver consigliato ma
  // non lo scriveva mai in physicsConfig.solver - l'utente vedeva
  // "rhoPimpleFoam" qui e la config salvata restava "simpleFoam" (il
  // default), silenziosamente sbagliata. Ora quello che si vede e'
  // quello che si salva.
  useEffect(() => {
    if (physicsConfig.solver !== solver) {
      setPhysicsConfig({ solver })
    }
  }, [solver, physicsConfig.solver, setPhysicsConfig])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Solver Raccomandato</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="p-4 rounded-lg bg-primary/5 border-2 border-primary">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-mono font-semibold text-lg">{solver}</h3>
            <Badge variant="success">Raccomandato</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {solver === 'simpleFoam' && 'Solver steady-state per flussi incomprimibili turbolenti'}
            {solver === 'pimpleFoam' && 'Solver transient per flussi incomprimibili'}
            {solver === 'rhoSimpleFoam' && 'Solver steady-state per flussi comprimibili'}
            {solver === 'rhoPimpleFoam' && 'Solver transient per flussi comprimibili'}
            {solver === 'buoyantSimpleFoam' && 'Solver steady-state con trasferimento di calore e buoyancy'}
            {solver === 'buoyantPimpleFoam' && 'Solver transient con trasferimento di calore e buoyancy'}
          </p>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo:</span>
              <span>{physicsConfig.analysisType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comprimibilità:</span>
              <span>{physicsConfig.compressibility}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Termico:</span>
              <span>{physicsConfig.thermal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Turbolenza:</span>
              <span>{physicsConfig.turbulenceModel}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}