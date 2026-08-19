import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ToastProvider } from '@/hooks/useToast'
import { Dashboard } from '@/features/projects/Dashboard'
import { ProjectWorkspace } from '@/features/projects/ProjectWorkspace'
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
          <Route path="/projects/:projectId" element={<ProjectWorkspace />} />
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