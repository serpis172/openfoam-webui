import React, { useState } from 'react'
import { Terminal, BarChart3, AlertCircle, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface BottomPanelProps {
  projectId: string
}

const tabs = [
  { id: 'logs', icon: Terminal, label: 'Logs' },
  { id: 'residuals', icon: BarChart3, label: 'Residui' },
  { id: 'errors', icon: AlertCircle, label: 'Errori' },
  { id: 'files', icon: FileText, label: 'File' },
]

export function BottomPanel({ projectId }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState('logs')

  return (
    <div className="h-64 border-t bg-card flex flex-col">
      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {activeTab === 'logs' && (
          <div className="font-mono text-sm text-muted-foreground">
            <p>Nessun log disponibile. Avvia una simulazione.</p>
          </div>
        )}
        
        {activeTab === 'residuals' && (
          <div className="text-sm text-muted-foreground">
            <p>Nessun dato residui disponibile.</p>
          </div>
        )}
        
        {activeTab === 'errors' && (
          <div className="text-sm text-muted-foreground">
            <p>Nessun errore.</p>
          </div>
        )}
        
        {activeTab === 'files' && (
          <div className="text-sm text-muted-foreground">
            <p>Nessun file disponibile.</p>
          </div>
        )}
      </div>
    </div>
  )
}