import React from 'react'
import { CheckCircle, AlertTriangle, Loader } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { MeshReport } from '@/api/mesh'

// Soglie indicative per solver RANS incompressibili (kOmegaSST/kEpsilon):
// non sono un giudizio assoluto, sono la stessa euristica che
// checkMesh/OpenFOAM tendenzialmente segnala come "da controllare".
const NON_ORTHO_WARN = 65
const SKEWNESS_WARN = 4

export function MeshQuality({ report, isGenerating }: { report?: MeshReport; isGenerating: boolean }) {
  if (isGenerating) {
    return (
      <Card>
        <CardHeader><CardTitle>Qualità Mesh</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader className="w-5 h-5 animate-spin" />
            <span>Meshing in corso, i dati di qualità arrivano al termine...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const quality = report?.quality

  if (!quality) {
    return (
      <Card>
        <CardHeader><CardTitle>Qualità Mesh</CardTitle></CardHeader>
        <CardContent>
          <EmptyState
            title="Nessuna mesh generata"
            description="I dati di checkMesh (celle, non-ortogonalità, skewness) appaiono qui dopo la generazione."
          />
        </CardContent>
      </Card>
    )
  }

  const nonOrthoWarning = quality.maxNonOrthogonality > NON_ORTHO_WARN
  const skewnessWarning = quality.maxSkewness > SKEWNESS_WARN

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Qualità Mesh</CardTitle>
        {report?.meshType && (
          <span className="text-xs text-muted-foreground font-mono">{report.meshType}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted text-center">
            <p className="text-xs text-muted-foreground">Celle</p>
            <p className="text-lg font-semibold">{quality.cells.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted text-center">
            <p className="text-xs text-muted-foreground">Punti</p>
            <p className="text-lg font-semibold">{quality.points.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted text-center">
            <p className="text-xs text-muted-foreground">Facce</p>
            <p className="text-lg font-semibold">{quality.faces.toLocaleString()}</p>
          </div>
        </div>

        <div className="space-y-2">
          <QualityRow label="Non-ortogonalità max" value={quality.maxNonOrthogonality} warning={nonOrthoWarning} unit="°" />
          <QualityRow label="Skewness max" value={quality.maxSkewness} warning={skewnessWarning} />
          {quality.maxAspectRatio > 0 && (
            <QualityRow label="Aspect ratio max" value={quality.maxAspectRatio} warning={false} />
          )}
        </div>

        {(nonOrthoWarning || skewnessWarning) && (
          <div className="flex items-start gap-2 text-amber-600 text-sm bg-amber-50 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Qualità mesh borderline: la simulazione può comunque girare, ma con rischio di
              divergenza o risultati meno accurati vicino alle zone peggiori.
            </p>
          </div>
        )}

        {!nonOrthoWarning && !skewnessWarning && (
          <div className="flex items-center gap-2 text-success text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>Qualità nella norma per un solver RANS.</span>
          </div>
        )}

        {(quality.estimatedMemory === 'N/D' || quality.estimatedRuntime === 'N/D') && (
          <p className="text-xs text-muted-foreground">
            Stima memoria/tempo di calcolo non disponibile: checkMesh non fornisce questo dato,
            servirebbe un profiling reale del solver.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function QualityRow({ label, value, warning, unit = '' }: { label: string; value: number; warning: boolean; unit?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={warning ? 'text-amber-600 font-semibold' : 'font-medium'}>
        {value.toFixed(2)}{unit}
      </span>
    </div>
  )
}
