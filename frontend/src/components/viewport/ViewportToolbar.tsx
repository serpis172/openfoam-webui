import React from 'react'
import { 
  Box, 
  Grid, 
  Wind, 
  Layers, 
  Maximize, 
  RotateCcw,
  Camera,
  Eye,
  EyeOff
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useViewportStore } from '@/stores/viewportStore'

export function ViewportToolbar() {
  const {
    mode,
    shading,
    showGrid,
    showAxes,
    setMode,
    setShading,
    toggleGrid,
    toggleAxes,
  } = useViewportStore()

  return (
    <div className="absolute top-4 left-4 z-10 flex gap-2">
      {/* View Mode */}
      <div className="flex rounded-lg border bg-card overflow-hidden">
        <Button
          variant={mode === 'geometry' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setMode('geometry')}
          title="Geometria"
        >
          <Box className="w-4 h-4" />
        </Button>
        <Button
          variant={mode === 'mesh' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setMode('mesh')}
          title="Mesh"
        >
          <Grid className="w-4 h-4" />
        </Button>
        <Button
          variant={mode === 'results' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => setMode('results')}
          title="Risultati"
        >
          <Wind className="w-4 h-4" />
        </Button>
      </div>

      {/* Display Options */}
      <div className="flex rounded-lg border bg-card overflow-hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleGrid}
          title="Toggle Griglia"
        >
          {showGrid ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleAxes}
          title="Toggle Assi"
        >
          <Layers className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Reset Camera">
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Fit View">
          <Maximize className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Screenshot">
          <Camera className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}