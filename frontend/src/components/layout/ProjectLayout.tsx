import { useEffect } from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader } from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { useProjectStore } from '@/stores/projectStore'

/**
 * ponytail: prima nessuno chiamava mai setCurrentProject(). Ogni pagina
 * (Mesh/Runs/BoundaryConditions/...) legge useProjectStore().currentProject
 * per sapere su quale caso agire - restando sempre null, "Genera Mesh" e
 * "Avvia Simulazione" erano permanentemente disabilitati (!currentProject),
 * e GeometryPage passava currentProject?.id || '' -> stringa vuota ->
 * upload verso /files//upload/... (case_id vuoto nell'URL) -> 405 dal
 * backend, che si aspettava un path diverso.
 *
 * Un solo fetch qui, una sola volta per progetto aperto, non uno per
 * pagina.
 */
export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>()
  const setCurrentProject = useProjectStore(s => s.setCurrentProject)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  })

  useEffect(() => {
    setCurrentProject(data?.meta ?? null)
    // pulizia quando si esce dal progetto o se ne apre un altro: niente
    // stato del progetto precedente che sopravvive alla navigazione
    return () => setCurrentProject(null)
  }, [data, setCurrentProject])

  if (!projectId) {
    return <Navigate to="/projects" replace />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader className="w-5 h-5 animate-spin" />
        Caricamento progetto...
      </div>
    )
  }

  if (isError || !data?.meta) {
    return <Navigate to="/projects" replace />
  }

  return <Outlet />
}
