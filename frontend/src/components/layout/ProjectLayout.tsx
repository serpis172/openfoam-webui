import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader } from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { useProjectStore } from '@/stores/projectStore'
import { ProgressSteps } from '@/components/ui/ProgressSteps'

// ponytail: prima esisteva un ProgressSteps solo dentro ProjectWorkspace
// (bypassato, mai su dati reali). Il flusso live (queste stesse pagine)
// non aveva NESSUN indicatore di avanzamento visibile - eppure e'
// proprio quello il cuore visivo del workflow SimFlow/SimScale che
// serviva copiare. Un solo posto (qui, sopra l'Outlet) invece di
// duplicarlo in ognuna delle 6 pagine.
const WORKFLOW_STEPS: { path: string; label: string }[] = [
  { path: 'geometry', label: 'Geometria' },
  { path: 'mesh', label: 'Mesh' },
  { path: 'physics', label: 'Fisica' },
  { path: 'boundary-conditions', label: 'Boundary Conditions' },
  { path: 'runs', label: 'Simulazione' },
  { path: 'results', label: 'Risultati' },
]

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
  const location = useLocation()
  const navigate = useNavigate()
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

  const currentStepIndex = WORKFLOW_STEPS.findIndex(
    s => location.pathname === `/projects/${projectId}/${s.path}`
  )

  return (
    <div>
      <div className="px-6 pt-4 border-b bg-card">
        <ProgressSteps
          steps={WORKFLOW_STEPS.map(s => s.label)}
          current={currentStepIndex === -1 ? 0 : currentStepIndex}
          onStepClick={(index) => navigate(`/projects/${projectId}/${WORKFLOW_STEPS[index].path}`)}
        />
      </div>
      <Outlet />
    </div>
  )
}
