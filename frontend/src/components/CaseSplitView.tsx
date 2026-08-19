import { Suspense, lazy, useState } from 'react'
import { Box, Loader2, Server } from 'lucide-react'
import ViewerFrame from './ViewerFrame'
import type { MeshViewerSource } from './MeshViewer'

// three.js pesa ~580KB minificato: caricato solo quando l'utente apre
// davvero il pannello Mesh, non nel bundle iniziale di ogni pagina
// (Dashboard non ha bisogno di WebGL).
const MeshViewer = lazy(() => import('./MeshViewer'))

export default function CaseSplitView({
  caseId,
  meshSource,
  defaultView = 'results',
  children,
}: {
  /** null quando il caso non esiste ancora (wizard, step "Base" non
   * ancora salvato): il viewer mostra un placeholder invece dell'iframe,
   * niente richieste a un case_id che non esiste. */
  caseId: string | null
  /** geometria/mesh da mostrare nel preview WebGL locale (three.js).
   * Se assente, il toggle "Mesh" resta disabilitato. */
  meshSource?: MeshViewerSource
  /** quale pannello mostrare all'apertura: il wizard parte su "mesh"
   * (non ci sono ancora risultati), il workspace del caso su "results". */
  defaultView?: 'results' | 'mesh'
  children: React.ReactNode
}) {
  const [view, setView] = useState<'results' | 'mesh'>(defaultView)
  const hasMeshSource = !!meshSource && meshSource.kind !== 'none'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_480px] gap-6 items-start">
      <div className="min-w-0">{children}</div>

      <div className="card overflow-hidden xl:sticky xl:top-6">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            <button
              onClick={() => setView('mesh')}
              disabled={!hasMeshSource}
              className={`px-3 py-1.5 flex items-center gap-1.5 ${
                view === 'mesh' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'
              } ${!hasMeshSource ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={hasMeshSource ? 'Geometria/mesh, rendering locale' : 'Carica geometria o genera la mesh prima'}
            >
              <Box className="w-3.5 h-3.5" />
              Mesh
            </button>
            <button
              onClick={() => setView('results')}
              className={`px-3 py-1.5 flex items-center gap-1.5 ${
                view === 'results' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'
              }`}
              title="Campi risultato, rendering server"
            >
              <Server className="w-3.5 h-3.5" />
              Risultati
            </button>
          </div>

          {view === 'results' && caseId && (
            <a
              href={`http://${window.location.hostname}:8081/?case_id=${encodeURIComponent(caseId)}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 text-xs hover:underline whitespace-nowrap"
            >
              Apri a schermo intero
            </a>
          )}
        </div>

        <div className="h-[520px] xl:h-[calc(100vh-220px)]">
          {view === 'mesh' ? (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-slate-900">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              }
            >
              <MeshViewer source={meshSource ?? { kind: 'none' }} />
            </Suspense>
          ) : caseId ? (
            <ViewerFrame caseId={caseId} compact />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-50">
              <Server className="w-10 h-10" />
              <p className="text-sm text-center px-8">
                I risultati appariranno qui dopo la prima esecuzione.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
