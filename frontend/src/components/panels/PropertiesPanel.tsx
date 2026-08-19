import React from 'react'
import { Box,  Box,  Settings, Grid, Wind, Layers, Play } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface PropertiesPanelProps {
  step: string
  projectId: string
}

export function PropertiesPanel({ step, projectId }: PropertiesPanelProps) {
  const getIcon = () => {
    switch (step) {
      case 'geometry': return Box
      case 'mesh': return Grid
      case 'physics': return Wind
      case 'boundaryConditions': return Layers
      case 'simulation': return Play
      default: return Settings
    }
  }

  const Icon = getIcon()

  return (
    <div className="w-80 border-l bg-card overflow-y-auto">
      <Card className="border-0 rounded-none">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon className="w-5 h-5" />
            Proprietà
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Seleziona un elemento nel viewport per vedere le proprietà.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}