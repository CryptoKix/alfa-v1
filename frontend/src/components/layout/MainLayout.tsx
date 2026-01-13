import React from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface MainLayoutProps {
  children: React.ReactNode
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen w-screen bg-background-primary flex text-text-primary overflow-hidden font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full relative min-w-0">
         {/* Scanline Effect Background */}
         <div className="scanline" />
         
         <Header />
         <main className="flex-1 overflow-hidden p-6 relative z-10 flex flex-col">
           {children}
         </main>
      </div>
    </div>
  )
}
