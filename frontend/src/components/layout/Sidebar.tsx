import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home,
  FolderOpen,
  Box,
  Grid,
  Wind,
  Layers,
  Settings2,
  Play,
  BarChart3,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
}

const navigation = [
  { href: '/', icon: Home, label: 'Dashboard' },
  { href: '/projects', icon: FolderOpen, label: 'Progetti' },
]

const workspaceNavigation = [
  { href: '#geometry', icon: Box, label: 'Geometria' },
  { href: '#mesh', icon: Grid, label: 'Mesh' },
  { href: '#physics', icon: Wind, label: 'Fisica' },
  { href: '#boundary-conditions', icon: Layers, label: 'Boundary Conditions' },
  { href: '#numerics', icon: Settings2, label: 'Numerica' },
  { href: '#simulation-control', icon: Play, label: 'Simulazione' },
  { href: '#runs', icon: BarChart3, label: 'Runs' },
  { href: '#results', icon: FileText, label: 'Risultati' },
]

export function Sidebar({ collapsed }: SidebarProps) {
  const location = useLocation()
  const { toggleSidebar } = useUIStore()
  
  const isProjectPage = location.pathname.includes('/projects/')

  return (
    <aside
      className={cn(
        'border-r bg-card flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Toggle button */}
      <div className="flex justify-end p-2">
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-1">
        {navigation.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              location.pathname === item.href
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}

        {isProjectPage && (
          <>
            <div className="pt-4 pb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {!collapsed && 'Workspace'}
            </div>
            
            {workspaceNavigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </a>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t">
        {!collapsed && (
          <p className="text-xs text-muted-foreground">
            Versione 4.0.0
          </p>
        )}
      </div>
    </aside>
  )
}