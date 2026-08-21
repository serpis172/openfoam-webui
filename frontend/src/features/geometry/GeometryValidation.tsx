import React from 'react'
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type { GeometryValidation as GeometryValidationType } from '@/types/geometry'

export function GeometryValidation({ validation }: { validation: GeometryValidationType | null }) {
  if (!validation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Validazione Geometria</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="In attesa di una geometria"
            description="Carica un file per un controllo di watertightness in tempo reale."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Validazione Geometria</CardTitle>
        <Badge variant={validation.valid ? 'success' : 'destructive'}>
          {validation.valid ? 'Valida' : 'Errori'}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {validation.errors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Errori
              </h4>
              {validation.errors.map((error, i) => (
                <p key={i} className="text-sm text-destructive pl-6">{error}</p>
              ))}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-warning flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Avvisi
              </h4>
              {validation.warnings.map((warning, i) => (
                <p key={i} className="text-sm text-warning pl-6">{warning}</p>
              ))}
            </div>
          )}

          {validation.suggestions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-info flex items-center gap-2">
                <Info className="w-4 h-4" />
                Suggerimenti
              </h4>
              {validation.suggestions.map((suggestion, i) => (
                <p key={i} className="text-sm text-muted-foreground pl-6">{suggestion}</p>
              ))}
            </div>
          )}

          {validation.errors.length === 0 && validation.warnings.length === 0 && (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle className="w-5 h-5" />
              <p className="text-sm">Geometria valida, pronta per il meshing.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
