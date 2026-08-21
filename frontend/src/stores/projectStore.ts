import { create } from 'zustand'
import type { Project } from '@/types/project'

interface ProjectState {
  currentProject: Project | null
  projects: Project[]
  isLoading: boolean
  error: string | null
  
  setCurrentProject: (project: Project | null) => void
  setProjects: (projects: Project[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  projects: [],
  isLoading: false,
  error: null,
  
  setCurrentProject: (project) => set({ currentProject: project }),
  setProjects: (projects) => set({ projects }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))