import React from 'react'
import { NavigationWidget } from '../widgets/NavigationWidget'
import { Header } from './Header'
import { NotificationToast } from '../shared/NotificationToast'

interface MainLayoutProps {
  children: React.ReactNode
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen w-screen bg-black flex text-text-primary overflow-hidden font-sans p-6 pb-0 gap-0">
      <div className="flex flex-col mb-6">
        <NavigationWidget />
      </div>
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-transparent gap-0">
         <div className="mx-6 bg-background-card border border-accent-pink/30 rounded-lg overflow-hidden shrink-0 shadow-floating relative z-20">
            <Header />
         </div>
         <main className="flex-1 overflow-hidden relative z-10 flex flex-col bg-transparent p-6">
           {children}
         </main>
      </div>
      <NotificationToast />
    </div>
  )
}
