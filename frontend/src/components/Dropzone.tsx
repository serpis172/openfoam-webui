import { UploadCloud } from 'lucide-react'
import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

interface Props {
  onFiles: (files: File[]) => void
  accept?: string
}

export default function Dropzone({ onFiles, accept }: Props) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onFiles(acceptedFiles)
  }, [onFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: accept
      ? {
          'application/octet-stream': accept.split(',').map(ext => ext.trim()),
        }
      : undefined,
  })

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-300 hover:border-blue-400'
      }`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="w-10 h-10 mx-auto text-slate-400 mb-3" />
      <p className="font-medium">
        {isDragActive ? 'Rilascia qui i file...' : 'Trascina i file qui o clicca per selezionarli'}
      </p>
      <p className="text-sm text-slate-500 mt-1">
        Formati supportati: STL, OBJ, VTK, VTP
      </p>
    </div>
  )
}