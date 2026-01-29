import React from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'info'
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-background-card border border-accent-cyan/20 rounded-3xl w-full max-w-md relative overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/80 via-accent-cyan/40 to-transparent z-20" />

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-3 rounded-2xl border",
              variant === 'danger' ? "bg-accent-pink/10 border-accent-pink/20 text-accent-pink" : "bg-accent-cyan/10 border-accent-cyan/20 text-accent-cyan"
            )}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-tight">{title}</h2>
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Tactical Confirmation Required</p>
            </div>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed px-1">
            {message}
          </p>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-black text-[10px] text-white uppercase tracking-widest transition-all"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm()
                onClose()
              }}
              className={cn(
                "flex-[1.5] py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95",
                variant === 'danger'
                  ? "bg-accent-pink text-black hover:bg-white"
                  : "bg-accent-cyan text-black hover:bg-white"
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
