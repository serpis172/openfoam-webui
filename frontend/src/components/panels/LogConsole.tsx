import React, { useEffect, useRef } from 'react'

interface LogFile {
  name: string
  size: number
  tail?: string[]
}

interface LogConsoleProps {
  logs: LogFile[]
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
      className="h-64 overflow-y-auto bg-slate-900 rounded-lg p-4 font-mono text-sm space-y-3"
    >
      {logs.length === 0 ? (
        <p className="text-muted-foreground">Nessun log disponibile</p>
      ) : (
        // ponytail: prima leggeva log.content (sempre undefined) e
        // mostrava JSON grezzo dell'intero oggetto {name, size} al posto
        // dell'output reale. logs contiene un file per elemento, ognuno
        // con fino a 100 righe di coda in tail[] - vanno unite, non
        // stringificate come oggetto.
        logs.map((log, i) => (
          <div key={i}>
            <div className="text-slate-500 text-xs mb-1">{log.name}</div>
            {log.tail && log.tail.length > 0 ? (
              <pre className="text-green-400 whitespace-pre-wrap break-all">
                {log.tail.join('\n')}
              </pre>
            ) : (
              <p className="text-muted-foreground text-xs">File vuoto</p>
            )}
          </div>
        ))
      )}
    </div>
  )
}