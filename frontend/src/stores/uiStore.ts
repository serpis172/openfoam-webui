import { create } from 'zustand'

interface UIState {
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  activePanel: string | null
  
  setTheme: (theme: 'light' | 'dark') => void
  toggleSidebar: () => void
  setCommandPalette: (open: boolean) => void
  setActivePanel: (panel: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  activePanel: null,
  
  setTheme: (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setCommandPalette: (open) => set({ commandPaletteOpen: open }),
  setActivePanel: (panel) => set({ activePanel: panel }),
}))