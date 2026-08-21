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

      {/* Help */}
      <Button variant="ghost" size="icon">
        <HelpCircle className="w-4 h-4" />
      </Button>

      {/* Settings */}
      <Button variant="ghost" size="icon">
        <Settings className="w-4 h-4" />
      </Button>

      {/* User */}
      <Button variant="ghost" size="icon">
        <User className="w-4 h-4" />
      </Button>
    </header>
  )
}