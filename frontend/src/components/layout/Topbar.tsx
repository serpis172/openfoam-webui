import React from 'react'
import { Link } from 'react-router-dom'
import { 
  Box, 
  Search, 
  Moon, 
  Sun, 
  Settings, 
  User, 
  Command,
  HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { useProjectStore } from '@/stores/projectStore'

export function Topbar() {
  const { theme, setTheme, setCommandPalette } = useUIStore()
  const { currentProject } = useProjectStore()

  return (
    <header className="h-14 border-b bg-card flex items-center px-4 gap-4">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2">
        <Box className="w-6 h-6 text-primary" />
        <span className="font-semibold text-lg">OpenFOAM Studio</span>
      </Link>

      {/* Breadcrumb progetto corrente */}
      {currentProject && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>/</span>
          <Link to={`/projects/${currentProject.id}`} className="hover:text-foreground">
            {currentProject.name}
          </Link>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setCommandPalette(true)}
      >
        <Search className="w-4 h-4" />
        <span className="hidden md:inline">Cerca...</span>
        <kbd className="hidden md:inline-flex items-center gap-1 rounded border bg-muted px-1.5 text-xs">
          <Command className="w-3 h-3" />K
        </kbd>
      </Button>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </Button>

      {/* Help, Settings, User: nessuna pagina reale esiste ancora dietro
       * questi bottoni. Meglio disabilitati con un motivo che finti e
       * silenziosamente rotti (stesso principio applicato altrove:
       * ResultsExport, Dashboard). */}
      <Button variant="ghost" size="icon" disabled title="Documentazione non ancora disponibile">
        <HelpCircle className="w-4 h-4" />
      </Button>

      <Button variant="ghost" size="icon" disabled title="Impostazioni non ancora implementate">
        <Settings className="w-4 h-4" />
      </Button>

      <Button variant="ghost" size="icon" disabled title="Profilo utente non ancora implementato">
        <User className="w-4 h-4" />
      </Button>
    </header>
  )
}