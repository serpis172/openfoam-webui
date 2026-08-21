import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectLayout } from '@/components/layout/ProjectLayout'
import { ToastProvider } from '@/hooks/useToast'
import { Dashboard } from '@/features/projects/Dashboard'
import { GeometryPage } from '@/features/geometry/GeometryPage'
import { MeshPage } from '@/features/mesh/MeshPage'
import { PhysicsPage } from '@/features/physics/PhysicsPage'
import { BoundaryConditionsPage } from '@/features/boundaryConditions/BoundaryConditionsPage'
import { RunsPage } from '@/features/simulation/RunsPage'
import { ResultsPage } from '@/features/results/ResultsPage'

export default function App() {
  return (
    <ToastProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Dashboard />} />

          {/* ProjectLayout fa il fetch del progetto UNA volta e popola
              projectStore.currentProject per tutte le rotte figlie -
              prima ogni pagina leggeva un currentProject sempre null.
              ProjectWorkspace (viewport unico + pannelli laterali)
              esiste ancora nel codebase ma non e' collegato a dati
              reali (Viewport3D mostra un cubo fisso) - le rotte
              figlie qui sono quelle effettivamente cablate al backend. */}
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<Navigate to="geometry" replace />} />
            <Route path="geometry" element={<GeometryPage />} />
            <Route path="mesh" element={<MeshPage />} />
            <Route path="physics" element={<PhysicsPage />} />
            <Route path="boundary-conditions" element={<BoundaryConditionsPage />} />
            <Route path="runs" element={<RunsPage />} />
            <Route path="results" element={<ResultsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </ToastProvider>
  )
}