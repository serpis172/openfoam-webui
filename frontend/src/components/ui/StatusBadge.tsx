import React from 'react'
import { Badge } from './Badge'
import { Loader, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import type { RunStatus } from '@/types/run'

interface StatusBadgeProps {
  status: RunStatus | string
}

const statusConfig: Record<string, { variant: any; icon: React.ReactNode; label: string }> = {
  queued: { variant: 'queued', icon: <Clock className="w-3 h-3" />, label: 'In coda' },
  preparing: { variant: 'info', icon: <Loader className="w-3 h-3 animate-spin" />, label: 'Preparazione' },
  meshing: { variant: 'info', icon: <Loader className="w-3 h-3 animate-spin" />, label: 'Meshing' },
  running: { variant: 'running', icon: <Loader className="w-3 h-3 animate-spin" />, label: 'In esecuzione' },
  postprocessing: { variant: 'info', icon: <Loader className="w-3 h-3 animate-spin" />, label: 'Post-processing' },
  completed: { variant: 'completed', icon: <CheckCircle className="w-3 h-3" />, label: 'Completato' },
  success: { variant: 'completed', icon: <CheckCircle className="w-3 h-3" />, label: 'Successo' },
  failed: { variant: 'failed', icon: <XCircle className="w-3 h-3" />, label: 'Fallito' },
  cancelled: { variant: 'secondary', icon: <AlertCircle className="w-3 h-3" />, label: 'Annullato' },
  draft: { variant: 'secondary', icon: <Clock className="w-3 h-3" />, label: 'Bozza' },
  ready: { variant: 'success', icon: <CheckCircle className="w-3 h-3" />, label: 'Pronto' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] || {
    variant: 'secondary',
    icon: <AlertCircle className="w-3 h-3" />,
    label: status,
  }

  return (
    <Badge variant={config.variant} className="gap-1">
      {config.icon}
      {config.label}
    </Badge>
  )
}