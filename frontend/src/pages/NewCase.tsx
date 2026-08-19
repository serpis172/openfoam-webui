import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle, Hammer, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import CaseSplitView from '../components/CaseSplitView'
import Dropzone from '../components/Dropzone'
import ProgressSteps from '../components/ProgressSteps'
import type { MeshViewerSource } from '../components/MeshViewer'

const steps = [
  'Base',
  'Geometria',
  'Fisica',
  'Boundary',
  'Mesh',
  'Funzioni',
  'Riepilogo',
]

function parseVector(value: string): number[] {
  return value
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter(n => !Number.isNaN(n))
}

export default function NewCase() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [stepError, setStepError] = useState<string | null>(null)

  // ponytail: il caso viene creato subito dopo lo step "Base", non alla
  // fine del wizard. Cosi' il viewer a destra ha da subito un case_id
  // valido (mostra la geometria appena caricata, poi mesh/risultati) e i
  // dati intermedi non si perdono se l'utente chiude la tab a metà.
  const [caseId, setCaseId] = useState<string | null>(null)
  const [geometryUploaded, setGeometryUploaded] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [solver, setSolver] = useState('simpleFoam')
  const [geometryFile, setGeometryFile] = useState<File | null>(null)

  const [fluid, setFluid] = useState('air')
  const [turbulence, setTurbulence] = useState('kOmegaSST')
  const [laminar, setLaminar] = useState(false)
  const [velocity, setVelocity] = useState('10 0 0')
  const [pressure, setPressure] = useState('0')
  const [endTime, setEndTime] = useState('1000')
  const [writeInterval, setWriteInterval] = useState('100')

  const [boundaries, setBoundaries] = useState([
    {
      name: 'inlet',
      patch_type: 'patch',
      U_type: 'fixedValue',
      U_value: [10, 0, 0],
      p_type: 'zeroGradient',
      p_value: 0,
      k_type: 'fixedValue',
      k_value: 0.1,
      omega_type: 'fixedValue',
      omega_value: 1,
    },
    {
      name: 'outlet',
      patch_type: 'patch',
      U_type: 'zeroGradient',
      U_value: [0, 0, 0],
      p_type: 'fixedValue',
      p_value: 0,
      k_type: 'fixedValue',
      k_value: 0.1,
      omega_type: 'fixedValue',
      omega_value: 1,
    },
    {
      name: 'walls',
      patch_type: 'wall',
      U_type: 'noSlip',
      U_value: [0, 0, 0],
      p_type: 'zeroGradient',
      p_value: 0,
      k_type: 'fixedValue',
      k_value: 0.1,
      omega_type: 'fixedValue',
      omega_value: 1,
    },
  ])

  const [meshType, setMeshType] = useState('blockMesh')
  const [processors, setProcessors] = useState(4)
  const [domainMin, setDomainMin] = useState('-1 -1 -1')
  const [domainMax, setDomainMax] = useState('5 1 1')
  const [cells, setCells] = useState('60 20 20')
  const [surfaceRefinement, setSurfaceRefinement] = useState(3)
  const [layers, setLayers] = useState(3)

  const [enableForces, setEnableForces] = useState(true)
  const [enableProbes, setEnableProbes] = useState(false)

  const [meshJobId, setMeshJobId] = useState<string | null>(null)

  const meshJobQuery = useQuery({
    queryKey: ['meshJob', meshJobId],
    queryFn: () => api.jobStatus(meshJobId!),
    enabled: !!meshJobId,
    refetchInterval: q => (['SUCCESS', 'FAILURE'].includes((q.state.data as any)?.state) ? false : 2000),
  })

  const meshReportQuery = useQuery({
    queryKey: ['meshReport', caseId],
    queryFn: () => api.meshReport(caseId!),
    enabled: !!caseId,
  })

  const meshJobState = (meshJobQuery.data as any)?.state
  const meshReport = (meshReportQuery.data as any)?.mesh_report

  const generateMesh = async () => {
    if (!caseId) return
    await api.saveConfig(caseId, buildConfig())
    const res: any = await api.runMesh(caseId, processors)
    setMeshJobId(res.job_id)
  }

  // quando il job mesh finisce con successo, ricarico lo stato/preview
  // (useEffect, non durante il render: altrimenti si invalida ad ogni
  // render finché lo stato resta SUCCESS, un giro infinito)
  useEffect(() => {
    if (meshJobState === 'SUCCESS' && meshJobId) {
      queryClient.invalidateQueries({ queryKey: ['meshReport', caseId] })
    }
  }, [meshJobState, meshJobId, caseId, queryClient])

  const meshPreviewSource: MeshViewerSource | undefined = meshReport?.preview
    ? { kind: 'gltf-url', url: `/api/files/${caseId}/download/postProcessing/mesh_preview.gltf?t=${meshReport.generated_at}` }
    : geometryFile
      ? { kind: 'stl-file', file: geometryFile }
      : undefined

  function buildConfig() {
    return {
      physics: {
        solver,
        fluid,
        nu: fluid === 'water' ? 1e-6 : 1.5e-5,
        rho: fluid === 'water' ? 1000 : 1.225,
        turbulence,
        laminar,
        velocity: parseVector(velocity),
        pressure: Number(pressure),
        end_time: Number(endTime),
        write_interval: Number(writeInterval),
        delta_t: 1,
      },
      boundaries,
      mesh: {
        mesh_type: meshType,
        domain_min: parseVector(domainMin),
        domain_max: parseVector(domainMax),
        cells: parseVector(cells).map(Math.round),
        stl_file: geometryFile ? geometryFile.name : '',
        location_in_mesh: [0, 0, 0],
        surface_refinement: Number(surfaceRefinement),
        refinement_levels: 2,
        layers: Number(layers),
        first_layer_thickness: 0.001,
        growth_ratio: 1.2,
        processors: Number(processors),
      },
      function_objects: [
        ...(enableForces
          ? [
              {
                type: 'forces',
                name: 'forces',
                patches: ['walls'],
                fields: ['p', 'U'],
                rho: fluid === 'water' ? 1000 : 1.225,
                origin: [0, 0, 0],
                probe_locations: [],
              },
            ]
          : []),
        ...(enableProbes
          ? [
              {
                type: 'probes',
                name: 'probes',
                patches: [],
                fields: ['p', 'U'],
                rho: fluid === 'water' ? 1000 : 1.225,
                origin: [0, 0, 0],
                probe_locations: [[0, 0, 0]],
              },
            ]
          : []),
      ],
      run: {
        clean_start: true,
        vtk_all_times: false,
        run_check_mesh: true,
      },
    }
  }

  const advanceMutation = useMutation({
    mutationFn: async () => {
      setStepError(null)

      // Step 0 -> 1: il caso non esiste ancora, va creato ora.
      if (step === 0 && !caseId) {
        if (!name.trim()) throw new Error('Il nome del caso è obbligatorio')
        const created: any = await api.createCase({ name, solver, description })
        setCaseId(created.case_id)

        // dati minimi ma validi, cosi' /cases/{id}/config non fallisce
        // se l'utente abbandona il wizard a metà e poi lo riprende
        await api.saveConfig(created.case_id, buildConfig())
        return
      }

      if (!caseId) throw new Error('Caso non ancora creato')

      // Step 1 -> 2: se e' stata scelta una geometria e non è ancora
      // stata caricata, caricala ora (cosi' il viewer la mostra subito).
      if (step === 1 && geometryFile && !geometryUploaded) {
        await api.uploadFile(caseId, `constant/triSurface/${geometryFile.name}`, geometryFile)
        setGeometryUploaded(true)
      }

      // Ogni altro passaggio: autosave silenzioso della config accumulata.
      await api.saveConfig(caseId, buildConfig())
    },
    onSuccess: () => setStep(s => Math.min(s + 1, steps.length - 1)),
    onError: (err: Error) => setStepError(err.message),
  })

  const prev = () => {
    setStepError(null)
    setStep(s => Math.max(s - 1, 0))
  }

  const finish = () => {
    if (caseId) navigate(`/cases/${caseId}`)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Nuovo caso CFD</h1>
      <p className="text-slate-500 mb-8">
        Configurazione guidata senza comandi manuali. Il caso si salva ad ogni passo.
      </p>

      <div className="card p-6 mb-6">
        <ProgressSteps steps={steps} current={step} />
      </div>

      <CaseSplitView caseId={caseId} meshSource={meshPreviewSource} defaultView="mesh">
        <div className="card p-8 mb-6">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Informazioni base</h2>

              <div>
                <label className="label">Nome caso</label>
                <input
                  className="input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!!caseId}
                />
                {caseId && (
                  <p className="text-xs text-slate-400 mt-1">
                    Caso creato ({caseId}): nome e solver non sono più modificabili qui, usa "Clona caso" dal workspace.
                  </p>
                )}
              </div>

              <div>
                <label className="label">Descrizione</label>
                <textarea
                  className="input"
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Solver</label>
                <select
                  className="input"
                  value={solver}
                  onChange={e => setSolver(e.target.value)}
                  disabled={!!caseId}
                >
                  <option value="simpleFoam">simpleFoam - stazionario incomprimibile</option>
                  <option value="icoFoam">icoFoam - transitorio laminare</option>
                  <option value="pimpleFoam">pimpleFoam - transitorio</option>
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Geometria</h2>

              <Dropzone
                accept=".stl,.obj,.vtk,.vtp"
                onFiles={files => {
                  if (files.length > 0) {
                    setGeometryFile(files[0])
                    setGeometryUploaded(false)
                  }
                }}
              />

              {geometryFile && (
                <div className="text-sm text-green-700">
                  File selezionato: {geometryFile.name}
                  {geometryUploaded ? ' (caricato, visibile nel viewer →)' : ' (verrà caricato al passo successivo)'}
                </div>
              )}

              <div className="text-sm text-slate-500">
                Se carichi una geometria STL, potrai usare snappyHexMesh nello step Mesh.
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Fisica</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Fluido</label>
                  <select className="input" value={fluid} onChange={e => setFluid(e.target.value)}>
                    <option value="air">Aria</option>
                    <option value="water">Acqua</option>
                  </select>
                </div>

                <div>
                  <label className="label">Turbolenza</label>
                  <select
                    className="input"
                    value={turbulence}
                    onChange={e => setTurbulence(e.target.value)}
                  >
                    <option value="kOmegaSST">kOmegaSST</option>
                    <option value="kEpsilon">kEpsilon</option>
                  </select>
                </div>

                <div>
                  <label className="label">Velocità iniziale (x y z)</label>
                  <input className="input" value={velocity} onChange={e => setVelocity(e.target.value)} />
                </div>

                <div>
                  <label className="label">Pressione iniziale</label>
                  <input className="input" value={pressure} onChange={e => setPressure(e.target.value)} />
                </div>

                <div>
                  <label className="label">End time</label>
                  <input className="input" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>

                <div>
                  <label className="label">Write interval</label>
                  <input
                    className="input"
                    value={writeInterval}
                    onChange={e => setWriteInterval(e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={laminar}
                  onChange={e => setLaminar(e.target.checked)}
                />
                Simulazione laminare
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Boundary conditions</h2>

              {boundaries.map((bc, index) => (
                <div key={index} className="border rounded-xl p-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label">Nome</label>
                      <input
                        className="input"
                        value={bc.name}
                        onChange={e => {
                          const updated = [...boundaries]
                          updated[index].name = e.target.value
                          setBoundaries(updated)
                        }}
                      />
                    </div>

                    <div>
                      <label className="label">Tipo patch</label>
                      <select
                        className="input"
                        value={bc.patch_type}
                        onChange={e => {
                          const updated = [...boundaries]
                          updated[index].patch_type = e.target.value
                          setBoundaries(updated)
                        }}
                      >
                        <option value="patch">patch</option>
                        <option value="wall">wall</option>
                        <option value="symmetry">symmetry</option>
                        <option value="empty">empty</option>
                      </select>
                    </div>

                    <div>
                      <label className="label">U type</label>
                      <select
                        className="input"
                        value={bc.U_type}
                        onChange={e => {
                          const updated = [...boundaries]
                          updated[index].U_type = e.target.value
                          setBoundaries(updated)
                        }}
                      >
                        <option value="fixedValue">fixedValue</option>
                        <option value="zeroGradient">zeroGradient</option>
                        <option value="noSlip">noSlip</option>
                        <option value="slip">slip</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Mesh</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Tipo mesh</label>
                  <select className="input" value={meshType} onChange={e => setMeshType(e.target.value)}>
                    <option value="blockMesh">blockMesh</option>
                    <option value="snappyHexMesh">snappyHexMesh</option>
                  </select>
                </div>

                <div>
                  <label className="label">Processori</label>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    className="input"
                    value={processors}
                    onChange={e => setProcessors(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="label">Dominio min (x y z)</label>
                  <input className="input" value={domainMin} onChange={e => setDomainMin(e.target.value)} />
                </div>

                <div>
                  <label className="label">Dominio max (x y z)</label>
                  <input className="input" value={domainMax} onChange={e => setDomainMax(e.target.value)} />
                </div>

                <div>
                  <label className="label">Celle (nx ny nz)</label>
                  <input className="input" value={cells} onChange={e => setCells(e.target.value)} />
                </div>

                {meshType === 'snappyHexMesh' && (
                  <>
                    <div>
                      <label className="label">Surface refinement</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        className="input"
                        value={surfaceRefinement}
                        onChange={e => setSurfaceRefinement(Number(e.target.value))}
                      />
                    </div>

                    <div>
                      <label className="label">Boundary layers</label>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        className="input"
                        value={layers}
                        onChange={e => setLayers(Number(e.target.value))}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="border-t pt-4">
                <button
                  className="btn-secondary flex items-center gap-2"
                  onClick={generateMesh}
                  disabled={meshJobState === 'PENDING' || meshJobState === 'STARTED'}
                >
                  {meshJobState === 'PENDING' || meshJobState === 'STARTED' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Hammer className="w-4 h-4" />
                  )}
                  Genera mesh e visualizza
                </button>

                {meshJobState && (
                  <p className="text-xs text-slate-500 mt-2">Stato job: {meshJobState}</p>
                )}

                {meshReport?.cells !== undefined && (
                  <div className="text-sm mt-3 bg-slate-50 rounded-lg p-3 space-y-1">
                    <div><strong>Celle:</strong> {meshReport.cells.toLocaleString()}</div>
                    {meshReport.max_non_orthogonality !== undefined && (
                      <div><strong>Non-ortogonalità max:</strong> {meshReport.max_non_orthogonality}</div>
                    )}
                    {meshReport.max_skewness !== undefined && (
                      <div><strong>Skewness max:</strong> {meshReport.max_skewness}</div>
                    )}
                    {meshReport.preview_error && (
                      <div className="text-amber-600">Preview 3D non disponibile: {meshReport.preview_error}</div>
                    )}
                  </div>
                )}

                {meshJobQuery.data && (meshJobQuery.data as any).state === 'FAILURE' && (
                  <p className="text-sm text-red-600 mt-2">
                    Meshing fallito: guarda i log dal workspace del caso dopo aver salvato.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Function objects</h2>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableForces}
                  onChange={e => setEnableForces(e.target.checked)}
                />
                Calcolo forze su walls
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableProbes}
                  onChange={e => setEnableProbes(e.target.checked)}
                />
                Probes in punti di misura
              </label>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Riepilogo</h2>

              <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1">
                <div><strong>Nome:</strong> {name || 'Non impostato'}</div>
                <div><strong>Solver:</strong> {solver}</div>
                <div><strong>Fluido:</strong> {fluid}</div>
                <div><strong>Turbolenza:</strong> {laminar ? 'laminar' : turbulence}</div>
                <div><strong>Mesh:</strong> {meshType}</div>
                <div><strong>Processori:</strong> {processors}</div>
                <div><strong>End time:</strong> {endTime}</div>
                <div><strong>Write interval:</strong> {writeInterval}</div>
              </div>

              <div className="text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Tutto già salvato passo per passo. Puoi andare al workspace del caso.
              </div>
            </div>
          )}

          {stepError && <div className="text-red-600 text-sm mt-4">{stepError}</div>}
        </div>

        <div className="flex justify-between">
          <button className="btn-secondary flex items-center gap-2" onClick={prev} disabled={step === 0}>
            <ArrowLeft className="w-4 h-4" />
            Indietro
          </button>

          {step < steps.length - 1 ? (
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending || (step === 0 && !name.trim())}
            >
              {advanceMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              Avanti
            </button>
          ) : (
            <button className="btn-primary flex items-center gap-2" onClick={finish}>
              <CheckCircle className="w-4 h-4" />
              Vai al workspace del caso
            </button>
          )}
        </div>
      </CaseSplitView>
    </div>
  )
}
