import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UploadCloud, File, X, Loader } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { upload } from '@/api/client'
import { formatBytes } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

interface GeometryUploadProps {
  projectId: string
}

const ACCEPTED_FORMATS = {
  'model/stl': ['.stl'],
  'model/obj': ['.obj'],
  'model/step': ['.step', '.stp'],
  'model/vtk': ['.vtk', '.vtp'],
}

export function GeometryUpload({ projectId }: GeometryUploadProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED_FORMATS,
    noClick: true,
    noKeyboard: true,
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      
      return upload<{ status: string; path: string }>(
        `/files/${projectId}/upload/constant/triSurface/${file.name}`,
        formData
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast({
        title: 'Upload completato',
        description: 'Geometria caricata con successo.',
      })
      setFiles([])
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore upload',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleUploadAll = async () => {
    setUploading(true)
    
    for (const file of files) {
      await uploadMutation.mutateAsync(file)
    }
    
    setUploading(false)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Geometria</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
          onClick={open}
        >
          <input {...getInputProps()} />
          <UploadCloud className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-medium mb-2">
            {isDragActive
              ? 'Rilascia i file qui...'
              : 'Trascina i file qui o clicca per selezionare'}
          </p>
          <p className="text-sm text-muted-foreground">
            Formati supportati: STL, OBJ, STEP, VTK
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <File className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}

            <Button
              onClick={handleUploadAll}
              disabled={uploading}
              className="w-full mt-4"
            >
              {uploading && <Loader className="w-4 h-4 mr-2 animate-spin" />}
              Carica {files.length} file
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}