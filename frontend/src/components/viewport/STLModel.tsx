import { useEffect, useMemo, useState } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import type { GeometryStats, GeometryValidation } from '@/types/geometry'

const API_KEY = import.meta.env.VITE_API_KEY as string | undefined

/** Calcola le statistiche reali da una BufferGeometry three.js: nessun
 * dato inventato, se qualcosa non è calcolabile (es. il volume su una
 * mesh non manifold) semplicemente non lo includiamo. */
export function computeGeometryStats(geometry: THREE.BufferGeometry): GeometryStats {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const position = geometry.attributes.position

  const vertices = position.count
  const faces = geometry.index ? geometry.index.count / 3 : position.count / 3

  // area di superficie: somma delle aree dei triangoli
  let surfaceArea = 0
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const triangle = new THREE.Triangle()

  const indices = geometry.index
  const triCount = indices ? indices.count / 3 : position.count / 3

  for (let i = 0; i < triCount; i++) {
    if (indices) {
      a.fromBufferAttribute(position, indices.getX(i * 3))
      b.fromBufferAttribute(position, indices.getX(i * 3 + 1))
      c.fromBufferAttribute(position, indices.getX(i * 3 + 2))
    } else {
      a.fromBufferAttribute(position, i * 3)
      b.fromBufferAttribute(position, i * 3 + 1)
      c.fromBufferAttribute(position, i * 3 + 2)
    }
    triangle.set(a, b, c)
    surfaceArea += triangle.getArea()
  }

  return {
    vertices,
    faces: Math.round(faces),
    // STL non ha il concetto di "spigolo" esplicito come STEP/BRep:
    // per una mesh triangolare chiusa edges ≈ faces * 3 / 2 (Eulero,
    // approssimato). Non è un valore CAD esatto, è una stima onesta.
    edges: Math.round((faces * 3) / 2),
    surfaceArea,
    boundingBox: {
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    },
  }
}

/** Controllo watertightness reale: in una mesh chiusa e manifold ogni
 * spigolo è condiviso esattamente da 2 triangoli. Spigoli con 1 sola
 * occorrenza = buco nella superficie; con 3+ = geometria non manifold. */
const MAX_TRIANGLES_FOR_VALIDATION = 500_000

export function validateGeometry(geometry: THREE.BufferGeometry): GeometryValidation {
  const position = geometry.attributes.position
  const indices = geometry.index
  const triCount = indices ? indices.count / 3 : position.count / 3

  if (triCount > MAX_TRIANGLES_FOR_VALIDATION) {
    return {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [
        `Mesh troppo grande (${Math.round(triCount).toLocaleString()} triangoli) per un controllo di watertightness nel browser: verrà comunque validata da checkMesh dopo la generazione della mesh.`,
      ],
    }
  }

  const getVertexKey = (i: number): string => {
    const idx = indices ? indices.getX(i) : i
    const x = position.getX(idx).toFixed(5)
    const y = position.getY(idx).toFixed(5)
    const z = position.getZ(idx).toFixed(5)
    return `${x},${y},${z}`
  }

  const edgeCounts = new Map<string, number>()
  let degenerateTriangles = 0

  for (let t = 0; t < triCount; t++) {
    const va = getVertexKey(t * 3)
    const vb = getVertexKey(t * 3 + 1)
    const vc = getVertexKey(t * 3 + 2)

    if (va === vb || vb === vc || va === vc) {
      degenerateTriangles++
      continue
    }

    const pairs: [string, string][] = [[va, vb], [vb, vc], [va, vc]]
    for (const [a, b] of pairs) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
    }
  }

  let openEdges = 0
  let nonManifoldEdges = 0
  for (const count of edgeCounts.values()) {
    if (count === 1) openEdges++
    else if (count > 2) nonManifoldEdges++
  }

  const errors: string[] = []
  const warnings: string[] = []
  const suggestions: string[] = []

  if (degenerateTriangles > 0) {
    warnings.push(`${degenerateTriangles} triangoli degeneri (area nulla)`)
    suggestions.push("Ripulisci la geometria nel CAD di origine prima di esportare l'STL")
  }
  if (openEdges > 0) {
    warnings.push(`${openEdges} spigoli aperti (${(openEdges / 2).toFixed(0)} buchi stimati nella superficie)`)
    suggestions.push('Una superficie non chiusa può far fallire snappyHexMesh: verifica di aver esportato un solido, non una superficie aperta')
  }
  if (nonManifoldEdges > 0) {
    errors.push(`${nonManifoldEdges} spigoli non manifold (condivisi da più di 2 triangoli)`)
    suggestions.push('Ripara la geometria con uno strumento di mesh repair (es. MeshLab, Blender) prima del meshing')
  }

  return { valid: errors.length === 0, errors, warnings, suggestions }
}

interface STLModelProps {
  /** Un File locale (dallo store del wizard, prima ancora dell'upload)
   * oppure un URL server: entrambi passano dallo stesso loader. */
  source: File | string
  wireframe?: boolean
  color?: string
  onStats?: (stats: GeometryStats) => void
  onValidation?: (validation: GeometryValidation) => void
}

export function STLModel({ source, wireframe = false, color = '#60a5fa', onStats, onValidation }: STLModelProps) {
  const { camera, controls } = useThree()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (typeof source === 'string') {
      setObjectUrl(source)
      return
    }
    const url = URL.createObjectURL(source)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  return objectUrl ? (
    <STLGeometryLoader
      url={objectUrl}
      wireframe={wireframe}
      color={color}
      onStats={onStats}
      onValidation={onValidation}
    />
  ) : null
}

function STLGeometryLoader({
  url,
  wireframe,
  color,
  onStats,
  onValidation,
}: {
  url: string
  wireframe: boolean
  color: string
  onStats?: (stats: GeometryStats) => void
  onValidation?: (validation: GeometryValidation) => void
}) {
  const geometry = useLoader(STLLoader, url, loader => {
    // ponytail: header inutile per i blob: locali (File caricato dal
    // wizard, niente auth in gioco), ma necessario per gli URL server
    // (STL gia' caricato, servito da /api/files/.../download/...).
    if (API_KEY && url.startsWith('/api')) loader.setRequestHeader({ 'X-API-Key': API_KEY })
  })
  const { camera, controls } = useThree() as any

  const stats = useMemo(() => computeGeometryStats(geometry), [geometry])
  const validation = useMemo(() => validateGeometry(geometry), [geometry])

  useEffect(() => {
    onStats?.(stats)
    onValidation?.(validation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, validation])

  useEffect(() => {
    geometry.computeBoundingSphere()
    const sphere = geometry.boundingSphere
    if (sphere && camera) {
      const distance = sphere.radius * 2.5 || 5
      camera.position.set(distance, distance, distance)
      camera.lookAt(sphere.center)
      if (controls) {
        controls.target.copy(sphere.center)
        controls.update()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} wireframe={wireframe} side={THREE.DoubleSide} />
    </mesh>
  )
}
