import React from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/hooks/useToast'
import { Dashboard } from '@/features/projects/Dashboard'
import { GeometryPage } from '@/features/geometry/GeometryPage'
import { MeshPage } from '@/features/mesh/MeshPage'
import { PhysicsPage } from '@/features/physics/PhysicsPage'
import { BoundaryConditionsPage } from '@/features/boundaryConditions/BoundaryConditionsPage'
import { RunsPage } from '@/features/simulation/RunsPage'
import { ResultsPage } from '@/features/results/ResultsPage'

function RedirectToGeometry() {
  const { projectId } = useParams<{ projectId: string }>()
  return <Navigate to={`/projects/${projectId}/geometry`} replace />
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Dashboard />} />
          {/* ProjectWorkspace (viewport unico + pannelli laterali) esiste
              ancora nel codebase ma non e' collegato a dati reali
              (Viewport3D mostra un cubo fisso, PropertiesPanel/BottomPanel
              non verificati) - redirect diretto alle pagine per-step, che
              sono quelle effettivamente cablate al backend. */}
          <Route path="/projects/:projectId" element={<RedirectToGeometry />} />
          <Route path="/projects/:projectId/geometry" element={<GeometryPage />} />
          <Route path="/projects/:projectId/mesh" element={<MeshPage />} />
          <Route path="/projects/:projectId/physics" element={<PhysicsPage />} />
          <Route path="/projects/:projectId/boundary-conditions" element={<BoundaryConditionsPage />} />
          <Route path="/projects/:projectId/runs" element={<RunsPage />} />
          <Route path="/projects/:projectId/results" element={<ResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </ToastProvider>
  )
}