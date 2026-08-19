import axios from 'axios'

const API_BASE = '/api'

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
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
  const response = await apiClient.post<T>(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}