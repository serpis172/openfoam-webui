import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Search } from 'lucide-react'
import { useWizardStore } from '@/stores/wizardStore'
import { MATERIALS } from '@/lib/materials'

export function MaterialSelector() {
  const { physicsConfig, setPhysicsConfig } = useWizardStore()
  const [search, setSearch] = useState('')

  const filteredMaterials = MATERIALS.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Materiale</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cerca materiale..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-2">
          {filteredMaterials.map((material) => (
            <button
              key={material.id}
              onClick={() => setPhysicsConfig({ materialId: material.id })}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                physicsConfig.materialId === material.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{material.name}</h3>
                <span className="text-xs text-muted-foreground">{material.type}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span>Densità: </span>
                  <span className="font-mono">{material.density} kg/m³</span>
                </div>
                <div>
                  <span>ν: </span>
                  <span className="font-mono">{material.kinematicViscosity} m²/s</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}