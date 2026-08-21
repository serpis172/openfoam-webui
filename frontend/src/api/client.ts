import axios from 'axios'

const API_BASE = '/api'
// ponytail: chiave letta da env a build-time. Se non impostata, il
// backend gira senza auth (vedi API_KEY in config.py) e l'header viene
// ignorato lato server.
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  },
})

// Interceptor per gestione errori globale
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'Errore API'
    console.error('API Error:', message)
    return Promise.reject(new Error(message))
  }
)

export async function get<T>(url: string, params?: Record<string, any>): Promise<T> {
  const response = await apiClient.get<T>(url, { params })
  return response.data
}

export async function post<T>(url: string, data?: any): Promise<T> {
  const response = await apiClient.post<T>(url, data)
  return response.data
}

export async function put<T>(url: string, data?: any): Promise<T> {
  const response = await apiClient.put<T>(url, data)
  return response.data
}

export async function patch<T>(url: string, data?: any): Promise<T> {
  const response = await apiClient.patch<T>(url, data)
  return response.data
}

export async function del<T>(url: string): Promise<T> {
  const response = await apiClient.delete<T>(url)
  return response.data
}

export async function upload<T>(url: string, formData: FormData): Promise<T> {
  // ponytail: NON impostare Content-Type qui. Un FormData ha bisogno del
  // boundary che il browser genera da solo in fase di invio - un header
  // manuale "multipart/form-data" senza boundary fa si' che axios/XHR
  // mandi quell'header letterale mentre il body e' comunque codificato
  // con un boundary reale, che il parser multipart del backend non trova
  // da nessuna parte nell'header dichiarato. Lasciando undefined, axios
  // rileva il FormData e imposta Content-Type con il boundary corretto.
  const response = await apiClient.post<T>(url, formData, {
    headers: { 'Content-Type': undefined },
  })
  return response.data
}

// ponytail: un <a href> nativo non porta l'header X-API-Key (lo aggiunge
// solo axios/fetch via JS), quindi se API_KEY e' configurata un link
// diretto a /api/files/.../download-all darebbe 401. Scarico via axios
// (header incluso) e forzo il download lato client con un blob URL.
export async function downloadBlob(url: string, filename: string): Promise<void> {
  const response = await apiClient.get(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(blobUrl)
}