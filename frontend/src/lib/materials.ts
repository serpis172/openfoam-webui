import type { Material } from '@/types/physics'

export const MATERIALS: Material[] = [
  { id: 'air', name: 'Aria', type: 'fluid', density: 1.225, kinematicViscosity: 1.5e-5 },
  { id: 'water', name: 'Acqua', type: 'fluid', density: 1000, kinematicViscosity: 1e-6 },
  { id: 'oil', name: 'Olio', type: 'fluid', density: 900, kinematicViscosity: 1e-4 },
]

export function getMaterial(id: string): Material {
  return MATERIALS.find(m => m.id === id) ?? MATERIALS[0]
}
