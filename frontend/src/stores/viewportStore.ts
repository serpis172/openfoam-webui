import { create } from 'zustand'

export type ViewMode = 'geometry' | 'mesh' | 'results'
export type ShadingMode = 'solid' | 'wireframe' | 'surface'

interface ViewportState {
  mode: ViewMode
  shading: ShadingMode
  showAxes: boolean
  showGrid: boolean
  showBoundingBox: boolean
  selectedFaces: string[]
  hoveredFace: string | null
  
  setMode: (mode: ViewMode) => void
  setShading: (shading: ShadingMode) => void
  toggleAxes: () => void
  toggleGrid: () => void
  toggleBoundingBox: () => void
  setSelectedFaces: (faces: string[]) => void
  setHoveredFace: (face: string | null) => void
}

export const useViewportStore = create<ViewportState>((set) => ({
  mode: 'geometry',
  shading: 'solid',
  showAxes: true,
  showGrid: true,
  showBoundingBox: false,
  selectedFaces: [],
  hoveredFace: null,
  
  setMode: (mode) => set({ mode }),
  setShading: (shading) => set({ shading }),
  toggleAxes: () => set((state) => ({ showAxes: !state.showAxes })),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleBoundingBox: () => set((state) => ({ showBoundingBox: !state.showBoundingBox })),
  setSelectedFaces: (faces) => set({ selectedFaces: faces }),
  setHoveredFace: (face) => set({ hoveredFace: face }),
}))