import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export function MeshQuality() {
  const quality = {
    cells: 125000,
    points: 132651,
    faces: 375000,
    maxSkewness: 0.85,
    maxNonOrthogonality: 32.5,
    maxAspectRatio: 3.2,
    estimatedMemory: '256 MB',
    estimatedRuntime: '~15 min',
  }

  const getQualityColor = (value: number, warning: number, danger: number) => {
    if (value > danger) return 'text-destructive'
    if (value > warning) return 'text-warning'
    return 'text-success'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Qualità Mesh</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">Celle</p>
            <p className="text-lg font-semibold">{quality.cells.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">Punti</p>
            <p className="text-lg font-semibold">{quality.points.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">Facce</p>
            <p className="text-lg font-semibold">{quality.faces.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">Memoria Stimata</p>
            <p className="text-lg font-semibold">{quality.estimatedMemory}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Max Skewness</span>
            <span className={`font-mono font-semibold ${getQualityColor(quality.maxSkewness, 2, 4)}`}>
              {quality.maxSkewness.toFixed(2)}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Max Non-Orthogonality</span>
            <span className={`font-mono font-semibold ${getQualityColor(quality.maxNonOrthogonality, 60, 70)}`}>
              {quality.maxNonOrthogonality.toFixed(1)}°
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Max Aspect Ratio</span>
            <span className={`font-mono font-semibold ${getQualityColor(quality.maxAspectRatio, 10, 100)}`}>
              {quality.maxAspectRatio.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-muted">
          <p className="text-xs text-muted-foreground mb-1">Tempo di esecuzione stimato</p>
          <p className="font-semibold">{quality.estimatedRuntime}</p>
        </div>
      </CardContent>
    </Card>
  )
}