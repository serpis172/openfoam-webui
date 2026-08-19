import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function ResultsControls() {
  const [variable, setVariable] = useState('p')
  const [colormap, setColormap] = useState('coolwarm')
  const [showSlice, setShowSlice] = useState(false)
  const [showStreamlines, setShowStreamlines] = useState(false)

  const variables = [
    { id: 'p', name: 'Pressione', units: 'Pa' },
    { id: 'U', name: 'Velocità', units: 'm/s' },
    { id: 'k', name: 'Energia Cinetica Turbolenta', units: 'm²/s²' },
    { id: 'omega', name: 'Omega', units: '1/s' },
  ]

  const colormaps = [
    { id: 'coolwarm', name: 'Cool-Warm' },
    { id: 'viridis', name: 'Viridis' },
    { id: 'jet', name: 'Jet' },
    { id: 'plasma', name: 'Plasma' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Controlli Visualizzazione</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Variable */}
        <div>
          <label className="block text-sm font-medium mb-2">Variabile</label>
          <select
            value={variable}
            onChange={(e) => setVariable(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {variables.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.units})
              </option>
            ))}
          </select>
        </div>

        {/* Colormap */}
        <div>
          <label className="block text-sm font-medium mb-2">Colormap</label>
          <select
            value={colormap}
            onChange={(e) => setColormap(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {colormaps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showSlice}
              onChange={(e) => setShowSlice(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Mostra Slice</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showStreamlines}
              onChange={(e) => setShowStreamlines(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Mostra Streamlines</span>
          </label>
        </div>
      </CardContent>
    </Card>
  )
}