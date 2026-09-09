import React from 'react'
import { CheckCircle, Circle, Loader } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProgressStepsProps {
  steps: string[]
  current: number
  onStepClick?: (index: number) => void
}

export function ProgressSteps({ steps, current, onStepClick }: ProgressStepsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {steps.map((step, index) => {
        const isCompleted = index < current
        const isCurrent = index === current
        // ponytail: prima limitava il click solo a step <= current (stile
        // wizard bloccato). Ma tutte le pagine sono già liberamente
        // raggiungibili dalla sidebar in qualunque ordine - bloccare qui
        // sarebbe stato incoerente, un finto vincolo che l'utente
        // scavalca comunque da un altro punto della UI.
        const isClickable = !!onStepClick

        return (
          <React.Fragment key={step}>
            {index > 0 && (
              <div className={cn(
                'h-0.5 w-8 flex-shrink-0',
                isCompleted ? 'bg-success' : 'bg-muted'
              )} />
            )}
            
            <button
              onClick={() => isClickable && onStepClick(index)}
              disabled={!isClickable}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                isCurrent && 'bg-primary/10 text-primary font-medium',
                isCompleted && 'text-success',
                !isCompleted && !isCurrent && 'text-muted-foreground',
                isClickable && 'hover:bg-accent',
                !isClickable && 'cursor-not-allowed'
              )}
            >
              {isCompleted && <CheckCircle className="w-4 h-4" />}
              {isCurrent && <Loader className="w-4 h-4 animate-spin" />}
              {!isCompleted && !isCurrent && <Circle className="w-4 h-4" />}
              <span className="whitespace-nowrap">{step}</span>
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}