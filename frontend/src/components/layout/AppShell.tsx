import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { NotificationPanel } from './NotificationPanel'
import { useUIStore } from '@/stores/uiStore'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { notificationPanelOpen, setNotificationPanelOpen } = useUIStore()

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[var(--bg-primary)] p-3 gap-3">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden gap-3">
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Notification Panel (slide-over) */}
      <NotificationPanel
        isOpen={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
      />

      {/* Background gradient effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Top-left cyan glow */}
        <div
          className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 rounded-full opacity-[0.03]"
          style={{
            background: 'radial-gradient(circle, var(--accent-cyan) 0%, transparent 70%)',
          }}
        />
        {/* Bottom-right pink glow */}
        <div
          className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 rounded-full opacity-[0.03]"
          style={{
            background: 'radial-gradient(circle, var(--accent-pink) 0%, transparent 70%)',
          }}
        />
      </div>
    </div>
  )
}
