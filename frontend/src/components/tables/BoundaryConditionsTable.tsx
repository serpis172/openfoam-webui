import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Trash2, Edit } from 'lucide-react'
import type { BoundaryCondition } from '@/types/boundaryConditions'

interface BoundaryConditionsTableProps {
  conditions: BoundaryCondition[]
  onChange: (conditions: BoundaryCondition[]) => void
}

export function BoundaryConditionsTable({ conditions, onChange }: BoundaryConditionsTableProps) {
  const removeCondition = (id: string) => {
    onChange(conditions.filter((c) => c.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Condizioni al Contorno</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Patch</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Tipo</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Parametri</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Stato</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((bc) => (
                <tr key={bc.id} className="border-b hover:bg-muted/50">
                  <td className="p-3">
                    <span className="font-medium">{bc.name}</span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-sm">{bc.patchName}</span>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">{bc.type}</Badge>
                  </td>
                  <td className="p-3">
                    <span className="text-sm text-muted-foreground">
                      {Object.keys(bc.parameters).length} parametri
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge variant={bc.valid ? 'success' : 'destructive'}>
                      {bc.valid ? 'Valida' : 'Errore'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCondition(bc.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {conditions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Nessuna boundary condition definita. Aggiungi una BC per iniziare.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}