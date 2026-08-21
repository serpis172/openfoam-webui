import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader } from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { useToast } from '@/hooks/useToast'

interface CreateProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const templates = [
  {
    id: 'internal_flow',
    name: 'Flusso Interno',
    description: 'Tubazioni, valvole, scambiatori',
    solver: 'simpleFoam',
  },
  {
    id: 'external_aero',
    name: 'Aerodinamica Esterna',
    description: 'Veicoli, edifici, profili alari',
    solver: 'simpleFoam',
  },
  {
    id: 'pipe_flow',
    name: 'Flusso in Tubo',
    description: 'Flusso sviluppato in condotti',
    solver: 'simpleFoam',
  },
  {
    id: 'heat_transfer',
    name: 'Scambio Termico',
    description: 'Convezione con trasferimento di calore',
    solver: 'buoyantSimpleFoam',
  },
  {
    id: 'transient',
    name: 'Flusso Transitorio',
    description: 'Simulazioni tempo-dipendenti',
    solver: 'pimpleFoam',
  },
  {
    id: 'empty',
    name: 'Personalizzato',
    description: 'Configurazione manuale completa',
    solver: 'simpleFoam',
  },
]

export function CreateProjectModal({ open, onOpenChange }: CreateProjectModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('internal_flow')
  const [solver, setSolver] = useState('simpleFoam')

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: 'Progetto creato',
        description: `${name} è stato creato con successo.`,
      })
      onOpenChange(false)
      navigate(`/projects/${data.id}`)
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const selectedTemplate = templates.find((t) => t.id === template)
    
    createMutation.mutate({
      name,
      description,
      solver: selectedTemplate?.solver || solver,
      template,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl p-6">
        <h2 className="text-2xl font-bold mb-6">Crea Nuovo Progetto</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Nome Progetto *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es: Aerodinamica Auto Sportiva"
              required
              className="w-full px-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Descrizione
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrivi brevemente l'obiettivo della simulazione..."
              rows={3}
              className="w-full px-4 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium mb-3">
              Template
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    template === t.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <h3 className="font-medium text-sm mb-1">{t.name}</h3>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={!name || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader className="w-4 h-4 mr-2 animate-spin" />
              )}
              Crea Progetto
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}