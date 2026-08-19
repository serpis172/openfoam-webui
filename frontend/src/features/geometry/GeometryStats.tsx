import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export function GeometryStats() {
  const stats = {
    vertices: 0,
    faces: 0,
    edges: 0,
    volume: 0,
    surfaceArea: 0,
    boundingBox: {
      min: [0, 0, 0],
      max: [0, 0, 0],
    },
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistiche Geometria</CardTitle>
      </CardHeader>
      <CardContent>
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
            <p className="text-xs text-muted-foreground">Spigoli</p>
            <p className="text-lg font-semibold">{stats.edges.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground">Area Superficiale</p>
            <p className="text-lg font-semibold">{stats.surfaceArea.toFixed(2)} m²</p>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-muted">
          <p className="text-xs text-muted-foreground mb-2">Bounding Box</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Min: </span>
              <span className="font-mono">
                [{stats.boundingBox.min.join(', ')}]
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Max: </span>
              <span className="font-mono">
                [{stats.boundingBox.max.join(', ')}]
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}