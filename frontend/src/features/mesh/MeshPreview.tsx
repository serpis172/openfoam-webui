import React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

export function MeshPreview() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Anteprima Mesh</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 rounded-lg overflow-hidden bg-slate-900">
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <color attach="background" args={['#0f172a']} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            
            {/* Placeholder mesh */}
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#22c55e" wireframe />
            </mesh>

            <OrbitControls makeDefault />
          </Canvas>
        </div>
      </CardContent>
    </Card>
  )
}