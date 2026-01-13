import React from 'react'
import { NavigationWidget } from '../widgets/NavigationWidget'
import { Header } from './Header'

interface MainLayoutProps {
  children: React.ReactNode
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen w-screen bg-black flex text-text-primary overflow-hidden font-sans p-2 gap-2">
      <NavigationWidget />
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-transparent gap-2">
         <div className="bg-background-card border border-white/5 rounded-2xl overflow-hidden shrink-0 shadow-lg">
            <Header />
         </div>
         <main className="flex-1 overflow-hidden relative z-10 flex flex-col bg-transparent">
           {children}
         </main>
      </div>
    </div>
  )
}
