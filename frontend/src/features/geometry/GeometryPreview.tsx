import React, { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { RotateCcw, Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { STLModel } from '@/components/viewport/STLModel'
import { useWizardStore } from '@/stores/wizardStore'
import type { GeometryStats, GeometryValidation } from '@/types/geometry'

export function GeometryPreview({
  onStats,
  onValidation,
}: {
  onStats?: (stats: GeometryStats) => void
  onValidation?: (validation: GeometryValidation) => void
}) {
  const [wireframe, setWireframe] = useState(false)
  const geometryFile = useWizardStore(s => s.geometryFile)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Anteprima 3D</CardTitle>
        <div className="flex gap-2">
          <Button
            variant={wireframe ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setWireframe(w => !w)}
            title="Wireframe"
          >
            <Grid3x3 className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-96 rounded-lg overflow-hidden bg-slate-900">
          {geometryFile ? (
            <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
              <color attach="background" args={['#0f172a']} />
              <ambientLight intensity={0.6} />
              <directionalLight position={[10, 10, 5]} intensity={1} />
              <gridHelper args={[10, 20, '#334155', '#1e293b']} />

              <Suspense fallback={null}>
                <STLModel
                  source={geometryFile}
                  wireframe={wireframe}
                  onStats={onStats}
                  onValidation={onValidation}
                />
              </Suspense>

              <OrbitControls makeDefault />
              <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
                <GizmoViewport />
              </GizmoHelper>
            </Canvas>
          ) : (
            <EmptyState
              title="Nessuna geometria caricata"
              description="Carica un file STL per vederlo qui, subito, senza aspettare il server."
              className="h-full text-slate-400"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
