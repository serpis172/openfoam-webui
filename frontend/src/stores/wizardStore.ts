import { create } from 'zustand'
import type { PhysicsConfig } from '@/types/physics'
import type { MeshSettings } from '@/types/mesh'
import type { BoundaryCondition } from '@/types/boundaryConditions'

export type WizardStep = 
  | 'geometry' 
  | 'mesh' 
  | 'physics' 
  | 'materials' 
  | 'boundaryConditions' 
  | 'numerics' 
  | 'simulationControl'
  | 'review'

interface WizardState {
  currentStep: WizardStep
  completedSteps: WizardStep[]
  
  geometryFile: File | null
  meshSettings: MeshSettings
  physicsConfig: PhysicsConfig
  boundaryConditions: BoundaryCondition[]
  
  setStep: (step: WizardStep) => void
  completeStep: (step: WizardStep) => void
  setGeometryFile: (file: File | null) => void
  setMeshSettings: (settings: Partial<MeshSettings>) => void
  setPhysicsConfig: (config: Partial<PhysicsConfig>) => void
  setBoundaryConditions: (conditions: BoundaryCondition[]) => void
}

const defaultMeshSettings: MeshSettings = {
  meshType: 'blockMesh',
  globalSize: 0.1,
  surfaceRefinement: 3,
  volumeRefinement: 2,
  boundaryLayers: 3,
  firstLayerThickness: 0.001,
  growthRatio: 1.2,
  processors: 4,
  domainMin: [-1, -1, -1],
  domainMax: [5, 1, 1],
  cells: [60, 20, 20],
}

const defaultPhysicsConfig: PhysicsConfig = {
  analysisType: 'steady',
  compressibility: 'incompressible',
  thermal: 'isothermal',
  turbulenceModel: 'kOmegaSST',
  solver: 'simpleFoam',
  materialId: 'air',
}

export const useWizardStore = create<WizardState>((set) => ({
  currentStep: 'geometry',
  completedSteps: [],
  
  geometryFile: null,
  meshSettings: defaultMeshSettings,
  physicsConfig: defaultPhysicsConfig,
  boundaryConditions: [],
  
  setStep: (step) => set({ currentStep: step }),
  completeStep: (step) => set((state) => ({
    completedSteps: [...state.completedSteps, step],
  })),
  setGeometryFile: (file) => set({ geometryFile: file }),
  setMeshSettings: (settings) => set((state) => ({
    meshSettings: { ...state.meshSettings, ...settings },
  })),
  setPhysicsConfig: (config) => set((state) => ({
    physicsConfig: { ...state.physicsConfig, ...config },
  })),
  setBoundaryConditions: (conditions) => set({ boundaryConditions: conditions }),
}))