import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  Home,
  FolderOpen,
  Plus,
  Search,
  Play,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useProjectStore } from '@/stores/projectStore'
import { Dialog, DialogContent } from '@/components/ui/Dialog'

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPalette } = useUIStore()
  const { currentProject } = useProjectStore()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPalette(!commandPaletteOpen)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [commandPaletteOpen, setCommandPalette])

  const commands = [
    {
      group: 'Navigazione',
      items: [
        { icon: Home, label: 'Dashboard', action: () => navigate('/') },
        { icon: FolderOpen, label: 'Progetti', action: () => navigate('/projects') },
      ],
    },
    {
      group: 'Azioni',
      items: [
        // ponytail: prima portava a /projects/new, una rotta che non
        // esiste (rimbalzava subito indietro via il redirect su 404
        // di ProjectLayout). Il modale di creazione vero vive in
        // Dashboard.tsx come stato locale - non ancora sollevato a
        // uno store condiviso, quindi qui si può solo portare l'utente
        // dove il bottone "Nuovo Progetto" reale esiste.
        { icon: Plus, label: 'Nuovo Progetto', action: () => navigate('/projects') },
        // "Avvia Simulazione" prima faceva solo console.log('Run') - non
        // succedeva nulla di visibile. Ora porta davvero alla pagina
        // Runs del progetto aperto, se ce n'è uno.
        ...(currentProject
          ? [{ icon: Play, label: `Avvia Simulazione (${currentProject.name})`, action: () => navigate(`/projects/${currentProject.id}/runs`) }]
          : []),
      ],
    },
  ]

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={setCommandPalette}>
      <DialogContent className="p-0 max-w-lg">
        <Command className="rounded-lg border shadow-md">
          <div className="flex items-center border-b px-3">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Cerca comandi..."
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 px-3"
            />
          </div>
          
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Nessun risultato trovato.
            </Command.Empty>
            
            {commands.map((group) => (
              <Command.Group key={group.group} heading={group.group}>
                {group.items.map((item) => (
                  <Command.Item
                    key={item.label}
                    onSelect={() => {
                      item.action()
                      setCommandPalette(false)
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}