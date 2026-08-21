import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Loader2, RotateCcw, Box, Grid3x3 } from 'lucide-react'

const API_KEY = import.meta.env.VITE_API_KEY as string | undefined

type Source =
  | { kind: 'none' }
  | { kind: 'stl-file'; file: File }
  | { kind: 'stl-url'; url: string }
  | { kind: 'gltf-url'; url: string }

/**
 * Preview locale via WebGL. A differenza del viewer trame (server-side,
 * per i campi risultato su mesh enormi), qui il dataset è sempre
 * piccolo (geometria caricata o superficie di una mesh, mai il volume
 * interno) quindi il rendering client-side è più reattivo di un
 * round-trip al server per ogni rotazione della camera.
 */
export default function MeshViewer({ source, className = '' }: { source: Source; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    mesh: THREE.Mesh | THREE.Group | null
  } | null>(null)

  const [wireframe, setWireframe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // setup scena una sola volta
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111827)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10000)
    camera.position.set(2, 2, 2)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(5, 10, 7)
    scene.add(dir)
    scene.add(new THREE.GridHelper(10, 20, 0x334155, 0x1e293b))

    sceneRef.current = { scene, camera, renderer, controls, mesh: null }

    const resize = () => {
      const { clientWidth, clientHeight } = container
      if (clientWidth === 0 || clientHeight === 0) return
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight)
    }
    resize()

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  // carica il modello quando cambia la sorgente
  useEffect(() => {
    const ctx = sceneRef.current
    if (!ctx || source.kind === 'none') return

    setLoading(true)
    setError(null)

    if (ctx.mesh) {
      ctx.scene.remove(ctx.mesh)
      ctx.mesh = null
    }

    const fitCameraTo = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3()).length() || 1
      const center = box.getCenter(new THREE.Vector3())
      object.position.sub(center)
      ctx.camera.position.copy(new THREE.Vector3(1, 1, 1).multiplyScalar(size * 0.8))
      ctx.camera.near = size / 1000
      ctx.camera.far = size * 100
      ctx.camera.updateProjectionMatrix()
      ctx.controls.target.set(0, 0, 0)
    }

    if (source.kind === 'stl-file') {
      const loader = new STLLoader()
      const reader = new FileReader()

      reader.onload = () => {
        try {
          const geometry = loader.parse(reader.result as ArrayBuffer)
          geometry.computeVertexNormals()

          const material = new THREE.MeshStandardMaterial({
            color: 0x60a5fa,
            wireframe,
            side: THREE.DoubleSide,
          })
          const mesh = new THREE.Mesh(geometry, material)
          ctx.scene.add(mesh)
          ctx.mesh = mesh
          fitCameraTo(mesh)
        } catch (e: any) {
          setError('STL non leggibile: ' + e.message)
        } finally {
          setLoading(false)
        }
      }
      reader.onerror = () => {
        setError('Impossibile leggere il file STL')
        setLoading(false)
      }
      reader.readAsArrayBuffer(source.file)
    }

    if (source.kind === 'stl-url') {
      const loader = new STLLoader()
      if (API_KEY) {
        loader.setRequestHeader({ 'X-API-Key': API_KEY })
      }
      loader.load(
        source.url,
        geometry => {
          geometry.computeVertexNormals()
          const material = new THREE.MeshStandardMaterial({
            color: 0x60a5fa,
            wireframe,
            side: THREE.DoubleSide,
          })
          const mesh = new THREE.Mesh(geometry, material)
          ctx.scene.add(mesh)
          ctx.mesh = mesh
          fitCameraTo(mesh)
          setLoading(false)
        },
        undefined,
        err => {
          setError('Geometria non disponibile: ' + (err as any)?.message)
          setLoading(false)
        }
      )
    }

    if (source.kind === 'gltf-url') {
      const loader = new GLTFLoader()
      if (API_KEY) {
        loader.setRequestHeader({ 'X-API-Key': API_KEY })
      }

      loader.load(
        source.url,
        gltf => {
          gltf.scene.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x34d399,
                wireframe,
                side: THREE.DoubleSide,
              })
            }
          })
          ctx.scene.add(gltf.scene)
          ctx.mesh = gltf.scene
          fitCameraTo(gltf.scene)
          setLoading(false)
        },
        undefined,
        err => {
          setError('Preview mesh non disponibile: ' + (err as any)?.message)
          setLoading(false)
        }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // toggle wireframe senza ricaricare il modello
  useEffect(() => {
    const ctx = sceneRef.current
    if (!ctx?.mesh) return
    ctx.mesh.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.wireframe = wireframe
      }
    })
  }, [wireframe])

  const resetCamera = () => {
    const ctx = sceneRef.current
    if (ctx?.mesh) {
      const box = new THREE.Box3().setFromObject(ctx.mesh)
      const size = box.getSize(new THREE.Vector3()).length() || 1
      ctx.camera.position.copy(new THREE.Vector3(1, 1, 1).multiplyScalar(size * 0.8))
      ctx.controls.target.set(0, 0, 0)
    }
  }

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute top-2 right-2 flex gap-1">
        <button
          onClick={() => setWireframe(w => !w)}
          className={`p-2 rounded-lg text-xs flex items-center gap-1 ${
            wireframe ? 'bg-blue-600 text-white' : 'bg-white/90 text-slate-700'
          }`}
          title="Wireframe"
        >
          <Grid3x3 className="w-4 h-4" />
        </button>
        <button
          onClick={resetCamera}
          className="p-2 rounded-lg text-xs bg-white/90 text-slate-700"
          title="Reset camera"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 right-2 bg-red-900/80 text-red-100 text-xs px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {source.kind === 'none' && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Box className="w-10 h-10" />
          <p className="text-sm">Nessuna geometria o mesh da mostrare ancora</p>
        </div>
      )}
    </div>
  )
}

export type { Source as MeshViewerSource }
