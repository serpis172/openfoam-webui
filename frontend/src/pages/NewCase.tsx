import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import Dropzone from '../components/Dropzone'
import ProgressSteps from '../components/ProgressSteps'

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
  const [step, setStep] = useState(0)

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const created: any = await api.createCase({
        name,
        solver,
        description,
      })

      const caseId = created.case_id

      if (geometryFile) {
        await api.uploadFile(
          caseId,
          `constant/triSurface/${geometryFile.name}`,
          geometryFile
        )
      }

      const config = {
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

      await api.saveConfig(caseId, config)

      return caseId
    },
    onSuccess: caseId => {
      navigate(`/cases/${caseId}`)
    },
  })

  const next = () => setStep(s => Math.min(s + 1, steps.length - 1))
  const prev = () => setStep(s => Math.max(s - 1, 0))

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Nuovo caso CFD</h1>
      <p className="text-slate-500 mb-8">
        Configurazione guidata senza comandi manuali
      </p>

      <div className="card p-6 mb-6">
        <ProgressSteps steps={steps} current={step} />
      </div>

      <div className="card p-8 mb-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">Informazioni base</h2>

            <div>
              <label className="label">Nome caso</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} />
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
              <select className="input" value={solver} onChange={e => setSolver(e.target.value)}>
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
                if (files.length > 0) setGeometryFile(files[0])
              }}
            />

            {geometryFile && (
              <div className="text-sm text-green-700">
                File selezionato: {geometryFile.name}
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
                  max={32}
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

            {createMutation.isError && (
              <div className="text-red-600 text-sm">
                Errore: {(createMutation.error as Error).message}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button className="btn-secondary flex items-center gap-2" onClick={prev} disabled={step === 0}>
          <ArrowLeft className="w-4 h-4" />
          Indietro
        </button>

        {step < steps.length - 1 ? (
          <button className="btn-primary flex items-center gap-2" onClick={next}>
            Avanti
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
          >
            <CheckCircle className="w-4 h-4" />
            Crea caso
          </button>
        )}
      </div>
    </div>
  )
}