import React from 'react'
import { NavigationWidget } from '../widgets/NavigationWidget'
import { Header } from './Header'
import { NotificationToast } from '../shared/NotificationToast'

interface MainLayoutProps {
  children: React.ReactNode
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen w-screen bg-black flex text-text-primary overflow-hidden font-sans p-2 gap-2">
      <NavigationWidget />
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-transparent gap-2">
         <div className="bg-background-card border border-accent-pink/10 rounded-2xl overflow-hidden shrink-0 shadow-lg relative">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-pink/80 via-accent-pink/40 to-transparent z-20" />
            <Header />
         </div>
         <main className="flex-1 overflow-hidden relative z-10 flex flex-col bg-transparent">
           {children}
         </main>
      </div>
      <NotificationToast />
    </div>
  )
}
