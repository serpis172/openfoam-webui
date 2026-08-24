import type { MeshSettings } from '@/types/mesh'

/** Dimensione della cella base (blockMesh), su ogni asse: (max-min)/n */
export function baseCellSize(mesh: Pick<MeshSettings, 'domainMin' | 'domainMax' | 'cells'>): [number, number, number] {
  return [0, 1, 2].map(i => {
    const span = mesh.domainMax[i] - mesh.domainMin[i]
    const n = mesh.cells[i]
    return n > 0 ? span / n : 0
  }) as [number, number, number]
}

/** snappyHexMesh dimezza la cella ad ogni livello di raffinamento (ottree
 * binario): livello L -> cella base / 2^L. E' lo stesso meccanismo per
 * refinementSurfaces e refinementRegions, documentato nel manuale
 * OpenFOAM. Non è una stima approssimata: è la formula esatta usata
 * dal mesher, a meno di piccoli aggiustamenti per lo snap alla
 * geometria che qui ignoriamo (differenza tipicamente <10%). */
export function cellSizeAtLevel(base: number, level: number): number {
  return base / Math.pow(2, level)
}

/** Stima (ESPLICITAMENTE approssimata, non un conteggio esatto) del
 * numero di celle nella mesh finale, per dare un ordine di grandezza
 * prima di lanciare un meshing che può volerci minuti. Ignora la
 * sottrazione del volume della geometria stessa e le zone di
 * transizione tra livelli (nCellsBetweenLevels) - la mesh reale avrà
 * quasi sempre MENO celle di questa stima, mai di più per un ordine
 * di grandezza. */
export function estimateCellCount(mesh: MeshSettings): { base: number; withRefinement: number } {
  const [dx, dy, dz] = mesh.domainMin.map((min, i) => mesh.domainMax[i] - min)
  const domainVolume = Math.abs(dx * dy * dz)
  const [bx, by, bz] = baseCellSize(mesh)
  const baseCellVolume = Math.abs(bx * by * bz) || 1
  const baseCells = domainVolume / baseCellVolume

  if (mesh.meshType !== 'snappyHexMesh') {
    return { base: Math.round(baseCells), withRefinement: Math.round(baseCells) }
  }

  // stima grezza: assume che il raffinamento massimo si applichi a una
  // frazione del dominio proporzionale al volume dei box + un guscio
  // attorno alla geometria stimato dalla distanza di raffinamento più
  // ampia definita. E' volutamente prudente (sovrastima), meglio
  // sorprendersi in positivo che sottostimare e finire senza RAM.
  const maxLevel = Math.max(
    mesh.surfaceRefinement,
    ...mesh.refinementDistances.map(d => d.level),
    ...mesh.refinementBoxes.map(b => b.level),
    0
  )

  const refinementDistance = mesh.refinementDistances.length > 0
    ? Math.max(...mesh.refinementDistances.map(d => d.distance))
    : (bx + by + bz) / 3 // fallback: se solo surfaceRefinement senza fasce, assume un guscio ~1 cella base

  // volume del "guscio" raffinato: superficie approssimata come 6 facce
  // di una box equivalente al dominio, per la profondità di raffinamento
  const boxVolume = mesh.refinementBoxes.reduce((sum, box) => {
    const bvx = Math.abs(box.max[0] - box.min[0])
    const bvy = Math.abs(box.max[1] - box.min[1])
    const bvz = Math.abs(box.max[2] - box.min[2])
    return sum + bvx * bvy * bvz
  }, 0)

  const domainSurfaceApprox = 2 * (dx * dy + dy * dz + dx * dz) * 0.3 // fattore prudenziale: solo la geometria interna, non tutto il dominio esterno
  const refinedShellVolume = domainSurfaceApprox * refinementDistance + boxVolume
  const refinedCellVolume = Math.pow(cellSizeAtLevel((bx + by + bz) / 3, maxLevel), 3) || 1
  const refinedCells = refinedShellVolume / refinedCellVolume

  const unrefinedVolume = Math.max(domainVolume - refinedShellVolume, 0)
  const unrefinedCells = unrefinedVolume / baseCellVolume

  return {
    base: Math.round(baseCells),
    withRefinement: Math.round(unrefinedCells + refinedCells),
  }
}
