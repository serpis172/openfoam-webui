import Editor from '@monaco-editor/react'
import { FileText, Save, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'

export default function FileBrowser({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState('')

  const filesQuery = useQuery({
    queryKey: ['files', caseId],
    queryFn: () => api.listFiles(caseId),
  })

  const readMutation = useMutation({
    mutationFn: async (path: string) => {
      const data = await api.readFile(caseId, path)
      setContent(data.content)
      setSelectedPath(path)
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPath) return
      await api.saveFile(caseId, selectedPath, content)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', caseId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      await api.deleteFile(caseId, path)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', caseId] })
      setSelectedPath(null)
      setContent('')
    },
  })

  const files = filesQuery.data?.files || []

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-4 card p-4">
        <h3 className="font-semibold mb-3">File del caso</h3>

        <div className="space-y-1 max-h-[600px] overflow-auto">
          {files.map((file: any) => (
            <div
              key={file.path}
              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer ${
                selectedPath === file.path
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-slate-50'
              }`}
              onClick={() => readMutation.mutate(file.path)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="truncate text-sm">{file.path}</span>
              </div>

              <button
                className="text-red-500 hover:text-red-700"
                onClick={event => {
                  event.stopPropagation()
                  if (confirm(`Eliminare ${file.path}?`)) {
                    deleteMutation.mutate(file.path)
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="col-span-8 card overflow-hidden">
        {selectedPath ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-mono text-sm">{selectedPath}</div>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => saveMutation.mutate()}
              >
                <Save className="w-4 h-4" />
                Salva
              </button>
            </div>

            <Editor
              height="600px"
              defaultLanguage="plaintext"
              theme="vs-dark"
              value={content}
              onChange={value => setContent(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
              }}
            />
          </>
        ) : (
          <div className="h-[600px] flex items-center justify-center text-slate-400">
            Seleziona un file per modificarlo
          </div>
        )}
      </div>
    </div>
  )
}