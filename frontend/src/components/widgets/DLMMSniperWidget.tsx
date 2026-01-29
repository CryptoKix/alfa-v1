import { useState } from 'react'
import { useAppDispatch } from '@/app/hooks'
import { updateSniperSettings, SniperSettings, DetectedPool } from '@/features/dlmm/dlmmSlice'
import { addNotification } from '@/features/notifications/notificationsSlice'
import {
  Target, Settings, RefreshCw, Power, Shield, TrendingUp, Zap,
  AlertTriangle, Eye, ChevronRight, ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axios from 'axios'

interface DLMMSniperWidgetProps {
  settings: SniperSettings
  detectedPools: DetectedPool[]
  onRefresh: () => void
}

const riskFilters = [
  { id: 'all', label: 'All Pools', icon: Target },
  { id: 'high', label: 'High Risk', icon: Zap },
  { id: 'medium', label: 'Medium Risk', icon: TrendingUp },
  { id: 'low', label: 'Low Risk', icon: Shield },
]

export default function DLMMSniperWidget({ settings, detectedPools, onRefresh }: DLMMSniperWidgetProps) {
  const dispatch = useAppDispatch()
  const [saving, setSaving] = useState(false)
  const [localSettings, setLocalSettings] = useState(settings)

  const handleToggleSniper = async () => {
    const newEnabled = !localSettings.enabled
    setLocalSettings(prev => ({ ...prev, enabled: newEnabled }))

    try {
      const res = await axios.post('/api/dlmm/sniper/settings', {
        enabled: newEnabled
      })
      if (res.data.success) {
        dispatch(updateSniperSettings({ enabled: newEnabled }))
        dispatch(addNotification({
          title: newEnabled ? 'Sniper Enabled' : 'Sniper Disabled',
          message: newEnabled ? 'Pool detection is now active' : 'Pool detection stopped',
          type: 'info'
        }))
      }
    } catch (e) {
      setLocalSettings(prev => ({ ...prev, enabled: !newEnabled }))
      dispatch(addNotification({
        title: 'Error',
        message: 'Failed to toggle sniper',
        type: 'error'
      }))
    }
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      const res = await axios.post('/api/dlmm/sniper/settings', localSettings)
      if (res.data.success) {
        dispatch(updateSniperSettings(localSettings))
        dispatch(addNotification({
          title: 'Settings Saved',
          message: 'Sniper settings updated',
          type: 'success'
        }))
      }
    } catch (e) {
      dispatch(addNotification({
        title: 'Error',
        message: 'Failed to save settings',
        type: 'error'
      }))
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-2">
      {/* Settings Panel */}
      <div className="lg:col-span-4 flex flex-col gap-2">
        {/* Sniper Toggle */}
        <div className="bg-background-card border border-accent-pink/20 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-pink/60 to-transparent" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-accent-pink" />
              <h3 className="text-sm font-bold uppercase text-text-primary">Pool Sniper</h3>
            </div>
            <button
              onClick={handleToggleSniper}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all",
                localSettings.enabled
                  ? "bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan"
                  : "bg-background-dark border border-white/10 text-text-secondary"
              )}
            >
              <Power size={14} />
              {localSettings.enabled ? 'Active' : 'Inactive'}
            </button>
          </div>

          <p className="text-xs text-text-secondary">
            Monitor for new Meteora DLMM pools and receive real-time alerts.
            Auto-create is disabled by default for safety.
          </p>
        </div>

        {/* Filter Settings */}
        <div className="bg-background-card border border-accent-purple/20 rounded-xl p-4 flex-1 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-purple/60 to-transparent" />
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-accent-purple" />
            <h3 className="text-xs font-bold uppercase text-text-primary">Detection Filters</h3>
          </div>

          {/* Risk Profile Filter */}
          <div className="mb-4">
            <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-2 block">
              Risk Profile
            </label>
            <div className="grid grid-cols-2 gap-2">
              {riskFilters.map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setLocalSettings(prev => ({
                    ...prev,
                    risk_profile_filter: filter.id as any
                  }))}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border text-xs transition-all",
                    localSettings.risk_profile_filter === filter.id
                      ? "bg-accent-purple/20 border-accent-purple/40 text-accent-purple"
                      : "bg-background-dark border-white/10 text-text-secondary hover:border-white/20"
                  )}
                >
                  <filter.icon size={12} />
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bin Step Range */}
          <div className="mb-4">
            <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-2 block">
              Bin Step Range
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={localSettings.min_bin_step}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  min_bin_step: parseInt(e.target.value) || 1
                }))}
                className="w-20 px-3 py-2 bg-background-dark border border-white/10 rounded-lg text-xs text-text-primary focus:border-accent-purple/50 focus:outline-none"
              />
              <span className="text-text-secondary">to</span>
              <input
                type="number"
                value={localSettings.max_bin_step}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  max_bin_step: parseInt(e.target.value) || 100
                }))}
                className="w-20 px-3 py-2 bg-background-dark border border-white/10 rounded-lg text-xs text-text-primary focus:border-accent-purple/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Auto-Create (Disabled Warning) */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-text-secondary uppercase tracking-wider">
                Auto-Create Position
              </label>
              <button
                onClick={() => setLocalSettings(prev => ({
                  ...prev,
                  auto_create_position: !prev.auto_create_position
                }))}
                className={cn(
                  "w-12 h-6 rounded-full transition-all relative",
                  localSettings.auto_create_position
                    ? "bg-accent-pink"
                    : "bg-background-dark border border-white/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white absolute top-1 transition-all",
                  localSettings.auto_create_position ? "right-1" : "left-1"
                )} />
              </button>
            </div>
            {localSettings.auto_create_position && (
              <div className="mt-2 flex items-center gap-2 text-[10px] text-amber-400">
                <AlertTriangle size={12} />
                Auto-create uses server wallet. Use with caution!
              </div>
            )}
          </div>

          {/* Default Strategy Settings (only if auto-create enabled) */}
          {localSettings.auto_create_position && (
            <>
              <div className="mb-4">
                <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-2 block">
                  Default Deposit (SOL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={localSettings.deposit_amount_sol}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    deposit_amount_sol: parseFloat(e.target.value) || 0.1
                  }))}
                  className="w-full px-3 py-2 bg-background-dark border border-white/10 rounded-lg text-xs text-text-primary focus:border-accent-purple/50 focus:outline-none"
                />
              </div>

              <div className="mb-4">
                <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-2 block">
                  Max Active Positions
                </label>
                <input
                  type="number"
                  value={localSettings.max_positions}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    max_positions: parseInt(e.target.value) || 5
                  }))}
                  className="w-full px-3 py-2 bg-background-dark border border-white/10 rounded-lg text-xs text-text-primary focus:border-accent-purple/50 focus:outline-none"
                />
              </div>
            </>
          )}

          {/* Save Button */}
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="w-full py-2 bg-accent-purple hover:bg-accent-purple/80 text-white rounded-lg text-xs font-bold uppercase transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Detected Pools Feed */}
      <div className="lg:col-span-8 bg-background-card border border-accent-cyan/20 rounded-xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-accent-cyan/60 to-transparent" />
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-accent-cyan" />
            <h3 className="text-sm font-bold uppercase text-text-primary">Detected Pools</h3>
            <span className="px-2 py-0.5 bg-accent-cyan/20 rounded text-[10px] font-bold text-accent-cyan">
              {detectedPools.length}
            </span>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-white/5 rounded-lg transition-all"
          >
            <RefreshCw size={14} className="text-text-secondary" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-56px)] custom-scrollbar">
          {detectedPools.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary">
              <Target size={48} className="opacity-20 mb-4" />
              <p className="text-lg font-bold">No Pools Detected</p>
              <p className="text-sm">
                {localSettings.enabled
                  ? 'Waiting for new pool launches...'
                  : 'Enable sniper to start detecting new pools'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {detectedPools.map(pool => (
                <div
                  key={pool.pool_address}
                  className="bg-background-dark/50 border border-white/5 rounded-xl p-4 hover:border-accent-cyan/30 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-text-primary">
                        {pool.token_x_symbol || 'Unknown'}/{pool.token_y_symbol || 'Unknown'}
                      </p>
                      <p className="text-[10px] text-text-secondary font-mono">
                        {pool.pool_address.slice(0, 16)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-1 rounded text-[9px] font-bold uppercase",
                        pool.status === 'sniped'
                          ? "bg-accent-cyan/20 text-accent-cyan"
                          : pool.status === 'ignored'
                            ? "bg-white/10 text-text-secondary"
                            : "bg-accent-purple/20 text-accent-purple"
                      )}>
                        {pool.status}
                      </span>
                      <span className="text-[10px] text-text-secondary">
                        {formatTime(pool.detected_at)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div>
                      <p className="text-[9px] text-text-secondary uppercase">Bin Step</p>
                      <p className="text-xs font-mono font-bold text-text-primary">{pool.bin_step}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-text-secondary uppercase">Base Fee</p>
                      <p className="text-xs font-mono font-bold text-text-primary">{pool.base_fee_bps} bps</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-text-secondary uppercase">Initial Price</p>
                      <p className="text-xs font-mono font-bold text-text-primary">
                        {pool.initial_price?.toFixed(6) || '-'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`https://solscan.io/tx/${pool.detected_signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 bg-background-dark border border-white/10 rounded text-[10px] text-text-secondary hover:text-text-primary transition-all"
                    >
                      View TX <ExternalLink size={10} />
                    </a>
                    <a
                      href={`https://app.meteora.ag/dlmm/${pool.pool_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 bg-accent-cyan/10 border border-accent-cyan/30 rounded text-[10px] text-accent-cyan hover:bg-accent-cyan/20 transition-all"
                    >
                      Open in Meteora <ChevronRight size={10} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
