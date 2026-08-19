import React, { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { RotateCcw, Maximize, Camera } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export function GeometryPreview() {
  const [wireframe, setWireframe] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Anteprima 3D</CardTitle>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWireframe(!wireframe)}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Maximize className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Camera className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-96 rounded-lg overflow-hidden bg-slate-900">
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <color attach="background" args={['#0f172a']} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            
            {/* Placeholder geometry */}
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color="#3b82f6"
                wireframe={wireframe}
              />
            </mesh>

            <OrbitControls makeDefault />
            <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
              <GizmoViewport />
            </GizmoHelper>
          </Canvas>
        </div>
      </CardContent>
    </Card>
  )
}