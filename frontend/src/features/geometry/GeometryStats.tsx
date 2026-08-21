import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { GeometryStats as GeometryStatsType } from '@/types/geometry'

export function GeometryStats({ stats }: { stats: GeometryStatsType | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistiche Geometria</CardTitle>
      </CardHeader>
      <CardContent>
        {!stats ? (
          <EmptyState
            title="In attesa di una geometria"
            description="Le statistiche appaiono qui appena carichi un file."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground">Vertici</p>
                <p className="text-lg font-semibold">{stats.vertices.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground">Facce</p>
                <p className="text-lg font-semibold">{stats.faces.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground">Spigoli (stima)</p>
                <p className="text-lg font-semibold">{stats.edges.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground">Area Superficiale</p>
                <p className="text-lg font-semibold">{(stats.surfaceArea ?? 0).toFixed(3)} m²</p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground mb-2">Bounding Box</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Min: </span>
                  <span className="font-mono">
                    [{stats.boundingBox.min.map(v => v.toFixed(2)).join(', ')}]
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max: </span>
                  <span className="font-mono">
                    [{stats.boundingBox.max.map(v => v.toFixed(2)).join(', ')}]
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
