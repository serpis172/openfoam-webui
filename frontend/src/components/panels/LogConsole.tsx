import React, { useEffect, useRef } from 'react'

interface LogConsoleProps {
  logs: any[]
}

export function LogConsole({ logs }: LogConsoleProps) {
  const consoleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div
      ref={consoleRef}
      className="h-64 overflow-y-auto bg-slate-900 rounded-lg p-4 font-mono text-sm"
    >
      {logs.length === 0 ? (
        <p className="text-muted-foreground">Nessun log disponibile</p>
      ) : (
        logs.map((log, i) => (
          <div key={i} className="text-green-400 whitespace-pre-wrap">
            {log.content || JSON.stringify(log)}
          </div>
        ))
      )}
    </div>
  )
}