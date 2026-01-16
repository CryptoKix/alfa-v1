import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface AppNotification {
  id: string
  title: string
  message: string
  type: 'success' | 'info' | 'error' | 'signal'
  timestamp: number
  read: boolean
}

export interface NotificationsState {
  notifications: AppNotification[]
}

const initialState: NotificationsState = {
  notifications: [],
}

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<Omit<AppNotification, 'id' | 'timestamp' | 'read'>>) => {
      const newNotification: AppNotification = {
        ...action.payload,
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        read: false,
      }
      state.notifications = [newNotification, ...state.notifications].slice(0, 50)
    },
    markAsRead: (state, action: PayloadAction<string>) => {
      const notification = state.notifications.find(n => n.id === action.payload)
      if (notification) {
        notification.read = true
      }
    },
    clearAll: (state) => {
      state.notifications = []
    },
  },
})

export const { addNotification, markAsRead, clearAll } = notificationsSlice.actions
export default notificationsSlice.reducer
