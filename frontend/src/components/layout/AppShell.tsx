import React from 'react'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { sidebarCollapsed } = useUIStore()

  return (
    <div className="h-screen flex flex-col bg-background">
      <Topbar />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} />
        
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      
      <CommandPalette />
    </div>
  )
}