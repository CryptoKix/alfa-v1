import { create } from 'zustand'

type ModalType =
  | 'wallet-connect'
  | 'settings'
  | 'confirm-trade'
  | 'bot-details'
  | 'position-details'
  | 'add-target'
  | null

interface ModalData {
  [key: string]: unknown
}

interface UIState {
  // Sidebar
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void

  // Modal
  activeModal: ModalType
  modalData: ModalData
  openModal: (modal: ModalType, data?: ModalData) => void
  closeModal: () => void

  // Command palette / Search
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  // Theme preferences (for future use)
  accentColor: 'cyan' | 'pink' | 'purple'
  setAccentColor: (color: 'cyan' | 'pink' | 'purple') => void

  // Toast notifications (ephemeral)
  toasts: Array<{
    id: string
    title: string
    message?: string
    type: 'success' | 'error' | 'info' | 'warning'
  }>
  addToast: (toast: Omit<UIState['toasts'][0], 'id'>) => void
  removeToast: (id: string) => void

  // Notification panel
  notificationPanelOpen: boolean
  setNotificationPanelOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  sidebarOpen: true,
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  // Modal
  activeModal: null,
  modalData: {},
  openModal: (modal, data = {}) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: {} }),

  // Command palette
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  // Theme
  accentColor: 'cyan',
  setAccentColor: (color) => set({ accentColor: color }),

  // Toasts
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: Math.random().toString(36).substring(7) },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  // Notification panel
  notificationPanelOpen: false,
  setNotificationPanelOpen: (open) => set({ notificationPanelOpen: open }),
}))
