import React from 'react'
import { Layers, Palette, Wind, Radio } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

const VIEWER_CONTROLS = [
  { icon: Palette, label: 'Campo', description: 'pressione, velocità, k, omega — dipende dai campi scritti dal solver' },
  { icon: Layers, label: 'Tempo', description: 'ogni timestep salvato, aggiornato in automatico durante una run live' },
  { icon: Wind, label: 'Slice / Streamlines / Iso-surface', description: 'visualizzazioni combinabili tra loro' },
  { icon: Radio, label: 'Live', description: 'segue l\'ultimo risultato mentre il solver gira, o resta fermo su un istante scelto' },
]

export function ResultsControls() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Controlli Visualizzazione</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          I controlli sono nella barra in alto del viewer 3D qui a fianco (rendering
          server-side: su mesh da milioni di celle un controllo separato qui non
          reggerebbe comunque il volume di dati).
        </p>

        <div className="space-y-3">
          {VIEWER_CONTROLS.map(({ icon: Icon, label, description }) => (
            <div key={label} className="flex gap-3">
              <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
