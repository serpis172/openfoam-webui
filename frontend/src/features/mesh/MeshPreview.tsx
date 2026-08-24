import React, { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport, Html } from '@react-three/drei'
import { Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { GLTFModel } from '@/components/viewport/GLTFModel'
import { STLModel } from '@/components/viewport/STLModel'
import { meshApi, type MeshReport } from '@/api/mesh'
import { useWizardStore } from '@/stores/wizardStore'

interface MeshPreviewProps {
  projectId?: string
  report?: MeshReport
  geometryFile: File | null
}

/** Le regioni di raffinamento definite in MeshSettingsForm, visibili
 * come wireframe sovrapposti alla geometria: il "pannello grafico per
 * vedere la grandezza della mesh" richiesto - si vede subito dove sarà
 * fine e dove sarà grossolana, prima ancora di generare la mesh vera. */
function RefinementBoxesOverlay() {
  const refinementBoxes = useWizardStore(s => s.meshSettings.refinementBoxes)

  return (
    <>
      {refinementBoxes.map((box) => {
        const center: [number, number, number] = [
          (box.min[0] + box.max[0]) / 2,
          (box.min[1] + box.max[1]) / 2,
          (box.min[2] + box.max[2]) / 2,
        ]
        const size: [number, number, number] = [
          Math.abs(box.max[0] - box.min[0]),
          Math.abs(box.max[1] - box.min[1]),
          Math.abs(box.max[2] - box.min[2]),
        ]
        // colore legato al livello: livelli più alti (celle più
        // piccole) tendono al rosso/arancio, più bassi al blu - stessa
        // logica cromatica "caldo=fine, freddo=grossolano" di SimFlow
        const hue = Math.max(0, 220 - box.level * 30)

        return (
          <group key={box.name} position={center}>
            <mesh>
              <boxGeometry args={size} />
              <meshBasicMaterial color={`hsl(${hue}, 80%, 55%)`} wireframe transparent opacity={0.9} />
            </mesh>
            <Html distanceFactor={10} position={[0, size[1] / 2 + 0.1, 0]}>
              <div className="px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px] whitespace-nowrap pointer-events-none">
                {box.name} · livello {box.level}
              </div>
            </Html>
          </group>
        )
      })}
    </>
  )
}

export function MeshPreview({ projectId, report, geometryFile }: MeshPreviewProps) {
  const [wireframe, setWireframe] = useState(false)

  const hasMeshPreview = !!projectId && report?.hasPreview
  const hasGeometryFallback = !hasMeshPreview && !!geometryFile

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Anteprima Mesh</CardTitle>
        <Button variant={wireframe ? 'default' : 'ghost'} size="icon" onClick={() => setWireframe(w => !w)} title="Wireframe">
          <Grid3x3 className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="h-96 rounded-lg overflow-hidden bg-slate-900">
          {hasMeshPreview || hasGeometryFallback ? (
            <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
              <color attach="background" args={['#0f172a']} />
              <ambientLight intensity={0.6} />
              <directionalLight position={[10, 10, 5]} intensity={1} />
              <gridHelper args={[10, 20, '#334155', '#1e293b']} />

              <Suspense
                fallback={
                  <mesh>
                    <boxGeometry args={[0.001, 0.001, 0.001]} />
                  </mesh>
                }
              >
                {hasMeshPreview ? (
                  <GLTFModel
                    url={meshApi.previewUrl(projectId!, report?.generatedAt)}
                    wireframe={wireframe}
                    color="#34d399"
                  />
                ) : (
                  <STLModel source={geometryFile!} wireframe={wireframe} color="#60a5fa" />
                )}
              </Suspense>

              <RefinementBoxesOverlay />

              <OrbitControls makeDefault />
              <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
                <GizmoViewport />
              </GizmoHelper>
            </Canvas>
          ) : report?.previewError ? (
            <EmptyState
              title="Preview non disponibile"
              description={`La mesh è stata generata ma il preview 3D non si è potuto creare: ${report.previewError}`}
              className="h-full text-amber-400"
            />
          ) : (
            <EmptyState
              title="Nessuna mesh ancora"
              description="Genera la mesh per vederla qui. Nel frattempo, se hai caricato una geometria, la vedrai come riferimento."
              className="h-full text-slate-400"
            />
          )}
        </div>

        {!hasMeshPreview && hasGeometryFallback && (
          <p className="text-xs text-muted-foreground mt-2">
            Questa è ancora la geometria grezza caricata, non la mesh: genera la mesh per vedere il risultato reale.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
