import React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useViewportStore } from '@/stores/viewportStore'
import { ViewportToolbar } from './ViewportToolbar'

interface Viewport3DProps {
  mode: string
}

export function Viewport3D({ mode }: Viewport3DProps) {
  const { showGrid, showAxes } = useViewportStore()

  return (
    <div className="flex-1 relative bg-slate-900">
      {/* Toolbar */}
      <ViewportToolbar />

      {/* Canvas */}
      <Canvas
        camera={{ position: [5, 5, 5], fov: 50 }}
        className="touch-none"
      >
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        
        {showGrid && (
          <Grid
            args={[10, 10]}
            cellColor="#1e293b"
            sectionColor="#334155"
            fadeDistance={50}
          />
        )}

        {/* Placeholder mesh */}
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#3b82f6" wireframe />
        </mesh>

        <OrbitControls makeDefault />
        
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} />
        </GizmoHelper>
      </Canvas>

      {/* Status Bar */}
      <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur rounded-lg px-4 py-2 text-sm">
        <span className="text-muted-foreground">Modalità: </span>
        <span className="font-medium">{mode}</span>
      </div>
    </div>
  )
}