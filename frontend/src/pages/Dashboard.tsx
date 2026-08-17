import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const casesQuery = useQuery({
    queryKey: ['cases', search],
    queryFn: () => api.listCases(search),
  })

  const deleteMutation = useMutation({
    mutationFn: (caseId: string) => api.deleteCase(caseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
  })

  const cloneMutation = useMutation({
    mutationFn: ({ caseId, name }: { caseId: string; name: string }) =>
      api.cloneCase(caseId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
  })

  const cases = casesQuery.data?.items || []

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-slate-500 mt-1">Gestisci i tuoi casi OpenFOAM</p>
        </div>

        <Link to="/cases/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Nuovo caso
        </Link>
      </div>

      <div className="card p-4 mb-6">
        <input
          className="input"
          placeholder="Cerca per nome..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {cases.map((item: any) => (
          <div key={item.id} className="card p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <Link to={`/cases/${item.id}`} className="text-lg font-semibold hover:text-blue-600">
                  {item.name}
                </Link>
                <div className="text-sm text-slate-500 mt-1">{item.solver}</div>
              </div>

              <div className="flex gap-2">
                <button
                  className="text-slate-500 hover:text-blue-600"
                  title="Clona"
                  onClick={() => {
                    const name = prompt('Nome del nuovo caso', `${item.name} copia`)
                    if (name) {
                      cloneMutation.mutate({ caseId: item.id, name })
                    }
                  }}
                >
                  <Copy className="w-5 h-5" />
                </button>

                <button
                  className="text-slate-500 hover:text-red-600"
                  title="Elimina"
                  onClick={() => {
                    if (confirm(`Eliminare il caso ${item.name}?`)) {
                      deleteMutation.mutate(item.id)
                    }
                  }}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="text-sm text-slate-500">
              Creato: {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
            </div>

            <div className="mt-4">
              <Link to={`/cases/${item.id}`} className="btn-secondary w-full text-center block">
                Apri caso
              </Link>
            </div>
          </div>
        ))}
      </div>

      {cases.length === 0 && (
        <div className="card p-10 text-center text-slate-500">
          Nessun caso trovato. Crea il tuo primo caso CFD.
        </div>
      )}
    </div>
  )
}