import React from 'react'
import { NavigationWidget } from '../widgets/NavigationWidget'
import { Header } from './Header'
import { NotificationToast } from '../shared/NotificationToast'

interface MainLayoutProps {
  children: React.ReactNode
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen w-screen bg-[#020206] flex text-white overflow-hidden font-sans p-3 gap-3">
      {/* Sidebar */}
      <NavigationWidget />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 gap-3 pb-14 md:pb-0">
        {/* Header */}
        <Header />

        {/* Page Content - widget grid goes here */}
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>

      <NotificationToast />
    </div>
  )
}
